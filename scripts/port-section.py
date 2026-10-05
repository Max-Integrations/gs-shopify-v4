"""Port a gs-shopify-v3 section into this theme, mechanically.

Usage: python3 scripts/port-section.py <v3-section-name> [<v3-section-name> ...]
       [--v3 ~/Documents/GitHub/gs-shopify-v3] [--as <target-name>] [--force]

What it does, per section:
  1. Copies sections/<name>.liquid from v3 (the v3 type name is kept, which
     is the project convention for mechanical ports).
  2. Schema: resolves every "t:..." label from v3's locales/en.default.schema.json
     into a literal string (v4's locale files do not have the v3 keys and 900
     MatchingTranslations errors are already outstanding); converts v3's
     `select` colour-scheme settings (primary/secondary/...) into Dawn's
     `color_scheme` type with the scheme mapped; strips any trailing commas
     that would make the JSON invalid.
  3. Body: `.scheme-{{ x }}` classes become `.color-{{ x }}`; v3 scheme ids in
     `color-{{ }}` / class strings are mapped; the small v3 snippets this theme
     does not have are inlined (sections stay self-contained):
       lazy-image            -> an <img> with srcset
       marker                -> the SVG case
       carousal-arrows       -> two buttons with inline SVG arrows
       carousal-arrow-count  -> buttons + counter
  4. Assets: copies any CSS/JS the section loads with asset_url from v3's
     assets/ (skipped when this theme already has a file of that name).
  5. Locales: copies every `'key' | t` string the body uses from v3's
     locales/en.default.json into this theme's en.default.json when missing.
  6. Reports what is left for a human: remaining {% render %} calls, global
     `settings.*` ids this theme's settings_schema lacks, and markers of v3
     theme.js behaviour (data-slideshow, data-marquee, flickity, AOS).

Idempotent for a given section: re-running overwrites the port.
"""
import json, os, re, shutil, sys

args = sys.argv[1:]
V3 = os.path.expanduser('~/Documents/GitHub/gs-shopify-v3')
AS = None
FORCE = False
names = []
i = 0
while i < len(args):
    a = args[i]
    if a == '--v3': V3 = os.path.expanduser(args[i + 1]); i += 2; continue
    if a == '--as': AS = args[i + 1]; i += 2; continue
    if a == '--force': FORCE = True; i += 1; continue
    names.append(a); i += 1
if not names:
    print(__doc__); sys.exit(1)

def strip_header(s): return re.sub(r'^\s*/\*.*?\*/\s*', '', s, flags=re.S)
def load_json(p): return json.loads(strip_header(open(p).read()))

v3_schema_locale = load_json(os.path.join(V3, 'locales', 'en.default.schema.json'))
v3_locale = load_json(os.path.join(V3, 'locales', 'en.default.json'))
v4_locale_path = 'locales/en.default.json'
v4_locale = load_json(v4_locale_path)
v4_settings_ids = set(re.findall(r'"id":\s*"([^"]+)"', open('config/settings_schema.json').read()))

SCHEME_MAP = {'primary': 'scheme-1', 'secondary': 'scheme-2', 'tertiary': 'scheme-3',
              'quaternary': 'scheme-4', 'inverse': 'scheme-1', 'background-1': 'scheme-1',
              'background-2': 'scheme-2', '': 'scheme-1'}

def lookup(path, tree):
    cur = tree
    for part in path.split('.'):
        if not isinstance(cur, dict) or part not in cur: return None
        cur = cur[part]
    return cur if isinstance(cur, str) else None

def resolve_t(value):
    if not isinstance(value, str) or not value.startswith('t:'): return value
    key = value[2:]
    found = lookup(key, v3_schema_locale)
    if found is None:
        # Fall back to the last key segment as a readable label.
        found = key.split('.')[-1].replace('_', ' ').capitalize()
        missing_t.append(key)
    return found

def walk(obj):
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            out[k] = walk(v)
        # Colour scheme selects -> Dawn color_scheme setting.
        if out.get('type') == 'select' and 'color_scheme' in str(out.get('id', '')):
            out['type'] = 'color_scheme'
            out['default'] = SCHEME_MAP.get(str(out.get('default', '')), 'scheme-1')
            out.pop('options', None)
        return out
    if isinstance(obj, list): return [walk(x) for x in obj]
    return resolve_t(obj)

