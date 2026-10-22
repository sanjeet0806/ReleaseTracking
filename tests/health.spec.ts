import { test } from '../src/fixtures';
import { Finding, isBlank, noteKnown, verify } from '../src/findings/finding';
import { checkStep } from '../src/findings/steps';
import { describeStatus } from '../src/http/client';
import { canonical, pageTitle, visibleText } from '../src/util/html';
import { pageHandle, pagePaths, SitemapError, sitemapIndex, sitemapPaths, SitemapKind } from '../src/shopify/sitemap';
import { runSeed, sample } from '../src/util/sample';

/** Shopify titles end with " – <shop name>"; returns [page part, shop part]. */
function splitTitle(title: string): [string, string] | undefined {
  const parts = title.split(/\s[–—|-]\s/);
  return parts.length < 2 ? undefined : [parts.slice(0, -1).join(' - ').trim(), parts.at(-1)!.trim()];
}

test.describe('site health', () => {
  test('key pages return the expected status, title and content @smoke', async ({ site, client }, ti) => {
    for (const page of site.keyPages) {
      await checkStep(ti, `Key page: ${page.name}`, 'Site health', async () => {
        const res = await client.get(page.path);
        const expectStatus = page.expectStatus ?? 200;
        const base: Pick<Finding, 'area' | 'url' | 'owner' | 'steps'> = {
          area: 'Site health', url: res.url, owner: 'Ecommerce dev',
          steps: `GET ${res.url} without following redirects; check status, <title>, <link rel="canonical"> and page text.`,
        };

        if (page.knownFinding) {
          noteKnown(ti, page.knownFinding, {
            ...base, severity: 'Low', title: `${page.name}: known open issue ${page.knownFinding}`,
            expected: 'Behavior confirmed by the content owner', actual: describeStatus(res),
            notes: 'Remove knownFinding from the site config once triaged.',
          });
        }
        if (!verify(ti, res.status === expectStatus, {
          ...base, severity: 'High', title: `${page.name} does not return the expected status`,
          expected: String(expectStatus), actual: describeStatus(res),
        })) return;
        verify(ti, res.ms <= site.run.maxResponseMs, {
          ...base, area: 'Performance', severity: 'Low', title: `${page.name} responds slowly`,
          expected: `Server response within ${site.run.maxResponseMs} ms`, actual: `${res.ms} ms`,
          notes: 'Single measurement; rerun before raising.',
        });

        if (page.expectRedirectTo) {
          if (!verify(ti, res.redirectTo === page.expectRedirectTo, {
            ...base, severity: 'Medium', title: `${page.name} redirects to the wrong page`,
            expected: page.expectRedirectTo, actual: res.redirectTo ?? '(no Location header)',
          })) return;
          const target = await client.get(page.expectRedirectTo);
          verify(ti, target.status === 200, {
            ...base, url: target.url, severity: 'High', title: `${page.name} redirects to a page that does not load`,
            expected: '200', actual: describeStatus(target),
          });
          return;
        }
        if (res.status < 200 || res.status > 299) return; // an expected error page has no content to check

        verify(ti, !isBlank(pageTitle(res.text)), {
          ...base, severity: 'Medium', title: `${page.name} has a blank <title>`, expected: 'Non-blank title', actual: '(blank)',
        });
        verify(ti, !isBlank(canonical(res.text)), {
          ...base, area: 'SEO', owner: 'SEO', severity: 'Low', title: `${page.name} has no canonical URL`,
          expected: '<link rel="canonical">', actual: '(missing)',
        });
        verify(ti, !isBlank(visibleText(res.text)), {
          ...base, severity: 'High', title: `${page.name} has no visible text in the page HTML`, expected: 'Visible text', actual: '(blank)',
        });
        const bodyText = visibleText(res.text, 'body').toLowerCase();
        for (const text of page.expectText ?? []) {
          verify(ti, bodyText.includes(text.toLowerCase()), {
            ...base, area: 'Content', owner: 'Ecommerce content', severity: 'Medium', title: `${page.name} is missing expected text "${text}"`,
            expected: `Page text includes "${text}"`, actual: '(not found)',
          });
        }
      });
    }
  });

  test('robots.txt, sitemap index and sitemap links are served @smoke', async ({ site, client }, ti) => {
    const steps = 'GET the URL; for sitemaps, open the first child sitemap of each kind and request a sample of its links.';
    await checkStep(ti, 'robots.txt', 'SEO', async () => {
      const robots = await client.get('/robots.txt');
      verify(ti, robots.status === 200 && !isBlank(robots.text), {
        area: 'SEO', url: robots.url, steps, severity: 'Medium', owner: 'SEO', title: 'robots.txt is missing or blank',
        expected: '200 with content', actual: `${describeStatus(robots)}, ${robots.text.length} bytes`,
      });
    });
    await checkStep(ti, 'Sitemaps', 'SEO', async () => {
      let index;
      try {
        index = await sitemapIndex(client);
      } catch (e) {
        if (!(e instanceof SitemapError)) throw e;
        verify(ti, false, {
          area: 'SEO', url: e.url, steps, severity: 'High', owner: 'SEO', title: 'Sitemap index does not load',
          expected: '200', actual: String(e.status),
        });
        return;
      }
      for (const kind of ['products', 'collections', 'pages'] as SitemapKind[]) {
        if (!verify(ti, index.some((c) => c.kind === kind), {
          area: 'SEO', url: client.url('/sitemap.xml'), steps, severity: 'Medium', owner: 'SEO', title: `Sitemap index lists no ${kind} sitemap`,
          expected: `At least one sitemap_${kind}_N.xml`, actual: `${index.length} child sitemaps, none for ${kind}`,
        })) continue;
        let links: string[];
        try {
          links = await sitemapPaths(client, kind, 1);
        } catch (e) {
          if (!(e instanceof SitemapError)) throw e;
          verify(ti, false, {
            area: 'SEO', url: e.url, steps, severity: 'High', owner: 'SEO', title: `First ${kind} sitemap does not load`,
            expected: '200', actual: String(e.status),
          });
          continue;
        }
        verify(ti, links.length > 0, {
          area: 'SEO', url: client.url('/sitemap.xml'), steps, severity: 'Medium', owner: 'SEO', title: `First ${kind} sitemap lists no URLs`,
          expected: 'At least one URL', actual: '0 URLs',
        });
        for (const path of sample(links.filter((p) => p !== '/'), 3, runSeed(site.id), (p) => p)) {
          const res = await client.get(path);
          verify(ti, res.status === 200, {
            area: 'SEO', url: res.url, steps, severity: 'Medium', owner: 'SEO', title: `URL listed in the ${kind} sitemap does not load`,
            expected: '200', actual: describeStatus(res), notes: 'Sitemaps should list only live URLs.',
          });
        }
      }
    });
  });

  test('missing product URL returns 404 @smoke', async ({ client }, ti) => {
    const res = await client.get('/products/qa-missing-product-zz');
    verify(ti, res.status === 404, {
      area: 'Site health', url: res.url, steps: `GET ${res.url} without following redirects.`,
      severity: 'Medium', owner: 'Ecommerce dev', title: 'Missing product does not return 404',
      expected: '404', actual: describeStatus(res),
    });
  });

  test('no leftover test, draft or duplicate pages are published @sanity', async ({ site, client }, ti) => {
    let paths: string[];
    try {
      paths = await pagePaths(client);
    } catch (e) {
      if (!(e instanceof SitemapError)) throw e;
      verify(ti, false, {
        area: 'Content', url: e.url, severity: 'Medium', owner: 'SEO', title: 'Pages sitemap does not load',
        expected: '200', actual: String(e.status),
      });
      return;
    }
    if (!verify(ti, paths.length > 0, {
      area: 'Content', url: client.url('/sitemap.xml'), severity: 'Medium', owner: 'SEO', title: 'Pages sitemap lists no pages',
      expected: 'At least one page', actual: '0 pages',
    })) return;
    const handles = new Set(paths.map(pageHandle));
    const allowed = new Set((site.leftoverPageAllow ?? []).map((h) => h.toLowerCase()));
    const patterns = site.leftoverPagePatterns.map((p) => new RegExp(p, 'i'));
    const storeRe = site.sampling.storePages ? new RegExp(site.sampling.storePages.pattern, 'i') : undefined;
    for (const path of paths) {
      const handle = pageHandle(path);
      if (allowed.has(handle.toLowerCase()) || storeRe?.test(path)) continue;
      const hit = patterns.find((re) => re.test(handle));
      // "authenticity1" next to "authenticity": a numbered copy of an existing page.
      const base = /^(.+?)-?\d+$/.exec(handle)?.[1];
      const copyOf = base && base !== handle && handles.has(base) ? base : undefined;
      verify(ti, !hit && !copyOf, {
        area: 'Content', url: client.url(path), severity: 'Low', owner: 'Ecommerce content',
        title: `Possible leftover page is published: ${handle}`,
        steps: 'Open the URL; confirm whether the page should be public. If it should, add the handle to leftoverPageAllow in the site config.',
        expected: 'Page unpublished, or listed in leftoverPageAllow',
        actual: hit ? `Listed in the pages sitemap (matches /${hit.source}/i)` : `Listed in the pages sitemap; looks like a numbered copy of /pages/${copyOf}`,
      });
    }
  });

  test('sampled store pages load with a store title @sanity', async ({ site, client }, ti) => {
    test.skip(!site.sampling.storePages, 'No store pages configured for this site');
    const cfg = site.sampling.storePages!;
    const re = new RegExp(cfg.pattern, 'i');
    const stores = (await pagePaths(client)).filter((p) => re.test(p));
    if (!verify(ti, stores.length > 0, {
      area: 'Store pages', url: client.url('/sitemap.xml'), severity: 'High', owner: 'Ecommerce dev', title: 'No store pages in the pages sitemap',
      expected: `Pages matching ${cfg.pattern}`, actual: '0 pages',
    })) return;
    for (const path of sample(stores, cfg.perRun, runSeed(site.id), (p) => p)) {
      await checkStep(ti, `Store page ${path}`, 'Store pages', async () => {
        const res = await client.get(path);
        const steps = `GET ${res.url}; read the <title>. Store details load by JavaScript and are checked in the browser suite.`;
        if (!verify(ti, res.status === 200, {
          area: 'Store pages', url: res.url, steps, severity: 'High', owner: 'Ecommerce dev', title: 'Store page does not return 200',
          expected: '200', actual: describeStatus(res),
        })) return;
        const title = pageTitle(res.text);
        const split = splitTitle(title);
        verify(ti, !!split && !isBlank(split[0]) && split[0].toLowerCase() !== split[1].toLowerCase(), {
          area: 'Store pages', url: res.url, steps, severity: 'Medium', owner: 'Ecommerce content', title: 'Store page title has no store name or address',
          expected: 'Title like "410 N. New Braunfels – EZPAWN"', actual: title || '(blank)',
        });
      });
    }
  });
});
