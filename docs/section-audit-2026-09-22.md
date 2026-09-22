# Section audit and consolidation

**Date:** 2026-09-22
**Branch:** `main`
**Rollback point:** `ec0265a` — `git reset --hard ec0265a` restores the tree exactly as it was before this work.

---

## Why

The v4 theme carried three generations of sections side by side: Dawn stock, mechanical v3 ports, and the newer `section--*` / `block--*` files built to the client's design. Several sections did the same job with different settings models, and a few carried 30–53 settings where child blocks would serve better. This audit mapped every section to where it is used across the 34 templates and 2 section groups, grouped the ones doing the same job, and moved repeated settings into blocks.

**Nothing was deleted.** Every retired section is renamed `deprecated--<name>.liquid` with its presets stripped and its schema name suffixed "(old)", so existing template JSON still validates but the section no longer appears in the "Add section" picker. The prefix keeps all 38 of them together at the top of a directory listing.

One file had to be shortened to fit Shopify's 50-character section filename limit: `influencer-page-collection-highlight` became `deprecated--influencer-collection.liquid`, the same way its sibling `influencers-overview-profile-highlights` had already become `influencer-highlights`.

---

## Results at a glance

| | Before | After |
|---|---|---|
| Section files | 78 | 83 (45 active, 38 deprecated) |
| Sections doing the tile-grid job | 4 | 1 |
| Sections doing the banner job | 5 | 2 |
| Testimonials sections | 2 | 1 |
| Sections above theme-check's 40-setting limit | 4 | 0 |

Settings removed from the biggest offenders:

| Section | Settings before | Settings after |
|---|---|---|
| club-join-steps | 31 | 2 |
| countdown | 33 | 12 |
| gs-cart-addons | 16 | 1 |
| section--testimonials | 23 | 16 |
| header | 27 | 21 |
| product-highlight | 53 | retired |
| multicolumn-with-content-hover | 44 | retired |
| section--full-width-image_text | 18 (+ 27 across two block types) | retired |

---

## Usage map before the work

| Section | Instances | Where |
|---|---|---|
| images-grid | 28 | 20 retail store pages ("In-Store Exclusives"), 3 collection templates, about, club ×3, foundation |
| section--retail-location | 21 | retail store pages |
| rich-text (Dawn) | 12 | about, club, contact, foundation, careers, retail hub |
| multicolumn (Dawn) | 8 | about, club, contact, foundation ×2, careers ×3 |
| featured-collections | 5 | index ×2, article, product, foundation |
| image-banner (Dawn) | 3 | about, contact, foundation |
| section--media-grid | 3 | index ×2, retail hub |
| image-with-text, multirow, video (Dawn) | 2 each | club/foundation, about ×2, careers ×2 |
| value-props, custom-testimonials | 2 each | index, foundation |
| Single instance | 1 each | countdown, product-highlight, multicolumn-with-content-hover (index); section--testimonials, section--single-cta-button, club-join-steps (club); section--about-details, section--stories-single-image (about); section--full-width-image_text, section--embed-toggle (careers); section--video-banner (foundation); section--contact-channels, section--contact-form, collapsible-content (contact) |

---

## Defects found and fixed

1. **`templates/index.json` was structurally invalid.** Its `order` array listed three section ids that no longer existed (`full_width_image_with_text_v2_MqghR7`, `max_integrations_sale_promo_message_4Qz89H`, `full_width_image_with_text_v2_MiAgyh`), and one disabled section was present in `sections` but missing from `order`. Shopify rejects templates where the two disagree.
2. **`events-module.liquid` never compiled.** Its header comment contained a literal `{% comment %}` tag, which nests and leaves the outer comment unclosed.
3. **The old `media-grid` section opened a `<span>` inside a `{% capture %}`**, which theme check reads as unclosed HTML. Rebuilt with `assign`.
4. **`section--sale-promo-message.liquid` had invalid schema JSON** (a trailing comma). It was orphaned: present in `index.json`'s sections but absent from `order`, and its only snippet (`spm-promo-button`) was unreferenced.
5. **`section--media-grid` never dimmed sibling tiles** on a sub-collection page. The section's own loop over its theme blocks could not see what the tile's identical test saw. Now the tile alone marks itself `.is-current` and the CSS dims its siblings with `:has()`.

**Not fixed (separate task):** 900 `MatchingTranslations` theme-check errors. GS locale keys (`general.countdown.*`, `products.product.badges.*`, and others) exist only in `en.default.json` and are missing from the other locale files.

---

## Sections retired as unused

No template referenced these. Renamed, not deleted.

**Dawn stock a GS section already replaces (17):** `collage`, `collection-list`, `contact-form`, `featured-blog`, `featured-collection`, `featured-product`, `newsletter`, `page`, `slideshow`, `related-products`, `disclosures`, `quick-order-list`, `bulk-quick-order-list`, `main-collection-banner`, `main-collection-product-grid`, plus the two below.

**v3 ports for pages that do not exist in v4 (11):** `events-full-width-image`, `events-header`, `events-image-grid`, `events-module`, `events-subheader`, `influencer-page-collection-highlight`, `influencer-page-details`, `influencer-page-discount-code`, `influencer-highlights`, `page-hero-influencers`, `text-scroller`.

**Orphaned (1):** `section--sale-promo-message`.

`apps` and `custom-liquid` were kept as generic utilities.

---

## Consolidations

### Tile grids: four sections became one

`images-grid` (30 settings + 9 per tile), `section--stories-single-image` (21 + 26), `multicolumn-with-content-hover` (44 + 7) and `section--media-grid` all rendered a heading over a row or grid of image tiles. They differed only in layout behaviour, so that behaviour became settings on `section--media-grid`.

