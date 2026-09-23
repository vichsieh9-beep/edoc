/* ---------- Formal diff ----------
 * A formal version diff is computed only from Base Version Snapshot vs Draft Snapshot.
 * Draft-time markers (block ids, tombstones, revision-changed) and editor artifacts
 * (inline styles, <div> paragraphs, placeholder <br>, empty blocks) are normalized away,
 * blocks are aligned by content, and changed blocks get a token-level inline diff. */
import { BLOCK_SELECTOR, cleanSnapshot, unwrapElement, normalizeWs, ownedTextNodes, ownText } from './dom.js';

const ALIGN_SELECTOR=BLOCK_SELECTOR+',hr';
const CONTAINER_SELECTOR='ul,ol,table,thead,tbody,tfoot,tr';
const EMPTY_REMOVABLE='h1,h2,p,li,blockquote';
const PAIR_THRESHOLD=0.5;

export function normalizeSnapshot(html) {
  const w=document.createElement('div');
  w.innerHTML=cleanSnapshot(html);
  w.querySelectorAll('[contenteditable]').forEach(x=>x.removeAttribute('contenteditable'));
  // Browsers keep computed styles as inline style / <font> wrappers when merging blocks.
  w.querySelectorAll('[style]').forEach(x=>{
    x.removeAttribute('style');
    if(x.tagName==='SPAN' && !x.attributes.length) unwrapElement(x);
  });
  w.querySelectorAll('font').forEach(unwrapElement);
  // Chrome / Safari create <div> paragraphs; the document model uses <p>.
  w.querySelectorAll('div').forEach(d=>{
    if(d.querySelector(ALIGN_SELECTOR+','+CONTAINER_SELECTOR+',div')){ unwrapElement(d); return; }
    const p=document.createElement('p'); p.append(...d.childNodes); d.replaceWith(p);
  });
  [...w.childNodes].forEach(n=>{
    if(n.nodeType===3 && n.textContent.trim()){ const p=document.createElement('p'); n.replaceWith(p); p.append(n); }
  });
  // A trailing <br> is only a caret placeholder.
  w.querySelectorAll('br').forEach(br=>{
    const block=br.parentElement;
    if(!block.matches(BLOCK_SELECTOR)) return;
    let next=br.nextSibling;
    while(next && next.nodeType===3 && !next.textContent.trim()) next=next.nextSibling;
    if(!next) br.remove();
  });
  w.querySelectorAll(EMPTY_REMOVABLE).forEach(b=>{
    if(b.isConnected && !b.textContent.trim() && !b.querySelector('img,hr,br,table')) b.remove();
  });
  w.querySelectorAll('ul,ol').forEach(l=>{ if(!l.querySelector('li')) l.remove(); });
  return w;
}

// Content identity of a block: tag + inline markup + text, excluding nested blocks.
export function blockSignature(block){
  const c=block.cloneNode(true);
  c.querySelectorAll(ALIGN_SELECTOR+','+CONTAINER_SELECTOR).forEach(x=>x.remove());
  c.querySelectorAll('span').forEach(unwrapElement);
  c.querySelectorAll('*').forEach(x=>[...x.attributes].forEach(a=>{
    const keep=(x.tagName==='IMG' && (a.name==='src'||a.name==='alt')) || (x.tagName==='A' && a.name==='href');
    if(!keep) x.removeAttribute(a.name);
  }));
  const tw=document.createTreeWalker(c,NodeFilter.SHOW_TEXT); let n;
  while((n=tw.nextNode())) n.textContent=n.textContent.replace(/\s+/g,' ');
  return block.tagName+'|'+c.innerHTML.replace(/\s+/g,' ').trim();
}

