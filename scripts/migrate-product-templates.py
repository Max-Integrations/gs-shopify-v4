"""Build the ten non-default v4 product templates from their v3 counterparts.

Usage: python3 scripts/migrate-product-templates.py [path-to-v3-repo]

The default template (templates/product.json) is the hand-built reference:
its buy-box blocks (gating rules, badges, value props, accordions...) are
the base every other template starts from, and each v3 template's own
main-product block list decides which of them appear, in which order, plus
the template-specific ones (countdown, custom liquid, promo image,
description accordion, custom-content tabs).

Non-main v3 sections map onto v4 sections that already exist; the mapping
is the one in docs/section-audit-2026-09-22.md. Nothing new is invented:
where v3 had a feature v4 has no home for (products-collage's product
list, product_variations) it is dropped and printed.

Idempotent: re-running overwrites the ten files from v3 again.
"""
import json, re, glob, os, sys, copy

V3 = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Documents/GitHub/gs-shopify-v3')
def load(p): return json.loads(re.sub(r'^\s*/\*.*?\*/\s*', '', open(p).read(), flags=re.S))
def save(p, d):
    json.dump(d, open(p, 'w'), indent=2, ensure_ascii=False); open(p, 'a').write('\n')
def clamp(v, lo, hi, step=1):
    try: v = float(v)
    except (TypeError, ValueError): v = lo
    v = max(lo, min(hi, v)); return int(round((v - lo) / step) * step + lo)
# Shopify's richtext/inline_richtext settings permit a short tag list and
# almost no attributes: class, id and style are rejected outright, which
# failed the sticker-club push ("Attribute 'class=\"list-intro\"' is not
# permitted on tag '<p>'"). v3 stored hand-written markup in these
# settings, so every value has to be cleaned on the way in. Liquid
# settings are NOT cleaned - they are code, not rich text.
def clean_rt(v):
    return re.sub(r'\s+(?:class|id|style)="[^"]*"', '', v or '')
def wrap_p(v):
    v = clean_rt(v).strip()
    return v if not v or v.startswith('<') else f'<p>{v}</p>'
def strip_tags(v): return re.sub(r'<[^>]+>', '', v or '').strip()
def light(hexcol):
    m = re.fullmatch(r'#?([0-9a-fA-F]{6})', (hexcol or '#ffffff').strip())
    if not m: return True
    r, g, b = (int(m.group(1)[i:i+2], 16) for i in (0, 2, 4))
    return (0.299*r + 0.587*g + 0.114*b) > 128
VIS = {'always': 'always', 'small': 'small', 'large': 'large'}
ALIGN = {'text-left': 'left', 'text-center': 'center', 'text-right': 'right', 'left': 'left', 'center': 'center', 'right': 'right'}
dropped = []

base = load('templates/product.json')
BASE = base['sections']['main']['blocks']
RECS = base['sections']['recommendations']['settings']
FEATURES = base['sections']['features']['settings']

# ---------------------------------------------------------------- blocks
def heading(text, size='h2', tag='h2'):
    return {'type': 'block--heading', 'settings': {'text': clean_rt(text), 'size': size, 'tag': tag, 'alignment': 'inherit', 'color': '', 'font_size_desktop': 0, 'font_size_mobile': 0}}
def text(html, size='body'):
    return {'type': 'block--text', 'settings': {'text': wrap_p(html), 'size': size, 'alignment': 'inherit', 'color': ''}}
def button(label, link, style='button', width='auto'):
    return {'type': 'block--button', 'settings': {'label': label or '', 'link': link or '', 'open_in_new_tab': False, 'style': style, 'width': width, 'font_size': 0, 'padding_y': 12, 'padding_x': 28, 'margin_y': 0, 'margin_x': 0, 'border_width': 1, 'border_radius': 0, 'custom_scheme': False, 'color_scheme': 'scheme-1', 'bg': '', 'text_color': '', 'border_color': '', 'hover_bg': '', 'hover_text_color': ''}}
def message(html=None, image=None, link=None, color=None, align='left'):
    s = {'text': wrap_p(html) if html else '', 'image': image or '', 'image_link': link or '', 'product_tags': '', 'exclude_tags': '', 'customer_rule': 'any', 'customer_tags': '', 'hide_buy_controls': False, 'boxed': False, 'alignment': align, 'text_color': color or '', 'bg': ''}
    return {'type': 'block--product-message', 'settings': s}
