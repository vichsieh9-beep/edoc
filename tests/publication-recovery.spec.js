import {test,expect} from '@playwright/test';
import {startRuntime} from './worker-runtime.mjs';
import {helpers,BASE,DOC,digest} from './collaboration-helpers.js';
import {bundleRuntime,loadTemplates,renderDocument} from '../scripts/lib/site.mjs';
import {pdfHtml} from '../scripts/lib/pdf.mjs';
import {formatPacket} from '../scripts/lib/changelog.mjs';
import {readFile} from 'node:fs/promises';
import {ADMIN_TOKEN,TEST_TOKEN} from './fake-github.js';
let rt,h;test.beforeEach(async()=>{rt=await startRuntime();h=helpers(rt);await h.setup();});test.afterEach(async()=>rt?.close());
async function ready({decline=true}={}){let s=(await h.create()).body;s=(await h.decide(s,s.items.slice(0,3).map(i=>i.id),'adopt')).body;if(decline)s=(await h.decide(s,s.items.slice(3).map(i=>i.id),'decline')).body;return s;}
async function publish(s,extra={}){const p=await h.preview(s);expect(p.status).toBe(200);return h.call('/suggestions/publish',{id:s.id,itemIds:s.items.filter(i=>i.decision==='adopt').map(i=>i.id),expectedRevision:s.revision,previewHash:p.body.previewHash,...extra});}
const status=p=>h.call('/suggestions/publication',{publicationId:p.id});
test('five_three_two_publish_once, private history and immutable previous versions',async()=>{
 const old=rt.gh.read(),s=await ready(),requestId=crypto.randomUUID(),p=await publish(s,{requestId});expect(p.status).toBe(202);
 const saved=(await status(p.body)).body;expect(saved.status).toBe('saved');expect(saved.versionKey).toBe('v0.8');
 const doc=rt.gh.read();expect(Object.keys(doc.versions)).toHaveLength(Object.keys(old.versions).length+1);
 for(const v of Object.keys(old.versions))expect(doc.versions[v]).toEqual(old.versions[v]);
 const html=doc.versions['v0.8'].html;expect(html).toContain('一');expect(html).not.toContain('四');expect(html).not.toContain('五');expect(doc.versions['v0.8'].contentHash).toBe(digest('<p>一</p><p>二</p><p>三</p><p>丁</p><p>戊</p>'));
 const current=(await h.call('/suggestions/get',{id:s.id})).body;expect(current.items[3].after).toBe('<p>四</p>');expect(current.items[3].decision).toBe('decline');expect(current.items[0].publishedIn).toBe('v0.8');
 expect(JSON.stringify(doc)).not.toContain(s.id);expect(JSON.stringify(doc.versions['v0.8'])).not.toContain('客戶法務');expect(doc.versions['v0.8'].aiSummary).toBeNull();
});
test('response_lost_retry_once and same ID changed payload refused',async()=>{
 const s=await ready(),p=await h.preview(s),requestId=crypto.randomUUID(),body={id:s.id,itemIds:s.items.slice(0,3).map(i=>i.id),expectedRevision:s.revision,previewHash:p.body.previewHash,requestId};
 const a=await h.call('/suggestions/publish',body),b=await h.call('/suggestions/publish',body);expect(b.body.id).toBe(a.body.id);await status(a.body);expect(rt.gh.commits).toHaveLength(1);
 expect((await h.call('/suggestions/publish',{...body,itemIds:[s.items[0].id]})).status).toBe(409);
});
test('GitHub saved but response lost reconciles after runtime restart',async()=>{
 const s=await ready();rt.loseNextWrite();const p=await publish(s);await rt.restart();
 const r=await status(p.body);expect(r.body.status).toBe('saved');expect(rt.gh.commits).toHaveLength(1);
 const events=(await h.call('/suggestions/history',{id:s.id})).body.events;expect(events.filter(e=>e.action==='publication.saved')).toHaveLength(1);
});
test('decision_changed_after_preview blocks stale publication',async()=>{
 const s=await ready(),p=await h.preview(s);await h.decide(s,[s.items[0].id],'decline');
 expect((await h.call('/suggestions/publish',{id:s.id,itemIds:s.items.slice(0,3).map(i=>i.id),expectedRevision:s.revision,previewHash:p.body.previewHash})).status).toBe(409);expect(rt.gh.commits).toHaveLength(0);
});
test('revocation_before_acceptance denied, after_acceptance job completes',async()=>{
 const publisher=(await h.call('/collaboration/links/create',{name:'C',capabilities:{view:true,propose:false,decide:false,publish:true,manage:false}})).body,s=await ready(),preview=(await h.preview(s)).body;
 let link=(await h.call('/collaboration/links/list')).body.links.find(x=>x.id===publisher.id);
 await h.call('/collaboration/links/update',{id:link.id,expectedRevision:link.revision,capabilities:{...link.capabilities,publish:false}});
 const input={id:s.id,itemIds:s.items.slice(0,3).map(i=>i.id),expectedRevision:s.revision,previewHash:preview.previewHash};expect((await h.call('/suggestions/publish',input,publisher.token)).status).toBe(403);
 link=(await h.call('/collaboration/links/list')).body.links.find(x=>x.id===publisher.id);await h.call('/collaboration/links/update',{id:link.id,expectedRevision:link.revision,capabilities:{...link.capabilities,publish:true}});
 const p=await h.call('/suggestions/publish',input,publisher.token);expect(p.status).toBe(202);
 link=(await h.call('/collaboration/links/list')).body.links.find(x=>x.id===publisher.id);await h.call('/collaboration/links/update',{id:link.id,expectedRevision:link.revision,enabled:false});
 expect((await status(p.body)).body.status).toBe('saved');expect(rt.gh.commits).toHaveLength(1);
});
test('pending_rebase_after_partial keeps all five and requires fresh comparison',async()=>{
 const s=await ready({decline:false}),p=await publish(s);await status(p.body);
 const remaining=(await h.call('/suggestions/get',{id:s.id})).body;expect(remaining.items.filter(i=>i.decision==='pending')).toHaveLength(2);expect(remaining.items).toHaveLength(5);
 expect((await h.decide(remaining,[remaining.items[3].id],'adopt')).status).toBe(409);
 expect((await h.create()).status).toBe(409);
 expect((await h.call('/suggestions/withdraw',{id:s.id,expectedRevision:remaining.revision},TEST_TOKEN)).status).toBe(409);
});
test('bounded transient retries retain work and manual retry same publication',async()=>{
 const s=await ready();rt.failNextWrites(3);const p=await publish(s);
 let r=await status(p.body);expect(['accepted','reconciling','failed']).toContain(r.body.status);expect(rt.gh.commits).toHaveLength(0);
 // Test fixture advances the clock/alarm, never waits minutes or calls remote GitHub.
 await rt.call('/advance-clock',{ms:600_001});r=await status(p.body);await rt.call('/advance-clock',{ms:600_001});r=await status(p.body);
 expect(r.body.status).toBe('failed');expect(r.body.attempts).toBe(3);
 const retry=await h.call('/suggestions/publication/retry',{publicationId:p.body.id});expect(retry.status).toBe(202);expect(retry.body.id).toBe(p.body.id);
 expect((await status(p.body)).body.status).toBe('saved');expect(rt.gh.commits).toHaveLength(1);
});
test('formal base change conflicts, metadata-only SHA change remains publishable',async()=>{
 const s=await ready(),p=await publish(s);const d=rt.gh.read();d.versions['v0.7'].aiSummary={summary:'metadata only'};rt.gh.write(`documents/${DOC}/document.json`,d);
 expect((await status(p.body)).body.status).toBe('saved');
});
test('public API without binding fails closed and private reads cannot be anonymous',async()=>{
 expect((await rt.call('/unbound-versions',{token:TEST_TOKEN,doc:DOC})).status).toBe(503);
 expect((await rt.call('/suggestions/get',{doc:DOC,id:'S001'})).status).toBe(401);
});
test('private confirmation failure is recovered without duplicate commit or saved event',async()=>{
 const s=await ready();expect((await rt.call('/fail-event',{action:'publication.saved'})).status).toBe(200);const p=await publish(s);expect((await status(p.body)).body.status).toBe('saved');
 expect(rt.gh.commits).toHaveLength(1);const events=(await h.call('/suggestions/history',{id:s.id})).body.events;expect(events.filter(e=>e.action==='publication.saved')).toHaveLength(1);
});
test('formal version advanced before writing releases conflict and retains original decisions',async()=>{
 const s=await ready(),p=await publish(s);const d=rt.gh.read();d.latestVersion='v0.8';d.versions['v0.8']={...d.versions['v0.7'],html:BASE.replace('甲','另一版本'),previous:'v0.7'};rt.gh.write(`documents/${DOC}/document.json`,d);
 expect((await status(p.body)).body.status).toBe('conflict');expect(rt.gh.commits).toHaveLength(0);
 const original=(await h.call('/suggestions/get',{id:s.id})).body;expect(original.items[0].decision).toBe('adopt');expect(original.items[0].publishedIn).toBeNull();
});
test('concurrent publications reserve once and cannot change locked decisions',async()=>{
 const s=await ready(),p=(await publish(s)).body;
 expect((await h.decide({...s,revision:s.revision+1},[s.items[0].id],'decline')).status).toBe(409);
 const r=await Promise.all([status(p),status(p)]);expect(r.some(x=>x.body.status==='saved')).toBe(true);expect(rt.gh.commits).toHaveLength(1);
});

