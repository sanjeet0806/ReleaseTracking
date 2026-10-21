const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', copy: '©',
  reg: '®', trade: '™', bull: '•', middot: '·', deg: '°', frac12: '½',
  eacute: 'é', egrave: 'è', aacute: 'á', oacute: 'ó', ntilde: 'ñ', uuml: 'ü',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k.startsWith('#')) {
      const cp = k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[k] ?? m;
  });
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Value of attribute `name` in a single tag, honoring either quote style. */
export function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${escapeRegex(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? decodeEntities(m[1] ?? m[2]) : undefined;
}

/** Visible text of the <main> element (or <body>), without scripts, templates or markup. */
export function visibleText(html: string): string {
  const noComments = html.replace(/<!--[\s\S]*?-->/g, ' ');
  const main = /<main(?=[\s>])[\s\S]*?<\/main>/i.exec(noComments)?.[0]
    ?? /<body(?=[\s>])[\s\S]*<\/body>/i.exec(noComments)?.[0]
    ?? noComments;
  const stripped = main
    .replace(/<(script|style|noscript|template|svg)(?=[\s>])[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(stripped)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

export function pageTitle(html: string): string {
  return decodeEntities(/<title(?=[\s>])[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').replace(/\s+/g, ' ').trim();
}

export function metaContent(html: string, kind: 'name' | 'property', key: string): string | undefined {
  for (const tag of html.match(/<meta(?=[\s>])[^>]*>/gi) ?? []) {
    if ((attr(tag, kind) ?? '').toLowerCase() === key.toLowerCase()) return attr(tag, 'content');
  }
  return undefined;
}

export function canonical(html: string): string | undefined {
  for (const tag of html.match(/<link(?=[\s>])[^>]*>/gi) ?? []) {
    if ((attr(tag, 'rel') ?? '').toLowerCase() === 'canonical') return attr(tag, 'href');
  }
  return undefined;
}

/**
 * Parsed JSON-LD items, with arrays and @graph flattened. A block that is not
 * valid JSON is returned as { invalid: <first 200 characters> }.
 */
export function jsonLd(html: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const add = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(add);
    if (!v || typeof v !== 'object') return;
    const obj = v as Record<string, unknown>;
    if (Array.isArray(obj['@graph'])) (obj['@graph'] as unknown[]).forEach(add);
    else out.push(obj);
  };
  for (const m of html.matchAll(/<script(?=[\s>])[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      add(JSON.parse(m[1]));
    } catch {
      out.push({ invalid: m[1].trim().slice(0, 200) });
    }
  }
  return out;
}
