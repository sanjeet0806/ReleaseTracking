import { test } from '../src/fixtures';
import { isBlank, verify } from '../src/findings/finding';
import { checkStep } from '../src/findings/steps';
import { describeStatus } from '../src/http/client';

interface SuggestProduct { title: string; url: string; price: string | number; available?: boolean }
interface SuggestResponse { resources?: { results?: { products?: SuggestProduct[] } } }

const suggestPath = (q: string) => `/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product&resources[limit]=5`;

test.describe('search', () => {
  test('search suggestions return relevant, complete products @smoke', async ({ site, client }, ti) => {
    for (const term of site.search.terms) {
      await checkStep(ti, `Search "${term}"`, 'Search', async () => {
        const res = await client.get(suggestPath(term));
        const base = { area: 'Search', url: res.url, owner: 'Ecommerce dev', steps: `GET ${res.url}` };
        if (!verify(ti, res.status === 200, { ...base, severity: 'High', title: 'Search suggestions endpoint does not return 200', expected: '200', actual: describeStatus(res) })) return;
        let products: SuggestProduct[] = [];
        try {
          products = (JSON.parse(res.text) as SuggestResponse).resources?.results?.products ?? [];
        } catch {
          verify(ti, false, { ...base, severity: 'High', title: 'Search suggestions are not valid JSON', expected: 'JSON', actual: res.text.slice(0, 60) });
          return;
        }
        if (!verify(ti, products.length > 0, { ...base, severity: 'High', title: `Search for "${term}" suggests no products`, expected: 'At least 1 product', actual: '0 products' })) return;
        const words = term.toLowerCase().split(/\s+/).filter(Boolean);
        verify(ti, products.some((p) => words.every((w) => String(p.title ?? '').toLowerCase().includes(w))), {
          ...base, severity: 'Medium', title: `Search for "${term}" suggests no matching product`,
          expected: `A suggested title contains "${term}"`, actual: products.slice(0, 3).map((p) => p.title).join(' | '),
        });
        const incomplete = products.filter((p) => isBlank(p.title) || isBlank(p.url) || !/\/products\//.test(String(p.url)) || !(Number(p.price) > 0));
        verify(ti, incomplete.length === 0, {
          ...base, severity: 'Medium', title: 'Search suggestion has a blank title, URL or price',
          expected: 'Every suggestion has a title, a /products/ URL and a price', actual: `${incomplete.length} of ${products.length}: ${incomplete.slice(0, 2).map((p) => JSON.stringify({ title: p.title, url: p.url, price: p.price })).join(' | ')}`,
        });
      });
    }
  });

  test('search with no matches returns an empty result, not an error @smoke', async ({ site, client }, ti) => {
    const res = await client.get(suggestPath(site.search.noResultTerm));
    const base = { area: 'Search', url: res.url, owner: 'Ecommerce dev', steps: `GET ${res.url}` };
    if (!verify(ti, res.status === 200, { ...base, severity: 'Medium', title: 'No-result search does not return 200', expected: '200', actual: describeStatus(res) })) return;
    let count = -1;
    try {
      count = (JSON.parse(res.text) as SuggestResponse).resources?.results?.products?.length ?? -1;
    } catch {
      count = -1;
    }
    verify(ti, count === 0, {
      ...base, severity: 'Low', title: 'No-result search does not return an empty product list',
      expected: '0 products', actual: count < 0 ? 'No product list in response' : `${count} products`,
    });
  });
});