test('isolated private backup restore reconciles existing formal version without rollback',async()=>{
 const old=rt.gh.read(),s=await ready(),p=await publish(s);
 const snapshot=await rt.backup();expect(snapshot.formalCommits).toBe(0);expect((await status(p.body)).body.status).toBe('saved');const formal=rt.gh.read();
 expect((await h.call('/suggestions/comment',{id:s.id,text:'AFTER_BACKUP_PRIVATE_SENTINEL'})).status).toBe(200);expect(JSON.stringify((await h.call('/suggestions/history',{id:s.id})).body)).toContain('AFTER_BACKUP_PRIVATE_SENTINEL');
 await rt.restore(snapshot);expect(JSON.stringify((await h.call('/suggestions/history',{id:s.id})).body)).not.toContain('AFTER_BACKUP_PRIVATE_SENTINEL');expect((await status(p.body)).body.status).toBe('saved');expect(rt.gh.read()).toEqual(formal);expect(rt.gh.commits).toHaveLength(1);
 for(const key of Object.keys(old.versions))expect(formal.versions[key]).toEqual(old.versions[key]);
 const restored=(await h.call('/suggestions/get',{id:s.id})).body;expect(restored.items.filter(i=>i.publishedIn==='v0.8')).toHaveLength(3);expect(restored.items.filter(i=>i.decision==='decline')).toHaveLength(2);
 expect((await h.call('/suggestions/history',{id:s.id})).body.events.filter(e=>e.action==='publication.saved')).toHaveLength(1);
 await rt.restart();expect((await status(p.body)).body.status).toBe('saved');expect(rt.gh.commits).toHaveLength(1);
});

