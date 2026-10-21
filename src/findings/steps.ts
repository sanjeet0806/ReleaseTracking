import { test, TestInfo } from '@playwright/test';
import { EnvironmentError } from '../http/client';
import { verify } from './finding';

/**
 * Runs one part of a test (one page, one product) as a named step. If it throws,
 * the error is recorded as a finding and the test moves on to the next part, so
 * one unreachable page does not hide the results for the rest.
 */
export async function checkStep(testInfo: TestInfo, name: string, area: string, fn: () => Promise<void>): Promise<void> {
  await test.step(name, async () => {
    try {
      await fn();
    } catch (e) {
      const env = e instanceof EnvironmentError;
      const err = e as Error & { url?: string };
      verify(testInfo, false, {
        area: env ? 'Environment' : area,
        title: env ? `${name}: site could not be reached` : `${name}: check could not complete`,
        url: err.url ?? /https?:\/\/[^\s)'"]+/.exec(err.message)?.[0] ?? '',
        expected: 'Request and check complete', actual: err.message.split('\n')[0],
        severity: 'Needs review', owner: env ? 'QA / infra' : 'QA',
        notes: env ? 'Network, proxy or DNS failure; likely not a site defect.' : undefined,
      });
    }
  });
}
