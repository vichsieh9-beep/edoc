// Presentation only: comparison fragments never enter stored draft content.
// CSS Highlights paint live insertions without replacing text nodes or moving the caret.
import { el } from './elements.js';
import { state } from './state.js';
import { BLOCK_SELECTOR, inertContainer, ownText } from '../engine/dom.js';
import { buildFormalDiff, normalizeSnapshot } from '../engine/diff.js';
import { showDraftDeletions, clearDraftDeletions } from './draft-deletions.js';
let renderedDraft=null, renderedDiff=null;
import { withObserverPaused } from './doc-surface.js';
import { revisionCards, comparisonLine, comparisonText } from './revision-cards.js';
import { configureRevisionNavigation, revisionTargetKey } from './revision-navigation.js';

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
// Native contenteditable paragraphs may be divs before snapshot normalization.
function liveBlock(node){
  const block=node?.parentElement.closest(BLOCK_SELECTOR+',div,hr');
  return block&&el.doc.contains(block)?block:el.doc;
}

// Deleted ghost nodes are rebuilt after typing. Identify them by their position
// in the fixed base snapshot, including unchanged/restored paragraphs, rather
// than their current position among deletion cards.
function deletionSourceKeys(root,baseHtml,items){
  const base=normalizeSnapshot(baseHtml),selector=BLOCK_SELECTOR+',hr';
  const text=node=>ownText(node).trim()||((node.tagName==='HR'||node.querySelector('img'))?comparisonText(node.outerHTML):'');
  const blocks=[...base.querySelectorAll(selector)],byNode=new Map(items.map(item=>[item.node,item])),keys=new Map();
  let cursor=0;
  for(const node of root.querySelectorAll(selector)){
    const item=byNode.get(node);if(item?.type==='added'||node.closest('.changed'))continue;
    const before=item?item.beforeText:text(node);if(!before)continue;
    const index=blocks.findIndex((block,i)=>i>=cursor&&block.tagName===node.tagName&&text(block)===before);
    if(index<0)continue;
    cursor=index+1;if(item?.type==='deleted')keys.set(node,'deleted-base:'+index);
  }
  return keys;
}