def inline_lazy_image(m):
    params = m.group(1)
    kv = dict(re.findall(r"(\w+):\s*([^,]+?)(?:,|$)", params.strip()))
    image = kv.get('image', '').strip()
    cls = kv.get('class', "''").strip()
    if not image:
        return m.group(0)  # unusual call; leave for the human
    return (
        "{%- if " + image + " != blank -%}"
        "<img class=\"{{ " + cls + " }}\" src=\"{{ " + image + " | image_url: width: 600 }}\""
        " srcset=\"{{ " + image + " | image_url: width: 300 }} 300w, {{ " + image + " | image_url: width: 600 }} 600w,"
        " {{ " + image + " | image_url: width: 900 }} 900w, {{ " + image + " | image_url: width: 1200 }} 1200w,"
        " {{ " + image + " | image_url: width: 1500 }} 1500w, {{ " + image + " | image_url: width: 2000 }} 2000w\""
        " sizes=\"(max-width: 600px) 300px, (max-width: 900px) 600px, (max-width: 1200px) 900px, (max-width: 1500px) 1200px, 100vw\""
        " width=\"{{ " + image + ".width }}\" height=\"{{ " + image + ".height }}\""
        " alt=\"{{ " + image + ".alt | escape }}\" loading=\"lazy\""
        " style=\"object-position: {{ " + image + ".presentation.focal_point | default: 'center' }}\">"
        "{%- endif -%}"
    )

MARKER = open(os.path.join(V3, 'snippets', 'marker.liquid')).read()
def inline_marker(m):
    params = m.group(1)
    kv = dict(re.findall(r"(\w+):\s*([^,]+?)(?:,|$)", params.strip()))
    expr = kv.get('marker', 'marker').strip()
    return MARKER.replace('{% case marker %}', '{% case ' + expr + ' %}')

ARROW_PREV = '<svg class="{{ arrow_class }}" width="14" height="12" viewBox="0 0 14 12" fill="none" aria-hidden="true" focusable="false"><path d="M12 6H1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 1.5L1 6L5.5 10.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'
ARROW_NEXT = '<svg class="{{ arrow_class }}" width="14" height="12" viewBox="0 0 14 12" fill="none" aria-hidden="true" focusable="false"><path d="M1.5 6H12.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 1.5L12.5 6L8 10.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'

def inline_arrows(m):
    params = m.group(1)
    kv = dict(re.findall(r"(\w+):\s*([^,]+?)(?:,|$)", params.strip()))
    cls = kv.get('class', "''").strip()
    return (
        "{%- assign arrow_class = " + cls + " -%}"
        "<button class=\"custom-navigation-button flickity-button flickity-prev-next-button swiper-button previous\" type=\"button\" aria-label=\"Previous\" data-slideshow-navigation-button data-swatch-scroll=\"prev\">" + ARROW_PREV + "</button>"
        "<button class=\"custom-navigation-button flickity-button flickity-prev-next-button swiper-button next\" type=\"button\" aria-label=\"Next\" data-slideshow-navigation-button data-swatch-scroll=\"next\">" + ARROW_NEXT + "</button>"
    )

def inline_arrow_count(m):
    return (
        "<button class=\"navigation-arrow-button previous\" type=\"button\" aria-label=\"Previous\" data-slideshow-navigation-button data-swatch-scroll=\"prev\">"
        "<svg class=\"navigation-arrow-button-icon\" width=\"9\" height=\"12\" viewBox=\"0 0 9 12\" fill=\"none\" aria-hidden=\"true\"><path d=\"M6.8999 10.6L2.0999 5.8L6.8999 1\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg></button>"
        "<div class=\"slider-pagination\"><span class=\"current-slide\">1</span><span class=\"slide-spacer\">/</span><span class=\"total-slides\">{{ section.blocks.size }}</span></div>"
        "<button class=\"navigation-arrow-button next\" type=\"button\" aria-label=\"Next\" data-slideshow-navigation-button data-swatch-scroll=\"next\">"
        "<svg class=\"navigation-arrow-button-icon\" width=\"7\" height=\"12\" viewBox=\"0 0 7 12\" fill=\"none\" aria-hidden=\"true\"><path d=\"M1.1001 10.6L5.9001 5.8L1.1001 1\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg></button>"
    )

