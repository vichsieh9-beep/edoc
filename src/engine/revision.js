import { BLOCK_SELECTOR } from './dom.js';

/* Imported revisions come from outside reviewers: keep only the document content model.
 * Parsed in a <template> so nothing executes or loads while filtering. */
const IMPORT_ALLOWED_TAGS=new Set(['H1','H2','P','UL','OL','LI','STRONG','EM','B','I','SPAN','BR','HR',
  'TABLE','THEAD','TBODY','TFOOT','TR','TD','TH','CAPTION','COLGROUP','COL','BLOCKQUOTE','A','IMG']);
const IMPORT_DROPPED_TAGS='script,style,iframe,frame,frameset,object,embed,applet,link,meta,base,form,input,button,'+
  'textarea,select,option,svg,math,template,noscript,audio,video,source,track,canvas,dialog,portal';
const IMPORT_ALLOWED_ATTRS={'*':['class','data-edoc-block'],A:['href','title'],IMG:['src','alt','title','width','height'],
  TD:['colspan','rowspan'],TH:['colspan','rowspan','scope']};
function isSafeImportUrl(value){
  const v=value.replace(/[\x00-\x20\x7f-\x9f]/g,'').toLowerCase();
  return !/^(javascript|data|vbscript):/.test(v);
}
export function sanitizeRevisionHtml(html){
  const tpl=document.createElement('template');
  tpl.innerHTML=String(html||'');
  const root=tpl.content;
  root.querySelectorAll(IMPORT_DROPPED_TAGS).forEach(el=>el.remove());
  const comments=document.createTreeWalker(root,NodeFilter.SHOW_COMMENT);
  const drop=[]; while(comments.nextNode()) drop.push(comments.currentNode); drop.forEach(c=>c.remove());
  [...root.querySelectorAll('*')].forEach(el=>{
    if(el.tagName==='DIV'){ // another browser's paragraph: keep the text as <p>
      if(el.querySelector(BLOCK_SELECTOR+',ul,ol,table,div')) el.replaceWith(...el.childNodes);
      else { const p=document.createElement('p'); p.append(...el.childNodes); el.replaceWith(p); }
      return;
    }
    if(!IMPORT_ALLOWED_TAGS.has(el.tagName)){ el.replaceWith(...el.childNodes); return; }
    const allowed=IMPORT_ALLOWED_ATTRS['*'].concat(IMPORT_ALLOWED_ATTRS[el.tagName]||[]);
    [...el.attributes].forEach(a=>{
      const name=a.name.toLowerCase();
      if(!allowed.includes(name) || ((name==='href'||name==='src') && !isSafeImportUrl(a.value))) el.removeAttribute(a.name);
    });
  });
  return tpl.innerHTML;
}

// Read a returned revision: a .edoc-revision.json package, or a review .html whose
// embedded revisionData holds the reviewer's latest pending revision.
export function parseRevisionFile(text, filename) {
  let pkg=null;
  if(filename.toLowerCase().endsWith('.json')){
    pkg=JSON.parse(text);
  } else {
    const parsed=new DOMParser().parseFromString(text,'text/html');
    const r=parsed.getElementById('revisionData');
    if(!r) throw new Error('找不到 EDoc revisionData');
    const arr=JSON.parse(r.textContent||'[]');
    if(!arr.length) throw new Error('這份 HTML 沒有修訂資料');
    const pending=arr.filter(x=>x.status!=='accepted');
    const pool=pending.length?pending:arr;
    const selected=pool[pool.length-1];
    pkg={edocRevisionPackage:true,documentId:(JSON.parse(parsed.getElementById('documentState').textContent||'{}')).documentId,revision:selected};
  }
  if(!pkg.edocRevisionPackage || !pkg.revision) throw new Error('不是有效的 EDoc 修訂包');
  return pkg;
}
export function makeRevisionPackage(documentId, revision) {
  return {edocRevisionPackage:true,formatVersion:1,documentId,revision};
}
// A revision can only become the next version if it was made on the current latest version.
export function isRevisionConflict(r, {documentId, latestVersion, latestHash}) {
  if(r.documentId!==documentId) return true;
  if(r.baseVersion!==latestVersion) return true;
  return !!r.baseHash && r.baseHash!==latestHash;
}