export function renderRevisionMarkup(formalHtml, {force=false}={}) {
  const panel=document.getElementById('revisionMarkup');
  if(!panel) return;
  CSS.highlights?.delete('edoc-insertions');
  const draft=state.activeRevision;
  const diff=draft ? formalHtml ?? buildFormalDiff(state.versions[draft.baseVersion].html,el.doc.innerHTML) : null;
  const root=draft ? inertContainer(diff) : el.doc;
  const deletions=topMarks(root,'.deleted');
  const needsRender=draft && !state.composing && (force || renderedDraft!==draft || renderedDiff!==diff || (deletions.length && !el.doc.querySelector('.draft-deletion')));
  if(needsRender)withObserverPaused(()=>{clearDraftDeletions(el.doc);el.doc.querySelectorAll('.deletion-record').forEach(n=>n.remove());});
  let live=characters(textNodes(el.doc));
  const compared=characters(textNodes(root));
  // Normalization may remove editor-only whitespace. Compare non-whitespace characters
  // before mapping ranges; if content does not match, never paint an unrelated word.
  const canMap=live.length===compared.length && live.every((c,i)=>c.char===compared[i].char);
  if(needsRender && canMap) {
    withObserverPaused(()=>{
      showDraftDeletions(root,el.doc,deletions,compared,live);
    });
    renderedDraft=draft;renderedDiff=diff;
    live=characters(textNodes(el.doc));
  }
  if(!draft){renderedDraft=null;renderedDiff=null;}
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
      const block=liveBlock(target.node);
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
    return liveBlock(target?.node);
  }
  deletions.forEach(mark=>touched.add(destination(mark)));
  {
    withObserverPaused(()=>{
      el.doc.querySelectorAll('.revision-changed').forEach(n=>{n.classList.remove('revision-changed');if(!n.className)n.removeAttribute('class');});
      touched.forEach(n=>{ if(n!==el.doc) n.classList.add('revision-changed'); });
    });
    if(draft && !state.clean && CSS.highlights && typeof Highlight!=='undefined') CSS.highlights.set('edoc-insertions',new Highlight(...ranges));
  }
  panel.hidden=false;
  document.getElementById('documentReview').classList.remove('simple-markup');
  const title=document.createElement('h2'); title.textContent='修訂';
  panel.replaceChildren(title);
  // The rail follows aligned paragraph differences. A replacement
  // keeps its before/after together; additions and deletions remain separate cards.
  const version=state.versions[state.activeVersion];
  let baseHtml=draft?state.versions[draft.baseVersion].html:state.versions[version?.previous]?.html;
  if(baseHtml===undefined){
    const original=root.cloneNode(true);
    original.querySelectorAll('.changed').forEach(n=>n.remove());
    original.querySelectorAll('.deleted').forEach(n=>n.classList.remove('deleted'));
    baseHtml=original.innerHTML;
  }
  const items=revisionCards(root,baseHtml);
  const usedDeleted=new Set();
  const rootMedia=[...root.querySelectorAll('hr,img')].filter(n=>!n.closest('.deleted,.deletion-record'));
  const liveMedia=[...el.doc.querySelectorAll('hr,img')].filter(n=>!n.closest('.deleted,.deletion-record'));
  const canMapMedia=rootMedia.length===liveMedia.length&&rootMedia.every((n,i)=>n.tagName===liveMedia[i].tagName&&n.getAttribute('src')===liveMedia[i].getAttribute('src'));
  function itemDestination(item){
    if(root===el.doc)return item.node;
    if(!canMap)return el.doc;
    if(item.type!=='deleted'){
      const index=compared.findIndex(c=>c.node.parentElement.closest(BLOCK_SELECTOR)===item.node);
      if(index>=0)return liveBlock(live[index]?.node);
      const media=item.node.tagName==='HR'?item.node:[...item.node.querySelectorAll('img')].find(n=>n.closest(BLOCK_SELECTOR)===item.node);
      const mediaIndex=rootMedia.indexOf(media);
      if(canMapMedia&&mediaIndex>=0)return media.tagName==='HR'?liveMedia[mediaIndex]:liveBlock(liveMedia[mediaIndex]);
      return el.doc; // An unmapped item must never select an unrelated neighbouring paragraph.
    }
    const candidates=[...el.doc.querySelectorAll(BLOCK_SELECTOR+',hr')].filter(n=>n.closest('.deleted,.deletion-record'));
    const exact=candidates.find(n=>!usedDeleted.has(n)&&(ownText(n).trim()||comparisonText(n.outerHTML))===item.beforeText);
    if(exact){usedDeleted.add(exact);return exact;}
    return destination(item.node);
  }
  const navigation=[],deletedOccurrences=new Map(),deletedKeys=deletionSourceKeys(root,baseHtml,items);
  for(const item of items){
    const card=document.createElement('button');card.type='button';card.className='markup-card';card.dataset.changeType=item.type;
    const context=document.createElement('span');context.className='markup-context';context.textContent=item.section||'文件內容';
    const kind=document.createElement('span');kind.className='markup-kind';kind.textContent={modified:'修改',added:'新增',deleted:'刪除'}[item.type];
    card.append(context,kind);
    if(item.type==='modified'){
      card.append(comparisonLine('修改前：',item.beforePieces),comparisonLine('修訂後：',item.afterPieces));
      if(item.sameText){const label=document.createElement('span');label.className='markup-context';label.textContent='格式或結構調整';card.append(label);}
    }else if(item.type==='added')card.append(comparisonLine('新增：',[{text:item.afterText}], 'insertion'));
    else card.append(comparisonLine('刪除：',[{text:item.beforeText}], 'deletion'));
    const target=itemDestination(item);
    const occurrence=deletedOccurrences.get(item.beforeText)||0;if(item.type==='deleted')deletedOccurrences.set(item.beforeText,occurrence+1);
    const key=item.type==='deleted'?deletedKeys.get(item.node)||'deleted:'+item.beforeText+':'+occurrence:target===el.doc?'unmapped:'+navigation.length:revisionTargetKey(target);
    navigation.push({key,target,card});
    panel.append(card);
  }
  const note=document.createElement('p'); note.className='markup-note';
  note.textContent=items.length ? '所有標記：紅字刪除線表示刪除，藍字底線表示新增；簡單標記只留正文側邊紅線。' : '沒有內容變更';
  panel.append(note);
  configureRevisionNavigation(navigation,{context:draft?'draft:'+draft.id:'version:'+state.activeVersion});
}
