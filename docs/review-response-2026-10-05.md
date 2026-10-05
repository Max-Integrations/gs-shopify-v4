# Response to the client review ("Theme Keeps.pdf")

**Date:** 2026-10-05
**Branch:** `main`, commits `e2abc4b` … `a9df812` (rollback point: `48cbf71`)
**Dev theme:** 145541234739, every change below is pushed and verified there.
**Preview:** `https://gruntstyle.myshopify.com?preview_theme_id=145541234739`

The client reviewed the v4 dev theme against the live v3 theme and listed defects, settings and
"modules" to carry over, 54 templates that must exist, and some nice-to-haves. This report
mirrors that list. Templates that already existed on the dev theme were **not** pushed (the
client edits them live); new templates and all code were.

---

## 1. Defects they reported

| Reported | Cause found | Done |
|---|---|---|
| Header icons: desktop Accessibility, Customer Service, Retail, Account, Cart; mobile Accessibility, Search, Account, Cart; Favorites star from the app | v4 rendered star/help/pin links, no accessibility icon, no mobile search, no app slot | Icon link blocks gain accessibility and headset icons, an "open accessibility menu" action (renders accessiBe's `.acsb-trigger` button), and "show on mobile". An `@app` block in the icon row takes the Swym launcher. A mobile search toggle drops the field under the top row. accessiBe loads from `assets/gs-accessibe.js` with v3's options (Theme settings > Grunt Style features). |
| "Give me back the Product Feature module" | Audit had folded `product-highlight` into Dawn image-with-text, which lacks the mobile image, per-set chevron switches, content padding, mobile reverse and per-section colours | `sections/product-highlight.liquid` is back with its preset. The product template migration passes it through (v3's product templates switched to it on 2026-10-01). |
| Featured collections colours not honoured | Heading/tab colours were scheme-only; `color_scheme: ""` on three product templates fell back to `:root`; `enable_product_badges` never reached the card | Heading, tab and active-tab colour settings; blank scheme treated as scheme-1; badges switch wired. Colour schemes also gained the v3 fields (below). |
| Remove Compare | Checkbox with no JavaScript; shown only because `settings.compare` did not exist | Removed. |
| Sort By not working | Server-side sort worked. The toolbar sits outside the re-rendered regions, so the chosen option never moved and the panel stayed open (a 70 vh sheet on mobile, over the re-sorted grid). On desktop the panel was anchored `right: 0` on a left-hand control and hung 88 px off the viewport | Script marks the option and closes the panel; panel anchors left. Verified in a browser on desktop and at phone width. |
| Pagination off, needs colour control | Dawn's underline style | v3's boxed style, with a **Pagination colours** block on the collection section. |
| Card ATC colour not updating, should be black | Hardcoded brand red in CSS | Theme settings > Product cards > quick view colours (default black/white), overridable per template on the **Product Card Quick View** block. |
| Spacing between price and ATC | 130 px reserved region plus 12 px button gap | Tightened defaults; three spacing ranges on the **Product Grid** block. |
| "% off" as a switch, for A/B tests | Always on because the setting did not exist | Theme setting (off by default) and a per-template override on the **Product Card Price** block. |
| Mobile quick add cuts off sizes; wants the Nosto layout | The quick view dialog's stylesheet never loaded (its tag sat outside the node the script keeps); no in-card option | Dialog stylesheet is global now. The Quick View block has a **quick add** mode: "Select Size" strip over the image with abbreviated sizes (always visible on touch), a QUICK ADD button that posts the chosen size and opens the drawer with the new line. Verified end to end in a browser. |
| Promo banner text does not show | Heading and description are empty on the live templates and `desc_color` is transparent | Transparent/empty colours fall back to white; overlay sits behind the text strip as v3 did. **The client still needs to type the heading/description on the live template.** |
| Blog article width via custom CSS | Fixed 68ch | **Article width** setting on the article section. |
| No review stars on complementary products | Stars render when the product has review metafields (3 of 5 did in the test); they were just not styled for the slot | v3's 10 px stars. Products with no reviews show none, as before. |
| Footer custom CSS | The client's own editor CSS; nothing to port | Engravers MT regular/bold are theme assets with an `@font-face`; the footer brand subheading uses it. |

Also fixed on the way: `main-collection` declared an `@app` block it never rendered; `gs-price` compared `sale_label_type` to a value v3 never used; quick view's add did not refresh the drawer.

## 2. Theme settings and Grunt Style features carried over

- **Colour schemes 1–5.** The scheme group gains v3's heading, link, button hover, secondary button, input, divider, rating and arrow colours. Defaults are v3's primary values and apply to the existing schemes without a settings_data push; heading, link and secondary button fall back to Dawn's derivation until a value is entered. For the dark schemes (3, 4, 6) enter heading `#ffffff` and link `#aaaaaa` / `#e0dad0` / `#ffffff` in the editor.
- **Cart sale message, cart countdown, empty-cart promo banner & copy:** Theme settings > Grunt Style features, v3's setting ids, live values as defaults ("YOUR ARSENAL IS EMPTY" is on; sale bar and countdown are off until enabled; banner images need choosing).
- **Product card inventory levels and badges:** Theme settings > Product cards (every setting the card snippets read now exists; "Made to order" state restored).
- Already present and left alone: PDP conditional tag messaging (`block--product-message`), holiday navigation highlight (header settings).

## 3. Modules carried over

Already in v4 (no work): Sale Promo Message / Full Width Image-Text V2, Value Props, Media Grid, Featured collections, Countdown, Single CTA, Custom Testimonials, Multicolumn w/Hover, Image Grid, Retail Location, Collapsible content, Multi-message bar, Multicolumn IMG+Text, Club join steps.

Ported from v3 with `scripts/port-section.py` (v3 type names kept, schema labels made literal, scheme ids mapped, the v3-only snippets inlined, assets and locale strings copied): `full-width-image-with-text` (v1), `shapes`, `media-grid-deals`, `multicolumn-with-yt-shorts`, `wonderment-faq` (the FAQ module), `anchor-tag`, `text-scroller-v2` (was `deprecated--text-scroller`), `text-scroller` (v1), `featured-content`, `trending-products-ticker`, `page-template-override`, `countdown-banner`, `slideshow`, `marquee`, `events-header`, `events-image-grid`, `two-column-media-highlight`, `beer-guarantee-receipt-upload`, `wonderment-custom-html`, `related-posts`, `spotlight` (Shop the look), `products-collage`, `collection-carousel`, `video-banner`, `product-short-videos`, plus the two AI-generated theme blocks the `_blocks` templates use (the shopping-tips ticker among them).

The six that ran on v3's Flickity and theme.js now run on `assets/gs-slideshow.js` (native scroll-snap scroller with arrows, autoplay and wrap-around) and `assets/gs-marquee.js` (v3's marquee speed on its own), with `assets/gs-carousel.css`. All 25 render on the dev theme without Liquid errors; they have **not** been visually tuned one by one.

## 4. Templates

`scripts/migrate-templates.py` ported the 39 requested templates that did not exist (7 collections, 31 pages, the shopping-tips article); the 8 that already existed were skipped. All 39 are on the dev theme and render without Liquid errors. Pages and collections keep their template assignment (the suffix is on the page/collection, not the theme), so they pick these up when the theme is published.

Dropped from the ported templates, all of them **disabled** in v3 so nothing live was lost: `page-hero-banners`, `custom-orders` (section), `sale-promo-message`, `events-module`, `Collapsible-content`, `featured-collection`, `wonderment-hero/rebuy/fairing/kno`. Four `media-grid` instances carried `custom_css` written for v3's markup; dropped and listed in the script output.

Product templates in the repo were regenerated from v3 (not pushed): they now carry the client's recent v3 edits (Swym wishlist block in the buy box, a club badge, Wonderment ETA settings) and the product-highlight band. `product.a-partner` and `product.mystery` are new and were pushed.

## 5. Nice-to-haves

Done: quantity beside the ATC (buy-buttons block option), stars on the price line (price block option), inventory status block, icon-with-text block ("Made to Order" badging with highlight and icon), FOMO message block (shows the real stock count at or under a threshold; live "people viewing" numbers need an app). Already true: variant labels abbreviated (S, M, 2XL) without touching products; small colour swatches (swatch block size setting); complementary products are already a carousel.

---

## What the client does in the editor (not pushed from here)

1. **Header:** add an Icon link block with the Accessibility icon, action "Open the accessibility menu", "show on mobile" on; change the Help block's icon to Headset and link it to `/pages/contact-grunt-style`; add the Swym wishlist app block between Retail and Account.
2. **Collections:** on the Product Card Quick View block choose "Quick add" where wanted and set colours; add a Pagination colours block; set "% off" per template for the A/B test; type the promo tile heading/description.
3. **Home page:** re-add Product Highlight (the live v3 instance is "FREEDOM FIGHTER", background `#dddad6`, CTA `#ab192d`, navy chevrons). v3's live top banner is now the Tees & Hoodies sale, not the Violence campaign; the countdown and testimonials custom CSS from v3 were not carried.
4. **Product templates:** add Inventory status / Icon with text / FOMO blocks where wanted; set "stars on the price line" and remove the app rating block if preferred; "quantity beside the button" on the buy-buttons block.
5. **Theme settings:** dark-scheme heading/link colours (section 2); enable the cart sale message/countdown when needed; choose the empty-cart banner images; accessiBe is on by default.
6. **Cleanup:** `templates/collection.qa-scratch.json` is a verification template left on the dev theme because the CLI cannot delete a single remote file and its store token lacks theme scope; delete it in the code editor. The three live collection templates still carry the dead `product_card_title_color` on the quick-view block; harmless.

## Not done

- Visual tuning of the 25 ported sections and 39 templates against the live site, page by page.
- Translations: the 900 pre-existing MatchingTranslations errors remain (theme check otherwise clean).
- v3 sections outside the requested list (`visual-merchandising-blocks`, influencer pages, `club-gs-giveaway-*`, `clubhouse`, `honor-the-fallen`, `order-status-tracking`, …) were not ported; their templates were not requested.
