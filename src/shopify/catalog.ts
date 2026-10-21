import { SiteClient } from '../http/client';
import { SiteConfig } from '../config/types';

/** Product as returned by /products.json and /collections/<handle>/products.json. */
export interface CatalogProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string | null;
  vendor: string;
  product_type: string;
  tags: string[];
  images: Array<{ src: string }>;
  variants: Array<{ id: number; price: string; sku: string | null; available: boolean }>;
}

/** Product as returned by /products/<handle>.js (prices in cents). */
export interface ProductJs {
  id: number;
  title: string;
  handle: string;
  description: string;
  price: number;
  available: boolean;
  images: string[];
  variants: Array<{ id: number; price: number; available: boolean; sku: string | null }>;
}

// One fetch per site + page per worker: several tests read the same sampled page.
const pageCache = new Map<string, Promise<CatalogProduct[]>>();

export function catalogPagePath(page: number, limit = 250): string {
  return `/products.json?limit=${limit}&page=${page}`;
}

export function catalogPage(client: SiteClient, page: number, limit = 250): Promise<CatalogProduct[]> {
  const key = `${client.site.id}|${page}|${limit}`;
  let hit = pageCache.get(key);
  if (!hit) {
    hit = client.json<{ products: CatalogProduct[] }>(catalogPagePath(page, limit)).then((r) => r.products);
    pageCache.set(key, hit);
    hit.catch(() => pageCache.delete(key));
  }
  return hit;
}

export function productJs(client: SiteClient, handle: string): Promise<ProductJs> {
  return client.json<ProductJs>(`/products/${encodeURIComponent(handle)}.js`);
}

/** Price as the storefront would print it, e.g. "$1,234.50" for USD/en-US. */
export function formatPrice(site: SiteConfig, amount: number): string {
  return new Intl.NumberFormat(site.catalog.locale, { style: 'currency', currency: site.catalog.currency }).format(amount);
}

/** Path for comparison: no locale prefix (/en-ca), no trailing slash, decoded. */
export function normalizeProductPath(urlOrPath: string, baseUrl: string): string {
  const path = decodeURIComponent(new URL(urlOrPath, baseUrl).pathname).replace(/^\/[a-z]{2}(-[a-z]{2})?(?=\/products\/)/i, '');
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}
