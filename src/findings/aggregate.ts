import { TestInfo } from '@playwright/test';
import { SiteConfig } from '../config/types';
import { Finding, noteKnown, verify } from './finding';

type Issue = Omit<Finding, 'url' | 'actual'> & { actual: string };

/** ID of the site's known open issue whose `match` appears in this title, if any. */
export function knownIssueFor(site: SiteConfig, title: string): string | undefined {
  return site.knownIssues?.find((k) => title.includes(k.match))?.id;
}

/**
 * Groups the same issue across many items (products) into one CSV row:
 * "10 of 10 sampled product pages", with example URLs. The row ID stays the same
 * across runs even though the sample changes. Issues listed in the site's
 * knownIssues are written as "Known open" rows and do not fail the run.
 */
export class IssueGroups {
  private readonly groups = new Map<string, { issue: Issue; items: Array<{ url: string; actual: string }> }>();
  private checked = 0;

  constructor(private readonly noun: string) {}

  /** Call once per item actually checked, so the row can say "n of N". */
  countItem(): void {
    this.checked++;
  }

  /** Records that `url` has `issue`. Same title = same group; give a generic `expected`. */
  add(url: string, issue: Issue): void {
    const g = this.groups.get(issue.title) ?? { issue, items: [] };
    g.items.push({ url, actual: issue.actual });
    this.groups.set(issue.title, g);
  }

  /** Writes one row per group. Returns the number of groups. */
  flush(testInfo: TestInfo, site: SiteConfig): number {
    for (const { issue, items } of this.groups.values()) {
      const examples = items.slice(0, 3);
      const finding: Finding = {
        ...issue,
        fingerprint: `${site.id}:${issue.title}`,
        url: examples.map((e) => e.url).join(' '),
        actual: `${items.length} of ${Math.max(this.checked, items.length)} sampled ${this.noun}. Examples: ${examples.map((e) => e.actual).join(' | ')}`,
      };
      const known = knownIssueFor(site, issue.title);
      if (known) noteKnown(testInfo, known, finding);
      else verify(testInfo, false, finding);
    }
    return this.groups.size;
  }
}
