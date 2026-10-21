/** One onboarded Shopify storefront. Each site is a JSON file in sites/. */
export interface SiteConfig {
  id: string;
  name: string;
  baseUrl: string;
  environment: 'production' | 'staging';
  features: {
    zipRadiusSearch: boolean;
    fulfillment: Array<'shipping' | 'pickup'>;
    searchApp: string;
  };
  keyPages: KeyPage[];
  keyCollections: string[];
  sampling: {
    /** Products checked per run, picked from the public catalog. */
    productsPerRun: number;
    /** Shopify serves /products.json pages 1-100 only. */
    maxCatalogPage: number;
    /** Optional rotating sample of store or location pages. */
    storePages?: { pattern: string; perRun: number };
  };
  catalog: {
    /** Product fields that must be non-blank. */
    requiredProductFields: ProductField[];
    /** Each product must carry at least one tag with each prefix, e.g. "Store_". */
    requiredTagPrefixes: string[];
    /** Tag prefixes that must not appear in public product data, e.g. "Serial#". Matched ignoring case and spaces. */
    forbiddenTagPrefixes: string[];
    /** ISO currency and locale used to format prices, e.g. USD / en-US. */
    currency: string;
    locale: string;
    /** false for themes that render the price with JavaScript (skips the price-in-HTML check). */
    priceInHtml: boolean;
  };
  structuredData: {
    /** false = flag aggregateRating/review markup on product pages. */
    allowRatings: boolean;
  };
  search: {
    terms: string[];
    noResultTerm: string;
  };
  /**
   * Open, untriaged issues: a finding whose title contains `match` is written as
   * a "Known open (<id>)" row and does not fail the run. Remove once triaged.
   */
  knownIssues?: Array<{ match: string; id: string }>;
  /**
   * Regexes (case-insensitive) removed from page text before comparing it with
   * the baseline, for parts that change on purpose (dates, counters).
   */
  contentMasks?: string[];
  /** Regexes (case-insensitive) for page handles that look like leftovers. */
  leftoverPagePatterns: string[];
  /** Page handles that match a leftover pattern but are legitimate. */
  leftoverPageAllow?: string[];
  run: {
    minRequestIntervalMs: number;
    userAgent: string;
    /** A page slower than this (server response, not full load) is a finding. */
    maxResponseMs: number;
  };
}

export interface KeyPage {
  name: string;
  path: string;
  /** Defaults to 200. */
  expectStatus?: number;
  /** For an expected redirect: the path it must land on. */
  expectRedirectTo?: string;
  /** Compare the page's text with an approved baseline. */
  contentBaseline?: boolean;
  /**
   * ID of an open, untriaged finding about this page (e.g. "QA-009"). The check
   * still runs and writes a "Known open" row each run until the ID is removed.
   */
  knownFinding?: string;
  /** Text that must appear on the page (header, footer or body), e.g. nav labels. */
  expectText?: string[];
}

export type ProductField = 'title' | 'handle' | 'vendor' | 'product_type' | 'body_html' | 'images' | 'price' | 'sku';
