import { TestInfo } from '@playwright/test';
import { Finding, verify } from './finding';

type Issue = Omit<Finding, 'url' | 'actual'> & { actual: string };

/**
 * Groups the same issue across many items (products) into one CSV row:
 * "Doubled URL in structured data: 10 of 10 sampled products", with example
 * URLs. The row ID stays the same across runs even though the sample changes.
 */
export class IssueGroups {
  private readonly groups = new Map<string, { issue: Issue; items: Array<{ url: string; actual: string }> }>();
  private checked = 0;

  constructor(private readonly noun: string) {}

  /** Call once per item checked, so the row can say "n of N". */
  countItem(): void {
    this.checked++;
  }

  /** Records that `url` has `issue`. Same issue title = same group. */
  add(url: string, issue: Issue): void {
    const g = this.groups.get(issue.title) ?? { issue, items: [] };
    g.items.push({ url, actual: issue.actual });
    this.groups.set(issue.title, g);
  }

  /** Writes one finding per group (each fails the test). Returns the number of groups. */
  flush(testInfo: TestInfo, siteId: string): number {
    for (const { issue, items } of this.groups.values()) {
      const examples = items.slice(0, 3);
      verify(testInfo, false, {
        ...issue,
        fingerprint: `${siteId}:${issue.title}`,
        url: examples.map((e) => e.url).join(' '),
        actual: `${items.length} of ${this.checked} sampled ${this.noun}. Examples: ${examples.map((e) => e.actual).join(' | ')}`,
      });
    }
    return this.groups.size;
  }
}
