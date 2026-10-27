# QA Report: CJP release planned for Oct 29, 2026

**Environment:** devshop.ezpawn.com (Shopify store `devezpawn`), desktop Chromium at 1440×900
**Tested:** 2026-10-28 by Sanjeet Tiwari, with Claude Code
**Tickets:** EC-301, EC-302, EC-303, EC-307, EC-309

## Verdict: not ready to release

No ticket passed on devshop. The release changes for EC-301, EC-302 and EC-303 are not deployed to any devshop theme I could reach. EC-307 and EC-309 failed where the code runs.

| Ticket | Jira status | Result on devshop | Summary |
|---|---|---|---|
| EC-301 Scrolling banner on every page | IN QA | ⛔ Not deployed | No promo bar on any theme; the code is in theme repo `main` |
| EC-302 Smaller hero banners | IN QA | ⛔ Not deployed | Hero banners unchanged; repo PR #49 only covers the OE collection page |
| EC-303 Discount sticker and PDP tiers | IN QA | ⛔ Not deployed, plus a spec conflict | No sticker or tiers; the repo code doesn't match the current ticket |
| EC-307 Bloomreach `abandoned_cart` / `abandoned_checkout` | IN DEVELOPMENT | ❌ Fail | No `abandoned_cart` call is made when leaving with items in the cart |
| EC-309 "I'm Interested" phone sent as `001…` | IN QA | ❌ Fail | Phone still sent as `+1…` |

## Themes tested

| Theme | ID | Role | Notes |
|---|---|---|---|
| Wizzy X devezpawn 2 April 2025 [NEW SCRIPT] | 143922102439 | **Published** on devshop | Old design. No CJP storefront and no "I'm Interested" form. Doesn't match production ("EzPawn New Design \| CJP Latest") |
| EzPawn New Design \| 22 May 2026 - Live - Stagging | 155312292007 | Unpublished (preview) | Mirrors repo `main`, per the README. Images don't load |
| EzPawn New Design \| 22 May 2026 - CJP - Stagging | 155245117607 | Unpublished (preview) | Mirrors repo `cjp` |

Each theme was tested in a fresh browser session. The theme name was confirmed on every page through `Shopify.theme`.

## Ticket details

### EC-301: Scrolling banner on every page. ⛔ Not deployed
- **On devshop:** no `ez-promo-bar` element and none of the approved messages ("Did you know you can buy jewelry online…", "Save up to 20%…", "Fresh finds every day…") on the homepage or the OE collection, in any of the three themes. The published theme shows an old static bar ("Jewelry SALE… Ends 12/15").
- **In the code:** the rotating promo bar is in `sections/announcement-bar.liquid` on repo `main`. The messages are theme-editor content (section blocks), so the copy can only be checked after deployment.
- **Needed:** deploy, then confirm on desktop and mobile that the bar appears and scrolls on every page type, the copy matches, it isn't clickable (block links left blank), and it doesn't push content too far down.

### EC-302: Smaller hero banners. ⛔ Not deployed
- **On devshop:** hero banners are unchanged on all themes (screenshots 01 and 02).
- **In the code:** PR #49 makes the **OE collection** hero 40% shorter, which is 60% of the original height and inside the 50–60% target. The **homepage** change isn't in the theme repo. A Jira comment (Oct 16) says the dev team made it, but I couldn't see it on devshop.
- **Needed:** deploy, then confirm at least one row of listings shows on page load on desktop and mobile, with no bad image cropping, on both pages.