def accordion(head, source='text', body='', video='', open_default=False, visibility='always'):
    return {'type': 'block--product-accordion', 'settings': {'heading': head, 'source': source, 'text': clean_rt(body), 'features_heading': '', 'video_url': video or '', 'open_default': bool(open_default), 'visibility': visibility}}

GATES = [k for k in base['sections']['main']['block_order'] if k.startswith('gate_') or k.startswith('notice_')]
BADGE_DEFAULT_POS = 'top-right'

def main_section(v3main, suffix):
    """v3 main-product -> section--product with theme blocks."""
    blocks, order = {}, []
    def put(k, b):
        i = 2; kk = k
        while kk in blocks: kk = f'{k}_{i}'; i += 1
        blocks[kk] = b; order.append(kk)
    badge_n = 0; rt_n = 0; acc_n = 0
    for bk in v3main['block_order']:
        b = v3main['blocks'][bk]; t = b['type']; s = b.get('settings', {})
        if b.get('disabled'): continue
        if t.startswith('shopify://apps/'):
            put(bk if len(bk) < 40 else 'app_' + t.split('/')[3], {'type': t, 'settings': s}); continue
        if t == 'title': put('title', copy.deepcopy(BASE['title']))
        elif t == 'price': put('price', copy.deepcopy(BASE['price']))
        elif t == 'richtext_details':
            rt_n += 1
            put(f'richtext_{rt_n}', message(s.get('pdp_richtext'), color=s.get('pdp_richtext_color') if s.get('pdp_richtext_color') not in (None, '', '#000000') else None, align=s.get('pdp_richtext_alignment_desktop', 'left')))
        elif t == 'color_swatch':
            sw = copy.deepcopy(BASE['swatches']); sw['settings']['style'] = 'image' if s.get('pdp_swatch_style') == 'featured_image' else 'pattern'; sw['settings']['shape'] = s.get('pdp_swatch_shape', 'circle'); put('swatches', sw)
        elif t == 'size-guide':
            pass  # folded into the variant picker below
        elif t == 'pdp_overrides':
            for g in GATES: put(g, copy.deepcopy(BASE[g]))
        elif t == 'variant_picker':
            vp = copy.deepcopy(BASE['variant_picker'])
            sg = next((v3main['blocks'][x] for x in v3main['block_order'] if v3main['blocks'][x]['type'] == 'size-guide' and not v3main['blocks'][x].get('disabled')), None)
            if sg:
                vp['settings']['size_guide_label'] = sg['settings'].get('title') or 'Size guide'
                if sg['settings'].get('size_chart'): vp['settings']['size_guide_page'] = sg['settings']['size_chart']
            else:
                vp['settings']['size_guide_label'] = ''
            put('variant_picker', vp)
        elif t == 'buttons': put('buy_buttons', copy.deepcopy(BASE['buy_buttons']))
        elif t == 'pdp_store_locator': put('store_locator', copy.deepcopy(BASE['store_locator']))
        elif t == 'product-accordion':
            for i in (1, 2, 3, 4):
                head = (s.get(f'text{i}') or '').strip()
                if not head: continue
                vis = {'always': 'always', 'small': 'mobile', 'large': 'desktop'}.get(s.get(f'tab{i}_visibility', 'always'), 'always')
                if s.get(f'tab{i}_pdp_features'):
                    a = accordion(head, 'features', '', '', s.get(f'tab{i}_expanded'), vis); a['settings']['features_heading'] = strip_tags(s.get(f'tab{i}_pdp_features_heading'))
                else:
                    a = accordion(head, 'text', s.get(f'description{i}'), s.get(f'youtube_url{i}'), s.get(f'tab{i}_expanded'), vis)
                acc_n += 1; put(f'accordion_{acc_n}', a)
        elif t == 'custom-content':
            if s.get('description_heading'):
                acc_n += 1; put(f'accordion_{acc_n}', accordion(s['description_heading'], 'description', '', '', s.get('first_discription')))
            for i in (1, 2, 3):
                head = (s.get(f'text{i}') or '').strip()
                if not head or not (s.get(f'description{i}') or s.get(f'youtube_url{i}')): continue
                acc_n += 1; put(f'accordion_{acc_n}', accordion(head, 'text', s.get(f'description{i}'), s.get(f'youtube_url{i}')))
        elif t == 'description':
            acc_n += 1; put(f'accordion_{acc_n}', accordion('Product Description', 'description', '', '', True))
        elif t == 'pdp_value_props':
            vp = {'type': 'block--product-value-props', 'settings': {'show_borders': bool(s.get('show_borders', True)), 'hide_for_tags': 'Custom Apparel, gift card'}, 'blocks': {}, 'block_order': []}
            for i in (1, 2, 3, 4):
                # v3 gates each prop on its NAME alone: {% if block.settings[title_key] != blank %}.
                # The live template leaves the beer-guarantee prop's name blank
                # with its image still set, which is how it is switched off.
                if not s.get(f'title_{i}'): continue
                ps = {'image': s.get(f'prop_image_{i}', ''), 'text': s.get(f'prop_text_{i}', ''), 'link': s.get(f'prop_link_{i}', ''), 'hide_for_tags': ''}
                if 'beer' in (s.get(f'title_{i}', '') + s.get(f'prop_image_{i}', '')).lower(): ps['hide_for_tags'] = 'no-beer-guarantee'
                k = 'prop_' + (re.sub(r'[^a-z0-9]+', '_', s.get(f'title_{i}', '').lower()).strip('_') or f'{i}')
                vp['blocks'][k] = {'type': 'block--product-value-prop', 'settings': ps}; vp['block_order'].append(k)
            put('value_props', vp)
        elif t == 'complementary_products':
            c = copy.deepcopy(BASE['complementary']); c['settings']['heading'] = s.get('heading', 'Load up'); c['settings']['limit'] = clamp(s.get('products_count', 6), 2, 10); put('complementary', c)
        elif t == 'pdp_badges':
            if not (s.get('matching_badge_tag') and s.get('image_badge')): continue
            badge_n += 1
            put('badge_' + re.sub(r'[^a-z0-9]+', '_', s['matching_badge_tag'].lower()).strip('_'), {'type': 'block--product-badge', 'settings': {'tag': s['matching_badge_tag'], 'image': s['image_badge'], 'position': BADGE_DEFAULT_POS}})
        elif t == 'countdown':
            if s.get('end_date'): put('countdown', {'type': 'block--product-countdown', 'settings': {'heading': s.get('heading_text', ''), 'end_date': s['end_date']}})
        elif t == 'custom_liquid':
            put('custom_liquid', {'type': 'block--custom-liquid', 'settings': {'custom_liquid': s.get('custom_liquid', '')}})
        elif t == 'pdp_promo_banner':
            if s.get('promo_banner_img'): put('promo_image', message(None, s['promo_banner_img'], s.get('promo_badge_link')))
        elif t in ('quantity_selector', 'shop_pay_installments', 'pdp_sale_message', 'pdp_conditional_message', 'skio-plan-picker', 'fenix_delivery'):
            pass  # inside buy-buttons / price, or an app block to place in the editor
        else:
            dropped.append((suffix, 'main block', t))
    # the "limited custom product message" and promo-exclusion messages live in richtext_details already
    sec = copy.deepcopy(base['sections']['main']); sec['blocks'] = blocks; sec['block_order'] = order
    return sec

