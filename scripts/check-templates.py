"""Template validator: every section type resolves to a file, order matches sections,
every block type is allowed by its section schema (theme blocks must exist in blocks/).

Usage: python3 scripts/check-templates.py   (from the repo root)
"""
import json,glob,os,re
secs={os.path.basename(f)[:-7] for f in glob.glob('sections/*.liquid')}
blocks={os.path.basename(f)[:-7] for f in glob.glob('blocks/*.liquid')}
schema={}
for f in glob.glob('sections/*.liquid'):
    m=re.search(r'{%-?\s*schema\s*-?%}(.*?){%-?\s*endschema\s*-?%}',open(f).read(),re.S)
    if m:
        try: schema[os.path.basename(f)[:-7]]=json.loads(re.sub(r',(\s*[}\]])',r'\1',m.group(1)))
        except Exception as e: print('BAD SCHEMA',f,e)
def allowed(sname):
    bl=schema.get(sname,{}).get('blocks',[])
    types={b['type'] for b in bl}
    return types
errs=[]
def load(p): return json.loads(re.sub(r'^\s*/\*.*?\*/\s*','',open(p).read(),flags=re.S))
for f in sorted(glob.glob('templates/*.json')+glob.glob('sections/*-group.json')):
    d=load(f); S=d.get('sections',{}); O=d.get('order',list(S))
    if 'order' in d and (set(O)!=set(S) or len(O)!=len(set(O))): errs.append((f,'order/sections mismatch',sorted(set(O)^set(S))))
    for k,s in S.items():
        t=s.get('type')
        if t not in secs: errs.append((f,k,'missing section type',t)); continue
        if t.startswith('deprecated--'): errs.append((f,k,'uses deprecated type',t))
        B=s.get('blocks',{}); BO=s.get('block_order',list(B))
        if 'block_order' in s and set(BO)!=set(B): errs.append((f,k,'block_order mismatch'))
        ok=allowed(t)
        for bk,b in B.items():
            bt=b.get('type','')
            if bt.startswith('shopify://'): continue
            if bt.startswith('block--'):
                if bt not in blocks: errs.append((f,k,bk,'missing block file',bt))
                elif bt not in ok and '@theme' not in ok: errs.append((f,k,bk,'block not allowed by section',t,bt))
            elif bt not in ok: errs.append((f,k,bk,'local block type not in schema',t,bt))
            for ck,cb in b.get('blocks',{}).items():
                if cb.get('type','').startswith('block--') and cb['type'] not in blocks: errs.append((f,k,bk,ck,'missing child block',cb['type']))
for e in errs: print(e)
print('OK' if not errs else f'{len(errs)} problems')