### EC-303: Discount sticker and PDP tiers. ⛔ Not deployed, plus a spec conflict
- **On devshop:** on three OE product pages ($514.99, $854.99, $1,019.99), no theme shows the "Inaugural offer" tiers. The items render as "Purchase at store only" with "I'm Interested" instead of Add to cart (screenshot 03). No stickers on OE cards.
- **Conflict 1 (stickers):** the repo code (PR #48, merged Oct 13) shows a single **"Up to 20% off"** sticker on every OE card. The ticket was updated on **Oct 19** to require price-based stickers instead: 10% under $500, 15% for $500–$1,000, 20% over $1,000, explicitly **replacing** "Up to 20% off". Unless the dev team changed this outside the repo, the build doesn't meet the current ticket.
- **Conflict 2 (product page tiers):** the code shows tiers **based on order total** ("Spend under $500 – 10% off…"), as agreed in the Oct 14 Jira comment. The ticket description still says **per item** ("Items under $500 10% off"). Checkout applies the discount by cart size. The product owner should confirm which wording is final, and that per-item stickers next to an order-total discount won't mislead shoppers.

### EC-307: Bloomreach abandoned cart and checkout. ❌ Fail
- **Steps:** add an in-stock item to the cart, open `/cart`, then fire the browser's page-exit events (`visibilitychange`, `pagehide`, `beforeunload`). Every Bloomreach (`exponea`) call was recorded.
- **Result:** on all three themes, with 1 item in the cart, no `track('abandoned_cart')` call was made. The only queued call was `initialize`. No script on the home, cart or product pages contains `abandoned_cart`. (Shopify's own `online_store_buyer_site_abandonment` beacon is unrelated.)
- **`abandoned_checkout`:** to be built with Shopify Flow plus Bloomreach settings copied from MaxPawn (owner: Sanjeet). It can't be checked from the storefront and is still open.

### EC-309: "I'm Interested" phone format. ❌ Fail
- **Steps:** on a store-inventory product page, submit the "I'm Interested" form with "QA Test" and three number formats. The Bloomreach calls were captured locally and nothing was sent to Bloomreach.
- **Result (same on both staging themes):**

| Input | `identify` phone_id | `update` phone | SMS `consent` phone | `store_inquiry` phone | Expected |
|---|---|---|---|---|---|
| `+1 (512) 555-0134` | `+15125550134` | `+15125550134` | `+15125550134` | `+1 (512) 555-0134` (raw) | `0015125550134` |
| `1-512-555-0134` | `+15125550134` | `+15125550134` | `+15125550134` | `1-512-555-0134` (raw) | `0015125550134` |
| `512.555.0134` | `+15125550134` | `+15125550134` | `+15125550134` | `512.555.0134` (raw) | `0015125550134` |

- **Root cause:** `formatPhoneE164()` in `assets/ez-pdp-catalog.js` returns `'+1' + digits`. The `store_inquiry` event sends the raw input, spaces and punctuation included.
- **What works:** name and the other form fields go through unchanged, and the confirmation screen appears (screenshot 04).
- The published devshop theme has no "I'm Interested" form, so this could only be tested on the staging previews.

## Other findings
1. **The devshop published theme is out of date.** It's from April 2025 and doesn't match production. QA should run on the theme that will actually be published, shared as a preview link.
2. **Images don't load on the "Live - Stagging" preview** (logo, hero, sister brands; screenshot 02). This is probably a data or settings gap on the staging theme, not part of this release.

## Limitations
- Bloomreach is blocked from this test environment, and customer-profile checks were skipped as agreed. Events were checked by recording calls in the browser, not in Bloomreach.
- No mobile or visual checks for EC-301, EC-302 or EC-303, because nothing is deployed.

## Recommendation
- **Hold the RFC.** Don't move it to Pending Approval yet.
- **Dev team (Utsav):** deploy the release build to a devshop preview theme and share the `?preview_theme_id=` link. Fix the EC-309 phone format and the EC-307 `abandoned_cart` trigger.
- **Product owner:** confirm the EC-303 sticker logic and tier wording.
- **Then:** rerun this QA. All checks above can be repeated within an hour.

## Screenshots
- `01-published-theme-home.png`: published devshop theme (old design, static sale bar)
- `02-live-staging-home.png`: "Live - Stagging" preview (no promo bar, original hero, broken images)
- `03-cjp-staging-oe-pdp-no-tiers.png`: OE product on "CJP - Stagging" (no tiers, store-only purchase)
- `04-ec309-interest-form-submitted.png`: "I'm Interested" confirmation after the EC-309 test
