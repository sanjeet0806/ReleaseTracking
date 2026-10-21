import fs from 'fs';
import path from 'path';
import { SiteConfig } from './types';

export const SITES_DIR = path.join(__dirname, '..', '..', 'sites');

const REQUIRED: Array<keyof SiteConfig> = [
  'id', 'name', 'baseUrl', 'environment', 'features', 'keyPages', 'keyCollections',
  'sampling', 'catalog', 'structuredData', 'search', 'leftoverPagePatterns', 'run',
];

/** Production sites may not be hit faster than this. */
export const MIN_PRODUCTION_INTERVAL_MS = 1000;

function fail(source: string, message: string): never {
  throw new Error(`sites/${source}: ${message}`);
}

function checkRegex(source: string, field: string, pattern: unknown): void {
  if (typeof pattern !== 'string' || !pattern) fail(source, `${field} must be a non-empty regex string`);
  try {
    new RegExp(pattern, 'i');
  } catch (e) {
    fail(source, `${field} is not a valid regex: ${(e as Error).message}`);
  }
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

export function validateSite(raw: unknown, source: string): SiteConfig {
  if (!raw || typeof raw !== 'object') fail(source, 'not a JSON object');
  const site = raw as SiteConfig;
  const missing = REQUIRED.filter((k) => site[k] === undefined || site[k] === null);
  if (missing.length) fail(source, `missing ${missing.join(', ')}`);
  if (!/^[a-z0-9-]+$/.test(site.id)) fail(source, 'id must be lowercase letters, digits or dashes');
  if (!/^https:\/\/[^/]+$/.test(site.baseUrl)) fail(source, 'baseUrl must be https://host with no trailing slash');
  if (!['production', 'staging'].includes(site.environment)) fail(source, 'environment must be production or staging');

  const interval = site.run?.minRequestIntervalMs;
  if (typeof interval !== 'number' || !Number.isFinite(interval) || interval < 0) fail(source, 'run.minRequestIntervalMs must be a number');
  if (site.environment === 'production' && interval < MIN_PRODUCTION_INTERVAL_MS) {
    fail(source, `run.minRequestIntervalMs must be at least ${MIN_PRODUCTION_INTERVAL_MS} for production`);
  }
  if (!nonEmptyString(site.run.userAgent)) fail(source, 'run.userAgent is required');
  if (typeof site.run.maxResponseMs !== 'number' || site.run.maxResponseMs < 1) fail(source, 'run.maxResponseMs must be a positive number');

  const s = site.sampling;
  if (!Number.isInteger(s?.maxCatalogPage) || s.maxCatalogPage < 1 || s.maxCatalogPage > 100) fail(source, 'sampling.maxCatalogPage must be an integer 1-100');
  if (!Number.isInteger(s.productsPerRun) || s.productsPerRun < 1) fail(source, 'sampling.productsPerRun must be an integer of at least 1');
  if (s.storePages) {
    checkRegex(source, 'sampling.storePages.pattern', s.storePages.pattern);
    if (!Number.isInteger(s.storePages.perRun) || s.storePages.perRun < 1) fail(source, 'sampling.storePages.perRun must be an integer of at least 1');
  }

  if (!Array.isArray(site.keyPages) || site.keyPages.length === 0) fail(source, 'keyPages must list at least one page');
  site.keyPages.forEach((p, i) => {
    if (!nonEmptyString(p?.name)) fail(source, `keyPages[${i}].name is required`);
    if (!nonEmptyString(p.path) || !p.path.startsWith('/')) fail(source, `keyPages[${i}].path must start with /`);
    const status = p.expectStatus ?? 200;
    if (!Number.isInteger(status) || status < 100 || status > 599) fail(source, `keyPages[${i}].expectStatus must be an HTTP status`);
    if (p.expectRedirectTo !== undefined && (status < 300 || status > 399)) fail(source, `keyPages[${i}].expectRedirectTo needs a 3xx expectStatus`);
    if (status >= 300 && status <= 399 && !nonEmptyString(p.expectRedirectTo)) fail(source, `keyPages[${i}] expects a redirect but has no expectRedirectTo`);
    if (p.expectText !== undefined && (!Array.isArray(p.expectText) || !p.expectText.every(nonEmptyString))) fail(source, `keyPages[${i}].expectText must be a list of non-empty strings`);
  });

  if (!Array.isArray(site.keyCollections)) fail(source, 'keyCollections must be a list');
  if (!Array.isArray(site.catalog.requiredProductFields)) fail(source, 'catalog.requiredProductFields must be a list');
  if (!Array.isArray(site.catalog.requiredTagPrefixes)) fail(source, 'catalog.requiredTagPrefixes must be a list');
  if (!Array.isArray(site.catalog.forbiddenTagPrefixes)) fail(source, 'catalog.forbiddenTagPrefixes must be a list');
  if (!nonEmptyString(site.catalog.currency) || !/^[A-Z]{3}$/.test(site.catalog.currency)) fail(source, 'catalog.currency must be an ISO code such as USD');
  if (!nonEmptyString(site.catalog.locale)) fail(source, 'catalog.locale is required, e.g. en-US');
  if (typeof site.catalog.priceInHtml !== 'boolean') fail(source, 'catalog.priceInHtml must be true or false');
  if (site.knownIssues !== undefined && (!Array.isArray(site.knownIssues) || !site.knownIssues.every((k) => nonEmptyString(k?.match) && nonEmptyString(k?.id)))) fail(source, 'knownIssues must be a list of { match, id }');
  const fields = ['title', 'handle', 'vendor', 'product_type', 'body_html', 'images', 'price', 'sku'];
  const badField = site.catalog.requiredProductFields.find((f) => !fields.includes(f));
  if (badField) fail(source, `catalog.requiredProductFields has unknown field "${badField}" (allowed: ${fields.join(', ')})`);
  if (!Array.isArray(site.search.terms) || !site.search.terms.every(nonEmptyString) || site.search.terms.length === 0) fail(source, 'search.terms must list at least one term');
  if (!nonEmptyString(site.search.noResultTerm)) fail(source, 'search.noResultTerm is required');
  if (!Array.isArray(site.leftoverPagePatterns)) fail(source, 'leftoverPagePatterns must be a list');
  if (site.contentMasks !== undefined) {
    if (!Array.isArray(site.contentMasks)) fail(source, 'contentMasks must be a list of regexes');
    site.contentMasks.forEach((re, i) => checkRegex(source, `contentMasks[${i}]`, re));
  }
  site.leftoverPagePatterns.forEach((re, i) => checkRegex(source, `leftoverPagePatterns[${i}]`, re));
  if (site.leftoverPageAllow !== undefined && (!Array.isArray(site.leftoverPageAllow) || !site.leftoverPageAllow.every(nonEmptyString))) fail(source, 'leftoverPageAllow must be a list of page handles');
  return site;
}

function readSite(file: string): SiteConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(SITES_DIR, file), 'utf8'));
  } catch (e) {
    fail(file, `invalid JSON: ${(e as Error).message}`);
  }
  return validateSite(raw, file);
}

/** Loads every site in sites/, or only those named in SITES (comma-separated ids). */
export function loadSites(): SiteConfig[] {
  const only = (process.env.SITES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const sites = fs.readdirSync(SITES_DIR).filter((f) => f.endsWith('.json')).sort().map(readSite);
  const ids = new Set<string>();
  for (const s of sites) {
    if (ids.has(s.id)) throw new Error(`Duplicate site id "${s.id}" in sites/`);
    ids.add(s.id);
  }
  const unknown = only.filter((id) => !ids.has(id));
  if (unknown.length) throw new Error(`SITES names unknown site(s): ${unknown.join(', ')}`);
  return only.length ? sites.filter((s) => only.includes(s.id)) : sites;
}
