import {test,expect} from '@playwright/test';
import {startRuntime} from './worker-runtime.mjs';
import {ADMIN_TOKEN,TEST_TOKEN} from './fake-github.js';
const doc='qa-senior-game-qa';let rt;
test.beforeEach(async()=>{rt=await startRuntime();});test.afterEach(async()=>{await rt?.close();});
const req=(path,extra={},token=ADMIN_TOKEN)=>rt.call(path,{token,doc,requestId:crypto.randomUUID(),...extra});
const enable=()=>req('/collaboration/settings',{enabled:true,ownerId:'Ladmin',expectedRevision:0});
const caps={view:true,propose:true,decide:false,publish:false,manage:false};
test('legacy_editor_cannot_publish and effective capabilities',async()=>{
 expect((await enable()).status).toBe(200);
 expect((await req('/session',{},TEST_TOKEN)).body.capabilities).toEqual(caps);
 expect((await req('/versions',{baseVersion:'v0.7'},TEST_TOKEN)).status).toBe(403);
 expect(rt.gh.commits).toHaveLength(0);
});
test('revocation_next_request and name snapshot retained',async()=>{
 await enable();const c=await req('/collaboration/links/create',{name:'B',capabilities:caps});expect(c.status).toBe(201);
 const token=c.body.token;expect((await req('/session',{},token)).body.name).toBe('B');
 expect((await req('/collaboration/links/update',{id:c.body.id,enabled:false,expectedRevision:1})).status).toBe(200);
 expect((await req('/session',{},token)).status).toBe(401);
 const h=await req('/suggestions/history');expect(h.body.events.some(e=>e.action==='link.updated')).toBe(true);
 expect(JSON.stringify(h.body)).not.toContain(token);expect(rt.gh.text('edit-links.json')).not.toContain('B');
});
test('cross_doc_denied and admin role cannot restore revoked private grant',async()=>{
 await enable();expect((await rt.call('/session',{token:TEST_TOKEN,doc:'other-doc'})).status).toBe(403);
 const links=(await req('/collaboration/links/list')).body.links;
 const admin=links.find(x=>x.id==='Ladmin');
 expect((await req('/collaboration/links/update',{id:admin.id,capabilities:caps,expectedRevision:admin.revision})).status).toBe(409);
});
test('last_owner_protected and ownership transfer logged',async()=>{
 await enable();const c=await req('/collaboration/links/create',{name:'C',capabilities:{view:true,propose:true,decide:true,publish:true,manage:true}});
 expect(c.status).toBe(201);expect((await req('/collaboration/settings',{enabled:true,ownerId:c.body.id,expectedRevision:1})).status).toBe(200);
 const a=(await req('/collaboration/links/list',{},c.body.token)).body.links.find(x=>x.id==='Ladmin');
 expect((await req('/collaboration/links/update',{id:'Ladmin',capabilities:caps,expectedRevision:a.revision},c.body.token)).status).toBe(200);
 expect((await req('/collaboration/settings',{enabled:false,expectedRevision:2})).status).toBe(403);
});
test('same link creation request replays no secret and private capabilities validate',async()=>{
 await enable();const requestId=crypto.randomUUID(),body={name:'B',capabilities:caps,requestId};
 const a=await req('/collaboration/links/create',body),b=await req('/collaboration/links/create',body);
 expect(a.status).toBe(201);expect(b.body.id).toBe(a.body.id);expect(b.body.token).toBeUndefined();
 expect((await req('/collaboration/links/create',{...body,name:'C'})).status).toBe(409);
 expect((await req('/collaboration/links/create',{name:'D',capabilities:{...caps,view:false}})).status).toBe(400);
});
test('terminal legacy revoke takes effect and global admin can recover owner',async()=>{
 await enable();const links=rt.gh.read('edit-links.json');links.links.find(x=>x.id==='Ltest').revoked=true;rt.gh.write('edit-links.json',links);
 expect((await req('/session',{},TEST_TOKEN)).status).toBe(401);
});
test('enable_races_legacy_publish',async()=>{
 const block=rt.blockNextWrite();
 const v={summary:'修改',details:['編輯者：客戶法務','建立時間：'+new Date().toISOString()],previous:'v0.7',html:'<p>測試改字</p>'};
 const pending=req('/versions',{baseVersion:'v0.7',versionKey:'v0.8',version:v},TEST_TOKEN);
 await block.entered;expect((await enable()).status).toBe(409);block.release();expect((await pending).status).toBe(201);
 expect((await enable()).status).toBe(200);expect((await req('/versions',{baseVersion:'v0.8'},TEST_TOKEN)).status).toBe(403);
});
test('explicit owner recovery by another valid global admin keeps old identity',async()=>{
 await enable();const list=rt.gh.read('edit-links.json');
 const owner=list.links.find(x=>x.id==='Ladmin');owner.revoked=true;
 const token='new-admin-token-0123456789abcdef';
 const {createHash}=await import('node:crypto');list.links.push({id:'Lnew',role:'admin',documents:['*'],name:'D',revoked:false,tokenHash:createHash('sha256').update(token).digest('hex')});rt.gh.write('edit-links.json',list);
 expect((await req('/collaboration/settings',{enabled:true,ownerId:'Lnew',expectedRevision:1},token)).status).toBe(403);
 const recover=await req('/collaboration/settings',{enabled:true,ownerId:'Lnew',recoverOwner:true,expectedRevision:1},token);expect(recover.status).toBe(200);
 const history=(await req('/suggestions/history',{},token)).body.events;expect(history[0].actorSnapshot.name).toBe('Vic');expect(history.at(-1).action).toBe('owner.recovered');
});
test('legacy response lost preserves one version and later mode enable is safe',async()=>{
 rt.loseNextWrite();const v={summary:'修改',details:['編輯者：客戶法務','建立時間：'+new Date().toISOString()],previous:'v0.7',html:'<p>舊模式修改</p>'};
 const r=await req('/versions',{baseVersion:'v0.7',versionKey:'v0.8',version:v},TEST_TOKEN);expect(r.status).toBe(201);expect(rt.gh.commits).toHaveLength(1);expect((await enable()).status).toBe(200);
});

