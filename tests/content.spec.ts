import path from 'path';
import { test } from '../src/fixtures';
import { verify } from '../src/findings/finding';
import { checkStep } from '../src/findings/steps';
import { describeStatus } from '../src/http/client';
import { baselineName, comparableText, diffLines, readBaseline, writeProposed } from '../src/content/baseline';
import { visibleText } from '../src/util/html';

const clip = (lines: string[], n = 3): string => lines.slice(0, n).map((l) => (l.length > 80 ? `${l.slice(0, 80)}…` : l)).join(' / ');

test.describe('content comparison', () => {
  test('page text matches the approved baseline @sanity @content', async ({ site, client }, ti) => {
    const update = process.env.UPDATE_BASELINES === '1';
    for (const page of site.keyPages.filter((p) => p.contentBaseline)) {
      await checkStep(ti, `Content: ${page.name}`, 'Content', async () => {
        const res = await client.get(page.path);
        const base = { area: 'Content', url: res.url, owner: 'Ecommerce content' };
        if (!verify(ti, res.status === 200, { ...base, severity: 'High', title: `${page.name} does not load for content check`, expected: '200', actual: describeStatus(res) })) return;
        const name = baselineName(page.path);
        const current = comparableText(visibleText(res.text), site.contentMasks);
        const approved = readBaseline(site.id, name);
        if (approved === current) return;
        const proposed = path.relative(process.cwd(), writeProposed(site.id, name, current));
        const approve = `Review ${proposed}; if correct, copy it to baselines/${site.id}/${name} and commit.`;
        if (approved === undefined) {
          if (update) {
            ti.annotations.push({ type: 'coverage', description: `New baseline proposed for ${page.name}: ${proposed}` });
            return;
          }
          verify(ti, false, {
            ...base, severity: 'Needs review', title: `${page.name} has no approved content baseline`,
            steps: approve, expected: `baselines/${site.id}/${name}`, actual: 'No approved baseline yet',
          });
          return;
        }
        const { added, removed } = diffLines(approved, current);
        verify(ti, false, {
          ...base, severity: 'Medium', title: `${page.name} text differs from the approved baseline`,
          steps: `Compare baselines/${site.id}/${name} with ${proposed}. If the change is intended, ${approve.charAt(0).toLowerCase()}${approve.slice(1)}`,
          expected: 'Text identical to the approved baseline',
          actual: `${added.length} line(s) added, ${removed.length} removed${removed.length ? `. Removed: ${clip(removed)}` : ''}${added.length ? `. Added: ${clip(added)}` : ''}`,
          notes: added.length + removed.length === 0 ? 'Only the order of lines changed.' : undefined,
        });
      });
    }
  });
});