# ---------------------------------------------------------------- sections
def pad(s, key, default=36): return clamp(s.get(key, default), 0, 100, 4)
# featured-collections' max_number_products_loaded is min 5, max 30, step 5.
# v3's products_to_show was a free integer (donation's collection tab used 6),
# and an off-step value is rejected on push.
def products(v, default=15): return clamp(v if v else default, 5, 30, 5)

def features(s):
    f = copy.deepcopy(FEATURES)
    f.update({'heading': wrap_p(strip_tags(s.get('heading')) and f"{s['heading']}") if s.get('heading') else FEATURES['heading'],
              'heading_align': ALIGN.get(s.get('heading_text_alignment_desktop', 'left'), 'left'),
              'heading_size': clamp(s.get('heading_size_desktop', 36), 16, 80, 2), 'heading_size_mobile': clamp(s.get('heading_size_mobile', 24), 12, 60, 2),
              'link_new_window': bool(s.get('link_new_window')),
              'visibility': {'always': 'always', 'large': 'desktop', 'small': 'mobile'}.get(s.get('section_visibility', 'always'), 'always'),
              'padding_top': pad(s, 'section_spacing_top_desktop', 10), 'padding_bottom': pad(s, 'section_spacing_bottom_desktop', 10)})
    return {'type': 'section--product-features', 'settings': f}

