import { expect, TestInfo } from '@playwright/test';

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Needs review';

/** One row of the findings CSV. Severity and owner are suggestions; the QA owner decides. */
export interface Finding {
  area: string;
  title: string;
  description?: string;
  url: string;
  steps?: string;
  expected: string;
  actual: string;
  severity: Severity;
  owner?: string;
  notes?: string;
  /** Set for a known, untriaged issue: the row is written but the test does not fail. */
  knownFinding?: string;
  /** Overrides the URL in the stable finding ID, for rows whose example URLs change daily. */
  fingerprint?: string;
}

export const FINDING_ANNOTATION = 'finding';
/** Prefix on soft-assertion messages from verify(), so the reporter can tell them from crashes. */
export const FINDING_MARK = '[finding]';

/** Records a finding against the running test without stopping it. */
export function recordFinding(testInfo: TestInfo, finding: Finding): void {
  testInfo.annotations.push({ type: FINDING_ANNOTATION, description: JSON.stringify(finding) });
}

/**
 * Pass/fail rule: anything mismatched, null or blank fails. When ok is false the
 * finding goes to the CSV and the test is marked failed, but the test keeps
 * running so one product with three problems gives three rows.
 */
export function verify(testInfo: TestInfo, ok: boolean, finding: Finding): boolean {
  if (!ok) {
    recordFinding(testInfo, finding);
    expect.soft(ok, `${FINDING_MARK} ${finding.title} | expected: ${finding.expected} | actual: ${finding.actual} | ${finding.url}`).toBe(true);
  }
  return ok;
}

/**
 * Known open issue (see KeyPage.knownFinding): writes a "Known open" row so it
 * stays visible every run, without failing the test.
 */
export function noteKnown(testInfo: TestInfo, knownFinding: string, finding: Finding): void {
  recordFinding(testInfo, { ...finding, knownFinding });
}

/** True when a value is null, undefined, a blank string, or an array with no non-blank element. */
export function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'number') return Number.isNaN(value);
  if (Array.isArray(value)) return value.every(isBlank);
  return false;
}
