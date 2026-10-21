import fs from 'fs';
import path from 'path';

export const BASELINES_DIR = path.join(__dirname, '..', '..', 'baselines');
export const PROPOSED_DIR = path.join(__dirname, '..', '..', 'baselines-proposed');

/** File name for a page path: "/pages/faq" -> "pages-faq.txt", "/" -> "home.txt". */
export function baselineName(pagePath: string): string {
  const slug = pagePath.replace(/[?#].*$/, '').replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return `${slug || 'home'}.txt`;
}

/** Page text prepared for comparison: masks removed, one trimmed line per block. */
export function comparableText(text: string, masks: string[] = []): string {
  let out = text;
  for (const m of masks) out = out.replace(new RegExp(m, 'gi'), '');
  return out.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n') + '\n';
}

export function readBaseline(siteId: string, name: string): string | undefined {
  const file = path.join(BASELINES_DIR, siteId, name);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
}

/**
 * Writes the current text as a proposed baseline. Approved baselines in
 * baselines/ are never overwritten by a run: a reviewer copies the proposed
 * file over and commits it.
 */
export function writeProposed(siteId: string, name: string, text: string): string {
  const dir = path.join(PROPOSED_DIR, siteId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, text, 'utf8');
  return file;
}

export interface TextDiff { added: string[]; removed: string[] }

/** Lines added and removed (multiset comparison; order changes are not reported). */
export function diffLines(baseline: string, current: string): TextDiff {
  const count = (s: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (const l of s.split('\n').filter(Boolean)) m.set(l, (m.get(l) ?? 0) + 1);
    return m;
  };
  const a = count(baseline);
  const b = count(current);
  const minus = (x: Map<string, number>, y: Map<string, number>): string[] =>
    [...x].flatMap(([l, n]) => Array<string>(Math.max(0, n - (y.get(l) ?? 0))).fill(l));
  return { added: minus(b, a), removed: minus(a, b) };
}
