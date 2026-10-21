import { test, expect } from '../src/fixtures';
import { isBlank, noteKnown, verify } from '../src/findings/finding';
import { canonical, pageTitle, visibleText } from '../src/util/html';
import { pagePaths, sitemapIndex } from '../src/shopify/sitemap';
import { runSeed, sample } from '../src/util/sample';

test.describe('site health', () => {
  test('key pages return the expected status, title and content @smoke', async ({ site, client }, ti) => {
    for (const page of site.keyPages) {
      const res = await client.get(page.path);
      const expectStatus = page.expectStatus ?? 200;
      const where = { area: 'Site health', url: res.url, severity: 'High' as const, owner: 'Ecommerce dev' };

      if (page.knownFinding) {
        noteKnown(ti, page.knownFinding, {
          ...where, severity: 'Low', title: `${page.name}: known open issue ${page.knownFinding}`,
          expected: 'Behavior confirmed by the content owner',
          actual: `${res.status}${res.redirectTo ? ` to ${res.redirectTo}` : ''}`,
          notes: 'Remove knownFinding from the site config once triaged.',
        });
      }
      const statusOk = verify(ti, res.status === expectStatus, {
        ...where, title: `${page.name} returns ${res.status}`,
        steps: `Request ${res.url} without following redirects.`,
        expected: String(expectStatus), actual: `${res.status}${res.redirectTo ? ` (to ${res.redirectTo})` : ''}`,
      });
      if (!statusOk) continue;
      if (page.expectRedirectTo) {
        verify(ti, res.redirectTo === page.expectRedirectTo, {
          ...where, severity: 'Medium', title: `${page.name} redirects to the wrong page`,
          expected: page.expectRedirectTo, actual: res.redirectTo ?? '(no Location header)',
        });
        continue;
      }
      verify(ti, !isBlank(pageTitle(res.text)), {
        ...where, severity: 'Medium', title: `${page.name} has a blank <title>`, expected: 'Non-blank title', actual: '(blank)',
      });
      verify(ti, !isBlank(canonical(res.text)), {
        ...where, severity: 'Low', area: 'SEO', owner: 'SEO', title: `${page.name} has no canonical URL`,
        expected: '<link rel="canonical">', actual: '(missing)',
      });
      verify(ti, !isBlank(visibleText(res.text)), {
        ...where, title: `${page.name} has no visible text in the page HTML`, expected: 'Visible text', actual: '(blank)',
      });
    }
  });

  test('robots.txt and sitemap index are served @smoke', async ({ client }, ti) => {
    const robots = await client.get('/robots.txt');
    verify(ti, robots.status === 200 && !isBlank(robots.text), {
      area: 'SEO', url: robots.url, severity: 'Medium', owner: 'SEO', title: 'robots.txt is missing or blank',
      expected: '200 with content', actual: `${robots.status}, ${robots.text.length} bytes`,
    });
    const index = await sitemapIndex(client);
    for (const kind of ['products', 'collections', 'pages'] as const) {
      verify(ti, index.children.some((c) => c.kind === kind), {
        area: 'SEO', url: client.url('/sitemap.xml'), severity: 'Medium', owner: 'SEO', title: `Sitemap index lists no ${kind} sitemap`,
        expected: `At least one sitemap_${kind}_N.xml`, actual: `${index.children.length} child sitemaps, none for ${kind}`,
      });
    }
  });

  test('missing product URL returns 404 @smoke', async ({ site, client }, ti) => {
    const res = await client.get(`/products/qa-missing-${runSeed(site.id).replace(/[^a-z0-9]/gi, '-').toLowerCase()}`);
    verify(ti, res.status === 404, {
      area: 'Site health', url: res.url, severity: 'Medium', owner: 'Ecommerce dev', title: 'Missing product does not return 404',
      expected: '404', actual: `${res.status}${res.redirectTo ? ` (to ${res.redirectTo})` : ''}`,
    });
  });

  test('no leftover test or draft pages are published @sanity', async ({ site, client }, ti) => {
    const paths = await pagePaths(client);
    expect(paths.length, 'pages sitemap lists pages').toBeGreaterThan(0);
    const patterns = site.leftoverPagePatterns.map((p) => new RegExp(p, 'i'));
    for (const path of paths) {
      const handle = path.replace(/^\/pages\//, '').split(/[?#]/)[0];
      const hit = patterns.find((re) => re.test(handle));
      verify(ti, !hit, {
        area: 'Content', url: client.url(path), severity: 'Low', owner: 'Ecommerce content',
        title: `Possible leftover page is published: ${handle}`,
        steps: 'Open the URL; confirm whether the page should be public.',
        expected: 'Page unpublished, or added to an allowed list', actual: `Listed in the pages sitemap (matches /${hit?.source}/i)`,
      });
    }
  });

  test('sampled store pages load with a store title @sanity', async ({ site, client }, ti) => {
    test.skip(!site.sampling.storePages, 'No store pages configured for this site');
    const cfg = site.sampling.storePages!;
    const re = new RegExp(cfg.pattern, 'i');
    const stores = (await pagePaths(client)).filter((p) => re.test(p));
    expect(stores.length, `store pages matching ${cfg.pattern}`).toBeGreaterThan(0);
    const bare = site.name.split(' ')[0].toLowerCase();
    for (const path of sample(stores, cfg.perRun, runSeed(site.id), (p) => p)) {
      const res = await client.get(path);
      if (!verify(ti, res.status === 200, {
        area: 'Store pages', url: res.url, severity: 'High', owner: 'Ecommerce dev', title: `Store page returns ${res.status}`,
        expected: '200', actual: String(res.status),
      })) continue;
      const title = pageTitle(res.text);
      const storePart = title.split(/\s[–—|-]\s/)[0].trim();
      verify(ti, !isBlank(storePart) && storePart.toLowerCase() !== bare, {
        area: 'Store pages', url: res.url, severity: 'Medium', owner: 'Ecommerce content', title: 'Store page title has no store name or address',
        expected: 'Title starts with the store address', actual: title || '(blank)',
      });
    }
  });
});
