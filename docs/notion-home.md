# V4 Theme Migration

Rebuilding the Grunt Style storefront on Shopify's Dawn-based **v4** theme and bringing it to parity with the live **v3** theme, so it can be published without the client noticing anything missing.

> **Status (6 Oct 2026):** build complete against the client's review document. In QA on the dev theme, page by page against live. Not published.

---

## Links

| | |
|---|---|
| Preview (dev theme) | https://gruntstyle.myshopify.com?preview_theme_id=145541234739 |
| Theme editor (dev theme) | https://gruntstyle.myshopify.com/admin/themes/145541234739/editor |
| Repo | `gs-shopify-v4` on GitHub, branch `main` |
| Review-response report | `docs/review-response-2026-10-05.md` in the repo (what changed for every item in the client's review) |
| Section audit (Sept) | `docs/section-audit-2026-09-22.md` in the repo |
| Client review document | "Theme Keeps.pdf" (the list everything below answers) |

---

## Key facts

- **Dev theme:** `145541234739` ("Development (3fbba5-Maxs-MacBook-Pro-3)"). All work lands here.
- **Live theme:** rotates with promos. On 6 Oct it is `146129649715` ("[10/5] Blackout Collection"). Read `Shopify.theme.id` on a live page before trusting an id.
- **Source of truth for templates is the published theme, not the `gs-shopify-v3` repo.** The repo copy was 13 templates behind on 6 Oct. Pull the live theme's `templates/*.json` and port from that.
- **Templates that already exist on the dev theme are never pushed from the repo.** The client edits them live (home, collection, product templates, about, club, contact, foundation, careers, retail pages). New templates and all code are pushed with `shopify theme push --only …`.
- `config/settings_data.json` is live-edited too. New settings ship as schema defaults. If a value must change in bulk: pull, merge, push the one file straight back.
- Only the Shopify CLI app is authorised on the store. No new apps.

---

## What the client asked for, and where it stands

### Defects they reported
| Item | Status |
|---|---|
| Header icons: Accessibility, Customer service, Retail, (Swym star), Account, Cart; mobile Accessibility, Search, Account, Cart | Done. accessiBe trigger in the header, mobile search toggle, Swym star via the launcher setting |
| Product Feature module back (not Dawn image-with-text) | Done, `product-highlight` restored |
| Featured collections colours not honoured | Done |
| Collection grid: remove Compare, Sort By, pagination, black ATC, spacing, "% off" switch, Nosto-style quick add, promo tile text | Done, browser-verified |
| Blog article width | Done (setting) |
| Review stars on complementary products | Done |

### Carried over from v3
| Item | Status |
|---|---|
| Colour schemes 1–5 with v3's extra fields | Done |
| Cart sale message, cart countdown, empty-cart promo | Done (Theme settings › Grunt Style features) |
| Product card inventory, badges, custom tag badges | Done (Theme settings › Grunt Style product cards) |
| 25 v3 sections ("modules") | Ported, render clean. Visual tuning in QA |
| 54 templates (9 collection, 37 page, 7 product, 1 article) | 46 new ones ported; 8 already existed. Render clean. Visual tuning in QA |
| PDP extras: inline qty, stars on price line, inventory status, icon-with-text badging, FOMO block | Done |

---

## QA, where we are

Passes 1 and 2 (the client's complaints; theme settings) are done. Pass 3 (the 39 new templates against live) is in progress; Pass 4 (ported sections not covered by those templates) is next.

Fixed during QA so far: accessiBe hiding its own trigger, Swym launcher selector, duplicate star, quick view on ported collection templates, v3 base styles for ported sections (and the product-card regression that caused), rich-text background image, collection header band, custom tag badges, hero copy and overlay on full-width banners, disabled tiles, colour scheme editor crash, stale promo-landing / new-featured / subscriptions templates.

**How to test a new template:** render it on an existing page: `/collections/all?view=access-limited`, `/pages/about?view=ads-google`, any blog post with `?view=shopping-tips`.

**Running list of QA findings:** keep it on the QA page of this teamspace as page / what's wrong / live screenshot.

---

## Open items

- [ ] Finish Pass 3 and Pass 4.
- [ ] Delete `templates/collection.qa-scratch.json` from the dev theme in the code editor (a verification template; the CLI cannot delete a single remote file).
- [ ] Swym: decide whether the star shows on phones (clear the launcher's mobile selector if not); enable the collections button for the star on cards.
- [ ] Decide whether a Rewards star linking to the club page returns to the header.
- [ ] Editor steps for the client before launch (all in the review-response report): home-page Product Highlight, dark-scheme heading/link colours, empty-cart banner images, promo tile text on collection templates.
- [ ] 900 pre-existing translation errors in theme check (locale keys), unchanged.
- [ ] Message-line block has no font-weight setting, so bold headings on full-width banners come through regular.

---

## Conventions

- Sections stay self-contained: no snippet extraction, no `{% render %}` imports in section files. Shared snippets that already exist (`gs-card-product`, `gs-price`, `gs-reviews`) are fine.
- Files the team authors are `section--*` / `block--*`. Mechanical v3 ports keep the v3 type name. Dawn stock files keep Dawn names.
- Never delete a section or block; retire it as `deprecated--*` with its presets removed.
- Commit a rollback point before any large refactor. Every change in this project is pushed to the dev theme and verified before it is committed.

## Tooling in the repo

| Script | What it does |
|---|---|
| `scripts/port-section.py` | Copies a v3 section in: literal labels, Dawn colour schemes, v3 snippets inlined, assets and locale strings copied, leftovers reported |
| `scripts/migrate-templates.py` | Ports v3 collection/page/article templates; `--v3 <pull dir>` to use a live-theme pull; skips templates that exist on the dev theme |
| `scripts/migrate-product-templates.py` | The product-template port |
| `scripts/check-templates.py --settings` | Validates every template against the schemas (ids, ranges, selects, scheme values) |
