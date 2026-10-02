// The #doc surface. Programmatic rendering pauses the MutationObserver so it is never
// mistaken for a user edit; user edits get live draft hints (tombstones, revision-changed).
// The formal diff ignores these hints and recomputes from snapshots.
import { el } from './elements.js';
import { state } from './state.js';
import { BLOCK_SELECTOR } from '../engine/dom.js';
import { clearDraftDeletions, draftInputRange, restoreDraftSelection } from './draft-deletions.js';
import {clearRevisionNavigation} from './revision-navigation.js';

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
  state.activeRevision.html=draftSurfaceHtml();
});

export function withObserverPaused(fn) {
  observer.disconnect();
  try { return fn(); }
  finally { observer.observe(el.doc,OBSERVER_OPTIONS); }
}
export function draftSurfaceHtml() {
  if(!el.doc.querySelector('.draft-deletion')) return el.doc.innerHTML;
  const copy=el.doc.cloneNode(true);
  copy.querySelectorAll('.draft-deletion').forEach(n=>n.remove());
  return copy.innerHTML;
}
export function setDocHtml(html) {
  clearRevisionNavigation();
  withObserverPaused(()=>{ clearDraftDeletions(el.doc);el.doc.innerHTML=html; });
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
  if(state.activeRevision) state.activeRevision.html=draftSurfaceHtml();
  state.activeRevision=null;
}

let preInputBlockId=null;
const NAVIGATION_KEYS=new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown','Shift','Control','Alt','Meta','CapsLock','Escape','Tab']);
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
  state.activeRevision.html=draftSurfaceHtml();
}
export function initDocSurface() {
  // Keyboard, paste/cut and composition happen before beforeinput target ranges
  // are captured. Clear presentation splits there to retain native edit commands.
  const prepareEditing=event=>{
    if(!state.activeRevision)return;
    // Moving/selecting the caret must not remove comparison text or reflow the
    // document. beforeinput still handles edits without a preceding key event.
    if(event.type==='keydown'&&(NAVIGATION_KEYS.has(event.key)||((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a')))return;
    withObserverPaused(()=>clearDraftDeletions(el.doc,{preserveBlocks:event.type==='compositionstart'||state.composing}));
    el.doc.dispatchEvent(new Event('edoc-markup-invalidated'));
  };
  for(const event of ['keydown','paste','cut','compositionstart','dragstart','drop'])el.doc.addEventListener(event,prepareEditing);
  el.doc.addEventListener('beforeinput',event=>{
    if(!state.activeRevision) return;
    const target=draftInputRange(event);
    const hadSplits=withObserverPaused(()=>clearDraftDeletions(el.doc,{preserveBlocks:state.composing}));
    // Some touch, dictation and menu edits have no preceding keyboard event.
    // Reissue supported native commands against the canonical target range;
    // captured WebKit ranges may otherwise reference removed split nodes.
    if(hadSplits && event.cancelable){
      const commands={insertText:'insertText',insertReplacementText:'insertText',insertParagraph:'insertParagraph',insertLineBreak:'insertLineBreak'};
      const command=commands[event.inputType] || (event.inputType.startsWith('delete')?'delete':null);
      if(command && (command!=='insertText' || event.data!==null)){
        event.preventDefault();
        if(target && !event.inputType.startsWith('history'))restoreDraftSelection(target);
        document.execCommand(command,false,command==='insertText'?event.data:null);
      }
    }
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
