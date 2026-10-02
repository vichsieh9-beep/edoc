// Read-only comparison fragments. They are recreated from the base diff, never
// from editable text, and are excluded from draft serialization and submission.
import { BLOCK_SELECTOR } from '../engine/dom.js';

// Keep original Text objects alive: native undo commands refer to these objects.
// Before an editing operation, remove presentation fragments and rejoin only the
// text pieces we created (never normalize unrelated editor nodes).
const splitTexts=new Map();
function canonicalPoint(node,offset) {
  const ghost=(node.nodeType===3?node.parentElement:node).closest?.('.draft-deletion');
  if(ghost) return canonicalPoint(ghost.parentNode,[...ghost.parentNode.childNodes].indexOf(ghost));
  if(node.nodeType===1) {
    const children=[...node.childNodes];
    const next=children.slice(offset).find(n=>!n.classList?.contains('draft-deletion'));
    if(next)return next.nodeType===3?canonicalPoint(next,0):{before:next};
    const previous=children.slice(0,offset).reverse().find(n=>!n.classList?.contains('draft-deletion'));
    if(previous)return previous.nodeType===3?canonicalPoint(previous,previous.length):{after:previous};
    return {node,offset:0};
  }
  for(const [original,pieces] of splitTexts) {
    const index=pieces.indexOf(node);
    if(index>=0)return {node:original,offset:pieces.slice(0,index).reduce((n,p)=>n+p.length,0)+offset};
  }
  return {node,offset};
}
function rememberSelection(doc) {
  if(document.activeElement!==doc && !doc.contains(document.activeElement)) return null;
  const selection=getSelection();
  if(!selection?.rangeCount || !doc.contains(selection.anchorNode) || !doc.contains(selection.focusNode)) return null;
  return {anchor:canonicalPoint(selection.anchorNode,selection.anchorOffset),focus:canonicalPoint(selection.focusNode,selection.focusOffset)};
}
export function draftInputRange(event) {
  const range=event.getTargetRanges?.()[0];
  return range?{anchor:canonicalPoint(range.startContainer,range.startOffset),focus:canonicalPoint(range.endContainer,range.endOffset)}:null;
}
export function restoreDraftSelection(bookmark) {
  if(!bookmark) return;
  const resolve=({node,offset,before,after})=>{
    const boundary=before || after;
    if(boundary?.parentNode)return [boundary.parentNode,[...boundary.parentNode.childNodes].indexOf(boundary)+(after?1:0)];
    if(!node)return [document.documentElement,0];
    const pieces=splitTexts.get(node);
    if(pieces) {
      for(let i=0;i<pieces.length;i++) {
        if(offset<pieces[i].length || i===pieces.length-1) return [pieces[i],Math.min(offset,pieces[i].length)];
        offset-=pieces[i].length;
      }
    }
    return [node,Math.min(offset,node.nodeType===3?node.length:node.childNodes.length)];
  };
  const [a,ao]=resolve(bookmark.anchor),[f,fo]=resolve(bookmark.focus);
  if(a.isConnected && f.isConnected) getSelection().setBaseAndExtent(a,ao,f,fo);
}
export function clearDraftDeletions(doc, {preserveBlocks=false}={}) {
  const bookmark=rememberSelection(doc),hadSplits=splitTexts.size>0;
  // Keep whole deleted paragraphs in place during IME composition. Inline
  // splits still rejoin their original Text objects for native editing/undo.
  doc.querySelectorAll('.draft-deletion').forEach(n=>{
    if(!preserveBlocks || !n.matches(BLOCK_SELECTOR+',hr,ul,ol,table,thead,tbody,tfoot,tr'))n.remove();
  });
  for(const [original,pieces] of splitTexts) {
    if(!doc.contains(original)) continue;
    original.data=pieces.filter(n=>doc.contains(n)).map(n=>n.data).join('');
    pieces.slice(1).forEach(n=>n.remove());
  }
  splitTexts.clear();
  if(hadSplits){CSS.highlights?.delete('edoc-insertions');restoreDraftSelection(bookmark);}
  return hadSplits;
}