test('admin recovers failed legacy publication after original link revocation',async()=>{
 rt.failNextWrites(3);const version={summary:'修改',details:['編輯者：客戶法務','建立時間：'+new Date().toISOString()],previous:'v0.7',html:'<p>保留原修訂</p>'};
 expect((await req('/versions',{baseVersion:'v0.7',versionKey:'v0.8',version},TEST_TOKEN)).status).toBe(502);
 await rt.call('/advance-clock',{ms:31_000});await rt.call('/advance-clock',{ms:31_000});
 const registry=rt.gh.read('edit-links.json');registry.links.find(l=>l.id==='Ltest').revoked=true;rt.gh.write('edit-links.json',registry);
 const pending=await req('/collaboration/legacy/status');expect(pending.status).toBe(200);expect(pending.body.status).toBe('failed');
 expect((await req('/collaboration/legacy/retry',{writeId:pending.body.id},TEST_TOKEN)).status).toBe(401);
 const retryBody={writeId:pending.body.id,requestId:crypto.randomUUID()};const recovered=await req('/collaboration/legacy/retry',retryBody);expect(recovered.status).toBe(201);expect(recovered.body.version).toBe('v0.8');expect(rt.gh.commits).toHaveLength(1);
 expect((await req('/collaboration/legacy/retry',retryBody)).body).toEqual(recovered.body);expect((await req('/collaboration/legacy/retry',{...retryBody,writeId:'different'})).status).toBe(409);
 expect((await req('/collaboration/legacy/status')).body.status).toBe('idle');expect((await enable()).status).toBe(200);
 const events=(await req('/suggestions/history')).body.events;expect(events.find(e=>e.action==='legacy.retry_requested').actorSnapshot.name).toBe('Vic');expect(events.find(e=>e.action==='legacy.published').actorSnapshot.name).toBe('客戶法務');
});
