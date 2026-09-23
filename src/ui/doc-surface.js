// The #doc surface. Programmatic rendering pauses the MutationObserver so it is never
// mistaken for a user edit; user edits get live draft hints (tombstones, revision-changed).
// The formal diff ignores these hints and recomputes from snapshots.
import { el } from './elements.js';
import { state } from './state.js';
import { BLOCK_SELECTOR } from '../engine/dom.js';

const OBSERVER_OPTIONS={childList:true,subtree:true,characterData:true};

const observer = new MutationObserver(mutations=>{
  if(state.suppressObserver || !state.activeRevision) return;
  for(const m of mutations){
    m.removedNodes.forEach(n=>{
      if(n.nodeType===1 && n.dataset && n.dataset.edocBlock && !n.classList.contains('deletion-record')){
        const tomb=n.cloneNode(true);
        tomb.classList.remove('revision-changed');
        tomb.classList.add('deletion-record');
        tomb.contentEditable='false';
        withObserverPaused(()=>{
          try{ m.target.insertBefore(tomb, m.nextSibling); }catch(e){}
        });
      }
    });
    m.addedNodes.forEach(n=>{
      if(n.nodeType===1){
        const node=n;
        if(!node.dataset.edocBlock && node.matches && node.matches(BLOCK_SELECTOR)) node.dataset.edocBlock=allocateNewBlockId();
        if(!node.classList.contains('deletion-record')) node.classList.add('revision-changed');
      }
    });
  }
  state.activeRevision.html=el.doc.innerHTML;
});

export function withObserverPaused(fn) {
  observer.disconnect();
  try { return fn(); }
  finally { observer.observe(el.doc,OBSERVER_OPTIONS); }
}
export function setDocHtml(html) {
  withObserverPaused(()=>{ el.doc.innerHTML=html; });
}
function nearestBlock(node) {
  let n=node;
  if(!n) return null;
  if(n.nodeType===3) n=n.parentElement;
  if(!n) return null;
  return n.closest ? n.closest(BLOCK_SELECTOR) : null;
}
function allocateNewBlockId() {
  return 'n'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
}
export function annotateBlocks(root=el.doc) {
  let i=1;
  root.querySelectorAll(BLOCK_SELECTOR).forEach(b=>{
    if(!b.dataset.edocBlock) b.dataset.edocBlock='b'+(i++);
  });
}
export function leaveRevisionView() {
  if(state.activeRevision) state.activeRevision.html=el.doc.innerHTML;
  state.activeRevision=null;
}

let preInputBlockId=null;
function markChangedFromEvent() {
  if(!state.activeRevision) return;
  let block=null;
  if(preInputBlockId) block=el.doc.querySelector('[data-edoc-block="'+CSS.escape(preInputBlockId)+'"]');
  if(!block){
    const sel=window.getSelection();
    block=nearestBlock(sel && sel.anchorNode);
  }
  if(block && !block.classList.contains('deletion-record')){
    if(!block.dataset.edocBlock) block.dataset.edocBlock=allocateNewBlockId();
    block.classList.add('revision-changed');
  }
  preInputBlockId=null;
  state.activeRevision.html=el.doc.innerHTML;
}
export function initDocSurface() {
  el.doc.addEventListener('beforeinput',()=>{
    if(!state.activeRevision) return;
    const sel=window.getSelection();
    const b=nearestBlock(sel && sel.anchorNode);
    if(b){
      if(!b.dataset.edocBlock) b.dataset.edocBlock=allocateNewBlockId();
      preInputBlockId=b.dataset.edocBlock;
    } else preInputBlockId=null;
  });
  observer.observe(el.doc,OBSERVER_OPTIONS);
  el.doc.addEventListener('input',markChangedFromEvent);
}
