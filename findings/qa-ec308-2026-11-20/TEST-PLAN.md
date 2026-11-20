# EC-308 test plan: abandoned-checkout emails 2–4 with tiered discount codes

- **Date:** Nov 20, 2026
- **Environment:** devshop, preview theme 157172859047 ("EzPawn Phase 2 Design | CJP")
- **Ticket:** EC-308 (story, READY FOR QA), parent EC-299 (CJP Online Phase 2)
- **Built in:** Shopify Flow plus Shopify discount codes (not Bloomreach)

## 1. Ticket review

### What's in scope
- **Email 1:** 10 hrs after abandonment, no code. Already live; regression only.
- **Email 2:** 24 hrs after email 1 (34 hrs total), cart reminder, no code.
- **Email 3:** 36 hrs after email 2 (70 hrs total), unique single-use code, tiered by cart subtotal at abandonment.
- **Email 4:** 12 hrs after email 3 (82 hrs total), same code as email 3.
- **Cancellation:** completing checkout cancels every remaining email.

### Tier rules agreed in the ticket comments
| Cart subtotal at abandonment | Code | Status |
| --- | --- | --- |
| Under $900.00 | $25 off | Agreed |
| $900.00 to under $1,500.00 | $50 off | Agreed: $900.00 gets $50 (Mehak) |
| Exactly $1,500.00 | $50 or $100? | **Open.** Jigar proposed $50; no confirmation yet |
| Over $1,500.00 | $100 off | Agreed |

### Gaps to close before sign-off
| # | Gap | Why it matters | Owner |
| --- | --- | --- | --- |
| G1 | **Which "subtotal"?** On devshop, one cart has three values: the original price, the Shopify subtotal after the 15%/25% product discounts, and the total after the "Additional 10% Off". Example: Lady's Mother's Ring is $968.99 original, $726.75 subtotal and $654.08 total. That is $50 by the original price and $25 by the other two. | The tier changes depending on the field the Flow reads | Mehak / Utsav |
| G2 | $1,500.00 tier not confirmed. The AC text still says "greater than $900", which doesn't match the agreed rule. | Boundary test can't pass or fail without a rule | Mehak (update AC) |
| G3 | **Code expiry not defined** (Jigar asked; Mehak handed it to Sanjeet/Utsav) | An AC tests "expired" codes | Utsav to state the setting |
| G4 | **Stacking not defined.** Can the code combine with the EC-320 15%/25% product discounts and the "Additional 10% Off" order discount? The Black Friday banner says that offer "cannot be combined with any other … discount". | Wrong combination settings over- or under-discount | Mehak |
| G5 | Minimum purchase not defined. Can a $100 code be used on a $60 cart? | Revenue risk | Mehak |
| G6 | "Unique to one shopper": is the code locked to the customer's email, or only single-use? | Decides whether a forwarded code should work | Utsav |
| G7 | Email templates are "pending" from Marketing | Content checks are blocked until they arrive | Marketing |
| G8 | **Waits are 10–82 hrs.** The lower-environment demo needs shortened delays, such as a test copy of the Flow using minutes. | Without them a full run takes about 3.5 days | Utsav |
| G9 | Pawn items are one of a kind. What happens when the item sells before email 2, 3 or 4 goes out? | The recovery link may show a sold-out cart, and the code would then be useless | Mehak / Utsav |
| G10 | "Email me with news and offers" is **pre-checked** at checkout. Does the flow send only to opted-in shoppers? | Legal approved emailing opted-in customers only | Marketing / Legal |

Legal approval: Mehak confirmed on Nov 19 that Legal approved this through Marketing. For legal questions, contact legal@ezcorp.com.

## 2. What I checked on devshop today (Nov 20)

