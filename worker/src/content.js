import { parseHTML } from 'linkedom/worker';
import { cleanSnapshot } from '../../src/engine/dom.js';
import { prepareSuggestionContent } from '../../src/engine/suggestion-patches.js';
import { buildFormalDiff, analyzeFormalDiff, diffTokens } from '../../src/engine/diff.js';
export const contentContext=()=>({document:parseHTML('<!doctype html><html><body></body></html>').document});
export const prepareContent=html=>prepareSuggestionContent(html,contentContext());
export const trustedContent=html=>prepareContent(cleanSnapshot(html,contentContext()));
export async function hashContent(html){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(html));return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function buildPublishedContent(baseHtml,cleanHtml){
 const ctx=contentContext(),a=trustedContent(baseHtml),b=prepareContent(cleanHtml);
 // Bound quadratic LCS before invoking the legacy diff, including hostile large inputs.
 const roots=[a,b].map(h=>{const r=ctx.document.createElement('div');r.innerHTML=h;return r;});
 const blocks=roots.map(r=>[...r.querySelectorAll('h1,h2,p,li,td,th,blockquote,hr')]);
 if(blocks[0].length*blocks[1].length>1_000_000||blocks.some(bs=>bs.some(n=>diffTokens(n.textContent).length>1000)))throw Object.assign(new Error('內容過於複雜，請拆分修訂'),{status:422,code:'complexity'});
 const html=buildFormalDiff(a,b,ctx),stats=analyzeFormalDiff(html,ctx);
 return {html,hash:await hashContent(b),summary:stats.summary,details:stats.details,stats};
}
