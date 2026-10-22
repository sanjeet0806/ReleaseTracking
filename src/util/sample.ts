import { localDate } from './date';

/** Seed: SEED env if set, else today's business date, so a same-day rerun checks the same items. */
export function runSeed(siteId: string): string {
  return `${process.env.SEED ?? localDate()}:${siteId}`;
}

/** FNV-1a 32-bit hash. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Picks up to n distinct items by ranking each on hash(seed + key) and taking the
 * lowest. An item's rank does not depend on the rest of the list, so a sale that
 * removes one product leaves the other picks unchanged.
 */
export function sample<T>(items: readonly T[], n: number, seed: string, key: (item: T) => string): T[] {
  return [...items]
    .map((item) => ({ item, rank: hash(`${seed}|${key(item)}`) }))
    .sort((a, b) => a.rank - b.rank || key(a.item).localeCompare(key(b.item)))
    .slice(0, Math.max(0, n))
    .map((x) => x.item);
}

/** A number in [1, max] chosen by the seed. */
export function pickNumber(max: number, seed: string): number {
  return (hash(seed) % Math.max(1, max)) + 1;
}