| Check | Result |
| --- | --- |
| Preview theme 157172859047 loads | Pass |
| Checkout has an email field ("Used for your order confirmation and cart reminders") | Pass |
| Marketing opt-in checkbox shown | Present, **pre-checked by default** (see G10) |
| Invalid code (`EC308-INVALID-TEST`, also lower case) shows Shopify's standard error and applies no discount | **Pass.** "Enter a valid discount code"; total unchanged at $393.98 ([screenshot](screenshots/co_invalid_code.png)) |
| What checkout calls "Subtotal" | The amount after product-level discounts ($514.99 → $437.75), before the order-level 10% (see G1) |
| Store-inventory items (TVs, tools, etc.) at checkout | Checkout sends them to a "stock problems" page, so only Online Exclusive items can be checked out. **Test carts must use Online Exclusive items.** |
| Emails, Flow runs and code generation | **Not tested.** This needs Shopify admin, which is signed out in this session, and a test inbox |

## 3. Test data (Online Exclusive items on devshop)

Prices are the original price, then the discounted price at checkout, then the total after the 10% order discount.

| ID | Cart | Original | Subtotal | After 10% | Purpose |
| --- | --- | --- | --- | --- | --- |
| D1 | Bracelet 10k 4.1 g | $429.99 | $365.50 | $328.95 | Clearly $25 |
| D2 | Lady's Mother's Ring 24k (lab-grown diamond) | $968.99 | $726.75 | $654.08 | **G1 split:** $50 by original, $25 otherwise |
| D3 | Yellow Gold 14k 5 g + Bead Bracelet 10k | $1,079.98 | $918.00 | $826.20 | **G1 split:** $50 by original or subtotal, $25 after 10% |
| D4 | Bracelet 14k 11.7 g | $1,579.99 | $1,343.00 | $1,208.70 | **G1 split:** $100 by original, $50 otherwise |
| D5 | Gucci Chain 10k + Bracelet 10k 4.1 g | $1,949.98 | $1,657.50 | $1,491.75 | **G1 split:** $100 by original or subtotal, $50 after 10% |
| D6 | Gucci Chain 10k + Bracelet 14k 11.7 g | $3,099.98 | $2,635.00 | $2,371.50 | Clearly $100 |

**Exact boundaries** ($899.99, $900.00, $1,499.99 and $1,500.00) can't be built from real Online Exclusive prices. Ask Utsav for 3 temporary test products priced $899.99, $900.00 and $1,500.00, with no automatic discount. With $0.01 tweaks they also cover $1,499.99 and $1,500.01.

## 4. Test cases

**Setup for each run:** use a fresh test inbox (e.g. a `+ec308-N` alias), an Online Exclusive cart, enter the email at checkout, then leave. Record the abandonment time from the admin "Abandoned checkouts" page.

