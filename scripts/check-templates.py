"""Template validator: every section type resolves to a file, order matches sections,
every block type is allowed by its section schema (theme blocks must exist in blocks/).

Usage: python3 scripts/check-templates.py [--settings]   (from the repo root)

--settings also checks every setting id against the target schema, ranges
against min/max/step, selects against their options and color_scheme values
against scheme-1..6. Those are the things a theme push rejects.

`_blocks` is Shopify's own wrapper for theme blocks placed straight into a
template (the AI-generated blocks); it has no section file. Its children
must exist in blocks/.
"""
import json, glob, os, re, sys
SETTINGS = '--settings' in sys.argv
secs = {os.path.basename(f)[:-7] for f in glob.glob('sections/*.liquid')}
blocks = {os.path.basename(f)[:-7] for f in glob.glob('blocks/*.liquid')}
schema = {}
block_schema = {}
for f in glob.glob('sections/*.liquid') + glob.glob('blocks/*.liquid'):
    m = re.search(r'{%-?\s*schema\s*-?%}(.*?){%-?\s*endschema\s*-?%}', open(f).read(), re.S)
    if m:
        try:
            sch = json.loads(re.sub(r',(\s*[}\]])', r'\1', m.group(1)))
        except Exception as e:
            print('BAD SCHEMA', f, e); continue
        (schema if f.startswith('sections/') else block_schema)[os.path.basename(f)[:-7]] = sch

def allowed(sname):
    return {b['type'] for b in schema.get(sname, {}).get('blocks', [])}

def defs_of(sch):
    return {s['id']: s for s in sch.get('settings', []) if 'id' in s}

SCHEMES = {'scheme-1', 'scheme-2', 'scheme-3', 'scheme-4', 'scheme-5', 'scheme-6'}
def check_settings(where, defs, settings, errs):
    for k, v in (settings or {}).items():
        d = defs.get(k)
        if d is None:
            errs.append((where, 'setting not in schema', k)); continue
        t = d.get('type')
        if t == 'range' and isinstance(v, (int, float)):
            lo, hi, st = d.get('min', 0), d.get('max', 100), d.get('step', 1)
            if v < lo or v > hi or abs(((v - lo) / st) - round((v - lo) / st)) > 1e-6:
                errs.append((where, 'range out of bounds/step', k, v, (lo, hi, st)))
        elif t == 'select' and d.get('options') and str(v) not in [o['value'] for o in d['options']]:
            errs.append((where, 'select value not an option', k, v))
        elif t == 'color_scheme' and v not in SCHEMES and v != '':
            errs.append((where, 'unknown color scheme', k, v))

errs = []
def load(p): return json.loads(re.sub(r'^\s*/\*.*?\*/\s*', '', open(p).read(), flags=re.S))
for f in sorted(glob.glob('templates/*.json') + glob.glob('sections/*-group.json')):
    d = load(f); S = d.get('sections', {}); O = d.get('order', list(S))
    if 'order' in d and (set(O) != set(S) or len(O) != len(set(O))): errs.append((f, 'order/sections mismatch', sorted(set(O) ^ set(S))))
    for k, s in S.items():
        t = s.get('type')
        B = s.get('blocks', {}); BO = s.get('block_order', list(B))
        if 'block_order' in s and set(BO) != set(B): errs.append((f, k, 'block_order mismatch'))
        if t == '_blocks':
            for bk, b in B.items():
                if b.get('type', '') not in blocks: errs.append((f, k, bk, 'missing theme block for _blocks', b.get('type')))
                elif SETTINGS: check_settings(f'{f}:{k}/{bk}', defs_of(block_schema[b['type']]), b.get('settings'), errs)
            continue
        if t not in secs: errs.append((f, k, 'missing section type', t)); continue
        if t.startswith('deprecated--'): errs.append((f, k, 'uses deprecated type', t))
        if SETTINGS: check_settings(f'{f}:{k}', defs_of(schema.get(t, {})), s.get('settings'), errs)
        ok = allowed(t)
        local = {b['type']: defs_of(b) for b in schema.get(t, {}).get('blocks', [])}
        for bk, b in B.items():
            bt = b.get('type', '')
            if bt.startswith('shopify://'): continue
            if bt.startswith('block--') or bt.startswith('ai_gen_block_'):
                if bt not in blocks: errs.append((f, k, bk, 'missing block file', bt))
                elif bt not in ok and '@theme' not in ok: errs.append((f, k, bk, 'block not allowed by section', t, bt))
                elif SETTINGS: check_settings(f'{f}:{k}/{bk}', defs_of(block_schema[bt]), b.get('settings'), errs)
            elif bt not in ok: errs.append((f, k, bk, 'local block type not in schema', t, bt))
            elif SETTINGS: check_settings(f'{f}:{k}/{bk}', local.get(bt, {}), b.get('settings'), errs)
            for ck, cb in b.get('blocks', {}).items():
                ct = cb.get('type', '')
                if ct.startswith('block--') and ct not in blocks: errs.append((f, k, bk, ck, 'missing child block', ct))
                elif SETTINGS and ct in block_schema: check_settings(f'{f}:{k}/{bk}/{ck}', defs_of(block_schema[ct]), cb.get('settings'), errs)
for e in errs: print(e)
print('OK' if not errs else f'{len(errs)} problems')
