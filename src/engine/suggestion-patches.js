import { inertContainer, BLOCK_SELECTOR } from './dom.js';
import { normalizeSnapshot, sectionNameFor } from './diff.js';
import { sanitizeRevisionHtml } from './revision.js';

export function prepareSuggestionContent(html,context){
 if(typeof html!=='string'||html.length>1_000_000) throw new Error('修改內容格式或大小不符');
 const root=inertContainer(sanitizeRevisionHtml(html,context),context);
 root.querySelectorAll('[class],[data-edoc-block],[contenteditable]').forEach(n=>{
  n.removeAttribute('class'); n.removeAttribute('data-edoc-block'); n.removeAttribute('contenteditable');
 });
 // Both DOMs use the same explicit table shell and attribute order.
 root.querySelectorAll('table').forEach(t=>{
  const rows=[...t.children].filter(x=>x.tagName==='TR');
  if(rows.length){ const body=root.ownerDocument.createElement('tbody');rows[0].before(body);body.append(...rows); }
 });
 root.querySelectorAll('*').forEach(n=>{
  const attrs=[...n.attributes].map(a=>[a.name,a.value]).sort(([a],[b])=>a.localeCompare(b));
  attrs.forEach(([a])=>n.removeAttribute(a));attrs.forEach(([a,b])=>n.setAttribute(a,b));
 });
 const out=normalizeSnapshot(root.innerHTML,context); return out.innerHTML;
}
const at=(root,path)=>path.reduce((n,i)=>n?.childNodes[i],root);
const nodeHtml=n=>n.nodeType===3?n.textContent.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'):n.outerHTML;
const sameShell=(a,b)=>a.nodeType===b.nodeType&&(a.nodeType===3||a.tagName===b.tagName&&JSON.stringify([...a.attributes].map(x=>[x.name,x.value]))===JSON.stringify([...b.attributes].map(x=>[x.name,x.value])));
export function createSuggestionItems(baseHtml,proposedHtml,context){
 const a=inertContainer(prepareSuggestionContent(baseHtml,context),context), b=inertContainer(prepareSuggestionContent(proposedHtml,context),context), out=[];
 const add=(patch,before,after,node)=>out.push({id:'I'+String(out.length+1).padStart(3,'0'),section:sectionNameFor(node,b.contains(node)?b:a),type:before?after?'modified':'deleted':'added',before,after,dependencyGroup:null,patch});
 // Exact siblings anchor alignment so an inserted/deleted paragraph cannot absorb
 // unchanged neighbours. A review item replaces one leaf paragraph/list entry.
 function anchors(xs,ys){
  const n=xs.length,m=ys.length;if(n*m>1_000_000)throw Object.assign(new Error('內容過於複雜，請拆分修訂'),{status:422,code:'complexity'});
  const x=xs.map(nodeHtml),y=ys.map(nodeHtml),dp=Array.from({length:n+1},()=>new Uint32Array(m+1));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i][j]=x[i]===y[j]?1+dp[i+1][j+1]:Math.max(dp[i+1][j],dp[i][j+1]);
  const pairs=[];let i=0,j=0;while(i<n&&j<m){if(x[i]===y[j]){pairs.push([i++,j++]);}else if(dp[i+1][j]>=dp[i][j+1])i++;else j++;}return pairs;
 }
 function walk(x,y,path,proposedPath=path){
  if(nodeHtml(x)===nodeHtml(y))return;
  const before=nodeHtml(x),after=nodeHtml(y);
  if(x.nodeType===3||!sameShell(x,y)||(x.matches?.(BLOCK_SELECTOR)&&!x.querySelector(BLOCK_SELECTOR))){add({kind:'node',path,proposedPath,before,after},before,after,x);return;}
  const xs=[...x.childNodes],ys=[...y.childNodes],initial=out.length;let bi=0,pi=0;
  function gap(endB,endP){
   // Corresponding blocks can be modified. Different element types are independent
   // deletion/addition records; exact anchors keep the remainder stable.
   while(bi<endB&&pi<endP&&xs[bi].nodeType===ys[pi].nodeType&&(xs[bi].nodeType===3||xs[bi].tagName===ys[pi].tagName)){
    walk(xs[bi],ys[pi],[...path,bi],[...proposedPath,pi]);bi++;pi++;
   }
   while(bi<endB){const before=nodeHtml(xs[bi]);add({kind:'children',path,proposedPath:null,start:bi,count:1,before,after:''},before,'',xs[bi]);bi++;}
   while(pi<endP){const after=nodeHtml(ys[pi]);add({kind:'children',path,proposedPath:[...proposedPath,pi],start:bi,count:0,before:'',after},'',after,ys[pi]);pi++;}
  }
  for(const [i,j] of [...anchors(xs,ys),[xs.length,ys.length]]){gap(i,j);bi=i+1;pi=j+1;}
  if(x.matches?.(BLOCK_SELECTOR)){
   const owner=node=>(node?.nodeType===3?node.parentElement:node)?.closest?.(BLOCK_SELECTOR);
   const own=out.slice(initial).filter(item=>{
    const p=item.patch,node=at(a,p.path);if(p.kind==='children'){const affected=[...node.childNodes].slice(p.start,p.start+p.count);return p.count?affected.every(n=>owner(n)===x&&!n.querySelector?.(BLOCK_SELECTOR)):owner(at(b,p.proposedPath||[]))===y;}
    return owner(node)===x;
   });
   if(own.length){
    const ownHtml=node=>[...node.childNodes].filter(n=>!n.matches?.(BLOCK_SELECTOR)&&!n.querySelector?.(BLOCK_SELECTOR)).map(nodeHtml).join('');
    const before=ownHtml(x),after=ownHtml(y),first=out.indexOf(own[0]),group={...own[0],before,after,type:before?after?'modified':'deleted':'added',patch:{kind:'group',path,proposedPath,patches:own.map(i=>i.patch)}};
    const rest=out.slice(initial).filter(i=>!own.includes(i));rest.splice(first-initial,0,group);out.splice(initial,out.length-initial,...rest);
   }
  }
 }
 walk(a,b,[]);out.forEach((i,index)=>i.id='I'+String(index+1).padStart(3,'0'));return out;
}
export function applySuggestionItems(baseHtml,items,selectedIds,context){
 if(new Set(selectedIds).size!==selectedIds.length||selectedIds.some(id=>!items.some(i=>i.id===id)))throw new Error('建議項目識別碼不符');
 const root=inertContainer(prepareSuggestionContent(baseHtml,context),context);
 const selected=items.filter(i=>selectedIds.includes(i.id));
 const groups=new Set(selected.map(i=>i.dependencyGroup).filter(Boolean));
 if(items.some(i=>groups.has(i.dependencyGroup)&&!selectedIds.includes(i.id)))throw new Error('相依項目須一起處理');
 // Resolve all nodes against the original snapshot before changing any sibling indices.
 const flatten=p=>p.kind==='group'?p.patches.flatMap(flatten):[p];
 const ops=selected.flatMap(i=>flatten(i.patch)).map((p,order)=>({p,node:at(root,p.path),order}));
 for(const {p,node} of ops){
  if(!node)throw new Error('建議基準已變動');
  const before=p.kind==='text'?node.textContent.slice(p.start,p.end):p.kind==='node'?nodeHtml(node):[...node.childNodes].slice(p.start,p.start+p.count).map(nodeHtml).join('');
  if(before!==p.before)throw new Error('建議基準已變動');
 }
 ops.sort((a,b)=>b.p.path.length-a.p.path.length||(b.p.start||0)-(a.p.start||0)||b.order-a.order);
 for(const {p,node} of ops){
  if(p.kind==='text')node.textContent=node.textContent.slice(0,p.start)+p.after+node.textContent.slice(p.end);
  else{
   const parentTag=p.kind==='node'?node.parentElement?.tagName:node.tagName;
   const tableContexts={TABLE:['<table>','</table>','table'],TBODY:['<table><tbody>','</tbody></table>','tbody'],THEAD:['<table><thead>','</thead></table>','thead'],TFOOT:['<table><tfoot>','</tfoot></table>','tfoot'],TR:['<table><tbody><tr>','</tr></tbody></table>','tr']};
   const shell=tableContexts[parentTag],parsed=inertContainer(shell?shell[0]+p.after+shell[1]:p.after,context),fragment=shell?parsed.querySelector(shell[2]):parsed;
   if(p.kind==='node')node.replaceWith(...fragment.childNodes);
   else {const reference=node.childNodes[p.start+p.count]||null; [...node.childNodes].slice(p.start,p.start+p.count).forEach(n=>n.remove());for(const n of [...fragment.childNodes])node.insertBefore(n,reference);}
  }
 }
 return prepareSuggestionContent(root.innerHTML,context);
}
