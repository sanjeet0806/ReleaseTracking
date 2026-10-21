import { SiteClient } from '../http/client';
import { decodeEntities } from '../util/html';

export type SitemapKind = 'products' | 'collections' | 'pages' | 'blogs' | 'articles' | 'other';

export interface SitemapChild { kind: SitemapKind; path: string }

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decodeEntities(m[1]));
}

function kindOf(loc: string): SitemapKind {
  const k = /\/sitemap_([a-z]+)_\d+\.xml/i.exec(loc)?.[1].toLowerCase();
  return k === 'products' || k === 'collections' || k === 'pages' || k === 'blogs' || k === 'articles' ? k : 'other';
}

/** Path + query of an absolute URL on the site, for use with SiteClient. */
export function toPath(url: string): string {
  const u = new URL(url);
  return u.pathname + u.search;
}

/** Handle from a /pages/<handle> path, ignoring any locale prefix such as /en-ca. */
export function pageHandle(path: string): string {
  return /\/pages\/([^/?#]+)/.exec(path)?.[1] ?? path;
}

export class SitemapError extends Error {
  constructor(readonly url: string, readonly status: number) {
    super(`GET ${url} returned ${status}`);
    this.name = 'SitemapError';
  }
}

// Fetched sitemaps, per client, so several checks in one test share requests.
const cache = new WeakMap<SiteClient, Map<string, Promise<string[]>>>();

async function fetchLocs(client: SiteClient, path: string): Promise<string[]> {
  let byPath = cache.get(client);
  if (!byPath) cache.set(client, (byPath = new Map()));
  let hit = byPath.get(path);
  if (!hit) {
    hit = (async () => {
      const res = await client.get(path);
      if (res.status !== 200) throw new SitemapError(res.url, res.status);
      return locs(res.text);
    })();
    byPath.set(path, hit);
    hit.catch(() => byPath!.delete(path));
  }
  return hit;
}

/** Child sitemaps listed in /sitemap.xml. Throws SitemapError if it is not 200. */
export async function sitemapIndex(client: SiteClient): Promise<SitemapChild[]> {
  return (await fetchLocs(client, '/sitemap.xml')).map((loc) => ({ kind: kindOf(loc), path: toPath(loc) }));
}

/**
 * De-duplicated URL paths from the sitemaps of one kind. `limit` stops after
 * that many child sitemaps (EZPAWN has 646 product sitemaps).
 */
export async function sitemapPaths(client: SiteClient, kind: SitemapKind, limit = Infinity): Promise<string[]> {
  const children = (await sitemapIndex(client)).filter((c) => c.kind === kind).slice(0, limit);
  const out = new Set<string>();
  for (const child of children) for (const loc of await fetchLocs(client, child.path)) out.add(toPath(loc));
  return [...out];
}

/** Every page path listed in the pages sitemap(s). */
export function pagePaths(client: SiteClient): Promise<string[]> {
  return sitemapPaths(client, 'pages');
}
