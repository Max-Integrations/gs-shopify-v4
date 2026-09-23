"""Migrate template JSON to the theme-block versions of rich-text, image-banner,
image-with-text, main-404 and section--full-width-image_text, and media-tile
buttons to block--button v2.

Usage: python3 migrate_buttons.py [SOURCE_DIR]
  SOURCE_DIR: a theme pull to read templates from (default: the repo itself).
  Writes into the repo's templates/ and sections/*-group.json. Re-runnable:
  already-migrated blocks are left alone.
"""
import json,re,glob,os,sys
SRC=sys.argv[1] if len(sys.argv)>1 else '.'
def load(p): return json.loads(re.sub(r'^\s*/\*.*?\*/\s*','',open(p).read(),flags=re.S))
def save(p,d): json.dump(d,open(p,'w'),indent=2,ensure_ascii=False); open(p,'a').write('\n')
def clamp(v,lo,hi,step=1):
    try: v=float(v)
    except: v=lo
    v=round((v-lo)/step)*step+lo
    return int(max(lo,min(hi,v)))
def rem_px(v,default):
    m=re.match(r'\s*([\d.]+)\s*(rem|px)?',str(v or ''))
    if not m: return default
    n=float(m.group(1)); return int(round(n*10)) if (m.group(2) or 'rem')=='rem' else int(round(n))
def colour(v):
    v=(v or '').strip()
    return '' if v.lower() in ('','#00000000','rgba(0,0,0,0)','transparent') else v

BTN={"label":"","link":"","open_in_new_tab":False,"style":"button","width":"auto","font_size":0,"padding_y":12,"padding_x":28,
     "border_width":1,"border_radius":0,"custom_scheme":False,"color_scheme":"scheme-1","bg":"","text_color":"","border_color":"","hover_bg":"","hover_text_color":""}
def button(label,link,secondary=False,new_tab=False,**over):
    b=dict(BTN); b.update({"label":label,"link":link or "","open_in_new_tab":bool(new_tab),"style":"outline" if secondary else "button"}); b.update(over)
    return {"type":"block--button","settings":b}
def heading(text,size='h2'):
    return {"type":"block--heading","settings":{"text":text or "","size":size or "h2","tag":"h2","alignment":"inherit","color":"","font_size_desktop":0,"font_size_mobile":0}}
def text(html,size='body'):
    return {"type":"block--text","settings":{"text":html or "","size":size,"alignment":"inherit","color":""}}
def wrap_p(v):
    v=v or ''
    return v if v.strip().startswith('<') else f'<p>{v}</p>'

SIZE={'small':(13,8,16),'medium':(15,12,24),'large':(17,16,32)}
CSS_MAP=[(r'\.rich-text__heading(?![\w-])','.gs-block-heading'),(r'\.rich-text__caption(?![\w-])','.gs-block-text'),(r'\.rich-text__text(?![\w-])','.gs-block-text'),(r'\.rich-text__buttons(?![\w-])','.gs-block-button-wrap'),
         (r'\.banner__heading(?![\w-])','.gs-block-heading'),(r'\.banner__text(?![\w-])','.gs-block-text'),(r'\.banner__buttons(?![\w-])','.gs-block-button-wrap'),
         (r'\.image-with-text__heading(?![\w-])','.gs-block-heading'),(r'\.image-with-text__text(?![\w-])','.gs-block-text')]

