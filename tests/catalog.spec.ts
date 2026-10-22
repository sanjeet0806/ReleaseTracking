import { test } from '../src/fixtures';
import { isBlank, verify } from '../src/findings/finding';
import { IssueGroups } from '../src/findings/aggregate';
import { checkStep } from '../src/findings/steps';
import { describeStatus, EnvironmentError } from '../src/http/client';
import { CatalogProduct, catalogPage, catalogPagePath, formatPrice, normalizeProductPath, productJs } from '../src/shopify/catalog';
import { childSitemapPaths, sitemapIndex } from '../src/shopify/sitemap';
import { ProductField } from '../src/config/types';
import { decodeEntities, jsonLd, metaContent, pageTitle, visibleText } from '../src/util/html';
import { pickNumber, runSeed, sample } from '../src/util/sample';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const norm = (s: unknown): string => decodeEntities(String(s ?? '')).replace(/\s+/g, ' ').trim().toLowerCase();
const plainText = (html: string | null | undefined): string => norm(decodeEntities((html ?? '').replace(/<[^>]+>/g, ' ')).replace(/ /g, ' '));
const squash = (s: string): string => s.replace(/\s+/g, '').toLowerCase();

const IN_STOCK = new Set(['InStock', 'LimitedAvailability', 'OnlineOnly', 'InStoreOnly', 'PreOrder', 'BackOrder', 'PreSale']);
const OUT_OF_STOCK = new Set(['OutOfStock', 'SoldOut', 'Discontinued']);

/** Required catalog fields; the first three are needed to sell the item. */
const CRITICAL_FIELDS: ProductField[] = ['title', 'price', 'images'];

function fieldValue(p: CatalogProduct, field: ProductField): unknown {
  switch (field) {
    case 'images': return p.images.map((i) => i.src);
    case 'price': return p.variants.length ? p.variants.map((v) => (Number(v.price) > 0 ? v.price : '')) : [''];
    case 'sku': return p.variants.length ? p.variants.map((v) => v.sku) : [''];
    case 'body_html': return plainText(p.body_html);
    default: return p[field];
  }
}

