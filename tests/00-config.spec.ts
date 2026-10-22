import { test, expect } from '../src/fixtures';

// Chunk 1 smoke check: the site config loads and the site answers.
test('site config is valid and the storefront responds @smoke', async ({ site, client }) => {
  expect(site.keyPages.length, 'at least one key page configured').toBeGreaterThan(0);
  const res = await client.get('/');
  expect(res.status, `${client.url('/')} status`).toBe(200);
});
