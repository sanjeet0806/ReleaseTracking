import { test } from '../src/fixtures';
import { isBlank, verify } from '../src/findings/finding';
import { IssueGroups } from '../src/findings/aggregate';
import { checkStep } from '../src/findings/steps';
import { describeStatus } from '../src/http/client';
import { CatalogProduct, catalogPage, collectionProducts, formatUsd, productJs } from '../src/shopify/catalog';
import { ProductField } from '../src/config/types';
import { decodeEntities, jsonLd, metaContent, pageTitle } from '../src/util/html';
import { pickNumber, runSeed, sample } from '../src/util/sample';

const norm = (s: unknown): string => decodeEntities(String(s ?? '')).replace(/\s+/g, ' ').trim().toLowerCase();

function fieldValue(p: CatalogProduct, field: ProductField): unknown {
  switch (field) {
    case 'images': return p.images.map((i) => i.src);
    case 'price': return p.variants.map((v) => (Number(v.price) > 0 ? v.price : ''));
    case 'sku': return p.variants.map((v) => v.sku);
    case 'body_html': return (p.body_html ?? '').replace(/<[^>]+>/g, '');
    default: return p[field];
  }
}

test.describe('catalog and product data', () => {
  test('key collections are served and have products @sanity', async ({ site, client }, ti) => {
    for (const handle of site.keyCollections) {
      await checkStep(ti, `Collection ${handle}`, 'Catalog', async () => {
        const products = await collectionProducts(client, handle, 1);
        verify(ti, products.length > 0, {
          area: 'Catalog', url: client.url(`/collections/${handle}`), severity: 'High', owner: 'Merchandising',
          title: `Collection "${handle}" has no products`, steps: `GET /collections/${handle}/products.json?limit=1`,
          expected: 'At least 1 product', actual: '0 products',
        });
      });
    }
  });

  test('sampled catalog page has complete product data @sanity', async ({ site, client }, ti) => {
    const page = pickNumber(site.sampling.maxCatalogPage, `${runSeed(site.id)}:page`);
    const products = await catalogPage(client, page);
    const url = client.url(`/products.json?limit=250&page=${page}`);
    if (!verify(ti, products.length > 0, {
      area: 'Catalog', url, severity: 'High', owner: 'Ecommerce dev', title: 'Catalog page returned no products',
      expected: 'At least 1 product', actual: `0 products on page ${page}`,
      notes: 'If the catalog shrank, lower sampling.maxCatalogPage in the site config.',
    })) return;
    const groups = new IssueGroups('products');
    const steps = `GET /products.json?limit=250&page=<n> and check each product's fields and tags. Page ${page} today (seed ${runSeed(site.id)}).`;
    for (const p of products) {
      groups.countItem();
      const productUrl = client.url(`/products/${p.handle}`);
      for (const field of site.catalog.requiredProductFields) {
        const value = fieldValue(p, field);
        if (isBlank(value) || (Array.isArray(value) && value.some(isBlank))) {
          groups.add(productUrl, {
            area: 'Catalog data', severity: 'Low', owner: 'Ecommerce dev / catalog', steps,
            title: `Product field "${field}" is blank`, expected: `Non-blank ${field}`, actual: p.handle,
          });
        }
      }
      for (const prefix of site.catalog.requiredTagPrefixes) {
        if (!p.tags.some((t) => t.startsWith(prefix))) {
          groups.add(productUrl, {
            area: 'Catalog data', severity: 'Medium', owner: 'Ecommerce dev / catalog', steps,
            title: `Product has no "${prefix}" tag`, expected: `A tag starting with "${prefix}"`, actual: p.handle,
          });
        }
      }
      for (const prefix of site.catalog.forbiddenTagPrefixes) {
        // The tag value itself is never copied into the report (it may be a serial number).
        if (p.tags.some((t) => t.startsWith(prefix))) {
          groups.add(productUrl, {
            area: 'Data exposure', severity: 'High', owner: 'Data governance + InfoSec', steps,
            title: `Public product data includes "${prefix}" tags`, expected: `No "${prefix}" tags in public data`,
            actual: `${p.handle} (has a ${prefix} tag; value not shown)`,
            notes: 'Severity is a suggestion; data owners decide whether this is a problem.',
          });
        }
      }
    }
    groups.flush(ti, site.id);
  });

  test('sampled product pages match catalog data and structured data is valid @sanity', async ({ site, client }, ti) => {
    const page = pickNumber(site.sampling.maxCatalogPage, `${runSeed(site.id)}:page`);
    const products = await catalogPage(client, page);
    const picks = sample(products, site.sampling.productsPerRun, runSeed(site.id), (p) => p.handle);
    if (!verify(ti, picks.length > 0, {
      area: 'Product page', url: client.url(`/products.json?page=${page}`), severity: 'High', owner: 'Ecommerce dev',
      title: 'No products to sample', expected: `${site.sampling.productsPerRun} products`, actual: '0',
    })) return;
    const groups = new IssueGroups('product pages');
    const steps = 'Open the product page and its /products/<handle>.js data; compare title, price, availability, images, add-to-cart form and the Product JSON-LD.';

    for (const p of picks) {
      await checkStep(ti, `Product ${p.handle}`, 'Product page', async () => {
        groups.countItem();
        const url = client.url(`/products/${p.handle}`);
        const add = (title: string, expected: string, actual: string, extra: { area?: string; severity?: 'High' | 'Medium' | 'Low'; owner?: string; notes?: string } = {}) =>
          groups.add(url, { area: extra.area ?? 'Product page', severity: extra.severity ?? 'High', owner: extra.owner ?? 'Ecommerce dev', steps, title, expected, actual: `${p.handle}: ${actual}`, notes: extra.notes });

        const js = await productJs(client, p.handle);
        if (isBlank(js.title)) add('Product data title is blank', 'Non-blank title', '(blank)');
        if (!(js.price > 0)) add('Product data price is blank or zero', 'Price above $0', String(js.price));
        if (isBlank(js.images)) add('Product data has no images', 'At least 1 image', '0 images');

        const res = await client.get(`/products/${p.handle}`);
        if (res.status !== 200) {
          add('Product page does not return 200', '200', describeStatus(res));
          return;
        }
        const html = res.text;
        const price = formatUsd(js.price / 100);
        const titleOk = norm(pageTitle(html)).includes(norm(js.title)) || norm(metaContent(html, 'property', 'og:title')).includes(norm(js.title));
        if (!titleOk) add('Product page title does not match product data', js.title, pageTitle(html) || '(blank)', { severity: 'Medium' });
        if (!html.includes(price)) add('Product page does not show the product price', price, '(price not found in page HTML)');
        if (isBlank(metaContent(html, 'property', 'og:image'))) add('Product page has no og:image', 'og:image meta tag', '(missing)', { severity: 'Low', area: 'SEO', owner: 'SEO' });
        if (js.available && !/action=["'][^"']*\/cart\/add/i.test(html)) add('Available product has no add-to-cart form', 'form posting to /cart/add', '(not found)');

        const ld = jsonLd(html);
        const invalid = ld.filter((x) => 'invalid' in x);
        if (invalid.length) add('Page has invalid JSON-LD', 'Valid JSON in every ld+json block', String(invalid[0].invalid).slice(0, 60), { severity: 'Medium', area: 'SEO / structured data', owner: 'SEO' });
        const product = ld.find((x) => x['@type'] === 'Product');
        if (!product) {
          add('Product structured data is missing', 'JSON-LD with @type Product', '(none)', { severity: 'Medium', area: 'SEO / structured data', owner: 'SEO' });
          return;
        }
        const sd = { area: 'SEO / structured data', owner: 'SEO' };
        if (norm(product.name) !== norm(js.title)) add('Structured data name does not match product title', js.title, String(product.name ?? '(blank)'), { ...sd, severity: 'Medium' });
        const offersRaw = product.offers;
        const offer = (Array.isArray(offersRaw) ? offersRaw[0] : offersRaw) as Record<string, unknown> | undefined;
        if (!offer) add('Structured data has no offer', 'offers with price and availability', '(none)', { ...sd, severity: 'Medium' });
        else {
          if (Math.abs(Number(offer.price) - js.price / 100) > 0.005) add('Structured data price does not match product price', price, String(offer.price ?? '(blank)'), { ...sd, severity: 'Medium' });
          const avail = String(offer.availability ?? '').split('/').pop();
          const want = js.available ? 'InStock' : 'OutOfStock';
          if (avail !== want) add('Structured data availability does not match product', want, avail || '(blank)', { ...sd, severity: 'Medium' });
        }
        for (const [field, value] of [['url', product.url], ['offer url', offer?.url]] as const) {
          if (value === undefined) continue;
          const path = new URL(String(value), site.baseUrl).pathname;
          if (path !== `/products/${p.handle}`) add(`Structured data ${field} is wrong`, `/products/${p.handle}`, path, { ...sd, severity: 'Medium' });
        }
        if (!site.structuredData.allowRatings && (product.aggregateRating || product.review)) {
          const r = product.aggregateRating as Record<string, unknown> | undefined;
          add('Product structured data includes ratings or reviews', 'No rating markup unless real reviews exist',
            `rating ${r?.ratingValue ?? '-'} (${r?.ratingCount ?? '-'}), review ${JSON.stringify(product.review ?? null).slice(0, 50)}`,
            { ...sd, severity: 'High', owner: 'SEO + Legal review', notes: 'May conflict with Google structured-data rules; route to legal@ezcorp.com.' });
        }
      });
    }
    groups.flush(ti, site.id);
  });
});