def migrate_blocks(sec):
    t=sec.get('type'); blocks=sec.get('blocks',{}); order=sec.get('block_order',list(blocks)); nb={}; no=[]; changed=False
    def put(k,b): nb[k]=b; no.append(k)
    for k in order:
        b=blocks.get(k)
        if b is None: continue
        bt=b['type']; s=b.get('settings',{}); dis=b.get('disabled',False)
        def keep(k,nbk):
            if dis: nbk['disabled']=True
            put(k,nbk)
        if bt.startswith('block--') or bt.startswith('shopify://'):
            # already a theme block: only the media-tile/button v2 size migration applies
            if bt=='block--button' and 'size' in s:
                f,py,px=SIZE.get(s.pop('size'),SIZE['medium']); s.setdefault('font_size',f); s.setdefault('padding_y',py); s.setdefault('padding_x',px)
                for kk,v in BTN.items(): s.setdefault(kk,v)
                if s.get('style')=='button' and not s.get('bg'): pass
                changed=True
            if bt=='block--media-tile':
                for ck,cb in b.get('blocks',{}).items():
                    if cb['type']=='block--button' and 'size' in cb['settings']:
                        cs=cb['settings']; f,py,px=SIZE.get(cs.pop('size'),SIZE['medium']); cs.setdefault('font_size',f); cs.setdefault('padding_y',py); cs.setdefault('padding_x',px)
                        for kk,v in BTN.items(): cs.setdefault(kk,v)
                        changed=True
            keep(k,b); continue
        changed=True
        if t in ('rich-text','image-banner','image-with-text'):
            if bt=='heading': keep(k,heading(s.get('heading'),s.get('heading_size','h2')))
            elif bt=='caption': keep(k,text(wrap_p(s.get('caption')),'small'))
            elif bt=='text': keep(k,text(wrap_p(s.get('text'))))
            elif bt=='button':
                n=0
                for suf,(l,u,sec2) in {'':('button_label','button_link','button_style_secondary'),'_2':('button_label_2','button_link_2','button_style_secondary_2')}.items():
                    if s.get(l): n+=1; keep(k+suf if suf else k,button(s[l],s.get(u),s.get(sec2),s.get('open_in_new_tab')))
                if n==0: keep(k,button('',''))
            elif bt=='buttons':
                n=0
                for i in ('1','2'):
                    if s.get(f'button_label_{i}'): n+=1; keep(f'{k}_{i}',button(s[f'button_label_{i}'],s.get(f'button_link_{i}'),s.get(f'button_style_secondary_{i}')))
                if n==0: keep(k,button('',''))
            else: keep(k,b)
        elif t=='main-404' and bt=='button':
            keep(k,button(s.get('label'),s.get('link'),style='link' if s.get('style')=='link' else 'button'))
        elif t=='section--full-width-image_text':
            if bt=='message_line':
                keep(k,{"type":"block--message-line","settings":{"text":s.get('text',''),"size_desktop":clamp(rem_px(s.get('size_scale_desktop'),16),10,100),"size_mobile":clamp(rem_px(s.get('size_scale_mobile'),16),10,80),
                    "text_color":s.get('text_color') or '#000000',"background_color":colour(s.get('background_color')),"letter_spacing":clamp(s.get('letter_spacing',0),0,16),
                    "padding_y":clamp(s.get('padding_vertical_desktop',8),0,64,2),"padding_x":clamp(s.get('padding_horizontal_desktop',8),0,64,2)}})
            elif bt=='button':
                keep(k,button(s.get('text',''),s.get('url'),False,s.get('open_in_new_tab'),font_size=clamp(rem_px(s.get('size_scale_desktop'),0),0,40) if s.get('size_scale_desktop') else 0,
                    padding_y=clamp(s.get('padding_vertical_desktop',12),0,40),padding_x=clamp(s.get('padding_horizontal_desktop',28),0,80),border_width=clamp(s.get('border_width',1),0,6),
                    bg=colour(s.get('background_color')),text_color=colour(s.get('text_color')),border_color=colour(s.get('border_color')),hover_bg=colour(s.get('background_color_hover')),hover_text_color=colour(s.get('text_color_hover'))))
            else: keep(k,b)
        else:
            keep(k,b); changed=False
    if changed:
        sec['blocks']=nb; sec['block_order']=no
        if sec.get('custom_css'):
            sec['custom_css']=[re.sub(pat,rep,rule) for rule in sec['custom_css'] for pat,rep in [(None,None)] for rule in [rule]] if False else [_rewrite(rule) for rule in sec['custom_css']]
    return changed
def _rewrite(rule):
    for pat,rep in CSS_MAP: rule=re.sub(pat,rep,rule)
    return rule

files=sorted(glob.glob(os.path.join(SRC,'templates/*.json'))+glob.glob(os.path.join(SRC,'sections/*-group.json')))
touched=0
for f in files:
    rel=os.path.relpath(f,SRC); d=load(f); ch=False
    for k,sec in d.get('sections',{}).items():
        if sec.get('type') in ('rich-text','image-banner','image-with-text','main-404','section--full-width-image_text','section--media-grid') and sec.get('blocks'):
            ch|=migrate_blocks(sec)
    if ch or SRC!='.': save(rel,d); touched+=1
print('files written:',touched)
