import { BLOCK_SELECTOR } from './dom.js';

/* Every html shown in the page passes through here: keep only the document content model.
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
      // contenteditable="false" keeps a draft's deletion records read-only when a saved draft is restored.
      if(name==='contenteditable' && a.value==='false') return;
      if(!allowed.includes(name) || ((name==='href'||name==='src') && !isSafeImportUrl(a.value))) el.removeAttribute(a.name);
    });
  });
  return tpl.innerHTML;
}

// A draft saved as a file, e.g. when publishing fails (see ui/draft.js).
export function makeRevisionPackage(documentId, revision) {
  return {edocRevisionPackage:true,formatVersion:1,documentId,revision};
}
