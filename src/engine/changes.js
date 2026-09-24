// Plain-language change list of a formal version, read from its stored diff html.
// This is what an AI reads to write the semantic summary.
import { BLOCK_SELECTOR, ownedTextNodes, normalizeWs, inertContainer } from './dom.js';
import { sectionNameFor } from './diff.js';

export function listChanges(formalHtml) {
  const wrap=inertContainer(formalHtml);
  const marked=el=>el.classList.contains('changed')||el.classList.contains('deleted');
  const out=[];
  wrap.querySelectorAll(BLOCK_SELECTOR).forEach(block=>{
    // Blocks inside an added / deleted block are reported with it.
    for(let p=block.parentElement; p && p!==wrap; p=p.parentElement) if(p.matches(BLOCK_SELECTOR) && marked(p)) return;
    const section=sectionNameFor(block,wrap);
    if(block.classList.contains('changed')){ out.push({section,type:'added',after:normalizeWs(block.textContent)}); return; }
    if(block.classList.contains('deleted')){ out.push({section,type:'deleted',before:normalizeWs(block.textContent)}); return; }
    let before='', after='', touched=false;
    for(const n of ownedTextNodes(block)){
      const m=n.parentElement.closest('.changed,.deleted');
      const mark=m && block.contains(m) ? m : null;
      if(mark) touched=true;
      if(!mark || mark.classList.contains('deleted')) before+=n.textContent;
      if(!mark || mark.classList.contains('changed')) after+=n.textContent;
    }
    if(touched) out.push({section,type:'modified',before:normalizeWs(before),after:normalizeWs(after)});
  });
  return out;
}