IWT = {'section_visibility': 'always', 'height': 'adapt', 'desktop_image_width': 'medium', 'layout': 'image_first', 'image_behavior': 'none', 'content_layout': 'no-overlap', 'desktop_content_position': 'middle', 'desktop_content_alignment': 'left', 'mobile_content_alignment': 'center', 'section_color_scheme': 'scheme-1', 'color_scheme': 'scheme-1', 'show_chevrons': False, 'full_width': False, 'content_background': '', 'padding_top': 0, 'padding_bottom': 0}
def image_with_text(image, blocks, layout='image_first', scheme='scheme-1', visibility='always', top=0, bottom=0, align='left', full=False, content_bg=''):
    s = dict(IWT); s.update({'image': image or '', 'layout': layout, 'color_scheme': scheme, 'section_visibility': visibility, 'padding_top': top, 'padding_bottom': bottom, 'desktop_content_alignment': align, 'mobile_content_alignment': 'center', 'full_width': bool(full), 'content_background': content_bg or ''})
    bl = {f'b{i+1}': b for i, b in enumerate(blocks)}
    return {'type': 'image-with-text', 'settings': s, 'blocks': bl, 'block_order': list(bl)}

def custom_split(s):
    # The live band runs edge to edge, image on one side and a flat
    # colour behind centred copy on the other, with outline buttons
    # stacked under it. v3 carried the colour as a hex, which is why
    # image-with-text gained a content background setting.
    blocks = [heading(s.get('heading', ''), 'h2'), text(s.get('paragraph', ''))]
    for i in (1, 2):
        if s.get(f'cta_{i}_text'): blocks.append(button(s[f'cta_{i}_text'], s.get(f'cta_{i}_link'), 'outline'))
    return image_with_text(s.get('image'), blocks,
                           # v3's reverse_desktop puts the IMAGE first; its unreversed
                           # default is text on the left. Verified against the live club band.
                           'image_first' if s.get('reverse_desktop') else 'text_first',
                           'scheme-1' if light(s.get('bg_color')) else 'scheme-4',
                           align='center', full=True, content_bg=s.get('bg_color'))

def split_banner(sec):
    s = sec.get('settings', {}); media = content = {}
    for bk in sec.get('block_order', []):
        b = sec['blocks'][bk]
        if b['type'] == 'media': media = b.get('settings', {})
        if b['type'] == 'content': content = b.get('settings', {})
    blocks = [heading(content.get('heading', ''), content.get('heading_size', 'h2') if content.get('heading_size') in ('h1', 'h2', 'h3') else 'h2'), text(content.get('description', ''))]
    if content.get('btn_text'): blocks.append(button(content['btn_text'], content.get('btn_link')))
    return image_with_text(media.get('image'), blocks, 'image_first', 'scheme-1', VIS.get(s.get('section_visibility', 'always'), 'always'), pad(s, 'top_space_desktop', 0), pad(s, 'bottom_space_desktop', 0))

def products_collage(s, suffix):
    dropped.append((suffix, 'products-collage product list', ', '.join(s.get('product_list', []))))
    blocks = [heading(s.get('heading', ''), 'h2'), text(s.get('description', ''))]
    if s.get('btn_text'): blocks.append(button(s['btn_text'], s.get('btn_link')))
    return image_with_text(s.get('main_image'), blocks, 'image_first', 'scheme-1', 'always', pad(s, 'top_space_desktop', 40), pad(s, 'bottom_space_desktop', 40), 'center')

MG = {'layout': 'grid', 'columns_desktop': 4, 'columns_mobile': 2, 'tile_ratio': 'square', 'desktop_row_height': 400, 'mobile_row_height': 200, 'tile_width': 'full', 'desktop_grid_gap': 20, 'mobile_grid_gap': 12, 'section_width': False, 'section_visibility': 'always', 'content_placement': 'below', 'card_background': '', 'card_padding': 0, 'enable_shadow': False, 'enable_hover_content': False, 'heading_badge': False, 'heading': '', 'heading_size': 'h3', 'heading_alignment': 'text-center', 'heading_color': '', 'text_color': '', 'btn_bg_color': '', 'btn_text_color': '', 'btn_hover_color': '', 'btn_hover_text_color': '', 'color_scheme': 'scheme-1', 'padding_top': 20, 'padding_bottom': 20}
def tile(image=None, video=None, link=None, blocks=(), position='center'):
    t = {'type': 'block--media-tile', 'settings': {'media_image': image or '', 'video': video or '', 'collection': '', 'link': link or '', 'span_two_columns': False, 'span_two_rows': False, 'content_position': position, 'content_alignment': 'center', 'hover_text': '', 'background_color': '#000000', 'background_opacity': 0, 'hover_overlay': 'keep'}}
    if blocks:
        t['blocks'] = {f'c{i+1}': b for i, b in enumerate(blocks)}; t['block_order'] = list(t['blocks'])
    return t

