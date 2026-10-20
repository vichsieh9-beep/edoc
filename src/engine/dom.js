// Document content model shared by the engine and the editor.
export const BLOCK_SELECTOR='h1,h2,h3,p,li,td,th,blockquote';

// Stored versions can come from any edit-link holder, so html is always parsed in an inert
// document: images do not load, scripts do not run and event handlers never fire.
let inertDocument=null;
export function inertContainer(html, context) {
  const doc=context?.document || (inertDocument=inertDocument||document.implementation.createHTMLDocument(''));
  const div=doc.createElement('div');
  div.innerHTML=html;
  return div;
}

// Content only: drop diff marks, draft tombstones and block ids.
export function cleanSnapshot(html, context) {
  const tmp = inertContainer(html, context);
  tmp.querySelectorAll('.deleted,.deletion-record').forEach(x=>x.remove());
  tmp.querySelectorAll('.changed,.revision-changed,.format-changed').forEach(x=>{x.classList.remove('changed','revision-changed','format-changed'); if(!x.className)x.removeAttribute('class');});
  tmp.querySelectorAll('[data-edoc-block]').forEach(x=>x.removeAttribute('data-edoc-block'));
  tmp.querySelectorAll('[data-edoc-fmt]').forEach(x=>x.removeAttribute('data-edoc-fmt'));
  return tmp.innerHTML;
}
export function annotateBaseBlocks(root) {
  let i=1;
  root.querySelectorAll(BLOCK_SELECTOR).forEach(el=>{ el.dataset.edocBlock='b'+(i++); });
}
export function unwrapElement(el){ el.replaceWith(...el.childNodes); }
// The Worker's DOM (linkedom) serializes a newly added attribute first, browsers last.
// Elements the engine writes several attributes on get the same sorted order on both.
const prepending=new WeakMap();
function prependsAttributes(doc){
  if(!prepending.has(doc)){ const t=doc.createElement('i'); t.setAttribute('a',''); t.setAttribute('b',''); prepending.set(doc,t.attributes[0].name==='b'); }
  return prepending.get(doc);
}
export function sortAttributes(el){
  const attrs=[...el.attributes].map(a=>[a.name,a.value]).sort(([a],[b])=>a.localeCompare(b));
  attrs.forEach(([a])=>el.removeAttribute(a));
  (prependsAttributes(el.ownerDocument)?attrs.reverse():attrs).forEach(([a,b])=>el.setAttribute(a,b));
}
export function normalizeWs(t){ return t.replace(/\s+/g,' ').trim(); }
// Text nodes whose nearest block is `block` itself (nested blocks own their own text).
export function ownedTextNodes(block) {
  const out=[];
  const walker=block.ownerDocument.createTreeWalker(block,4);
  let n;
  while((n=walker.nextNode())){
    let p=n.parentElement, owner=null;
    while(p){
      if(p.matches && p.matches(BLOCK_SELECTOR)){owner=p;break;}
      p=p.parentElement;
    }
    if(owner===block) out.push(n);
  }
  return out;
}
export function ownText(block){ return ownedTextNodes(block).map(n=>n.textContent).join(''); }