export function diffTokens(text) {
  return text.match(/[㐀-鿿]|[A-Za-z0-9_]+|\s+|[^\sA-Za-z0-9_㐀-鿿]/g) || [];
}
function tokenKey(t){ return /^\s+$/.test(t) ? ' ' : t; }
function tokenKeys(text){ return diffTokens(text).map(tokenKey).filter(k=>k!==' '); }
// Token LCS diff. Whitespace runs compare equal; '=' and '+' carry the new text,
// '-' carries the old text; within a change run deletions come before insertions.
export function diffOps(aText,bText) {
  const a=diffTokens(aText), b=diffTokens(bText);
  const ak=a.map(tokenKey), bk=b.map(tokenKey);
  const n=a.length,m=b.length;
  const dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
  for(let i=n-1;i>=0;i--) for(let j=m-1;j>=0;j--)
    dp[i][j]=ak[i]===bk[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const ops=[]; let i=0,j=0,del=[],ins=[];
  const flush=()=>{ ops.push(...del,...ins); del=[]; ins=[]; };
  while(i<n||j<m){
    if(i<n&&j<m&&ak[i]===bk[j]){ flush(); ops.push(['=',b[j]]); i++; j++; }
    else if(j<m&&(i===n||dp[i][j+1]>=dp[i+1][j])) ins.push(['+',b[j++]]);
    else del.push(['-',a[i++]]);
  }
  flush();
  return ops;
}
function lcsLength(a,b) {
  if(!a.length||!b.length) return 0;
  let prev=new Uint16Array(b.length+1), cur=new Uint16Array(b.length+1);
  for(let i=1;i<=a.length;i++){
    for(let j=1;j<=b.length;j++) cur[j]=a[i-1]===b[j-1]?prev[j-1]+1:Math.max(prev[j],cur[j-1]);
    [prev,cur]=[cur,prev];
  }
  return prev[b.length];
}
function similarity(a,b){ return (!a.length&&!b.length) ? 1 : 2*lcsLength(a,b)/(a.length+b.length); }
function lcsPairs(a,b) {
  const n=a.length,m=b.length;
  const dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
  for(let i=n-1;i>=0;i--) for(let j=m-1;j>=0;j--)
    dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const pairs=[]; let i=0,j=0;
  while(i<n&&j<m){
    if(a[i]===b[j]){ pairs.push([i,j]); i++; j++; }
    else if(dp[i+1][j]>=dp[i][j+1]) i++; else j++;
  }
  return pairs;
}

// Mark the token-level difference of a matched block pair inside curBlock.
// Returns false when the own text is the same (ignoring whitespace).
export function inlineDiffBlock(baseBlock,curBlock) {
  const aText=ownText(baseBlock);
  const nodes=ownedTextNodes(curBlock);
  const bText=nodes.map(n=>n.textContent).join('');
  if(normalizeWs(aText)===normalizeWs(bText)) return false;
  const segs=nodes.map(()=>[]), lead=[];
  const len=i=>nodes[i].textContent.length;
  const push=(i,mode,t)=>{ const s=segs[i]; if(s.length&&s[s.length-1][0]===mode) s[s.length-1][1]+=t; else s.push([mode,t]); };
  let ni=0,off=0;
  for(const [mode,tok] of diffOps(aText,bText)){
    if(mode==='-'){
      let i=ni,o=off;
      while(i<nodes.length-1 && o===len(i)){ i++; o=0; }
      if(i>=nodes.length){ lead.push(tok); continue; }
      ni=i; off=o; push(i,'-',tok);
      continue;
    }
    let rest=tok;
    while(rest){
      while(ni<nodes.length && off===len(ni)){ ni++; off=0; }
      if(ni>=nodes.length) break;
      const take=Math.min(rest.length,len(ni)-off);
      push(ni,mode,rest.slice(0,take)); off+=take; rest=rest.slice(take);
    }
  }
  const mark=(mode,t)=>{ const sp=document.createElement('span'); sp.className=mode==='+'?'changed':'deleted'; sp.textContent=t; return sp; };
  let changed=false;
  nodes.forEach((node,i)=>{
    // Whitespace-only insertions stay plain text; whitespace-only deletions are dropped.
    const s=segs[i].filter(([m,t])=>m!=='-'||t.trim()).map(([m,t])=>[m==='+'&&!t.trim()?'=':m,t]);
    if(!s.some(([m])=>m!=='=')) return;
    changed=true;
    const frag=document.createDocumentFragment();
    for(const [m,t] of s) frag.appendChild(m==='=' ? document.createTextNode(t) : mark(m,t));
    node.replaceWith(frag);
  });
  const leadText=lead.join('');
  if(leadText.trim()){ curBlock.prepend(mark('-',leadText)); changed=true; }
  return changed;
}

export function buildFormalDiff(baseHtml,currentHtml) {
  const baseWrap=normalizeSnapshot(baseHtml);
  const curWrap=normalizeSnapshot(currentHtml);
  const baseBlocks=[...baseWrap.querySelectorAll(ALIGN_SELECTOR)];
  const curBlocks=[...curWrap.querySelectorAll(ALIGN_SELECTOR)];
  const baseSig=baseBlocks.map(blockSignature), curSig=curBlocks.map(blockSignature);
  const baseKeys=baseBlocks.map(b=>tokenKeys(ownText(b))), curKeys=curBlocks.map(b=>tokenKeys(ownText(b)));

  // 1. Align blocks: identical blocks anchor via LCS; blocks between anchors pair by similarity.
  const match=new Map(); // cur index -> base index
  function pairGap(b0,b1,c0,c1) {
    const n=b1-b0, m=c1-c0;
    if(!n||!m) return;
    const W=Array.from({length:n+1},()=>new Float64Array(m+1));
    const S=Array.from({length:n+1},()=>new Float64Array(m+1));
    for(let x=1;x<=n;x++) for(let y=1;y<=m;y++){
      let s=0;
      if(baseBlocks[b0+x-1].tagName===curBlocks[c0+y-1].tagName){
        s=similarity(baseKeys[b0+x-1],curKeys[c0+y-1]);
        if(s<PAIR_THRESHOLD) s=0;
      }
      S[x][y]=s;
      W[x][y]=Math.max(W[x-1][y],W[x][y-1],s?W[x-1][y-1]+s:0);
    }
    let x=n,y=m;
    while(x>0&&y>0){
      if(S[x][y] && W[x][y]===W[x-1][y-1]+S[x][y]){ match.set(c0+y-1,b0+x-1); x--; y--; }
      else if(W[x-1][y]>=W[x][y-1]) x--; else y--;
    }
  }
  let pb=0,pc=0;
  for(const [i,j] of [...lcsPairs(baseSig,curSig),[baseBlocks.length,curBlocks.length]]){
    pairGap(pb,i,pc,j);
    if(i<baseBlocks.length) match.set(j,i);
    pb=i+1; pc=j+1;
  }
  const baseToCur=new Map();
  match.forEach((i,j)=>baseToCur.set(i,j));
  const curIndex=new Map(curBlocks.map((el,j)=>[el,j]));

  // 2. Modified and added blocks, marked in the draft DOM.
  const addedWhole=new Set();
  const wrapOwnText=el=>ownedTextNodes(el).forEach(t=>{
    if(!t.textContent.trim()) return;
    const sp=document.createElement('span'); sp.className='changed'; t.replaceWith(sp); sp.appendChild(t);
  });
  curBlocks.forEach((el,j)=>{
    const keepsDescendant=()=>[...el.querySelectorAll(ALIGN_SELECTOR)].some(d=>match.has(curIndex.get(d)));
    if(match.has(j)){
      const i=match.get(j);
      if(baseSig[i]===curSig[j]) return;
      if(inlineDiffBlock(baseBlocks[i],el)) return;
      if(normalizeWs(ownText(el))) wrapOwnText(el); // same text, different inline markup
      return;
    }
    const parentBlock=el.parentElement.closest(ALIGN_SELECTOR);
    if(parentBlock && addedWhole.has(parentBlock)) return;
    if(keepsDescendant()) wrapOwnText(el);
    else { el.classList.add('changed'); addedWhole.add(el); }
  });

  // 3. Deleted base blocks are re-inserted next to their surviving neighbours.
  baseBlocks.forEach((b,i)=>b.setAttribute('data-edoc-i',i));
  const position=new Map(), shells=new Map(), deleted=new Set();
  baseBlocks.forEach((b,i)=>{ if(baseToCur.has(i)) position.set(b,curBlocks[baseToCur.get(i)]); });
  function counterpart(el) {
    if(position.has(el)) return position.get(el);
    if(shells.has(el)) return shells.get(el);
    for(const d of el.querySelectorAll(ALIGN_SELECTOR)){
      let up=position.get(d);
      if(!up) continue;
      for(let x=d; x!==el; x=x.parentElement) up=up && up.parentElement;
      return up && up!==curWrap && up.tagName===el.tagName ? up : null;
    }
    return null;
  }
  function place(baseEl,node) {
    for(let s=baseEl.nextElementSibling; s; s=s.nextElementSibling){ const c=counterpart(s); if(c){ c.before(node); return; } }
    for(let s=baseEl.previousElementSibling; s; s=s.previousElementSibling){ const c=counterpart(s); if(c){ c.after(node); return; } }
    const parent=baseEl.parentElement;
    if(parent===baseWrap){ curWrap.append(node); return; }
    const cp=counterpart(parent);
    if(cp){ cp.append(node); return; }
    const shell=parent.cloneNode(false);
    shell.removeAttribute('data-edoc-i');
    shell.classList.add('deleted');
    shell.append(node);
    shells.set(parent,shell);
    place(parent,shell);
  }
  baseBlocks.forEach((b,i)=>{
    if(baseToCur.has(i)) return;
    const anc=b.parentElement.closest(ALIGN_SELECTOR);
    if(anc && deleted.has(anc)) return; // already inside that block's clone
    const clone=b.cloneNode(true);
    clone.querySelectorAll('[data-edoc-i]').forEach(d=>{ if(baseToCur.has(+d.dataset.edocI)) d.remove(); });
    clone.classList.add('deleted');
    place(b,clone);
    position.set(b,clone);
    deleted.add(b);
  });
  curWrap.querySelectorAll('[data-edoc-i]').forEach(x=>x.removeAttribute('data-edoc-i'));
  return curWrap.innerHTML;
}


export function sectionNameFor(el,root){
  let n=el;
  while(n){
    if(n.previousElementSibling){
      n=n.previousElementSibling;
      if(n.tagName==='H2') return n.textContent.replace(/[【】]/g,'').trim();
      const h=n.querySelector && n.querySelector('h2:last-of-type');
      if(h) return h.textContent.replace(/[【】]/g,'').trim();
    } else {
      n=n.parentElement;
      if(n===root || !n) break;
    }
  }
  return '其他';
}
export function analyzeFormalDiff(formalHtml){
  const wrap=document.createElement('div');
  wrap.innerHTML=formalHtml;
  const sectionStats=new Map();
  let addedChars=0,deletedChars=0,modifiedBlocks=0,addedBlocks=0,deletedBlocks=0;
  const count=t=>t.replace(/\s+/g,'').length;

  function ensure(sec){
    if(!sectionStats.has(sec)) sectionStats.set(sec,{modified:0,added:0,deleted:0});
    return sectionStats.get(sec);
  }
  function insideMarkedBlock(block){
    for(let p=block.parentElement; p && p!==wrap; p=p.parentElement)
      if(p.matches(BLOCK_SELECTOR) && (p.classList.contains('changed')||p.classList.contains('deleted'))) return true;
    return false;
  }

  wrap.querySelectorAll(BLOCK_SELECTOR).forEach(block=>{
    if(insideMarkedBlock(block)) return; // counted with the enclosing added / deleted block
    const blockChanged=block.classList.contains('changed');
    const blockDeleted=block.classList.contains('deleted');
    // Inline marks owned by this block, not by a nested block.
    const own=sel=>[...block.querySelectorAll(sel)].filter(x=>!x.matches(BLOCK_SELECTOR) && x.parentElement.closest(BLOCK_SELECTOR)===block);
    const ownChanged=blockChanged||blockDeleted?[]:own('.changed');
    const ownDeleted=blockChanged||blockDeleted?[]:own('.deleted');

    if(blockChanged) addedChars += count(block.textContent);
    if(blockDeleted) deletedChars += count(block.textContent);
    ownChanged.forEach(x=>addedChars += count(x.textContent));
    ownDeleted.forEach(x=>deletedChars += count(x.textContent));

    if(!blockChanged && !blockDeleted && !ownChanged.length && !ownDeleted.length) return;
    const st=ensure(sectionNameFor(block,wrap));
    if(blockDeleted){ st.deleted++; deletedBlocks++; }
    else if(blockChanged){ st.added++; addedBlocks++; }
    else { st.modified++; modifiedBlocks++; }
  });

  const parts=[];
  for(const [sec,st] of sectionStats){
    const p=[];
    if(st.modified) p.push(st.modified+' 處修改');
    if(st.added) p.push(st.added+' 處新增');
    if(st.deleted) p.push(st.deleted+' 處刪除');
    parts.push(sec+' '+p.join('、'));
  }
  const summary=parts.length ? parts.join('；') : '未偵測到內容變更';
  const details=parts.slice();
  details.push('統計：'+modifiedBlocks+' 處修改、'+addedBlocks+' 處新增、'+deletedBlocks+' 處刪除');
  details.push('文字：新增約 '+addedChars+' 字、刪除約 '+deletedChars+' 字');
  details.push('語意摘要：待回到 ChatGPT 後依完整 Diff 自動補充');
  return {summary,details,addedChars,deletedChars,modifiedBlocks,addedBlocks,deletedBlocks};
}
