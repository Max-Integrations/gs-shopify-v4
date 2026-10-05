"""Port v3 collection, page and article templates into this theme.

Usage: python3 scripts/migrate-templates.py [--v3 PATH] [--only 'page.*'] [--dry-run] [--force]

Sibling of migrate-product-templates.py and imports its converters (it is
guarded, so importing does not run the product migration). The rules:

- A template that already exists in templates/ is SKIPPED unless --force:
  the client edits those live on the dev theme and they are never pushed
  from here. New templates are written and may be pushed.
- Every v3 section is converted through the dispatch table below: a plain
  string means "same section exists in v4, copy verbatim"; a function
  rebuilds it. Anything else is dropped and printed.
- Disabled sections are KEPT (the client switches seasonal bands on and
  off); the product script skips them, this one does not.
- `prune` strips settings the target schema does not have, clamps ranges to
  min/max/step, coerces selects to a valid option and maps v3 colour-scheme
  ids (primary -> scheme-1 ...), so the push never trips on a stale value.
- custom_css is kept on verbatim sections and on remaps whose selectors
  are known to survive; otherwise dropped and printed.
"""
import copy, glob, json, os, re, sys, importlib.util

ARGS = sys.argv[1:]
V3 = os.path.expanduser('~/Documents/GitHub/gs-shopify-v3')
ONLY = None; DRY = False; FORCE = False
i = 0
while i < len(ARGS):
    a = ARGS[i]
    if a == '--v3': V3 = os.path.expanduser(ARGS[i + 1]); i += 2; continue
    if a == '--only': ONLY = ARGS[i + 1]; i += 2; continue
    if a == '--dry-run': DRY = True; i += 1; continue
    if a == '--force': FORCE = True; i += 1; continue
    i += 1

spec = importlib.util.spec_from_file_location('gs_pt', os.path.join(os.path.dirname(__file__), 'migrate-product-templates.py'))
gs_pt = importlib.util.module_from_spec(spec); spec.loader.exec_module(gs_pt)
load, save, clamp, clean_rt, wrap_p, strip_tags = gs_pt.load, gs_pt.save, gs_pt.clamp, gs_pt.clean_rt, gs_pt.wrap_p, gs_pt.strip_tags
heading, text, button, tile, MG = gs_pt.heading, gs_pt.text, gs_pt.button, gs_pt.tile, gs_pt.MG
VIS, ALIGN, pad = gs_pt.VIS, gs_pt.ALIGN, gs_pt.pad

SCHEME = {'primary': 'scheme-1', 'secondary': 'scheme-2', 'tertiary': 'scheme-3', 'quaternary': 'scheme-4',
          'inverse': 'scheme-1', 'background-1': 'scheme-1', 'background-2': 'scheme-2', '': 'scheme-1'}
SCHEMES = {'scheme-1', 'scheme-2', 'scheme-3', 'scheme-4', 'scheme-5', 'scheme-6'}
dropped = []

# ---------------------------------------------------------------- schema index
SCHEMA = {}
def schema_of(path):
    m = re.search(r'{%-?\s*schema\s*-?%}(.*?){%-?\s*endschema', open(path).read(), re.S)
    if not m: return None
    return json.loads(re.sub(r',(\s*[}\]])', r'\1', m.group(1)))
for f in glob.glob('sections/*.liquid') + glob.glob('blocks/*.liquid'):
    sch = schema_of(f)
    if sch is None: continue
    name = os.path.basename(f)[:-7]
    SCHEMA[name] = {
        'settings': {s['id']: s for s in sch.get('settings', []) if 'id' in s},
        'blocks': {b['type']: {s['id']: s for s in b.get('settings', []) if 'id' in s} for b in sch.get('blocks', [])},
    }

def prune_settings(defs, settings, where):
    """Drop unknown ids, clamp ranges, coerce selects, map schemes."""
    out = {}
    for k, v in (settings or {}).items():
        d = defs.get(k)
        if d is None:
            dropped.append((where, 'setting not in schema', k)); continue
        t = d.get('type')
        if t == 'color_scheme':
            v = SCHEME.get(str(v), v)
            if v not in SCHEMES: v = d.get('default', 'scheme-1')
        elif t == 'range':
            try:
                v = clamp(v, d.get('min', 0), d.get('max', 100), d.get('step', 1))
            except Exception:
                v = d.get('default', d.get('min', 0))
        elif t == 'select' and d.get('options'):
            vals = [o['value'] for o in d['options']]
            if str(v) not in vals:
                dropped.append((where, 'select value coerced', k, v)); v = d.get('default', vals[0])
        elif t in ('richtext', 'inline_richtext'):
            v = clean_rt(v) if isinstance(v, str) else v
        out[k] = v
    return out

