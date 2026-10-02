// Paragraph review cards follow the same aligned diff as the document body.
import {sectionNameFor} from '../engine/diff.js';
import {inertContainer,cleanSnapshot,BLOCK_SELECTOR,ownedTextNodes,ownText} from '../engine/dom.js';

export function comparisonText(html){
  const root=inertContainer(html),text=root.textContent.trim();
  if(text)return text;
  const image=root.querySelector('img');if(image)return '圖片'+(image.alt?'：'+image.alt:'');
  if(root.querySelector('hr'))return '分隔線';
  return html?'格式或結構內容':'';
}
function pieces(block,side){
  const out=[];
  for(const n of ownedTextNodes(block)){
    const deleted=n.parentElement.closest('.deleted'),added=n.parentElement.closest('.changed');
    if(side==='before'?added&&!deleted:deleted)continue;
    const kind=deleted?'deletion':added?'insertion':'plain',previous=out.at(-1);
    if(previous?.kind===kind)previous.text+=n.data;else out.push({kind,text:n.data});
  }
  return out;
}
export function revisionCards(root,baseHtml){
  const base=inertContainer(cleanSnapshot(baseHtml)),baseTexts=[...base.querySelectorAll(BLOCK_SELECTOR)].map(ownText);
  const items=[];
  for(const node of root.querySelectorAll(BLOCK_SELECTOR+',hr')){
    const deleted=node.closest('.deleted'),added=node.closest('.changed');
    const beforePieces=pieces(node,'before'),afterPieces=pieces(node,'after');
    let beforeText=beforePieces.map(p=>p.text).join('').trim(),afterText=afterPieces.map(p=>p.text).join('').trim();
    // A nested divider owns its own card; its containing cell/paragraph must not duplicate it.
    const media=[...node.querySelectorAll('img')].find(n=>n.closest(BLOCK_SELECTOR)===node);
    if(!beforeText&&!afterText){
      if(node.tagName!=='HR'&&!media)continue; // Empty editor caret placeholders are not content cards.
      const text=node.tagName==='HR'?'分隔線':comparisonText(media.outerHTML);
      if(deleted)beforeText=text;else if(added)afterText=text;else continue;
    }
    if(!deleted&&!added&&!beforePieces.concat(afterPieces).some(p=>p.kind!=='plain'))continue;
    const type=deleted?'deleted':added?'added':'modified';
    // A formatting-only diff marks new styled text without deleting its words.
    if(type==='modified'&&!beforeText&&baseTexts.some(t=>t.trim()===afterText)){
      beforeText=afterText;beforePieces.push({kind:'plain',text:beforeText});
    }
    items.push({node,type,section:sectionNameFor(node,root),beforeText,afterText,beforePieces,afterPieces,sameText:type==='modified'&&beforeText===afterText});
  }
  return items;
}
export function comparisonLine(label,parts,wholeKind){
  const row=document.createElement('span');row.className='markup-change';row.append(label);
  for(const part of parts){
    const kind=wholeKind || part.kind;
    if(kind==='plain')row.append(document.createTextNode(part.text));
    else{const span=document.createElement('span');span.className='markup-'+kind;span.textContent=part.text;row.append(span);}
  }
  return row;
}