def port(name):
    global missing_t
    missing_t = []
    src_path = os.path.join(V3, 'sections', name + '.liquid')
    target = (AS or name)
    dst_path = os.path.join('sections', target + '.liquid')
    if not os.path.exists(src_path):
        print(f'!! {name}: not in v3'); return
    if os.path.exists(dst_path) and not FORCE:
        print(f'!! {target}: exists in this theme (use --force to overwrite)'); return
    src = open(src_path).read()

    m = re.search(r'{% schema %}(.*?){% endschema %}', src, re.S)
    body, schema_txt = src[:m.start()], m.group(1)
    schema_txt = re.sub(r',(\s*[}\]])', r'\1', schema_txt)  # trailing commas
    schema = json.loads(schema_txt)
    schema = walk(schema)
    if 'presets' not in schema:
        schema['presets'] = [{'name': schema.get('name', target)}]

    # Body rewrites.
    body = body.replace('scheme-{{', 'color-{{')
    for v3id, v4id in SCHEME_MAP.items():
        if v3id: body = body.replace(f'color-{v3id}', f'color-{v4id}').replace(f'scheme-{v3id}', f'color-{v4id}')
    body = re.sub(r"{%-?\s*render\s+'lazy-image'\s*,?\s*([^%]*?)-?%}", inline_lazy_image, body)
    body = re.sub(r"{%-?\s*render\s+'marker'\s*,?\s*([^%]*?)-?%}", inline_marker, body)
    body = re.sub(r"{%-?\s*render\s+'carousal-arrows'\s*,?\s*([^%]*?)-?%}", inline_arrows, body)
    body = re.sub(r"{%-?\s*render\s+'carousal-arrow-count'\s*,?\s*([^%]*?)-?%}", inline_arrow_count, body)

    # Assets.
    copied = []
    for asset in set(re.findall(r"'([^']+\.(?:css|js))'\s*\|\s*asset_url", body)):
        s = os.path.join(V3, 'assets', asset); d = os.path.join('assets', asset)
        if os.path.exists(s) and not os.path.exists(d):
            shutil.copy(s, d); copied.append(asset)

    # Locale strings used by the body.
    added_keys = []
    for key in set(re.findall(r"'([a-z0-9_.]+)'\s*\|\s*t\b", body)):
        if lookup(key, v4_locale) is not None: continue
        val = lookup(key, v3_locale)
        if val is None: continue
        cur = v4_locale
        parts = key.split('.')
        for p in parts[:-1]:
            cur = cur.setdefault(p, {})
            if not isinstance(cur, dict): break
        else:
            cur[parts[-1]] = val; added_keys.append(key)

    header = (
        "{% comment %}\n"
        f"  Ported from gs-shopify-v3 sections/{name}.liquid by scripts/port-section.py\n"
        "  (2026-10 client review: \"modules to carry over\"). Schema labels are\n"
        "  literal strings, colour schemes are Dawn's, and the v3 snippets this\n"
        "  theme lacks are inlined so the section stays self-contained.\n"
        "{% endcomment %}\n"
    )
    out = header + body.rstrip() + '\n\n{% schema %}\n' + json.dumps(schema, indent=2, ensure_ascii=False) + '\n{% endschema %}\n'
    open(dst_path, 'w').write(out)

    # Report.
    leftover_renders = sorted(set(re.findall(r"render '([^']+)'", body)))
    used_settings = sorted(set(re.findall(r"settings\.([a-z0-9_]+)", body)) - set(re.findall(r"(?:section|block)\.settings\.([a-z0-9_]+)", body)))
    missing_settings = [s for s in used_settings if s not in v4_settings_ids]
    flags = [f for f in ('data-slideshow', 'data-marquee', 'flickity', 'data-aos', 'data-quick-view', 'data-side-drawer-open', 'lazyload', 'aos-') if f in body]
    n_settings = len([s for s in schema.get('settings', []) if 'id' in s])
    print(f'== {target}: {len(out.splitlines())} lines, {n_settings} settings, blocks={[b["type"] for b in schema.get("blocks", [])]}')
    if copied: print('   assets copied:', copied)
    if added_keys: print('   locale keys added:', added_keys)
    if missing_t: print('   t: keys not found (label guessed):', missing_t)
    if leftover_renders: print('   RENDERS LEFT TO INLINE:', leftover_renders)
    if missing_settings: print('   GLOBAL SETTINGS NOT IN THIS THEME:', missing_settings)
    if flags: print('   v3 theme.js behaviour markers:', flags)

for n in names: port(n)
json.dump(v4_locale, open(v4_locale_path, 'w'), indent=2, ensure_ascii=False); open(v4_locale_path, 'a').write('\n')