def prune(sec, target):
    s = SCHEMA.get(target)
    if s is None: return sec
    sec['settings'] = prune_settings(s['settings'], sec.get('settings', {}), target)
    for bk, b in (sec.get('blocks') or {}).items():
        bt = b.get('type', '')
        if bt.startswith('shopify://') or bt.startswith('ai_gen_block_'): continue
        # A theme block (blocks/*.liquid) carries its own settings; the
        # section schema only lists its type.
        defs = SCHEMA[bt]['settings'] if bt in SCHEMA else s['blocks'].get(bt)
        if defs is not None:
            b['settings'] = prune_settings(defs, b.get('settings', {}), f'{target}/{bt}')
        for ck, cb in (b.get('blocks') or {}).items():
            ct = cb.get('type', '')
            if ct in SCHEMA:
                cb['settings'] = prune_settings(SCHEMA[ct]['settings'], cb.get('settings', {}), f'{target}/{bt}/{ct}')
    return sec

# ---------------------------------------------------------------- converters
def verbatim(target):
    def fn(sec, k):
        new = {'type': target, 'settings': copy.deepcopy(sec.get('settings', {}))}
        if sec.get('blocks'):
            new['blocks'] = copy.deepcopy(sec['blocks']); new['block_order'] = list(sec.get('block_order', sec['blocks']))
        if sec.get('custom_css'): new['custom_css'] = sec['custom_css']
        return k, prune(new, target)
    return fn

def keep_flags(src, dst):
    if src.get('disabled'): dst['disabled'] = True
    if src.get('name'): dst['name'] = src['name']
    return dst

def rich_text(sec, k):
    return k, gs_pt.rich_text(sec)

def full_width_v2(sec, k):
    return k, gs_pt.full_width(sec.get('settings', {}))

def hero_banner(sec, k):
    return k, gs_pt.full_width(sec.get('settings', {}), ('full_width_hero_desktop', 'full_width_hero_mobile'), 'full_width_hero_link', None)

def media_grid(sec, k):
    """v3 media-grid (tiles with spans, overlay copy, button, colours) ->
    section--media-grid with block--media-tile + block--text/button."""
    s = sec.get('settings', {}); m = dict(MG)
    cols_mobile = 2 if str(s.get('mobile_columns_layout', '')) in ('2', 'two', 'two-columns') else 1
    m.update({'layout': 'grid', 'columns_desktop': 4, 'columns_mobile': cols_mobile, 'tile_ratio': 'fixed',
              'desktop_row_height': clamp(s.get('desktop_row_height', 400), 100, 800, 10), 'mobile_row_height': clamp(s.get('mobile_row_height', 200), 100, 600, 10),
              'desktop_grid_gap': clamp(s.get('desktop_grid_gap', 20), 0, 60, 2), 'mobile_grid_gap': clamp(s.get('mobile_grid_gap', 12), 0, 40, 2),
              'section_width': bool(s.get('section_width')), 'section_visibility': VIS.get(s.get('section_visibility', 'always'), 'always'),
              'content_placement': 'overlay', 'enable_shadow': bool(s.get('enable_shadow')), 'enable_hover_content': bool(s.get('enable_hover_content')),
              'heading': s.get('heading', ''), 'heading_size': s.get('heading_size', 'h2') if s.get('heading_size') in ('h1', 'h2', 'h3', 'h4') else 'h2',
              'heading_alignment': s.get('heading_alignment', 'text-center') if str(s.get('heading_alignment', '')).startswith('text-') else 'text-center',
              'color_scheme': SCHEME.get(str(s.get('color_scheme', '')), 'scheme-1'),
              'padding_top': pad(s, 'top_space_desktop', 20), 'padding_bottom': pad(s, 'bottom_space_desktop', 20)})
    blocks = {}
    for bk in sec.get('block_order', []):
        b = sec['blocks'][bk]; bs = b.get('settings', {})
        inner = []
        if bs.get('heading'): inner.append(heading(bs['heading'], bs.get('heading_size', 'h3') if bs.get('heading_size') in ('h1', 'h2', 'h3', 'h4') else 'h3', 'h3'))
        if bs.get('description'): inner.append(text(bs['description']))
        if bs.get('btn_text'): inner.append(button(bs['btn_text'], bs.get('btn_link'), 'link' if bs.get('button_as_link') else 'button'))
        t = tile(bs.get('media_image'), bs.get('video'), bs.get('btn_link') if (bs.get('full_image_link') or not bs.get('btn_text')) else None, inner,
                 {'top': 'top', 'center': 'center', 'bottom': 'bottom'}.get(str(bs.get('content_position', 'center')).split('-')[0], 'center'))
        t['settings']['span_two_columns'] = int(bs.get('column', 1) or 1) >= 2
        t['settings']['span_two_rows'] = int(bs.get('row', 1) or 1) >= 2
        if bs.get('background_color'): t['settings']['background_color'] = bs['background_color']
        if bs.get('background_opacity') is not None: t['settings']['background_opacity'] = clamp(bs.get('background_opacity', 0), 0, 100, 5)
        if b.get('disabled'): t['disabled'] = True
        blocks[bk] = t
    new = {'type': 'section--media-grid', 'settings': m, 'blocks': blocks, 'block_order': list(blocks)}
    if sec.get('custom_css'): dropped.append((k, 'custom_css dropped (media-grid -> section--media-grid)', sec['custom_css'][:80]))
    return k, prune(new, 'section--media-grid')

