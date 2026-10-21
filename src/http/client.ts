import { APIRequestContext } from '@playwright/test';
import { SiteConfig } from '../config/types';

export interface PageResponse {
  status: number;
  url: string;
  /** Raw Location header, if any. */
  location?: string;
  /** Location resolved against the request URL, as path + query (same-host) or full URL (other host). */
  redirectTo?: string;
  text: string;
  ms: number;
}

/** "301 (to /x)" style description of a response's status, for findings. */
export function describeStatus(res: PageResponse): string {
  return `${res.status}${res.redirectTo ? ` (to ${res.redirectTo})` : ''}`;
}

/**
 * The request never reached the site: DNS, proxy, TLS or connection failure.
 * The findings reporter files these under "Environment", not as site defects.
 */
export class EnvironmentError extends Error {
  constructor(readonly url: string, cause: string) {
    super(`[environment] ${cause} (${url})`);
    this.name = 'EnvironmentError';
  }
}

// Next free request slot per host, shared by every client in this worker. The
// slot is reserved before waiting, so overlapping calls queue instead of firing together.
const nextSlotAt = new Map<string, number>();

export class SiteClient {
  private readonly host: string;

  constructor(private readonly request: APIRequestContext, readonly site: SiteConfig) {
    this.host = new URL(site.baseUrl).host;
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const at = Math.max(now, nextSlotAt.get(this.host) ?? 0);
    nextSlotAt.set(this.host, at + this.site.run.minRequestIntervalMs);
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  }

  /** Absolute URL on this site. Refuses other hosts so the throttle stays per-site. */
  url(path: string): string {
    const u = new URL(path, this.site.baseUrl);
    if (u.host !== this.host) throw new Error(`Refusing request to ${u.host}: client is for ${this.host}`);
    return u.toString();
  }

  /** GET without following redirects, so callers can check them. */
  async get(path: string): Promise<PageResponse> {
    const url = this.url(path);
    await this.throttle();
    const started = Date.now();
    let res;
    try {
      res = await this.request.get(url, { maxRedirects: 0, failOnStatusCode: false });
    } catch (e) {
      throw new EnvironmentError(url, String((e as Error).message ?? e).split('\n')[0]);
    }
    try {
      const location = res.headers()['location'];
      let redirectTo: string | undefined;
      if (location) {
        const target = new URL(location, url);
        redirectTo = target.host === this.host ? target.pathname + target.search : target.toString();
      }
      return { status: res.status(), url, location, redirectTo, text: await res.text(), ms: Date.now() - started };
    } finally {
      await res.dispose();
    }
  }

  /** GET a JSON endpoint; throws with status, URL and redirect target unless it is 200 JSON. */
  async json<T>(path: string): Promise<T> {
    const res = await this.get(path);
    if (res.status !== 200) {
      throw new Error(`GET ${res.url} returned ${res.status}${res.redirectTo ? ` (redirect to ${res.redirectTo})` : ''}`);
    }
    try {
      return JSON.parse(res.text) as T;
    } catch {
      throw new Error(`GET ${res.url} did not return JSON (starts: ${res.text.slice(0, 80).replace(/\s+/g, ' ')})`);
    }
  }
}
