import path from 'path';
import { defineConfig } from '@playwright/test';
import { loadSites } from './src/config/load';
import { SiteConfig } from './src/config/types';
import { SiteOptions } from './src/fixtures';
import { writeFindingsCsv } from './src/findings/csv-reporter';
import { localDate, localStamp } from './src/util/date';

let sites: SiteConfig[];
try {
  sites = loadSites();
} catch (e) {
  // A broken site file stops the run before any test; still leave a CSV row for the QA owner.
  const message = (e as Error).message;
  writeFindingsCsv(path.join(__dirname, 'reports'), localStamp(), localDate(), [{
    siteId: 'config', site: '', test: 'Load site configs', outcome: 'unexpected', status: 'New', confidence: 'Configuration error',
    finding: { area: 'Configuration', title: 'Site config could not be loaded', url: '', expected: 'All sites/*.json files valid', actual: message, severity: 'Needs review', owner: 'QA' },
  }]);
  throw e;
}

// Playwright's request client does not read HTTPS_PROXY; pass it through so runs
// work behind a corporate or sandbox proxy. Credentials in the URL are split out.
function proxyFromEnv() {
  const raw = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  if (!raw) return undefined;
  const u = new URL(raw);
  const username = decodeURIComponent(u.username);
  const password = decodeURIComponent(u.password);
  u.username = '';
  u.password = '';
  return {
    server: u.toString().replace(/\/$/, ''),
    bypass: process.env.NO_PROXY ?? process.env.no_proxy,
    ...(username ? { username, password } : {}),
  };
}
const proxy = proxyFromEnv();

export default defineConfig<SiteOptions>({
  testDir: './tests',
  // Always one worker: the per-host throttle (run.minRequestIntervalMs) is per
  // process, so more workers would multiply the request rate on each site.
  workers: 1,
  retries: 1,
  timeout: 180_000,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['./src/findings/csv-reporter.ts'],
  ],
  projects: sites.map((site) => ({
    name: site.id,
    use: { site, baseURL: site.baseUrl, userAgent: site.run.userAgent, proxy },
  })),
});