def images_grid(sec, k): return k, gs_pt.images_grid(sec)
def collection_tab(sec, k): return k, gs_pt.collection_tab(sec)
def featured_collections(sec, k): return k, gs_pt.featured_collections(sec)
def split_banner(sec, k): return k, gs_pt.split_banner(sec)
def custom_split(sec, k): return k, gs_pt.custom_split(sec.get('settings', {}))
def apps(sec, k): return k, gs_pt.apps(sec)
def custom_liquid(sec, k): return k, gs_pt.custom_liquid(sec.get('settings', {}))

def multicolumn_any(sec, k):
    """multi-column, multicolumn-with-image, multi-column-with-rich-text -> Dawn multicolumn."""
    s = sec.get('settings', {}); blocks = {}
    for bk in sec.get('block_order', []):
        b = sec['blocks'][bk]; bs = b.get('settings', {})
        col = {'type': 'column', 'settings': {'image': bs.get('image', ''), 'title': strip_tags(bs.get('heading', '')), 'text': wrap_p(bs.get('description')),
                                              'link_label': bs.get('link', '') or '', 'link': bs.get('link_url', '') or ''}}
        if b.get('disabled'): col['disabled'] = True
        blocks[bk] = col
    new = {'type': 'multicolumn', 'settings': {
        'title': strip_tags(s.get('heading', '')), 'heading_size': 'h1',
        'image_width': 'third', 'image_ratio': 'adapt', 'button_label': '', 'button_link': '',
        'columns_desktop': clamp(s.get('column_count', 3), 1, 6), 'column_alignment': 'center' if s.get('content_alignment') == 'text-center' else 'left',
        'background_style': 'primary' if s.get('column_background') else 'none', 'color_scheme': SCHEME.get(str(s.get('color_scheme', '')), 'scheme-1'),
        'columns_mobile': '2' if str(s.get('column_count_mobile', '1')) == '2' else '1', 'swipe_on_mobile': False,
        'padding_top': pad(s, 'top_space_desktop', 36), 'padding_bottom': pad(s, 'bottom_space_desktop', 36)},
        'blocks': blocks, 'block_order': list(blocks)}
    return k, prune(new, 'multicolumn')

def single_cta(sec, k):
    s = sec.get('settings', {})
    b = button(strip_tags(s.get('single_cta_text', 'Shop now')), s.get('single_cta_url'), 'outline' if str(s.get('single_cta_border_type', '')) in ('outline', 'border') else 'button',
               'full' if s.get('single_cta_btn_width') == 'full' else 'auto')
    b['settings']['open_in_new_tab'] = bool(s.get('single_cta_link_window'))
    if s.get('single_cta_bg_color'): b['settings']['bg'] = s['single_cta_bg_color']
    if s.get('single_cta_text_color'): b['settings']['text_color'] = s['single_cta_text_color']
    new = {'type': 'rich-text', 'settings': {'section_visibility': 'always', 'desktop_content_position': 'center',
           'content_alignment': ALIGN.get(s.get('single_cta_text_alignment', 'center'), 'center'), 'color_scheme': 'scheme-1', 'full_width': True,
           'padding_top': 20, 'padding_bottom': 20}, 'blocks': {'cta': b}, 'block_order': ['cta']}
    return k, prune(new, 'rich-text')

