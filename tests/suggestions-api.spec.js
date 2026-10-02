import {test,expect} from '@playwright/test';
import {startRuntime} from './worker-runtime.mjs';
import {helpers,BASE,PROPOSED,DOC,digest} from './collaboration-helpers.js';
import {TEST_TOKEN} from './fake-github.js';
let rt,h;test.beforeEach(async()=>{rt=await startRuntime();h=helpers(rt);await h.setup();});test.afterEach(async()=>rt?.close());
test('submission_no_formal_version, frozen author and idempotent submit',async()=>{
 const requestId=crypto.randomUUID(),a=await h.create({requestId,name:'fake'}),b=await h.create({requestId,name:'fake'});
 expect(a.status).toBe(201);expect(b.body.id).toBe(a.body.id);expect(a.body.items).toHaveLength(5);expect(a.body.items[0].decision).toBe('pending');
 expect(rt.gh.read().latestVersion).toBe('v0.7');expect(rt.gh.commits).toHaveLength(0);
 const events=(await h.call('/suggestions/history',{id:a.body.id})).body.events;expect(events[0].actorSnapshot.name).toBe('客戶法務');expect(events).toHaveLength(1);
 expect((await h.create({requestId,proposedHtml:'<p>另一內容</p>',name:'fake'})).status).toBe(409);
});
test('batch_decision_cas, declines retain exact proposal and can change decision',async()=>{
 const s=(await h.create()).body,ids=s.items.slice(0,3).map(i=>i.id);let a=await h.decide(s,ids,'adopt');expect(a.status).toBe(200);
 expect((await h.decide(s,[s.items[3].id],'decline')).status).toBe(409);
 let b=await h.decide(a.body,s.items.slice(3).map(i=>i.id),'decline');expect(b.body.items[3]).toMatchObject({before:'<p>丁</p>',after:'<p>四</p>',decision:'decline'});
 const p=await h.preview(b.body);expect(p.body.cleanHtml).toBe('<p>一</p><p>二</p><p>三</p><p>丁</p><p>戊</p>');
 const c=await h.decide(b.body,[s.items[3].id],'adopt');expect(c.status).toBe(200);
 const events=(await h.call('/suggestions/history',{id:s.id})).body.events;expect(events.filter(e=>e.action==='items.decided')).toHaveLength(3);
});
test('withdraw_keeps_snapshot, no editing of frozen proposal',async()=>{
 const s=(await h.create()).body;expect((await h.call('/suggestions/withdraw',{id:s.id,expectedRevision:s.revision},TEST_TOKEN)).status).toBe(200);
 const v=await h.call('/suggestions/get',{id:s.id});expect(v.body.proposedHtml).toBe(PROPOSED);expect(v.body.status).toBe('withdrawn');
 expect((await h.decide(v.body,[s.items[0].id],'adopt')).status).toBe(409);
});
test('old_base rejected and successor retains linked history without old adoption',async()=>{
 let s=(await h.create()).body;s=(await h.decide(s,[s.items[0].id],'adopt')).body;const old=rt.gh.read();old.versions['v0.8']={...old.versions['v0.7'],previous:'v0.7',html:BASE.replace('甲','最新')};old.latestVersion='v0.8';rt.gh.write(`documents/${DOC}/document.json`,old);
 expect((await h.create()).status).toBe(409);
 expect((await h.preview(s)).status).toBe(409);
 const next=await h.create({baseVersion:'v0.8',baseHash:digest(old.versions['v0.8'].html),proposedHtml:old.versions['v0.8'].html.replace('乙','二'),sourceSuggestionId:s.id,sourceItemIds:[s.items[1].id]});
 expect(next.status).toBe(201);expect(next.body.sourceSuggestionId).toBe(s.id);expect(next.body.items.every(i=>i.decision==='pending')).toBe(true);
 expect((await h.call('/suggestions/get',{id:s.id})).body.items).toHaveLength(5);
});
test('unknown or duplicate IDs rejected atomically; permission enforced for self adoption',async()=>{
 const s=(await h.create()).body;
 expect((await h.decide(s,[s.items[0].id,'bad'],'adopt')).status).toBe(400);
 expect((await h.decide(s,[s.items[0].id,s.items[0].id],'adopt')).status).toBe(400);
 expect((await h.call('/suggestions/decide',{id:s.id,itemIds:[s.items[0].id],decision:'adopt',expectedRevision:s.revision},TEST_TOKEN)).status).toBe(403);
 const l=(await h.call('/collaboration/links/list')).body.links.find(x=>x.id==='Ltest');
 await h.call('/collaboration/links/update',{id:l.id,expectedRevision:l.revision,capabilities:{...l.capabilities,decide:true}});
 expect((await h.call('/suggestions/decide',{id:s.id,itemIds:[s.items[0].id],decision:'adopt',expectedRevision:s.revision},TEST_TOKEN)).status).toBe(200);
});
test('all declined is completed without a version; comments and mode toggles retain history',async()=>{
 const s=(await h.create()).body,a=(await h.decide(s,s.items.map(x=>x.id),'decline')).body;expect(a.status).toBe('completed');expect(rt.gh.commits).toHaveLength(0);
 expect((await h.call('/suggestions/comment',{id:s.id,text:'暫不採用'})).status).toBe(200);
 await h.call('/collaboration/settings',{enabled:false,expectedRevision:1});
 expect((await h.decide(a,[s.items[0].id],'adopt')).status).toBe(409);
 expect((await h.call('/suggestions/get',{id:s.id})).body.items).toHaveLength(5);
});
test('compare produces fresh base plus original unresolved evidence without automatic adoption',async()=>{
 let s=(await h.create()).body;s=(await h.decide(s,[s.items[0].id],'adopt')).body;
 const d=rt.gh.read();d.latestVersion='v0.8';d.versions['v0.8']={...d.versions['v0.7'],html:BASE.replace('甲','新的'),previous:'v0.7'};rt.gh.write(`documents/${DOC}/document.json`,d);
 const c=await h.call('/suggestions/compare',{id:s.id},TEST_TOKEN);expect(c.status).toBe(200);expect(c.body.draftHtml).toBe(d.versions['v0.8'].html);expect(c.body.originalProposedHtml).toBe(PROPOSED);expect(c.body.unresolvedItems).toHaveLength(5);
 expect((await h.call('/suggestions/get',{id:s.id})).body.items[0].decision).toBe('adopt');
});

test('renamed revoked author and archived document retain original named suggestion history',async()=>{
 const s=(await h.create()).body,l=(await h.call('/collaboration/links/list')).body.links.find(x=>x.id==='Ltest');
 expect((await h.call('/collaboration/links/update',{id:l.id,expectedRevision:l.revision,name:'更名後',enabled:false})).status).toBe(200);
 const d=rt.gh.read();d.archived={at:new Date().toISOString(),by:'Vic'};rt.gh.write(`documents/${DOC}/document.json`,d);
 const record=await h.call('/suggestions/get',{id:s.id}),history=await h.call('/suggestions/history',{id:s.id});expect(record.status).toBe(200);expect(record.body.proposedHtml).toBe(PROPOSED);expect(history.status).toBe(200);expect(history.body.events[0].actorSnapshot.name).toBe('客戶法務');
 expect((await h.decide(s,[s.items[0].id],'adopt')).status).not.toBe(200);
});