def images_grid(sec):
    s = sec.get('settings', {}); m = dict(MG)
    m.update({'layout': 'carousel' if s.get('show_carousel') else 'grid', 'columns_desktop': clamp(s.get('item_per_row_desktop', 4), 1, 6), 'columns_mobile': clamp(s.get('item_per_row_mobile', 2), 1, 3),
              'section_visibility': VIS.get(s.get('section_visibility', 'always'), 'always'), 'heading': s.get('heading', ''), 'heading_size': s.get('heading_size', 'h3') if s.get('heading_size') in ('h1', 'h2', 'h3', 'h4') else 'h3',
              'heading_alignment': s.get('heading_alignment', 'text-left'), 'padding_top': pad(s, 'top_space_desktop', 20), 'padding_bottom': pad(s, 'bottom_space_desktop', 20)})
    blocks = {}
    for bk in sec.get('block_order', []):
        b = sec['blocks'][bk]['settings']; inner = []
        if b.get('heading'): inner.append(text(b['heading']))
        if b.get('btn_text'): inner.append(button(b['btn_text'], b.get('btn_link'), 'link' if b.get('button_as_link') else 'button'))
        blocks[bk] = tile(b.get('image'), None, b.get('btn_link') if not b.get('btn_text') else None, inner)
    return {'type': 'section--media-grid', 'settings': m, 'blocks': blocks, 'block_order': list(blocks)}

def short_videos(sec, suffix):
    s = sec.get('settings', {}); m = dict(MG)
    m.update({'layout': 'carousel', 'columns_desktop': 4, 'columns_mobile': 2, 'tile_ratio': 'portrait', 'content_placement': 'overlay', 'heading': s.get('heading', ''), 'heading_size': 'h2', 'heading_alignment': s.get('heading_alignment', 'text-center'),
              'color_scheme': 'scheme-4' if s.get('color_scheme') == 'inverse' else 'scheme-1', 'padding_top': pad(s, 'top_space_desktop', 30), 'padding_bottom': pad(s, 'bottom_space_desktop', 10)})
    blocks = {}
    for bk in sec.get('block_order', []):
        b = sec['blocks'][bk]['settings']
        # v3 stored these as shopify://files/videos/NAME.mp4 - FILE references,
        # not the video resources a `video` setting accepts, so Shopify rejects
        # them on push whatever the spelling. The tile keeps its product link
        # and the video is listed below for re-selection in the editor, which
        # writes the correct reference itself.
        if b.get('video'): dropped.append((suffix, 'short video (re-pick in the editor)', b['video'].split('/')[-1]))
        blocks[bk] = tile(None, None, f"shopify://products/{b['product']}" if b.get('product') else None)
    return {'type': 'section--media-grid', 'settings': m, 'blocks': blocks, 'block_order': list(blocks)}

def full_width(s, images=('full_width_image_desktop', 'full_width_image_mobile'), link_key='full_image_cta_url', link_flag='full_image_link'):
    return {'type': 'section--full-width-image_text', 'settings': {'visibility': VIS.get(s.get('section_visibility', 'always'), 'always'), 'layout_preset': ALIGN.get(s.get('horizontal_content_alignment_desktop', 'center'), 'center'), 'alignment_preset': 'center', 'background_color': '#ffffff',
            'background_image_desktop': s.get(images[0], ''), 'background_image_mobile': s.get(images[1], ''), 'image_height_auto': bool(s.get('image_height_auto', True)),
            'banner_link': s.get(link_key, '') if (link_flag is None or s.get(link_flag)) else '', 'open_in_new_tab': bool(s.get('link_new_window') or s.get('full_width_hero_new_window')),
            'padding_top_desktop': 0, 'padding_bottom_desktop': 0, 'padding_horizontal_desktop': 0, 'item_gap_desktop': 8, 'padding_top_mobile': 0, 'padding_bottom_mobile': 0, 'padding_horizontal_mobile': 0, 'item_gap_mobile': 8, 'button_gap': 8}}