def countdown(sec, k):
    """v3 countdown settings -> v4 countdown with heading/subheading/text/timer/products/donation blocks."""
    s = sec.get('settings', {}); blocks = {}; order = []
    def put(key, b): blocks[key] = b; order.append(key)
    if s.get('heading'): put('heading', {'type': 'heading', 'settings': {'text': clean_rt(s['heading']), 'size': s.get('heading_size', 'h2') if s.get('heading_size') in ('h1', 'h2', 'h3') else 'h2'}})
    if s.get('sub_heading'): put('subheading', {'type': 'subheading', 'settings': {'text': clean_rt(s['sub_heading']), 'size': 'h4'}})
    if s.get('content'): put('text', {'type': 'text', 'settings': {'text': clean_rt(s['content'])}})
    if s.get('countdown_timer_end'): put('timer', {'type': 'timer', 'settings': {'end': s['countdown_timer_end']}})
    if s.get('product_list'): put('products', {'type': 'products', 'settings': {'product_list': s['product_list'], 'grid_image_size': s.get('grid_image_size', 'square'), 'grid_image_fit': s.get('grid_image_fit', 'cover')}})
    settings = {'section_visibility': VIS.get(s.get('section_visibility', 'always'), 'always'), 'layout': s.get('layout', 'center'),
                'countdown_bg_image': s.get('countdown_bg_image', ''), 'bg__color': s.get('bg__color', 'solid'), 'gradient_color': s.get('gradient_color', ''),
                'solid_color': s.get('solid_color', ''), 'enable_innner_background': bool(s.get('enable_innner_background')),
                'text_color': s.get('text_color', ''), 'highlight_text_color': s.get('highlight_text_color', ''),
                'color_scheme': SCHEME.get(str(s.get('color_scheme', '')), 'scheme-1'),
                'padding_top': pad(s, 'top_space_desktop', 36), 'padding_bottom': pad(s, 'bottom_space_desktop', 36)}
    new = {'type': 'countdown', 'settings': settings, 'blocks': blocks, 'block_order': order}
    if sec.get('custom_css'): new['custom_css'] = sec['custom_css']
    return k, prune(new, 'countdown')

PORTED_VERBATIM = ['full-width-image-with-text', 'shapes', 'media-grid-deals', 'multicolumn-with-yt-shorts', 'wonderment-faq', 'anchor-tag',
                   'text-scroller-v2', 'featured-content', 'trending-products-ticker', 'page-template-override', 'countdown-banner', 'slideshow',
                   'marquee', 'events-header', 'events-image-grid', 'text-scroller', 'two-column-media-highlight', 'beer-guarantee-receipt-upload',
                   'wonderment-custom-html', 'related-posts', 'spotlight', 'products-collage', 'collection-carousel', 'video-banner',
                   'product-short-videos', 'product-highlight', 'main-collection', 'main-page', 'main-article', 'value-props', 'featured-collections',
                   'club-join-steps', 'section--retail-location', '_blocks']

DISPATCH = {t: verbatim(t) for t in PORTED_VERBATIM}
DISPATCH.update({
    'rich-text': rich_text,
    'full-width-image-with-text-v2': full_width_v2,
    'hero-banner-secondary': hero_banner,
    'media-grid': media_grid,
    'images-grid': images_grid,
    'collection-tab': collection_tab,
    'featured-collections': featured_collections,
    'split-banner': split_banner,
    'custom-split-section': custom_split,
    'apps': apps,
    'custom-liquid': custom_liquid,
    'multi-column': multicolumn_any,
    'multicolumn-with-image': multicolumn_any,
    'multi-column-with-rich-text': multicolumn_any,
    'single-cta-button': single_cta,
    'countdown': countdown,
})
DROP_SILENTLY = {'breadcrumb'}  # the article template shows its own back link

