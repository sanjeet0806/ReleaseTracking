import path from 'path';
import { test } from '../src/fixtures';
import { Finding, noteKnown, verify } from '../src/findings/finding';
import { checkStep } from '../src/findings/steps';
import { describeStatus } from '../src/http/client';
import {
  baselineName, comparableText, describeChange, diffLines, navigationLinks, NAVIGATION_BASELINE,
  readBaseline, removeProposed, writeProposed,
} from '../src/content/baseline';
import { SiteConfig } from '../src/config/types';
import { visibleText } from '../src/util/html';
import type { TestInfo } from '@playwright/test';

/**
 * Compares `current` with the approved baseline `name`. Records a finding if it
 * differs or has no approved baseline yet; proposes the new text for review.
 * With UPDATE_BASELINES=1, a missing baseline is proposed and listed as
 * "Known open (BASELINE-PENDING)" instead of failing; a changed one still fails.
 */
function compareWithBaseline(ti: TestInfo, site: SiteConfig, name: string, current: string, base: Pick<Finding, 'area' | 'url' | 'owner'> & { label: string }): void {
  const approved = readBaseline(site.id, name);
  if (approved === current) {
    removeProposed(site.id, name);
    return;
  }
  const proposed = path.relative(process.cwd(), writeProposed(site.id, name, current));
  const approve = `review ${proposed}; if correct, copy it to baselines/${site.id}/${name} and commit (QA owner approves via CODEOWNERS).`;
  const { label, ...where } = base;
  if (approved === undefined) {
    const finding: Finding = {
      ...where, severity: 'Needs review', title: `${label} has no approved content baseline`,
      steps: approve.charAt(0).toUpperCase() + approve.slice(1), expected: `baselines/${site.id}/${name}`, actual: 'No approved baseline yet',
    };
    if (process.env.UPDATE_BASELINES === '1') noteKnown(ti, 'BASELINE-PENDING', finding);
    else verify(ti, false, finding);
    return;
  }
  const { added, removed } = diffLines(approved, current);
  const changes = removed.slice(0, 3).map((r) => describeChange(r, added));
  const extraAdded = added.filter((a) => !removed.some((r) => describeChange(r, [a]).includes('→'))).slice(0, 2).map((a) => `added "${a.slice(0, 60)}${a.length > 60 ? '…' : ''}"`);
  verify(ti, false, {
    ...where, severity: 'Medium', title: `${label} text differs from the approved baseline`,
    steps: `Compare baselines/${site.id}/${name} with ${proposed}. If the change is intended, ${approve}`,
    expected: 'Text identical to the approved baseline',
    actual: `${added.length} line(s) added, ${removed.length} removed. ${[...changes, ...extraAdded].join('; ')}`,
    notes: added.length + removed.length === 0 ? 'Only the order of lines changed.' : undefined,
  });
}

test.describe('content comparison', () => {
  test('page text matches the approved baseline @sanity @content', async ({ site, client }, ti) => {
    for (const page of site.keyPages.filter((p) => p.contentBaseline)) {
      await checkStep(ti, `Content: ${page.name}`, 'Content', async () => {
        const res = await client.get(page.path);
        const base = { area: 'Content', url: res.url, owner: 'Ecommerce content', label: page.name };
        if (!verify(ti, res.status === 200, { ...base, severity: 'High', title: `${page.name} does not load for content check`, expected: '200', actual: describeStatus(res) })) return;
        const current = comparableText(visibleText(res.text), site.contentMasks);
        if (!verify(ti, current !== '', {
          ...base, severity: 'High', title: `${page.name} has no text to compare`, steps: `GET ${res.url}; read the text inside <main>.`,
          expected: 'Page text', actual: '(blank)',
        })) return;
        compareWithBaseline(ti, site, baselineName(page.path), current, base);
      });
    }
  });

  test('header and footer links match the approved baseline @sanity @content', async ({ site, client }, ti) => {
    const res = await client.get('/');
    const base = { area: 'Navigation', url: res.url, owner: 'Ecommerce content', label: 'Header and footer links' };
    if (!verify(ti, res.status === 200, { ...base, severity: 'High', title: 'Home page does not load for navigation check', expected: '200', actual: describeStatus(res) })) return;
    const links = navigationLinks(res.text, site.baseUrl);
    if (!verify(ti, links !== '', {
      ...base, severity: 'High', title: 'Home page has no header or footer links', steps: `GET ${res.url}; list links inside <header> and <footer>.`,
      expected: 'Header and footer links', actual: '(none found)',
    })) return;
    compareWithBaseline(ti, site, NAVIGATION_BASELINE, links, base);
  });
});
