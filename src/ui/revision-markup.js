// Presentation only: stored versions and the editable DOM keep their original content.
// CSS Highlights paint live insertions without replacing text nodes or moving the caret.
import { el } from './elements.js';
import { state } from './state.js';
import { BLOCK_SELECTOR, inertContainer } from '../engine/dom.js';
import { buildFormalDiff, sectionNameFor } from '../engine/diff.js';
import { withObserverPaused } from './doc-surface.js';

function textNodes(root) {
  const nodes=[];
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode())) if(!node.parentElement.closest('.deleted,.deletion-record')) nodes.push(node);
  return nodes;
}
function characters(nodes) {
  const result=[];
  for(const node of nodes) for(let offset=0;offset<node.length;offset++) {
    if(!/\s/.test(node.data[offset])) result.push({ node, offset, char:node.data[offset] });
  }
  return result;
}
function topMarks(root,selector) {
  return [...root.querySelectorAll(selector)].filter(n=>!n.parentElement.closest(selector));
}

export function renderRevisionMarkup(formalHtml) {
  const panel=document.getElementById('revisionMarkup');
  if(!panel) return;
  CSS.highlights?.delete('edoc-insertions');
  const draft=state.activeRevision;
  const root=draft ? inertContainer(formalHtml ?? buildFormalDiff(state.versions[draft.baseVersion].html,el.doc.innerHTML)) : el.doc;
  const deletions=topMarks(root,'.deleted');
  const insertions=topMarks(root,'.changed').filter(n=>!n.closest('.deleted'));
  const live=characters(textNodes(el.doc));
  const compared=characters(textNodes(root));
  // Normalization may remove editor-only whitespace. Compare non-whitespace characters
  // before mapping ranges; if content does not match, never paint an unrelated word.
  const canMap=live.length===compared.length && live.every((c,i)=>c.char===compared[i].char);
  const positions=new Map();
  const ranges=[];
  const touched=new Set();
  if(canMap) {
    compared.forEach((c,i)=>{
      if(!positions.has(c.node)) positions.set(c.node,i);
      if(!c.node.parentElement.closest('.changed')) return;
      const target=live[i];
      const previous=ranges.at(-1);
      if(previous && previous.endContainer===target.node && previous.endOffset===target.offset) previous.setEnd(target.node,target.offset+1);
      else {
        const range=document.createRange(); range.setStart(target.node,target.offset); range.setEnd(target.node,target.offset+1); ranges.push(range);
      }
      const block=target.node.parentElement.closest(BLOCK_SELECTOR);
      if(block) touched.add(block);
    });
  }
  function destination(mark) {
    if(!canMap) return el.doc;
    // Locate the next surviving text in document order, including deletion-only blocks.
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let node, index=compared.length;
    while((node=walker.nextNode())) {
      if(positions.has(node) && (mark.compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING || mark.contains(node))) {
        index=positions.get(node); break;
      }
    }
    const target=live[Math.min(index,live.length-1)];
    return target?.node.parentElement.closest(BLOCK_SELECTOR) || el.doc;
  }
  deletions.forEach(mark=>touched.add(destination(mark)));
  {
    withObserverPaused(()=>{
      el.doc.querySelectorAll('.revision-changed').forEach(n=>n.classList.remove('revision-changed'));
      touched.forEach(n=>{ if(n!==el.doc) n.classList.add('revision-changed'); });
    });
    if(draft && !state.clean && CSS.highlights && typeof Highlight!=='undefined') CSS.highlights.set('edoc-insertions',new Highlight(...ranges));
  }
  panel.hidden=state.clean;
  document.getElementById('documentReview').classList.toggle('simple-markup',state.clean);
  const title=document.createElement('h2'); title.textContent='修訂';
  const base=document.createElement('p'); base.className='markup-base';
  const previous=draft?.baseVersion || state.versions[state.activeVersion]?.previous;
  base.textContent=previous ? '比較基準：'+previous : '第一版';
  panel.replaceChildren(title,base);
  // Each deleted fragment is kept in a separate card with its section for orientation.
  for(const mark of deletions) {
    const card=document.createElement('button'); card.type='button'; card.className='markup-card';
    const context=document.createElement('span'); context.className='markup-context';
    context.textContent=sectionNameFor(mark,root) || '文件內容';
    const label=document.createElement('span'); label.textContent='刪除：';
    const text=document.createElement('span'); text.className='markup-deletion'; text.textContent=mark.textContent;
    card.append(context,label,text);
    card.addEventListener('click',()=>destination(mark).scrollIntoView({block:'center',behavior:'smooth'}));
    panel.append(card);
  }
  const note=document.createElement('p'); note.className='markup-note';
  note.textContent=insertions.length ? '新增或格式變更以底線標示於正文。' : deletions.length ? '點選修訂可定位至正文附近。' : '沒有內容變更';
  panel.append(note);
}
