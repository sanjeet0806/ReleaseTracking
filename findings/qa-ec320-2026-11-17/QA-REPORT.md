# QA report: EC-320 strike-through pricing (devshop)

- **Date:** Nov 17, 2026
- **Build:** devshop preview theme 157172859047 ("EzPawn Phase 2 Design | CJP", draft)
- **Devices:** desktop (1440×900) and mobile (iPhone 13)
- **Related tickets:** EC-320 (story), EC-329 (release task)

## Result: not ready for release

Most of the pricing works: the right discounts show on the homepage, product page and cart. Two problems block release:

1. **The Online Exclusive collection page has no strike-through.**
2. **Checkout takes an extra 10% off**, so the amount charged is lower than the red sale price.

## Results by acceptance criterion

| AC | What it checks | Result | Notes |
| --- | --- | --- | --- |
| AC1 | Original price struck through, sale price in red | Pass | Works on the homepage, product page and cart, on desktop and mobile |
| AC2 | Same display on every page | **Fail** | See problem 1. Search couldn't be tested: searching for promo items by name only returns store inventory items |
| AC3 | Gold 15%, diamond 25% | Pass | See the price checks below |
| AC5 | Checkout charge matches the red sale price | **Fail** | Line prices match, but an extra 10% comes off the order total. See problem 2 |
| AC6 | Strike-through gone after Nov 30 | Not tested | Can only be checked after the promo ends |
| AC8 | Matches Alfredo's design | Not tested | Needs a side-by-side check against the design |

## Price checks

| Item | Type | Original | Expected | Shown (listing, product page, cart, checkout) |
| --- | --- | --- | --- | --- |
| Bead Bracelet 10k 4.9 g | Gold | $514.99 | 15% off | $437.75 |
| Bracelet 14k 6.1 g | Gold | $779.99 | 15% off | $663.00 |
| Lady's Mother's Ring 24k | Lab-grown diamond | $968.99 | 25% off | $726.75 |

Shopify rounds the discount amount down to the cent. For example, 15% of $514.99 is $77.2485, which becomes $77.24, so the sale price is $437.75. The listing, product page, cart and checkout all show the same amount.

All promo items have Price equal to Compare-at Price, which the strike-through calculation needs.

## Problems

### 1. No strike-through on the Online Exclusive collection page (high)
- **Page:** `/collections/online-exclusive`. Every "Online Exclusive" link on the site opens this page.
- **What happens:** cards show only the full price ($514.99, $779.99, …), with no strike-through, sale price or "% off" badge. This happens on desktop and mobile.
- **Layout:** the grid also looks broken on desktop. Images are tiny and titles are cut off ("Bead …", "Brace…").
- **The other page works:** `/collections/online-exclusives` (with an "s") does show the strike-through. But Shopify reports no products in that collection, so it isn't the page shoppers land on.
- **Screenshots:** `d_coll_grid.png`, `m_coll.png`

### 2. An extra 10% off stacks at checkout (high, needs a decision)
- **What happens:** an "Additional 10% Off" order discount is active in devshop today and is applied on top of the 15%/25%.
- **Example:**
  - Bead Bracelet: red sale price $437.75; checkout total before shipping $393.98, after a further $43.77 off.
  - Two items: cart total $990.68, against $1,100.75 in red sale prices.
- **Why it matters:** the Black Friday banner says that offer runs Nov 26–30 only and "cannot be combined with any other markdown, promotion, or discount on a single item." Today it is both active early and stacking.
- **Needs:** confirm whether the Black Friday discount was turned on in devshop only for testing. Before release, check its dates and stacking rules in production.
- **Screenshots:** `d_cart.png`, `d_checkout_single.png`

### 3. Minor
- **Discount name:** the cart line and checkout show "15%off" / "15%OFF" (no space). The 25% discount is named "25% off".
- **Cart summary:** "Additional 10% Off" appears above Subtotal, and Subtotal is shown struck through.
- **Mobile homepage:** the cards show the sale price and the strike-through, but no "15% off" badge was visible. On desktop the badge shows.

## Earlier UAT feedback (Mehak, Nov 5)
- **Homepage discount tag:** fixed. Badges now show on homepage cards on desktop (Utsav, Nov 17).
- **Cart discount display:** fixed. The cart shows the sale price, the struck-through original and the "% off" badge for each item.

## Not affected
Products outside the promo, such as electronics, show only their existing markdowns. The promo discount isn't applied to them.
