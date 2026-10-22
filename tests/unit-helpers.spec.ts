import { test, expect } from '../src/fixtures';
import { isBlank } from '../src/findings/finding';
import { csvCell, findingId } from '../src/findings/csv-reporter';
import { sample } from '../src/util/sample';
import { canonical, decodeEntities, jsonLd, metaContent, visibleText } from '../src/util/html';

// Offline checks of shared helpers; no site requests.
test.describe('framework helpers @unit', () => {
  test('isBlank treats null, blank and all-blank arrays as blank', () => {
    expect([null, undefined, '', '  ', [], ['', null], NaN].every(isBlank)).toBe(true);
    expect([0, false, 'a', ['', 'a']].some(isBlank)).toBe(false);
  });

  test('sample keeps the same picks when other items are added or removed', () => {
    const items = Array.from({ length: 50 }, (_, i) => `p${i}`);
    const picks = sample(items, 5, 'seed', (x) => x);
    const unpicked = items.filter((x) => !picks.includes(x));
    const changed = [...items.filter((x) => x !== unpicked[0]), 'new-item'];
    const again = sample(changed, 5, 'seed', (x) => x).filter((x) => x !== 'new-item');
    expect(picks.slice(0, again.length).every((x) => again.includes(x) || picks.indexOf(x) >= again.length)).toBe(true);
    expect(sample(items, 5, 'seed', (x) => x)).toEqual(picks);
  });

  test('html helpers handle entities, quotes and look-alike tags', () => {
    expect(decodeEntities('&#99999999; &ndash; &rsquo; &amp;')).toBe('&#99999999; – ’ &');
    expect(metaContent(`<meta property="og:title" content="Men's Rolex">`, 'property', 'og:title')).toBe("Men's Rolex");
    expect(metaContent(`<meta data-name="description" content="x">`, 'name', 'description')).toBeUndefined();
    expect(canonical(`<link href='https://a/b' rel='canonical'>`)).toBe('https://a/b');
    expect(visibleText('<main-menu>Nav</main-menu><main><script>x</script><p>Real &amp; text</p></main>')).toBe('Real & text');
    expect(jsonLd('<script type="application/ld+json">{"@graph":[{"@type":"Product"}]}</script>')[0]['@type']).toBe('Product');
    expect(jsonLd('<script type="application/ld+json">{bad</script>')[0]).toHaveProperty('invalid');
  });

  test('csv cells are quoted and formula-safe; finding IDs are stable', () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    const f = { area: 'A', title: 'T', url: 'u', expected: '', actual: '', severity: 'Low' as const };
    expect(findingId('ezpawn', f)).toBe(findingId('ezpawn', { ...f, actual: 'different' }));
  });
});

test.describe('content baseline helpers @unit', () => {
  test('baselines compare equal across CRLF and trailing newlines; names do not collide', async () => {
    const { comparableText, baselineName, diffLines, describeChange, navigationLinks } = await import('../src/content/baseline');
    expect(comparableText('A\r\nB\r\n')).toBe(comparableText('A\nB'));
    expect(comparableText('  \n ')).toBe('');
    expect(baselineName('/pages/a-b')).not.toBe(baselineName('/pages/a/b'));
    expect(baselineName('/')).toBe('home.txt');
    expect(diffLines('a\nb\n', 'a\nc\n')).toEqual({ added: ['c'], removed: ['b'] });
    expect(describeChange('Returns accepted within 30 days of purchase', ['Returns accepted within 14 days of purchase'])).toContain('→');
    const nav = navigationLinks('<header><a href="/cart">3</a><a href="/pages/faq">FAQ</a></header><footer><a href="https://x.com/a">X</a></footer>', 'https://shop.test');
    expect(nav).toBe('header | (count) | /cart\nheader | FAQ | /pages/faq\nfooter | X | https://x.com/a\n');
  });
});
