import { BLOCK_SELECTOR, inertContainer } from './dom.js';
import { CONTENT_CLASSES, FORMAT_NOTE, STYLED_BLOCKS, blockTagOf, canonicalBlockStyle, canonicalSpanStyle, fontElementStyle } from './content-model.js';

/* Every html shown in the page passes through here: keep only the document content model.
 * Parsed in a <template> so nothing executes or loads while filtering. */
const IMPORT_ALLOWED_TAGS=new Set(['H1','H2','H3','P','UL','OL','LI','STRONG','EM','B','I','U','S','SUP','SUB','SPAN','BR','HR',
  'TABLE','THEAD','TBODY','TFOOT','TR','TD','TH','CAPTION','COLGROUP','COL','BLOCKQUOTE','A','IMG']);
const IMPORT_DROPPED_TAGS='script,style,iframe,frame,frameset,object,embed,applet,link,meta,base,form,input,button,'+
  'textarea,select,option,svg,math,template,noscript,audio,video,source,track,canvas,dialog,portal';
const IMPORT_ALLOWED_ATTRS={'*':['class','data-edoc-block','data-edoc-fmt'],A:['href','title'],IMG:['src','alt','title','width','height'],
  TD:['colspan','rowspan'],TH:['colspan','rowspan','scope']};
// Same meaning, one spelling: strikethrough is <s>.
const RENAMED_TAGS={STRIKE:'S',DEL:'S'};
function isSafeImportUrl(value){
  const v=value.replace(/[\x00-\x20\x7f-\x9f]/g,'').toLowerCase();
  return !/^(javascript|data|vbscript):/.test(v);
}
function rename(el,tag){
  const n=el.ownerDocument.createElement(tag.toLowerCase());
  for(const a of [...el.attributes]) n.setAttribute(a.name,a.value);
  n.append(...el.childNodes); el.replaceWith(n);
  return n;
}
// Formatting is kept only in its canonical form (see content-model.js).
function filterStyle(el){
  const raw=el.getAttribute('style')||'';
  const style=el.tagName==='SPAN' ? canonicalSpanStyle(raw,blockTagOf(el))
    : STYLED_BLOCKS.has(el.tagName) ? canonicalBlockStyle(raw,el.getAttribute('align')||'') : '';
  if(style) el.setAttribute('style',style); else el.removeAttribute('style');
}
function filterClass(el){
  const value=el.getAttribute('class');
  if(value===null) return;
  const tokens=value.split(/\s+/).filter(Boolean);
  // Page chrome classes could restyle stored text as part of the page; diff marks only.
  if(tokens.every(t=>CONTENT_CLASSES.has(t))) return;
  const keep=tokens.filter(t=>CONTENT_CLASSES.has(t));
  if(keep.length) el.setAttribute('class',keep.join(' ')); else el.removeAttribute('class');
}
export function sanitizeRevisionHtml(html, context){
  const root=inertContainer(String(html||''), context);
  const doc=root.ownerDocument;
  root.querySelectorAll(IMPORT_DROPPED_TAGS).forEach(el=>el.remove());
  const comments=doc.createTreeWalker(root,128);
  const drop=[]; while(comments.nextNode()) drop.push(comments.currentNode); drop.forEach(c=>c.remove());
  [...root.querySelectorAll('*')].forEach(original=>{
    let el=original;
    if(el.tagName==='DIV'){ // another browser's paragraph: keep the text as <p>
      if(el.querySelector(BLOCK_SELECTOR+',ul,ol,table,div')) el.replaceWith(...el.childNodes);
      else { const p=doc.createElement('p'); p.append(...el.childNodes); el.replaceWith(p); }
      return;
    }
    if(el.tagName==='FONT'){ // the browser's colour / font / size commands
      const style=fontElementStyle(el);
      if(!style){ el.replaceWith(...el.childNodes); return; }
      const span=doc.createElement('span'); span.setAttribute('style',style); span.append(...el.childNodes); el.replaceWith(span);
      el=span;
    } else if(RENAMED_TAGS[el.tagName]) el=rename(el,RENAMED_TAGS[el.tagName]);
    if(!IMPORT_ALLOWED_TAGS.has(el.tagName)){ el.replaceWith(...el.childNodes); return; }
    const styled=el.hasAttribute('style');
    if(styled||el.hasAttribute('align')) filterStyle(el);
    const allowed=IMPORT_ALLOWED_ATTRS['*'].concat(IMPORT_ALLOWED_ATTRS[el.tagName]||[]);
    [...el.attributes].forEach(a=>{
      const name=a.name.toLowerCase();
      // contenteditable="false" keeps a draft's deletion records read-only when a saved draft is restored.
      if(name==='contenteditable' && a.value==='false') return;
      if(name==='style' && (el.tagName==='SPAN'||STYLED_BLOCKS.has(el.tagName))) return;
      if(name==='data-edoc-fmt' && !FORMAT_NOTE.test(a.value)){ el.removeAttribute(a.name); return; }
      if(!allowed.includes(name) || ((name==='href'||name==='src') && !isSafeImportUrl(a.value))) el.removeAttribute(a.name);
    });
    if(el.hasAttribute('class')) filterClass(el);
    // A span that only carried editor styles is only a wrapper (bare spans already stored stay).
    if(el.tagName==='SPAN' && (styled || original!==el) && !el.attributes.length) el.replaceWith(...el.childNodes);
  });
  return root.innerHTML;
}

// A draft saved as a file, e.g. when publishing fails (see ui/draft.js).
export function makeRevisionPackage(documentId, revision) {
  return {edocRevisionPackage:true,formatVersion:1,documentId,revision};
}