def video_banner(s):
    return {'type': 'video', 'settings': {'heading': strip_tags(s.get('heading')), 'heading_size': 'h1', 'enable_video_looping': False, 'video_url': s.get('video_url', ''), 'overlay_opacity': clamp(s.get('overlay_opacity', 0), 0, 100, 10), 'play_label': s.get('play_btn_text', 'Play now'), 'play_position': 'bottom-right', 'play_button_bg': '#000000', 'play_button_text': '#ffffff',
            'cover_image': s.get('cover_image', ''), 'description': strip_tags(s.get('description')), 'full_width': bool(s.get('video_full_width')), 'color_scheme': 'scheme-1', 'padding_top': pad(s, 'top_space_desktop', 0), 'padding_bottom': pad(s, 'bottom_space_desktop', 0)}}

def collection_tab(sec):
    s = sec.get('settings', {}); r = copy.deepcopy(RECS)
    r.update({'section_heading': strip_tags(s.get('heading')), 'heading_text_align': ALIGN.get(s.get('heading_alignment', 'text-left'), 'left'), 'collection_type': 'tabs', 'collection_source': 'manual', 'layout_style': 'carousel',
              'max_number_products_loaded': products(s.get('products_to_show')), 'section_spacing_top_desktop': clamp(s.get('top_space_desktop', 10), 0, 100), 'section_spacing_bottom_desktop': clamp(s.get('bottom_space_desktop', 10), 0, 100)})
    blocks = {}
    for bk in sec.get('block_order', []):
        b = sec['blocks'][bk]['settings']
        blocks[bk] = {'type': 'collection_block', 'settings': {'custom_title': b.get('tab-heading', ''), 'collection': b.get('collection', ''), 'cta_label': '', 'cta_link': ''}}
    return {'type': 'featured-collections', 'settings': r, 'blocks': blocks, 'block_order': list(blocks)}

def related(s):
    r = copy.deepcopy(RECS)
    r.update({'section_heading': strip_tags(s.get('heading')) or 'You may also like', 'heading_text_align': ALIGN.get(s.get('heading_alignment', 'text-left'), 'left'), 'collection_type': 'recommendations', 'max_number_products_loaded': products(s.get('products_to_show')),
              'section_spacing_top_desktop': clamp(s.get('top_space_desktop', 25), 0, 100), 'section_spacing_bottom_desktop': clamp(s.get('bottom_space_desktop', 25), 0, 100)})
    return {'type': 'featured-collections', 'settings': r}

def rich_text(sec):
    s = sec.get('settings', {}); blocks = {}
    for bk in sec.get('block_order', []):
        b = sec['blocks'][bk]; bs = b.get('settings', {})
        if b['type'] == 'heading': blocks[bk] = heading(bs.get('heading', ''), bs.get('heading_size', 'h2') if bs.get('heading_size') in ('h1', 'h2', 'h3') else 'h2')
        elif b['type'] == 'text': blocks[bk] = text(bs.get('text', ''))
        elif b['type'] == 'button' and bs.get('btn_text'): blocks[bk] = button(bs['btn_text'], bs.get('btn_link'))
    return {'type': 'rich-text', 'settings': {'section_visibility': VIS.get(s.get('section_visibility', 'always'), 'always'), 'desktop_content_position': 'center', 'content_alignment': ALIGN.get(s.get('content_alignment', 'text-center'), 'center'), 'color_scheme': 'scheme-1', 'full_width': True, 'padding_top': pad(s, 'top_space_desktop', 10), 'padding_bottom': pad(s, 'bottom_space_desktop', 10)}, 'blocks': blocks, 'block_order': list(blocks)}