test.describe('catalog and product data', () => {
  test('key collections are served and have products @sanity', async ({ site, client }, ti) => {
    for (const handle of site.keyCollections) {
      await checkStep(ti, `Collection ${handle}`, 'Catalog', async () => {
        const path = `/collections/${encodeURIComponent(handle)}/products.json?limit=1`;
        const base = { area: 'Catalog', url: client.url(path), severity: 'High' as const, owner: 'Merchandising', steps: `GET ${client.url(path)}` };
        const res = await client.get(path);
        if (!verify(ti, res.status === 200, { ...base, title: `Collection "${handle}" does not load`, expected: '200', actual: describeStatus(res) })) return;
        let count = 0;
        try {
          count = (JSON.parse(res.text) as { products?: unknown[] }).products?.length ?? 0;
        } catch {
          count = 0;
        }
        verify(ti, count > 0, { ...base, title: `Collection "${handle}" has no products`, expected: 'At least 1 product', actual: '0 products' });
      });
    }
  });

  test('sampled catalog page has complete product data @sanity', async ({ site, client }, ti) => {
    const seed = runSeed(site.id);
    const page = pickNumber(site.sampling.maxCatalogPage, `${seed}:page`);
    const url = client.url(catalogPagePath(page));
    const products = await catalogPage(client, page);
    if (!verify(ti, products.length > 0, {
      area: 'Catalog', url, severity: 'High', owner: 'Ecommerce dev', title: 'Catalog page returned no products',
      expected: 'At least 1 product', actual: `0 products on page ${page}`,
      notes: 'If the catalog shrank, lower sampling.maxCatalogPage in the site config.',
    })) return;
    ti.annotations.push({ type: 'coverage', description: `Catalog fields checked on page ${page} (${products.length} products); Shopify serves pages 1-${site.sampling.maxCatalogPage} only.` });
    const groups = new IssueGroups('products');
    const steps = `GET ${url} (page ${page} from seed ${seed}) and check each product's fields and tags.`;
    const forbidden = site.catalog.forbiddenTagPrefixes.map((p) => ({ prefix: p, key: squash(p) }));
    for (const p of products) {
      groups.countItem();
      const productUrl = client.url(`/products/${encodeURIComponent(p.handle)}`);
      for (const field of site.catalog.requiredProductFields) {
        const value = fieldValue(p, field);
        if (isBlank(value) || (Array.isArray(value) && value.some(isBlank))) {
          groups.add(productUrl, {
            area: 'Catalog data', severity: CRITICAL_FIELDS.includes(field) ? 'High' : 'Low', owner: 'Ecommerce dev / catalog', steps,
            title: `Product field "${field}" is blank`, expected: `Non-blank ${field} on every product`, actual: p.handle,
          });
        }
      }
      for (const prefix of site.catalog.requiredTagPrefixes) {
        if (!p.tags.some((t) => t.startsWith(prefix) && t.length > prefix.length && !isBlank(t.slice(prefix.length)))) {
          groups.add(productUrl, {
            area: 'Catalog data', severity: 'Medium', owner: 'Ecommerce dev / catalog', steps,
            title: `Product has no "${prefix}" tag with a value`, expected: `A tag "${prefix}<value>" on every product`, actual: p.handle,
          });
        }
      }
      for (const { prefix, key } of forbidden) {
        // The tag value itself is never copied into the report (it may be a serial number).
        if (p.tags.some((t) => squash(t).startsWith(key))) {
          groups.add(productUrl, {
            area: 'Data exposure', severity: 'High', owner: 'Data governance + InfoSec', steps,
            title: `Public product data includes "${prefix}" tags`, expected: `No "${prefix}" tags in public product data`,
            actual: `${p.handle} (has a ${prefix} tag; value not shown)`,
            notes: 'Severity is a suggestion; data owners decide whether this is a problem.',
          });
        }
      }
    }
    groups.flush(ti, site);
  });

  test('sampled product pages match product data and structured data is valid @sanity', async ({ site, client }, ti) => {
    // Picks come from one product sitemap chosen by the seed, which spans the
    // whole catalog (the /products.json API stops at page 100).
    const seed = runSeed(site.id);
    const children = (await sitemapIndex(client)).filter((c) => c.kind === 'products');
    if (!verify(ti, children.length > 0, {
      area: 'Product page', url: client.url('/sitemap.xml'), severity: 'High', owner: 'SEO', title: 'No product sitemap to sample from',
      expected: 'At least one sitemap_products_N.xml', actual: '0',
    })) return;
    const child = children[pickNumber(children.length, `${seed}:sitemap`) - 1];
    const handles = (await childSitemapPaths(client, child.path))
      .map((p) => /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?products\/([^/?#]+)$/i.exec(p)?.[1])
      .filter((h): h is string => !!h)
      .map((h) => decodeURIComponent(h));
    const picks = sample(handles, site.sampling.productsPerRun, seed, (h) => h);
    if (!verify(ti, picks.length > 0, {
      area: 'Product page', url: client.url(child.path), severity: 'High', owner: 'SEO', title: 'Product sitemap lists no products',
      expected: `${site.sampling.productsPerRun} products to sample`, actual: '0',
    })) return;

    const groups = new IssueGroups('product pages');
    const steps = `Products sampled from ${child.path} with seed ${seed}. Open each product page and /products/<handle>.js; compare title, price, availability, images, description, add-to-cart and the Product JSON-LD.`;
    const sd = { area: 'SEO / structured data', owner: 'SEO' };
    let soldOutChecked = 0;

    for (const handle of picks) {
      const url = client.url(`/products/${encodeURIComponent(handle)}`);
      const add = (title: string, expected: string, actual: string, extra: { area?: string; severity?: 'High' | 'Medium' | 'Low'; owner?: string; notes?: string } = {}) =>
        groups.add(url, { area: extra.area ?? 'Product page', severity: extra.severity ?? 'High', owner: extra.owner ?? 'Ecommerce dev', steps, title, expected, actual: `${handle}: ${actual}`, notes: extra.notes });

      await test.step(`Product ${handle}`, async () => {
        try {
          const res = await client.get(`/products/${encodeURIComponent(handle)}`);
          if (res.status !== 200) {
            groups.countItem();
            add('Product in sitemap does not load', 'Every sitemap product returns 200', describeStatus(res));
            return;
          }
          const js = await productJs(client, handle);
          groups.countItem();
          const html = res.text;
          const variantPrices = js.variants.map((v) => v.price / 100).filter((n) => n > 0);

          if (isBlank(js.title)) add('Product data title is blank', 'Non-blank title', '(blank)');
          if (!variantPrices.length) add('Product data price is blank or zero', 'Price above zero', String(js.price));
          if (isBlank(js.images)) add('Product data has no images', 'At least 1 image', '0 images');
          if (isBlank(plainText(js.description))) add('Product description is blank', 'Non-blank description', '(blank)', { severity: 'Medium', owner: 'Ecommerce content' });

          const titleOk = norm(pageTitle(html)).includes(norm(js.title)) || norm(metaContent(html, 'property', 'og:title')).includes(norm(js.title));
          if (!titleOk) add('Product page title does not match product data', 'Page <title> or og:title contains the product title', `"${pageTitle(html) || '(blank)'}" vs "${js.title}"`, { severity: 'Medium' });
          if (site.catalog.priceInHtml && variantPrices.length) {
            const shown = variantPrices.some((p) => html.includes(formatPrice(site, p)));
            const og = Number(metaContent(html, 'property', 'og:price:amount')?.replace(/,/g, ''));
            const ogOk = Number.isFinite(og) && variantPrices.some((p) => Math.abs(p - og) < 0.005);
            if (!shown && !ogOk) add('Product page does not show the product price', 'Page HTML shows a variant price (or og:price:amount matches)', `${formatPrice(site, variantPrices[0])} not found`, { severity: 'Medium' });
          }
          if (isBlank(metaContent(html, 'property', 'og:image'))) add('Product page has no og:image', 'og:image meta tag', '(missing)', { severity: 'Low', area: 'SEO', owner: 'SEO' });
          const cartForm = /<form[^>]+action=["'][^"']*\/cart\/add/i.test(html);
          if (js.available && !cartForm) add('Available product has no add-to-cart form', 'form posting to /cart/add', '(not found)');
          if (!js.available) {
            soldOutChecked++;
            const disabled = /<button[^>]*name=["']add["'][^>]*disabled|<button[^>]*disabled[^>]*name=["']add["']/i.test(html) || /sold\s*out/i.test(visibleText(html, 'body'));
            if (cartForm && !disabled) add('Sold-out product still offers Add to cart', 'Add to cart disabled or hidden, or "Sold out" shown', 'cart form present and enabled');
          }

          const ld = jsonLd(html);
          const invalid = ld.find((x) => 'invalid' in x);
          if (invalid) add('Page has invalid JSON-LD', 'Valid JSON in every ld+json block', String(invalid.invalid).slice(0, 60), { ...sd, severity: 'Medium' });
          if (!ld.some((x) => asList(x['@type']).includes('BreadcrumbList'))) add('Product page has no breadcrumb structured data', 'JSON-LD BreadcrumbList', '(missing)', { ...sd, severity: 'Low' });
          const product = ld.find((x) => asList(x['@type']).some((t) => t === 'Product' || t === 'ProductGroup'));
          if (!product) {
            add('Product structured data is missing', 'JSON-LD with @type Product or ProductGroup', '(none)', { ...sd, severity: 'Medium' });
            return;
          }
          if (norm(product.name) !== norm(js.title)) add('Structured data name does not match product title', 'name equals the product title', `"${String(product.name ?? '(blank)')}" vs "${js.title}"`, { ...sd, severity: 'Medium' });

          const offers = [
            ...asList(product.offers),
            ...asList(product.hasVariant).flatMap((v) => (isObj(v) ? asList(v.offers) : [])),
          ].filter(isObj);
          if (!offers.length) {
            add('Structured data has no offer', 'offers with price and availability', '(none)', { ...sd, severity: 'Medium' });
          } else {
            const prices = offers.map((o) => Number(o.price ?? o.lowPrice)).filter((n) => Number.isFinite(n));
            if (!prices.length) add('Structured data offer price is blank', 'offers.price set', '(blank)', { ...sd, severity: 'Medium' });
            else if (!prices.some((p) => variantPrices.some((v) => Math.abs(p - v) < 0.005))) {
              add('Structured data price does not match product price', 'An offer price equals a variant price', `${prices[0]} vs ${variantPrices[0] ?? '(none)'}`, { ...sd, severity: 'Medium' });
            }
            const avails = offers.map((o) => String(o.availability ?? '').split('/').pop() ?? '').filter(Boolean);
            if (!avails.length) add('Structured data availability is blank', 'offers.availability set', '(blank)', { ...sd, severity: 'Medium' });
            else {
              const anyIn = avails.some((a) => IN_STOCK.has(a));
              const unknown = avails.filter((a) => !IN_STOCK.has(a) && !OUT_OF_STOCK.has(a));
              if (unknown.length) add('Structured data availability has an unknown value', 'A schema.org ItemAvailability value', unknown[0], { ...sd, severity: 'Low' });
              else if (anyIn !== js.available) add('Structured data availability does not match product', 'In stock when the product is available, otherwise out of stock', `${avails.join(',')} vs available=${js.available}`, { ...sd, severity: 'Medium' });
            }
          }
          const want = `/products/${handle}`;
          const urls = [['url', product.url], ['offer url', offers[0]?.url]] as const;
          const bad = urls.filter(([, v]) => isBlank(v) || normalizeProductPath(String(v), site.baseUrl) !== want);
          if (bad.length) {
            add('Structured data URL is wrong or missing', 'url and offers.url point to /products/<handle>',
              bad.map(([f, v]) => `${f} ${isBlank(v) ? '(blank)' : normalizeProductPath(String(v), site.baseUrl)}`).join('; '), { ...sd, severity: 'Medium' });
          }
          if (!site.structuredData.allowRatings && (product.aggregateRating || product.review)) {
            const r = isObj(product.aggregateRating) ? product.aggregateRating : undefined;
            const reviews = asList(product.review).filter(isObj);
            add('Product structured data includes ratings or reviews', 'No rating markup unless real reviews exist',
              `rating ${r?.ratingValue ?? '-'} (${r?.ratingCount ?? '-'} ratings), ${reviews.length} review(s), author ${reviews.some((x) => !isBlank(x.author)) ? 'present' : 'absent'}`,
              { ...sd, severity: 'High', owner: 'SEO + Legal review', notes: 'May conflict with Google structured-data rules; route to legal@ezcorp.com.' });
          }
        } catch (e) {
          // Recorded in the group so one bad product does not hide the others.
          const env = e instanceof EnvironmentError;
          groups.add(url, {
            area: env ? 'Environment' : 'Product page', severity: 'Needs review', owner: env ? 'QA / infra' : 'QA', steps,
            title: env ? 'Product page could not be reached' : 'Product check could not complete',
            expected: 'Product page and product data load', actual: `${handle}: ${(e as Error).message.split('\n')[0]}`,
          });
        }
      });
    }
    if (soldOutChecked === 0) ti.annotations.push({ type: 'coverage', description: 'No sold-out product in the sample; sold-out Add to cart handling was not exercised.' });
    groups.flush(ti, site);
  });
});
