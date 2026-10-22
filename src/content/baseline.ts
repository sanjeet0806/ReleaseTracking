import fs from 'fs';
import path from 'path';
import { attr, decodeEntities } from '../util/html';

export const BASELINES_DIR = path.join(__dirname, '..', '..', 'baselines');
export const PROPOSED_DIR = path.join(__dirname, '..', '..', 'baselines-proposed');
/** Baseline file for the header and footer link list (one per site). */
export const NAVIGATION_BASELINE = '_navigation.txt';

/** File name for a page path: "/pages/faq" -> "pages-faq.txt", "/" -> "home.txt". Query strings are not allowed (see load.ts). */
export function baselineName(pagePath: string): string {
  const slug = pagePath.replace(/[?#].*$/, '').replace(/^\/+|\/+$/g, '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\//g, '--').replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  return `${slug || 'home'}.txt`;
}

/** Text prepared for comparison: LF line endings, masks removed, one trimmed line per block, one trailing newline. */
export function comparableText(text: string, masks: string[] = []): string {
  let out = text.replace(/\r\n?/g, '\n');
  for (const m of masks) out = out.replace(new RegExp(m, 'gi'), '');
  const lines = out.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return lines.length ? lines.join('\n') + '\n' : '';
}

/** Approved baseline, normalized the same way as current text (so CRLF files from Windows still match). */
export function readBaseline(siteId: string, name: string): string | undefined {
  const file = path.join(BASELINES_DIR, siteId, name);
  return fs.existsSync(file) ? comparableText(fs.readFileSync(file, 'utf8')) : undefined;
}

/**
 * Writes the current text as a proposed baseline. Approved baselines in
 * baselines/ are never overwritten by a run: a reviewer copies the proposed
 * file over and commits it (CODEOWNERS requires the QA owner's review).
 */
export function writeProposed(siteId: string, name: string, text: string): string {
  const dir = path.join(PROPOSED_DIR, siteId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, text, 'utf8');
  return file;
}

/** Removes a proposal once the page matches its approved baseline again, so stale files do not mislead the reviewer. */
export function removeProposed(siteId: string, name: string): void {
  fs.rmSync(path.join(PROPOSED_DIR, siteId, name), { force: true });
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

/**
 * Short description of one change: for a removed line, finds the added line that
 * shares the longest start with it and shows where they part, e.g.
 * '…returns within 30 days → …returns within 14 days'.
 */
export function describeChange(removed: string, added: string[], width = 60): string {
  const prefix = (x: string, y: string): number => {
    let i = 0;
    while (i < x.length && i < y.length && x[i] === y[i]) i++;
    return i;
  };
  const best = added.map((a) => ({ a, n: prefix(removed, a) })).sort((p, q) => q.n - p.n)[0];
  const cut = (s: string, at: number): string => {
    const start = Math.max(0, at - 20);
    return `${start > 0 ? '…' : ''}${s.slice(start, start + width)}${start + width < s.length ? '…' : ''}`;
  };
  if (!best || best.n < 10) return `removed "${cut(removed, 0)}"`;
  return `"${cut(removed, best.n)}" → "${cut(best.a, best.n)}"`;
}

/** "header | Why Buy From Us | /pages/why-ezpawn" lines for every link in <header> and <footer>. */
export function navigationLinks(html: string, baseUrl: string): string {
  const out: string[] = [];
  const noScripts = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|template|noscript)(?=[\s>])[\s\S]*?<\/\1>/gi, ' ');
  for (const region of ['header', 'footer'] as const) {
    for (const block of noScripts.match(new RegExp(`<${region}(?=[\\s>])[\\s\\S]*?<\\/${region}>`, 'gi')) ?? []) {
      for (const m of block.matchAll(/<a(?=[\s>])([^>]*)>([\s\S]*?)<\/a>/gi)) {
        const href = attr(m[1], 'href');
        if (!href || href.startsWith('#') || /^javascript:/i.test(href)) continue;
        let text = decodeEntities(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() || attr(m[1], 'aria-label') || '(no text)';
        // A bare number is a live counter (cart items, wishlist), not a label.
        if (/^\d+$/.test(text)) text = '(count)';
        let target = href;
        try {
          const u = new URL(href, baseUrl);
          target = u.origin === new URL(baseUrl).origin ? u.pathname + u.search : u.toString();
        } catch {
          /* keep the raw href */
        }
        out.push(`${region} | ${text} | ${target}`);
      }
    }
  }
  return comparableText([...new Set(out)].join('\n'));
}