export function showDraftDeletions(root, doc, deletions, compared, live) {
  const bookmark=rememberSelection(doc);
  const mapped=new Map([[root,doc]]);
  for(let i=0;i<compared.length;i++) {
    let source=compared[i].node.parentElement, cursor=live[i].node.parentElement;
    while(source && source!==root) {
      if(!source.closest('.deleted')) {
        let target=mapped.get(source) || cursor;
        while(target!==doc && target?.tagName!==source.tagName && !(source.tagName==='P' && target?.tagName==='DIV')) target=target?.parentElement;
        if(target && target!==doc) {
          mapped.set(source,target);
          // Advance in both trees: repeated li/ul ancestors must retain depth.
          cursor=target.parentElement;
        }
      }
      source=source.parentElement;
    }
  }
  function place(source, target, parent) {
    let next=source.nextElementSibling;
    while(next && !mapped.has(next)) next=next.nextElementSibling;
    if(next) parent.insertBefore(target,mapped.get(next));
    else {
      let previous=source.previousElementSibling;
      while(previous && !mapped.has(previous)) previous=previous.previousElementSibling;
      if(previous) mapped.get(previous).after(target);
      else parent.append(target);
    }
    mapped.set(source,target);
  }
  function container(source) {
    if(mapped.has(source)) return mapped.get(source);
    const parent=container(source.parentElement);
    const shell=document.importNode(source,false);
    shell.className='deleted deletion-record draft-deletion';
    shell.contentEditable='false'; shell.removeAttribute('data-edoc-block');
    place(source,shell,parent);
    return shell;
  }
  const whole=mark=>mark.matches(BLOCK_SELECTOR+',hr,ul,ol,table,thead,tbody,tfoot,tr');
  // Capture positions before inserting anything; reverse order keeps offsets in
  // the original Text valid as multiple deletion fragments split the same node.
  const pending=deletions.map(mark=>{
    if(whole(mark)) return {mark};
    const owner=mark.closest(BLOCK_SELECTOR) || root;
    let index=compared.findIndex(c=>owner.contains(c.node) && (mark.compareDocumentPosition(c.node)&Node.DOCUMENT_POSITION_FOLLOWING));
    let end=false;
    if(index<0) for(let i=compared.length-1;i>=0;i--) if(owner.contains(compared[i].node)){index=i;end=true;break;}
    let point=index<0?null:{node:live[index].node,offset:live[index].offset+(end?1:0)};
    if(point && !end && compared[index].offset>0 && /\s/.test(compared[index].node.data[compared[index].offset-1])) {
      while(point.offset>0 && /\s/.test(point.node.data[point.offset-1]))point.offset--;
    }
    if(point && end && /\s/.test(compared[index].node.data[compared[index].offset+1] || '')){
      while(point.offset<point.node.length && /\s/.test(point.node.data[point.offset]))point.offset++;
    }
    return {mark,point};
  });
  for(const {mark,point} of pending.reverse()) {
    const ghost=document.importNode(mark,true);
    ghost.classList.add('deleted','deletion-record','draft-deletion');
    ghost.contentEditable='false';
    ghost.removeAttribute('data-edoc-block');
    ghost.querySelectorAll('[data-edoc-block]').forEach(n=>n.removeAttribute('data-edoc-block'));
    if(point) {
      const pieces=splitTexts.get(point.node) || [point.node];
      const tail=point.node.splitText(point.offset);
      pieces.splice(pieces.indexOf(point.node)+1,0,tail);
      splitTexts.set(point.node,pieces);
      tail.before(ghost);
    } else place(mark,ghost,container(mark.parentElement));
  }
  restoreDraftSelection(bookmark);
}
