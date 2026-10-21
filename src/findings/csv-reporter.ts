import fs from 'fs';
import path from 'path';
import type { FullConfig, FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { Finding, FINDING_ANNOTATION, FINDING_MARK } from './finding';
import { localDate, localStamp } from '../util/date';
import { hash } from '../util/sample';

const COLUMNS = [
  'ID', 'Run ID', 'Site', 'Area', 'Title', 'Description', 'Evidence / URL', 'Steps to reproduce', 'Expected', 'Actual',
  'Suggested severity', 'Confidence', 'Suggested owner', 'Found on', 'Test', 'Run outcome', 'Status', 'Decision (Jira / other)', 'Notes',
];

export interface Row {
  siteId: string;
  site: string;
  test: string;
  outcome: string;
  status: string;
  confidence: string;
  finding: Finding;
}

const ENV_ERROR = /\[environment\]|ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|tunnel|proxy|certificate/i;

/** Quotes a CSV cell, and neutralizes cells Excel would run as formulas. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Same site + area + title + URL gives the same ID in every run, so a defect can be tracked across files. */
export function findingId(siteId: string, f: Finding): string {
  return `${siteId.toUpperCase()}-${hash(`${siteId}|${f.area}|${f.title}|${f.fingerprint ?? f.url}`).toString(16).padStart(8, '0').slice(0, 6)}`;
}

/** Writes the findings CSV (UTF-8 with BOM, CRLF) and returns its path. */
export function writeFindingsCsv(dir: string, runId: string, foundOn: string, rows: Row[]): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `findings-${runId}.csv`);
  const seen = new Map<string, number>();
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    const f = r.finding;
    const base = findingId(r.siteId || 'RUN', f);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    lines.push([
      n > 1 ? `${base}-${n}` : base, runId, r.site, f.area, f.title, f.description ?? '', f.url, f.steps ?? '',
      f.expected, f.actual, f.severity, r.confidence, f.owner ?? '', foundOn, r.test, r.outcome, r.status, '', f.notes ?? '',
    ].map((v) => csvCell(String(v))).join(','));
  }
  fs.writeFileSync(file, '﻿' + lines.join('\r\n') + '\r\n', 'utf8');
  return file;
}

function clean(message: string): string {
  return message.replace(/\u001b\[[0-9;]*m/g, '').split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? message;
}

/**
 * Writes reports/findings-<runId>.csv and reports/run-summary-<runId>.json.
 *
 * - Failed test: one row per finding, plus a row for every error that is not a
 *   finding (crash, timeout, blocked request), so nothing fails silently.
 * - Flaky test (failed, then passed on retry): the failed attempt's rows, marked "Flaky".
 * - Known open issue (KeyPage.knownFinding): a "Known open" row each run, even when the test passes.
 */
export default class CsvFindingsReporter implements Reporter {
  private readonly tests: TestCase[] = [];
  private readonly runId = localStamp();
  private readonly foundOn = localDate();
  private started = Date.now();
  private sites: Record<string, string> = {};

  constructor(private readonly options: { outputDir?: string } = {}) {}

  onBegin(config: FullConfig): void {
    this.started = Date.now();
    for (const p of config.projects) this.sites[p.name] = String(p.use.baseURL ?? '').replace(/^https?:\/\//, '');
  }

  onTestEnd(test: TestCase): void {
    if (!this.tests.includes(test)) this.tests.push(test);
  }

  private rowsFor(test: TestCase): Row[] {
    const siteId = test.parent.project()?.name ?? '';
    const base = { siteId, site: this.sites[siteId] ?? siteId, test: test.titlePath().slice(2).join(' > ') };
    const outcome = test.outcome();
    const last = test.results.at(-1);
    const rows: Row[] = [];
    const findingsOf = (r: TestResult): Finding[] =>
      r.annotations.filter((a) => a.type === FINDING_ANNOTATION && a.description).map((a) => JSON.parse(a.description!) as Finding);

    if (last) {
      for (const f of findingsOf(last).filter((x) => x.knownFinding)) {
        rows.push({ ...base, outcome, status: `Known open (${f.knownFinding})`, confidence: 'Known issue, untriaged', finding: f });
      }
    }
    const failedAttempt = outcome === 'unexpected' ? last : outcome === 'flaky' ? test.results.find((r) => r.status !== 'passed') : undefined;
    if (!failedAttempt) return rows;
    const status = outcome === 'flaky' ? 'Flaky (passed on retry)' : 'New';
    for (const f of findingsOf(failedAttempt).filter((x) => !x.knownFinding)) {
      rows.push({ ...base, outcome, status, confidence: 'Automated check', finding: f });
    }
    const crashes = failedAttempt.errors.map((e) => clean(e.message ?? e.value ?? '')).filter((m) => m && !m.includes(FINDING_MARK));
    if (failedAttempt.status === 'timedOut' && crashes.length === 0) crashes.push(`Timed out after ${failedAttempt.duration} ms`);
    for (const message of crashes) {
      const env = ENV_ERROR.test(message);
      const url = /https?:\/\/[^\s)'"]+/.exec(message)?.[0] ?? '';
      rows.push({
        ...base, outcome, status, confidence: env ? 'Environment issue' : 'Test error',
        finding: {
          area: env ? 'Environment' : 'Test run',
          title: env ? `Site could not be reached: ${test.title}` : `Test could not complete: ${test.title}`,
          url, expected: 'Test completes', actual: message, severity: 'Needs review', owner: env ? 'QA / infra' : 'QA',
          notes: env
            ? 'Network, proxy or DNS failure; likely not a site defect. Check runner network access, then rerun.'
            : 'Test error rather than a recorded check; review the HTML report for this test.',
        },
      });
    }
    return rows;
  }

  onEnd(result: FullResult): void {
    const dir = this.options.outputDir ?? path.join(process.cwd(), 'reports');
    const rows = this.tests.flatMap((t) => this.rowsFor(t));
    const file = writeFindingsCsv(dir, this.runId, this.foundOn, rows);
    const count = (o: string): number => this.tests.filter((t) => t.outcome() === o).length;
    const summary = {
      runId: this.runId, foundOn: this.foundOn, runStatus: result.status,
      durationSeconds: Math.round((Date.now() - this.started) / 1000),
      seed: process.env.SEED ?? this.foundOn, sites: this.sites,
      tests: { total: this.tests.length, passed: count('expected'), failed: count('unexpected'), flaky: count('flaky'), skipped: count('skipped') },
      findings: rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {}),
      findingsCsv: file,
    };
    fs.writeFileSync(path.join(dir, `run-summary-${this.runId}.json`), JSON.stringify(summary, null, 2) + '\n');
    const t = summary.tests;
    console.log(`\nRun ${this.runId} (${result.status}): ${t.total} tests, ${t.passed} passed, ${t.failed} failed, ${t.flaky} flaky, ${t.skipped} skipped`);
    console.log(`Findings CSV: ${file} (${rows.length} row${rows.length === 1 ? '' : 's'})`);
  }
}
