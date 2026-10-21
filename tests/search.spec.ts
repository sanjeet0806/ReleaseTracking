import { test } from '../src/fixtures';
import { Finding, isBlank, verify } from '../src/findings/finding';
import { checkStep } from '../src/findings/steps';
import { SiteClient } from '../src/http/client';
import { catalogPage } from '../src/shopify/catalog';
import { pickNumber, runSeed, sample } from '../src/util/sample';

interface SuggestProduct { title: string; handle?: string; url: string; price: string | number; available?: boolean; vendor?: string; type?: string; tags?: string[] }
interface SuggestResponse { resources?: { results?: { products?: SuggestProduct[] } } }

function suggestPath(q: string, limit = 5): string {
  const params = new URLSearchParams({ q, 'resources[type]': 'product', 'resources[limit]': String(limit) });
  return `/search/suggest.json?${params.toString()}`;
}

/** Lowercase, accents removed, punctuation as spaces. */
const fold = (s: unknown): string => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** True when every word of `term` appears as a whole word (or its plural/singular) in the product's title, vendor, type or tags. */
function matches(p: SuggestProduct, term: string): boolean {
  const text = ` ${fold([p.title, p.vendor, p.type, ...(p.tags ?? [])].join(' '))} `;
  return fold(term).split(' ').every((w) => {
    const stem = w.replace(/s$/, '');
    return new RegExp(` ${stem}s? `).test(text);
  });
}

async function suggest(client: SiteClient, q: string, limit = 5): Promise<{ url: string; products: SuggestProduct[] }> {
  const path = suggestPath(q, limit);
  const body = await client.json<SuggestResponse>(path);
  return { url: client.url(path), products: body.resources?.results?.products ?? [] };
}

const base = (url: string): Pick<Finding, 'area' | 'url' | 'owner' | 'steps'> => ({ area: 'Search', url, owner: 'Ecommerce dev', steps: `GET ${url}` });

test.describe('search', () => {
  test('search suggestions return relevant, complete, in-stock products @smoke', async ({ site, client }, ti) => {
    for (const term of site.search.terms) {
      await checkStep(ti, `Search "${term}"`, 'Search', async () => {
        const { url, products } = await suggest(client, term);
        if (!verify(ti, products.length > 0, { ...base(url), severity: 'High', title: `Search for "${term}" suggests no products`, expected: 'At least 1 product', actual: '0 products', notes: 'Inventory is one-of-a-kind; if this term can legitimately run out, replace it in search.terms.' })) return;
        verify(ti, products.some((p) => matches(p, term)), {
          ...base(url), severity: 'Medium', title: `Search for "${term}" suggests no matching product`,
          expected: `A suggestion whose title, vendor, type or tags contain "${term}"`, actual: products.slice(0, 3).map((p) => p.title).join(' | '),
        });
        const incomplete = products.filter((p) => isBlank(p.title) || isBlank(p.url) || !/\/products\//.test(String(p.url)) || !(Number(p.price) > 0));
        verify(ti, incomplete.length === 0, {
          ...base(url), severity: 'Medium', title: 'Search suggestion has a blank title, URL or price',
          expected: 'Every suggestion has a title, a /products/ URL and a price',
          actual: `${incomplete.length} of ${products.length}: ${incomplete.slice(0, 2).map((p) => JSON.stringify({ title: p.title, url: p.url, price: p.price })).join(' | ')}`,
        });
        const soldOut = products.filter((p) => p.available === false);
        verify(ti, soldOut.length === 0, {
          ...base(url), severity: 'Low', title: 'Search suggests sold-out products',
          expected: 'Only available products suggested', actual: `${soldOut.length} of ${products.length}: ${soldOut.slice(0, 2).map((p) => p.title).join(' | ')}`,
        });
      });
    }
  });

  test('a product from today\'s catalog sample is found by its title @sanity', async ({ site, client }, ti) => {
    // Known-item search that does not depend on fixed inventory: pick an in-stock product each day.
    const seed = runSeed(site.id);
    const page = pickNumber(site.sampling.maxCatalogPage, `${seed}:page`);
    const products = (await catalogPage(client, page)).filter((p) => p.variants.some((v) => v.available));
    if (!verify(ti, products.length > 0, { ...base(client.url(`/products.json?limit=250&page=${page}`)), severity: 'High', title: 'No in-stock product to search for', expected: 'At least 1 in-stock product', actual: '0' })) return;
    const [pick] = sample(products, 1, `${seed}:search`, (p) => p.handle);
    const { url, products: found } = await suggest(client, pick.title, 10);
    // Pawn stores list many items with identical titles (handle, handle-2, ...), so a
    // suggestion with the same title counts as finding the item.
    const sameItem = (p: SuggestProduct): boolean =>
      p.handle === pick.handle || String(p.url).split('?')[0].endsWith(`/products/${pick.handle}`) || fold(p.title) === fold(pick.title);
    verify(ti, found.some(sameItem), {
      ...base(url), severity: 'Medium', title: 'Search does not find a listed product by its title',
      expected: `/products/${pick.handle} (or an item with the same title) among the first 10 suggestions`, actual: found.slice(0, 3).map((p) => p.title).join(' | ') || '0 suggestions',
      notes: 'Product picked from today\'s catalog sample; a newly listed product may take time to be indexed.',
    });
  });

  test('misspelled searches still suggest the intended products @sanity', async ({ site, client }, ti) => {
    test.skip(!site.search.misspellings?.length, 'No misspellings configured');
    for (const { term, expect } of site.search.misspellings!) {
      await checkStep(ti, `Misspelling "${term}"`, 'Search', async () => {
        const { url, products } = await suggest(client, term);
        verify(ti, products.some((p) => matches(p, expect)), {
          ...base(url), severity: 'Medium', title: `Misspelled search "${term}" does not suggest "${expect}"`,
          expected: `A suggestion containing "${expect}"`, actual: products.slice(0, 3).map((p) => p.title).join(' | ') || '0 suggestions',
        });
      });
    }
  });

  test('search with no matches returns an empty result, not an error @smoke', async ({ site, client }, ti) => {
    await checkStep(ti, 'No-result search', 'Search', async () => {
      const { url, products } = await suggest(client, site.search.noResultTerm);
      verify(ti, products.length === 0, {
        ...base(url), severity: 'Low', title: 'No-result search returns products',
        expected: '0 products', actual: `${products.length} products: ${products.slice(0, 2).map((p) => p.title).join(' | ')}`,
      });
    });
  });
});
