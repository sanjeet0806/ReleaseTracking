import { SiteClient } from '../http/client';

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
  price: number;
  available: boolean;
  images: string[];
  variants: Array<{ id: number; price: number; available: boolean; sku: string | null }>;
}

export async function catalogPage(client: SiteClient, page: number, limit = 250): Promise<CatalogProduct[]> {
  return (await client.json<{ products: CatalogProduct[] }>(`/products.json?limit=${limit}&page=${page}`)).products;
}

export async function collectionProducts(client: SiteClient, handle: string, limit = 1): Promise<CatalogProduct[]> {
  return (await client.json<{ products: CatalogProduct[] }>(`/collections/${encodeURIComponent(handle)}/products.json?limit=${limit}`)).products;
}

export function productJs(client: SiteClient, handle: string): Promise<ProductJs> {
  return client.json<ProductJs>(`/products/${encodeURIComponent(handle)}.js`);
}

/** "$1,234.50" for a decimal price string or a number of dollars. */
export function formatUsd(dollars: string | number): string {
  return `$${Number(dollars).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