### A. Cadence
| ID | Steps | Expected |
| --- | --- | --- |
| A1 | Abandon; don't buy | Email 1 at +10h (regression), email 2 at +34h, email 3 at +70h, email 4 at +82h. Allow a tolerance for Flow delay (agree on ± minutes) |
| A2 | Check the order and count | Exactly 4 emails, in order, with no duplicates (in particular, the live email 1 isn't sent twice) |
| A3 | Buy after email 1, before email 2 | Emails 2–4 never sent |
| A4 | Buy after email 2, before email 3 | Emails 3–4 never sent; no code generated (check Discounts) |
| A5 | Buy after email 3, before email 4, **using the code** | Email 4 not sent; code shows as used |
| A6 | Buy after email 3, before email 4, **without the code** | Email 4 not sent |
| A7 | Buy after email 4 | Order succeeds; code still valid if not expired |
| A8 | Buy in a different session or device with the same email | Sequence cancelled (Shopify matches the checkout or customer) |
| A9 | Buy with a different email than the abandoned checkout | Document what happens; expected per Shopify: the sequence continues |
| A10 | Abandon, return, change the cart, abandon again | Document: one or two sequences? Which subtotal sets the tier? (AC: "at time of abandonment") |
| A11 | Two separate abandoned checkouts, same email | Document: one code per checkout (AC: "unique to one abandoned checkout") |
| A12 | Unsubscribe after email 2 | Emails 3–4 not sent |
| A13 | Marketing opt-in **unchecked** at checkout | Matches the agreed rule (G10): no emails 2–4 if opt-in only |
| A14 | Item sells (or is unpublished) before email 3 | Matches the agreed behavior (G9); the email shouldn't link to a dead cart without explanation |

### B. Discount tiers (run with D1–D6 and the boundary products)
| ID | Cart subtotal at abandonment | Expected code |
| --- | --- | --- |
| B1 | $25-ish (smallest cart) | $25 off |
| B2 | $899.99 | $25 off |
| B3 | **$900.00** | **$50 off** (agreed) |
| B4 | $900.01 | $50 off |
| B5 | $1,499.99 | $50 off |
| B6 | **$1,500.00** | **Pending G2** (Jigar proposed $50) |
| B7 | $1,500.01 | $100 off |
| B8 | Very large ($3,000+) | $100 off (no higher tier) |
| B9 | D2–D5 straddle carts | Tier matches the subtotal definition agreed in G1 |
| B10 | Multi-item cart | Tier uses the whole-cart subtotal, not one line |
| B11 | Shipping and tax | Not counted in the tier subtotal |

### C. Codes
| ID | Steps | Expected |
| --- | --- | --- |
| C1 | Compare codes across 3+ abandoned checkouts | Every code is different and not guessable (no sequential pattern) |
| C2 | Compare email 3 and email 4 | Same code; no second code created in admin |
| C3 | Apply the code at checkout | Correct dollar amount ($25/$50/$100) taken from the order |
| C4 | Use the code a second time (new checkout, same email) | Rejected with Shopify's standard error; no discount |
| C5 | Use the code from a different email or customer | Per G6: rejected if customer-locked, else accepted once |
| C6 | Expired code (after the G3 period, or set an end date in admin to force it) | Standard error; no discount |
| C7 | Code in lower case, with leading or trailing spaces | Accepted (Shopify ignores case) |
| C8 | Code on the cart page (if the theme has a field) and via the `/discount/CODE` URL | Per AC "works only when entered at checkout": confirm whether the URL or cart route is allowed |
| C9 | Code together with the EC-320 15%/25% and the "Additional 10% Off" | Matches the G4 stacking rule; final total equals the expected math |
| C10 | Code worth more than the cart (e.g. $100 code, $60 cart) | Per G5; never a negative total; shipping not discounted |
| C11 | Code on a non-Online-Exclusive or excluded product (if exclusions are defined) | Per G4/G5 |
| C12 | Admin discount record | Code type is fixed amount; usage limit 1; end date matches G3; combination settings match G4; title or tag identifies EC-308 |

### D. Email content (once the Marketing templates arrive)
| ID | Check |
| --- | --- |
| D-1 | Subject, preheader and body match Marketing's copy for each of emails 2, 3 and 4 |
| D-2 | Code is clearly visible in emails 3 and 4, with how-to-use instructions (user story 4) |
| D-3 | The dollar amount shown matches the generated code's value |
| D-4 | Expiry date and terms (one use, exclusions) shown, as Legal asked |
| D-5 | "Return to cart" link restores the same cart on desktop and mobile |
| D-6 | Product image, name and price correct; shows the strike-through/sale price if EC-320 applies |
| D-7 | Unsubscribe link and physical address present and working |
| D-8 | Renders in Gmail, Outlook, iOS Mail and dark mode; no broken images or links |
| D-9 | Sender name and from-address correct (EZPAWN) |

### E. Regression
| ID | Check |
| --- | --- |
| E1 | Email 1 timing and content unchanged |
| E2 | Normal checkout without a code is unaffected (EC-320 pricing still correct) |
| E3 | No EC-308 emails go to customers who completed purchase |
| E4 | Bloomreach doesn't also send an abandoned-cart email (no double messaging) |

## 5. Exit criteria
- G1–G6 and G8–G10 answered in the ticket; the AC updated for G2.
- A1–A6, B2–B7, C1–C6, C9 and C12 pass in the lower environment (demo for user story 5).
- D-series passes once the templates are in.
- Any defects logged against EC-308 with screenshots.