def metafield_grid(s):
    ns, key = s.get('metafield_namespace', 'custom'), s.get('metafield_key', '')
    cols = clamp(s.get('item_per_row', 4), 1, 6)
    liquid = f'''{{%- assign imgs = product.metafields.{ns}.{key}.value -%}}
{{%- if imgs != blank -%}}
<div class="page-width gs-metafield-grid">
  {{%- if "{strip_tags(s.get('heading'))}" != blank -%}}<h2 class="gs-metafield-grid__heading">{s.get('heading', '')}</h2>{{%- endif -%}}
  <div class="gs-metafield-grid__items">
    {{%- for img in imgs -%}}
      {{{{ img | image_url: width: 600 | image_tag: loading: 'lazy', class: 'gs-metafield-grid__img' }}}}
    {{%- endfor -%}}
  </div>
</div>
<style>
  .gs-metafield-grid__heading {{ text-align: {ALIGN.get(s.get('heading_alignment', 'text-center'), 'center')}; margin: 0 0 2rem; }}
  .gs-metafield-grid__items {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }}
  .gs-metafield-grid__img {{ display: block; width: 100%; height: auto; aspect-ratio: 1; object-fit: cover; }}
  @media screen and (min-width: 750px) {{ .gs-metafield-grid__items {{ grid-template-columns: repeat({cols}, minmax(0, 1fr)); gap: 20px; }} }}
</style>
{{%- endif -%}}'''
    return {'type': 'custom-liquid', 'settings': {'custom_liquid': liquid, 'color_scheme': 'scheme-1', 'padding_top': pad(s, 'top_space_desktop', 40), 'padding_bottom': pad(s, 'bottom_space_desktop', 40)}}

def secondary_content(sec):
    s = sec.get('settings', {}); blocks = {}
    if s.get('show_product_description'):
        blocks['description'] = {'type': 'collapsible_row', 'settings': {'heading': 'Product Description', 'icon': 'none', 'row_content': '<p>{{ product.description }}</p>', 'page': ''}}
    for bk in sec.get('block_order', []):
        b = sec['blocks'][bk]['settings']
        blocks[bk] = {'type': 'collapsible_row', 'settings': {'heading': b.get('heading', ''), 'icon': 'none', 'row_content': wrap_p(b.get('pdp_description')), 'page': ''}}
    return {'type': 'collapsible-content', 'settings': {'caption': '', 'heading': '', 'heading_size': 'h1', 'heading_alignment': 'center', 'layout': 'row', 'container_color_scheme': 'scheme-2', 'color_scheme': 'scheme-1', 'open_first_collapsible_row': False, 'image_ratio': 'adapt', 'desktop_layout': 'image_second', 'padding_top': 40, 'padding_bottom': 40}, 'blocks': blocks, 'block_order': list(blocks)}

def multi_column(sec):
    s = sec.get('settings', {}); blocks = {}
    for bk in sec.get('block_order', []):
        b = sec['blocks'][bk]['settings']
        blocks[bk] = {'type': 'column', 'settings': {'image': b.get('image', ''), 'title': b.get('heading', ''), 'text': wrap_p(b.get('description')), 'link_label': '', 'link': ''}}
    return {'type': 'multicolumn', 'settings': {'title': s.get('heading', ''), 'heading_size': s.get('heading_size', 'h1') if s.get('heading_size') in ('h1', 'h2') else 'h1', 'image_width': 'third', 'image_ratio': 'adapt', 'button_label': '', 'button_link': '', 'columns_desktop': clamp(s.get('column_count', 4), 1, 6), 'column_alignment': 'center' if s.get('content_alignment') == 'text-center' else 'left',
            'background_style': 'primary' if s.get('column_background') else 'none', 'color_scheme': 'scheme-1', 'columns_mobile': '2' if str(s.get('column_count_mobile', '1')) == '2' else '1', 'swipe_on_mobile': False, 'padding_top': pad(s, 'top_space_desktop', 70), 'padding_bottom': pad(s, 'bottom_space_desktop', 70)}, 'blocks': blocks, 'block_order': list(blocks)}

def apps(sec):
    blocks = {bk: {'type': sec['blocks'][bk]['type'], 'settings': sec['blocks'][bk].get('settings', {}), **({'disabled': True} if sec['blocks'][bk].get('disabled') else {})} for bk in sec.get('block_order', [])}
    return {'type': 'apps', 'settings': {'include_margins': True}, 'blocks': blocks, 'block_order': list(blocks)}

def custom_liquid(s):
    return {'type': 'custom-liquid', 'settings': {'custom_liquid': s.get('custom_liquid', ''), 'color_scheme': 'scheme-1', 'padding_top': pad(s, 'top_space_desktop', 0), 'padding_bottom': pad(s, 'bottom_space_desktop', 0)}}

