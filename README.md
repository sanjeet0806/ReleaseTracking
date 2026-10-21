# Shopify QA framework

Config-driven QA checks for Shopify storefronts. Each site is one JSON file in
`sites/`; the same checks run against every site. Currently onboarded:
`shop.ezpawn.com` (`ezpawn`) and `maxpawn.com` (`maxpawn`).

Checks are read-only and send at most one request per second to each site.
Today they use the sites' HTML and Shopify's public JSON; checks that need a
real browser (filters, zip/radius search, visual snapshots, cart) come next,
once the sites' CDN and Wizzy hosts are reachable from the runner.

## Run

Requires Node 22+.

```sh
npm install
npm run test:smoke          # fast checks (~1 min)
npm run test:sanity         # smoke + sanity, the daily run (~3 min)
npm test                    # everything
npm run test:ezpawn         # one site (or: SITES=ezpawn npx playwright test)
```

Runs are started manually. To pause or stop a run, press `Ctrl+C`; the next run
starts fresh. `SEED=2026-10-21` repeats a given day's product sample.

Behind a proxy, set `HTTPS_PROXY` (and `NO_PROXY`); the framework passes it to
Playwright.

## Results

Each run writes to `reports/`:

| File | Contents |
|---|---|
| `findings-<run>.csv` | One row per finding, for triage (open in Excel) |
| `run-summary-<run>.json` | Test counts, flaky count, sample seed, coverage notes |
| `html/index.html` | Playwright report with every step (`npx playwright show-report reports/html`) |

Pass/fail rule: a check fails if anything is mismatched, null or blank;
otherwise it passes.

CSV columns: ID, Run ID, Site, Area, Title, Description, Evidence / URL, Steps
to reproduce, Expected, Actual, Suggested severity, Confidence, Suggested owner,
Found on, Test, Run outcome, Status, Decision (Jira / other), Notes.

- **ID** is stable: the same issue gets the same ID in every run, so it can be
  tracked across files. Repeated issues (for example, the same defect on 10
  sampled products) are grouped into one row with a count and example URLs.
- **Status** is `New`, `Flaky (passed on retry)`, or `Known open (QA-xxx)` for
  issues already logged and waiting on triage.
- **Area = Environment** means the site could not be reached (network, proxy,
  DNS); check the runner before raising a defect.
- Severity and owner are suggestions. The QA owner fills in **Decision**
  (Jira ticket or other follow-up).

## Content baselines

Pages with `"contentBaseline": true` are compared with approved text in
`baselines/<site>/<page>.txt`. A run never changes approved files. When text
is new or different, the run writes it to `baselines-proposed/<site>/` and
records a finding.

To approve: review the proposed file, copy it into `baselines/<site>/`, and
commit it. `npm run baselines:propose` proposes text for every page without
failing on missing baselines.

## Onboard a new Shopify site

1. Copy `sites/maxpawn.json` to `sites/<id>.json` and set `id`, `name`,
   `baseUrl` (https://host, no trailing slash) and `environment`.
2. List `keyPages` (status, expected redirects, expected text, which pages get
   a content baseline) and `keyCollections`.
3. Set `catalog` (required fields and tags, currency, locale, and
   `priceInHtml: false` if the theme draws prices with JavaScript),
   `search.terms` (terms that always have matches) and `sampling`
   (`maxCatalogPage` = catalog size / 250, capped at 100).
4. Run `SITES=<id> npm run baselines:propose`, review and approve the
   baselines, then `SITES=<id> npm run test:sanity`.
5. Log known issues in `knownIssues` so they show as `Known open` until triaged.

The config is validated before any test runs; an invalid file stops the run
and writes one CSV row saying what is wrong.

## Layout

| Path | Purpose |
|---|---|
| `sites/` | One JSON config per site |
| `src/config/` | Config types and validation |
| `src/http/client.ts` | Throttled request client (one worker, 1 request/second per host) |
| `src/findings/` | Findings, grouping, CSV reporter |
| `src/shopify/` | Sitemap and catalog helpers |
| `src/content/` | Content baselines |
| `tests/` | Checks: health, catalog/product, content, search, helper unit tests |
