import { SiteClient } from '../http/client';
import { decodeEntities } from '../util/html';

export type SitemapKind = 'products' | 'collections' | 'pages' | 'blogs' | 'articles' | 'other';

export interface SitemapIndex {
  children: Array<{ kind: SitemapKind; path: string }>;
}

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decodeEntities(m[1]));
}

function kindOf(loc: string): SitemapKind {
  const m = /\/sitemap_([a-z]+)_\d+\.xml/i.exec(loc);
  const k = m?.[1].toLowerCase();
  return k === 'products' || k === 'collections' || k === 'pages' || k === 'blogs' || k === 'articles' ? k : 'other';
}

/** Path + query of an absolute URL on the site, for use with SiteClient. */
export function toPath(url: string): string {
  const u = new URL(url);
  return u.pathname + u.search;
}

export async function sitemapIndex(client: SiteClient): Promise<SitemapIndex> {
  const res = await client.get('/sitemap.xml');
  if (res.status !== 200) throw new Error(`GET ${res.url} returned ${res.status}`);
  return { children: locs(res.text).map((loc) => ({ kind: kindOf(loc), path: toPath(loc) })) };
}

/** Every page path listed in the site's pages sitemap(s). */
export async function pagePaths(client: SiteClient): Promise<string[]> {
  const index = await sitemapIndex(client);
  const out: string[] = [];
  for (const child of index.children.filter((c) => c.kind === 'pages')) {
    const res = await client.get(child.path);
    if (res.status !== 200) throw new Error(`GET ${res.url} returned ${res.status}`);
    out.push(...locs(res.text).map(toPath));
  }
  return out;
}