test('public build PDF source and changelog exclude private rejected content and comments',async({page},testInfo)=>{
 const secret='PRIVATE_REJECT_7f91',comment='PRIVATE_COMMENT_8a12';
 let s=(await h.create({proposedHtml:'<p>PUBLIC_ADOPT_6b22</p><p>乙</p><p>丙</p><p>'+secret+'</p><p>戊</p>'})).body;
 s=(await h.decide(s,[s.items[0].id],'adopt')).body;s=(await h.decide(s,[s.items[1].id],'decline')).body;
 expect((await h.call('/suggestions/comment',{id:s.id,text:comment})).status).toBe(200);
 s=(await h.call('/suggestions/get',{id:s.id})).body;const p=await publish(s);expect((await status(p.body)).body.status).toBe('saved');
 const doc=rt.gh.read(),templates=await loadTemplates(),script=await bundleRuntime();const output=renderDocument(doc,{templates,script,slug:DOC});
 for(const privateText of [secret,comment,TEST_TOKEN,ADMIN_TOKEN]){expect(JSON.stringify(doc)).not.toContain(privateText);expect(output).not.toContain(privateText);}
 await page.goto('/documents/qa-senior-game-qa/');await page.setContent(output);await page.waitForFunction(()=>window.EDoc&&EDoc.versions['v0.8'].hash);
 const facts=await page.evaluate(()=>({version:'v0.8',previous:'v0.7',summary:EDoc.versions['v0.8'].summary,hash:EDoc.versions['v0.8'].hash,changes:EDoc.listChanges(EDoc.versions['v0.8'].html)}));
 const packet=formatPacket(doc,facts);expect(packet).toContain('PUBLIC_ADOPT_6b22');expect(packet).not.toContain(secret);expect(packet).not.toContain(comment);
 const html=pdfHtml({version:'v0.8',html:doc.versions['v0.8'].html,hash:facts.hash,url:'http://edoc.test'});await page.setContent(html);
 expect(await page.locator('body').innerText()).toContain('PUBLIC_ADOPT_6b22');expect(await page.locator('body').innerText()).not.toContain(secret);expect(await page.locator('body').innerText()).not.toContain(comment);
 const file=testInfo.outputPath('public.pdf');await page.pdf({path:file,format:'A4'});expect((await readFile(file)).subarray(0,5).toString()).toBe('%PDF-');
});

test('paragraph review units publish one adoption while retaining declined deletion and unchanged neighbours',async()=>{
 const base='<h2>需求條件</h2><p>具遊戲測試經驗。</p><p>能獨立規劃測試。</p><p>善用 AI 協作。</p><p>清楚回報問題。</p><p>主動溝通風險。</p>';
 const d=rt.gh.read();d.versions['v0.7'].html=base;rt.gh.write(`documents/${DOC}/document.json`,d);
 let s=(await h.create({baseHash:digest(base),proposedHtml:base.replace('具遊戲','具備網路遊戲').replace('規劃測試。','規劃測試案例。').replace('<p>主動溝通風險。</p>','')})).body;expect(s.items).toHaveLength(3);
 s=(await h.decide(s,[s.items[0].id],'adopt')).body;s=(await h.decide(s,s.items.slice(1).map(i=>i.id),'decline')).body;
 const p=await publish(s);expect((await status(p.body)).body.status).toBe('saved');expect(rt.gh.commits).toHaveLength(1);expect(rt.gh.read().versions['v0.8'].contentHash).toBe(digest(base.replace('具遊戲','具備網路遊戲')));
 const history=(await h.call('/suggestions/get',{id:s.id})).body;expect(history.items[2].before).toBe('<p>主動溝通風險。</p>');expect(history.items[2].decision).toBe('decline');
});