# ---------------------------------------------------------------- rich text safety
# Shopify's richtext setting accepts only p/ul/ol/h1-h6 at the top level and a
# short inline tag list inside; a push rejects anything else ("All top level
# nodes must be ..."). v3 stored hand-written HTML in these settings.
RT_TOP = {'p', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'}
RT_INLINE = {'a', 'strong', 'em', 'b', 'i', 'u', 's', 'span', 'br', 'sup', 'sub', 'small', 'mark'}

def top_level_tags(html):
    depth = 0; tags = []
    for m in re.finditer(r'<(/?)([a-zA-Z][\w-]*)[^>]*?(/?)>', html):
        closing, tag, selfclose = m.group(1), m.group(2).lower(), m.group(3)
        if closing: depth -= 1; continue
        if depth == 0: tags.append(tag)
        if not selfclose and tag not in ('br', 'img', 'hr', 'input', 'source'): depth += 1
    return tags

def safe_rt(html):
    """Return (richtext, liquid): richtext when the HTML can live in a richtext
    setting (wrapped in <p> if it is inline-only), else liquid with the raw
    HTML for a custom-liquid block."""
    html = clean_rt(html or '').strip()
    if not html: return '', None
    tags = top_level_tags(html)
    all_tags = {m.lower() for m in re.findall(r'<\s*([a-zA-Z][\w-]*)', html)}
    if all_tags - RT_TOP - RT_INLINE - {'li'}:
        return None, html  # script, div, custom elements, iframe, img ...
    if not tags or any(t not in RT_TOP for t in tags) or not html.startswith('<'):
        return '<p>' + html + '</p>', None
    return html, None

def fix_rich_text(sec):
    """Post-pass: make every block--text value legal, or turn the block into
    block--custom-liquid; wrap multicolumn column text."""
    def fix_blocks(blocks):
        for bk, b in (blocks or {}).items():
            bt = b.get('type', '')
            if bt == 'block--text':
                rt, liquid = safe_rt(b['settings'].get('text', ''))
                if liquid is not None:
                    b['type'] = 'block--custom-liquid'; b['settings'] = {'custom_liquid': liquid}
                else:
                    b['settings']['text'] = rt
            elif bt == 'column' and 'text' in b.get('settings', {}):
                rt, liquid = safe_rt(b['settings']['text'])
                b['settings']['text'] = rt if liquid is None else '<p>' + re.sub(r'<[^>]+>', '', liquid) + '</p>'
            if b.get('blocks'): fix_blocks(b['blocks'])
    fix_blocks(sec.get('blocks'))
    return sec

def convert_template(path):
    name = os.path.basename(path)
    v3 = load(path); sections = {}; order = []
    for k in v3['order']:
        sec = v3['sections'][k]; t = sec['type']
        if t in DROP_SILENTLY: continue
        fn = DISPATCH.get(t)
        if fn is None:
            dropped.append((name, 'section type has no v4 home', t, 'disabled' if sec.get('disabled') else 'LIVE')); continue
        try:
            key, new = fn(sec, k)
        except Exception as e:
            dropped.append((name, 'converter failed', t, repr(e))); continue
        if t == '_blocks':
            new['type'] = '_blocks'
        # Every converter's output goes through the schema (the product
        # script's converters copy v3 ids such as color_scheme through).
        if new.get('type') in SCHEMA:
            new = prune(new, new['type'])
        new = fix_rich_text(new)
        keep_flags(sec, new)
        i = 2; kk = key
        while kk in sections: kk = f'{key}_{i}'; i += 1
        sections[kk] = new; order.append(kk)
    return name, {'sections': sections, 'order': order}

# The templates the client's review lists (2026-10). Anything else in v3
# is out of scope unless asked for with --only or --all.
TARGETS = """collection.access-limited collection.female-focused collection.male-focused collection.new-featured
collection.patterns-landing collection.promo-landing collection.subscriptions collection.campaign-landing-template
collection.club-special page.contact-grunt-style page.about-grunt-style page.9-11-2024 page.ads-google page.ads-meta
page.all-reviews page.by-collection page.by-design page.christmas-shop page.club-grunt-style page.club-faq
page.custom-orders page.daily-deals-landing page.enroll page.events page.forms page.foundation-landing page.faq-2
page.faq-rewards page.favorites-wishlist page.gift-guide page.govx-landing page.grunt-style-careers page.memorial-landing
page.retail-hub page.sale-ended page.signupforsms-landing page.sitemap page.sturgis page.state
page.support-those-who-serve page.vip-text-alert page.violent-but-true page.wholesale-registration
page.wonderment-tracking page.this-defend-brand-landing page.wtf-redirect article.shopping-tips""".split()

def main():
    if ONLY:
        paths = sorted(glob.glob(os.path.join(V3, 'templates', ONLY + '.json')))
    elif '--all' in ARGS:
        paths = sorted(glob.glob(os.path.join(V3, 'templates', '*.json')))
    else:
        paths = [os.path.join(V3, 'templates', t + '.json') for t in TARGETS]
    paths = [p for p in paths if os.path.exists(p) and (re.match(r'(collection|page|article|blog)\.', os.path.basename(p)) or os.path.basename(p) in ('collection.json', 'page.json', 'article.json', 'blog.json'))]
    written = []; skipped = []
    for p in paths:
        name = os.path.basename(p)
        if os.path.exists(os.path.join('templates', name)) and not FORCE:
            skipped.append(name); continue
        name, out = convert_template(p)
        if not DRY: save(os.path.join('templates', name), out)
        written.append(name)
    print('written:' if not DRY else 'would write:', written)
    print('skipped (exist on the dev theme):', skipped)
    for d in dropped: print('dropped:', d)

if __name__ == '__main__':
    main()