**`section--media-grid` gained:**
- `layout` — grid or carousel (native scroll-snap, driven by the shared `gs-swatch-scroller.js` already loaded from `layout/theme.liquid`)
- 1–6 tiles per row on desktop, 1–4 on mobile
- `tile_ratio` — fixed row height, or natural / square / portrait / landscape from the image
- `tile_width` — full, three-quarter or half slot, for centred rows of small tiles
- `content_placement` — content over the image or below it
- card background and padding, circle-badge headings
- Dawn's `padding_top` / `padding_bottom` pair in place of the v3 heading kit

**`block--media-tile` gained:**
- a `collection` picker that supplies the image, title and link, and marks the tile current on that collection's page
- `hover_text` revealed over the image on hover, focus or tap
- `hover_overlay` — keep the overlay, lift it, or show it only on hover

**Migrated:** all 28 `images-grid` instances (collection strips, club perks and monthly tees, About logo row, Foundation gallery, 20 retail "In-Store Exclusives"), the About history timeline, and the homepage "About the brand" cards.

### Banners

| Retired | Now | Notes |
|---|---|---|
| `section--full-width-image_text` | `image-banner` | Careers hero: an image with one heading block. |
| `section--video-banner` | `image-banner` | `image-banner` gained `video_desktop` / `video_mobile`: muted looping background video, images as posters, "adapt" uses the video's own ratio so a wide desktop file and a squarer mobile file each keep their shape. Only the video for the current breakpoint loads. |
| `product-highlight` (53 settings) | `image-with-text` | `image-with-text` gained a second button block and a `show_chevrons` decoration with two colours. |

### Testimonials

`custom-testimonials` folded into `section--testimonials`, which is a superset (per-quote rating, author photo, enlarge mode, autoplay, dots). Field mapping: `testimonial_heading` → `author_title`, `comment_text` → `message`, `customer_name` → `author`, `customer_jd` → `country_name`.

`section--testimonials` also lost the v3 heading kit (bracket highlight, highlight style, gradient flag, separate heading tag) and its four pixel paddings, in favour of heading + size + alignment and Dawn's padding pair.

### Other one-instance merges

| Retired | Now | Notes |
|---|---|---|
| `section--single-cta-button` | `rich-text` + one button block | The button block gained `open_in_new_tab`; a new colour scheme-6 (black background, gold button) gives the club band its yellow-on-black look. |
| `section--about-details` | `multicolumn` | Three columns on scheme-2 cards; the store-page links became a rich-text line in the first column. |

---

## Settings moved into blocks

| Section | Before | Blocks now | Settings left |
|---|---|---|---|
| `club-join-steps` | 31 settings: 4 step headers + icons, 2 hardcoded plans | `step_fit`, `step_size`, `step_plan`, `step_review` (heading, progress label, icon, step copy); `plan` (key, label, price, ribbon, saving, was-price, Skio selling plan id, icon) | 2 — anchor id, product handle prefix |
| `gs-cart-addons` | 16 settings across 3 independent features | `free_shipping`, `gift_wrap`, `roundup`, one each, rendered in block order | 1 — colour scheme |
| `countdown` | 33 settings | `heading`, `subheading`, `text`, `timer`, `products`, `donation` | 12 |
| `header` | rewards/help/stores label+link pairs | `utility_link` (icon, label, link) | 21 |
| `main-404` | fixed primary/secondary button pair | `button` (label, link, style) | 5 |

A third club plan is now an added block rather than a code change. The cart's three add-ons are added, removed and reordered in the editor instead of toggled by checkboxes.

---

## Commits

| Commit | What |
|---|---|
| `ec0265a` | Rollback point before section consolidation |
| `ed2b456` | Deprecate unused sections, fix index.json order, fix two syntax errors |
| `144019d` | Fold five one-instance sections into Dawn sections |
| `00482c1` | Merge custom-testimonials into section--testimonials |
| `934f039` | Move repeated settings into blocks |
| `e94bfeb` | Consolidate the four tile-grid sections onto section--media-grid |
| `a2693a5` | Fix dev-theme push validation |
| `348229d` | Media grid: dim non-current tiles with CSS `:has()` |
| _(this change)_ | Add this report; rename deprecated sections to the `deprecated--` prefix |

---

## Verification

- **Theme check:** zero errors other than the pre-existing 900 translation errors.
- **Template consistency:** every template's `order` matches its `sections`, every `type` resolves to a file on disk, and every `block_order` matches its `blocks`.
- **Dev theme 145541234739:** pushed cleanly. Home, about, club, contact, foundation, careers, retail hub, a store page, two collections, a sub-collection, cart, 404 and a product page all return 200 with no Liquid errors and the new markup present.

Preview: `https://gruntstyle.myshopify.com?preview_theme_id=145541234739`

### Visual differences to review before this goes further

1. The About "Retail / Perks / Rewards" cards use Dawn multicolumn styling with text links, not the previous black buttons on grey cards.
2. The club "Join The Members-Only Community" band is a Dawn button on scheme-6 rather than a hand-styled yellow bar.
3. The homepage "About the brand" cards reveal on hover and focus; the old `+` / `−` toggle button is gone.
4. Retail "In-Store Exclusives" strips and collection "Shop by product type" strips now use the media grid's carousel, so gap and arrow styling differ slightly from the old images-grid.

---

## Follow-up work not done here

1. **Translations.** 900 missing locale keys, the only remaining theme-check errors.
2. **`featured-collections`** still carries 44 settings, 20 of them pixel spacing and 6 CTA colours that Dawn's padding pair and colour scheme could replace. It is used 5 times, so it is a real migration rather than a rename.
3. **Deleting the deprecated files** once the client signs off on the live result.
4. **`gs-swatch-scroller.js`** now drives five components and should be renamed `gs-scroller.js`.
