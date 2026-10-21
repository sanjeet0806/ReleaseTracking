import { test as base } from '@playwright/test';
import { SiteConfig } from './config/types';
import { SiteClient } from './http/client';

export interface SiteOptions { site: SiteConfig }

export const test = base.extend<SiteOptions & { client: SiteClient }>({
  site: [undefined as unknown as SiteConfig, { option: true }],
  client: async ({ request, site }, use) => {
    if (!site) throw new Error('Playwright project has no "site" in use{}; projects are built from sites/*.json in playwright.config.ts');
    await use(new SiteClient(request, site));
  },
});

export { expect } from '@playwright/test';
