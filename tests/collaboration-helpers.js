import {createHash} from 'node:crypto';
import {ADMIN_TOKEN,TEST_TOKEN} from './fake-github.js';
export const DOC='qa-senior-game-qa',BASE='<p>甲</p><p>乙</p><p>丙</p><p>丁</p><p>戊</p>',PROPOSED='<p>一</p><p>二</p><p>三</p><p>四</p><p>五</p>';
export const digest=s=>createHash('sha256').update(s).digest('hex');
export function helpers(rt){
 const call=(path,b={},token=ADMIN_TOKEN)=>rt.call(path,{doc:DOC,token,requestId:crypto.randomUUID(),...b});
 return {call,async setup(){const doc=rt.gh.read();doc.versions['v0.7'].html=BASE;rt.gh.write(`documents/${DOC}/document.json`,doc);return call('/collaboration/settings',{enabled:true,ownerId:'Ladmin',expectedRevision:0});},create:(b={},token=TEST_TOKEN)=>call('/suggestions/create',{baseVersion:'v0.7',baseHash:digest(BASE),proposedHtml:PROPOSED,...b},token),decide:(s,ids,decision)=>call('/suggestions/decide',{id:s.id,itemIds:ids,decision,expectedRevision:s.revision}),preview:s=>call('/suggestions/preview',{id:s.id,itemIds:s.items.filter(i=>i.decision==='adopt').map(i=>i.id),expectedRevision:s.revision})};
}