def featured_collections(sec):
    r = copy.deepcopy(RECS); r.update({k: v for k, v in sec.get('settings', {}).items() if k in r}); r.setdefault('collection_source', 'manual')
    r['max_number_products_loaded'] = products(r.get('max_number_products_loaded'))
    out = {'type': 'featured-collections', 'settings': r}
    if sec.get('blocks'):
        out['blocks'] = {bk: {'type': 'collection_block', 'settings': {'custom_title': b['settings'].get('custom_title', b['settings'].get('tab-heading', '')), 'collection': b['settings'].get('collection', ''), 'cta_label': b['settings'].get('cta_label', ''), 'cta_link': b['settings'].get('cta_link', '')}} for bk, b in sec['blocks'].items()}
        out['block_order'] = [k for k in sec['block_order'] if k in out['blocks']]
    return out

# ---------------------------------------------------------------- run
def main():
    """Rewrite every v3 product template. Guarded so scripts/migrate-templates.py
    can import the converters above without running this."""
    written = []
    # The default template is included too, but its main/features/recommendations
    # are the hand-built reference this script reads its buy box from, so those
    # three are kept as they are and only the trailing bands are converted.
    for path in sorted(glob.glob(os.path.join(V3, 'templates', 'product.*.json'))) + [os.path.join(V3, 'templates', 'product.json')]:
        name = os.path.basename(path)
        suffix = 'default' if name == 'product.json' else name[len('product.'):-5]
        if 'test' in suffix or suffix.startswith('sl-'): continue
        v3 = load(path); sections = {}; order = []
        for k in v3['order']:
            sec = v3['sections'][k]; t = sec['type']; s = sec.get('settings', {})
            if sec.get('disabled'): continue
            if t == 'breadcrumb': continue
            if t == 'main-product': key, new = 'main', main_section(sec, suffix)
            elif t == 'features-benefits': key, new = 'features', features(s)
            elif t == 'custom-split-section': key, new = k, custom_split(s)
            # Restored verbatim on 2026-10-05 (the client's "Product Feature"
            # module); v3's product templates switched to it on 2026-10-01.
            elif t == 'product-highlight': key, new = k, {'type': 'product-highlight', 'settings': s, **({'custom_css': sec['custom_css']} if sec.get('custom_css') else {})}
            elif t == 'split-banner': key, new = k, split_banner(sec)
            # products-collage is a v4 section again (2026-10-05); verbatim.
            elif t == 'products-collage': key, new = k, {'type': 'products-collage', 'settings': s, **({'blocks': sec['blocks'], 'block_order': sec['block_order']} if sec.get('blocks') else {})}
            elif t == 'images-grid': key, new = k, images_grid(sec)
            elif t == 'product-short-videos': key, new = k, short_videos(sec, suffix)
            elif t == 'full-width-image-with-text-v2': key, new = k, full_width(s)
            elif t == 'hero-banner-secondary': key, new = k, full_width(s, ('full_width_hero_desktop', 'full_width_hero_mobile'), 'full_width_hero_link', None)
            elif t == 'video-banner': key, new = k, video_banner(s)
            elif t == 'collection-tab': key, new = k, collection_tab(sec)
            elif t == 'related-products': key, new = 'recommendations', related(s)
            elif t == 'featured-collections': key, new = 'recommendations' if s.get('collection_type') == 'recommendations' else k, featured_collections(sec)
            elif t == 'rich-text': key, new = k, rich_text(sec)
            elif t == 'product-image-grid-metafields': key, new = k, metafield_grid(s)
            elif t == 'product-secondary-content': key, new = k, secondary_content(sec)
            elif t == 'multi-column': key, new = k, multi_column(sec)
            elif t == 'apps': key, new = k, apps(sec)
            elif t == 'custom-liquid': key, new = k, custom_liquid(s)
            else:
                dropped.append((suffix, 'section', t)); continue
            i = 2; kk = key
            while kk in sections: kk = f'{key}_{i}'; i += 1
            sections[kk] = new; order.append(kk)
        if suffix == 'default':
            for k in ('main', 'features', 'recommendations'):
                if k in sections and k in base['sections']:
                    sections[k] = copy.deepcopy(base['sections'][k])
        out = {'sections': sections, 'order': order}
        save(os.path.join('templates', name), out); written.append(name)
    print('written:', written)
    for d in dropped: print('dropped:', d)

if __name__ == '__main__':
    main()
