// Document content model shared by the engine and the editor.
export const BLOCK_SELECTOR='h1,h2,p,li,td,th,blockquote';

// Stored versions can come from any edit-link holder, so html is always parsed in an inert
// document: images do not load, scripts do not run and event handlers never fire.
let inertDocument=null;
export function inertContainer(html) {
  inertDocument=inertDocument||document.implementation.createHTMLDocument('');
  const div=inertDocument.createElement('div');
  div.innerHTML=html;
  return div;
}

// Content only: drop diff marks, draft tombstones and block ids.
export function cleanSnapshot(html) {
  const tmp = inertContainer(html);
  tmp.querySelectorAll('.deleted,.deletion-record').forEach(x=>x.remove());
  tmp.querySelectorAll('.changed,.revision-changed').forEach(x=>{x.classList.remove('changed','revision-changed'); if(!x.className)x.removeAttribute('class');});
  tmp.querySelectorAll('[data-edoc-block]').forEach(x=>x.removeAttribute('data-edoc-block'));
  return tmp.innerHTML;
}
export function annotateBaseBlocks(root) {
  let i=1;
  root.querySelectorAll(BLOCK_SELECTOR).forEach(el=>{ el.dataset.edocBlock='b'+(i++); });
}
export function unwrapElement(el){ el.replaceWith(...el.childNodes); }
export function normalizeWs(t){ return t.replace(/\s+/g,' ').trim(); }
// Text nodes whose nearest block is `block` itself (nested blocks own their own text).
export function ownedTextNodes(block) {
  const out=[];
  const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT);
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
