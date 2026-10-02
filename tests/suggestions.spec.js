import {test,expect} from '@playwright/test';
import {setup,collab} from './collaboration-browser.js';
import {ADMIN_TOKEN,TEST_TOKEN,createFakeGithub} from './fake-github.js';
import {prepareContent,hashContent,trustedContent} from '../worker/src/content.js';
const BASE='<p>甲</p><p>乙</p><p>丙</p><p>丁</p><p>戊</p>',PROPOSED='<p>一</p><p>二</p><p>三</p><p>四</p><p>五</p>';
async function fixture(page){const gh=createFakeGithub(),d=gh.read();d.versions['v0.7'].html=BASE;gh.write('documents/qa-senior-game-qa/document.json',d);await setup(page,{gh});return gh;}
async function openMore(page){const more=page.locator('.suggestion-more');if(!await more.evaluate(n=>n.open))await more.locator('summary').click();}
async function create(gh){return (await collab(gh,'/suggestions/create',{baseVersion:'v0.7',baseHash:await hashContent(trustedContent(BASE)),proposedHtml:PROPOSED},TEST_TOKEN)).body;}
test('submit keeps formal version menu and draft until successful response',async({page})=>{
 await setup(page,{token:TEST_TOKEN});await page.locator('#newRevisionBtn').click();await expect(page.locator('#doc')).toHaveAttribute('contenteditable','true');await page.locator('#doc').press('ControlOrMeta+End');await page.keyboard.insertText('新增建議文字');
 await page.getByRole('button',{name:'送出修訂建議',exact:true}).click();await expect(page.locator('#suggestionPanel')).toContainText('S001');
 await page.locator('#versionButton').click();await expect(page.locator('#versionMenu')).not.toContainText('v0.8');await expect(page.locator('#versionMenu')).not.toContainText('S001');
});
test('right panel decisions and filtered bulk operate only visible IDs, full history kept',async({page})=>{
 const gh=await fixture(page),s=await create(gh);await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 S001'}).click();
 await expect(page.locator('[data-suggestion-item]')).toHaveCount(5);
 await page.locator('[data-suggestion-item]').nth(0).getByRole('button',{name:'採納',exact:true}).click();
 await page.getByLabel('顯示項目').selectOption('pending');await expect(page.locator('[data-suggestion-item]')).toHaveCount(4);
 await page.getByText('更多操作',{exact:true}).click();await page.getByRole('button',{name:'不採納可見項目'}).click();await page.getByLabel('顯示項目').selectOption('all');
 await expect(page.locator('[data-suggestion-item]').nth(1)).toContainText('四'.replace('四','二'));await expect(page.locator('[data-suggestion-item]').nth(1)).toContainText('不採納');
 const actual=(await collab(gh,'/suggestions/get',{id:s.id})).body;expect(actual.items.map(i=>i.decision)).toEqual(['adopt','decline','decline','decline','decline']);
 await openMore(page);await page.getByRole('button',{name:'完整歷程'}).click();await expect(page.locator('#suggestionHistory')).toContainText('客戶法務');await expect(page.locator('#suggestionHistory')).toContainText('Vic');
});
test('five proposals three adopted two declined preview and publication retain rejected changes',async({page})=>{
 const gh=await fixture(page),s=await create(gh);await expect(page.locator('#stateChip')).toHaveText('正式版・唯讀');await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 S001'}).click();await expect(page.locator('#stateChip')).toHaveText('修訂建議・唯讀');
 for(let i=0;i<3;i++)await page.locator('[data-suggestion-item]').nth(i).getByRole('button',{name:'採納',exact:true}).click();
 for(let i=3;i<5;i++)await page.locator('[data-suggestion-item]').nth(i).getByRole('button',{name:'不採納',exact:true}).click();
 await page.getByRole('button',{name:'發布新版',exact:true}).click();await expect(page.locator('#publicationPreview')).toContainText('採納 3');await expect(page.locator('#publicationPreview')).toContainText('不採納 2');await expect(page.locator('#stateChip')).toHaveText('採納預覽・尚未發布');await page.getByRole('button',{name:'返回修訂建議',exact:true}).click();await expect(page.locator('#stateChip')).toHaveText('修訂建議・唯讀');await page.getByRole('button',{name:'發布新版',exact:true}).click();
 await expect(page.locator('#pdfBtn')).toHaveAttribute('aria-disabled','true');await expect(page.locator('#versionMenu')).not.toContainText('v0.8');
 await page.getByRole('button',{name:'確認並發布',exact:true}).click();await expect(page.locator('#versionLabel')).toContainText('v0.8');
 expect(trustedContent(gh.read().versions['v0.8'].html)).toBe('<p>一</p><p>二</p><p>三</p><p>丁</p><p>戊</p>');
 expect((await collab(gh,'/suggestions/get',{id:s.id})).body.items).toHaveLength(5);await expect(page.locator('#cardMeaning')).toHaveText('變更說明尚未補寫');await expect(page.locator('#pdfBtn')).toHaveAttribute('aria-disabled','true');
});
test('withdraw keeps original text and named history, narrow screen remains readable',async({page})=>{
 const gh=createFakeGithub();await setup(page,{gh,token:TEST_TOKEN});const base=trustedContent(gh.read().versions['v0.7'].html);
 await collab(gh,'/suggestions/create',{baseVersion:'v0.7',baseHash:await hashContent(base),proposedHtml:base+'<p>保留原建議</p>'},TEST_TOKEN);
 await page.setViewportSize({width:390,height:844});await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 S001'}).click();
 page.once('dialog',d=>d.accept());await openMore(page);await page.getByRole('button',{name:'撤回修訂建議',exact:true}).click();await expect(page.locator('#revisionMarkup')).toContainText('已撤回');
 await openMore(page);await page.getByRole('button',{name:'完整歷程'}).click();await expect(page.locator('#suggestionHistory')).toContainText('撤回建議');await expect(page.locator('#revisionMarkup')).toContainText('保留原建議');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await collab(gh,'/suggestions/get',{id:'S001'})).body.proposedHtml).toContain('保留原建議');
});
test('composition and failed submission preserve content, caret and stable retry ID',async({page})=>{
 let dropped=false,ids=[];const gh=await setup(page,{token:TEST_TOKEN,onResponse:async(route,res)=>{if(route.request().url().endsWith('/suggestions/create')){ids.push(JSON.parse(route.request().postData()).requestId);if(!dropped){dropped=true;await route.abort();return false;}}}});
 await page.locator('#newRevisionBtn').click();await expect(page.locator('#doc')).toHaveAttribute('contenteditable','true');
 await page.locator('#doc').press('ControlOrMeta+End');await page.keyboard.insertText('中文輸入保留');await page.locator('#doc').dispatchEvent('compositionstart');
 await page.locator('#finishRevisionBtn').click();await expect(page.locator('#notice')).toContainText('完成輸入');expect(ids).toHaveLength(0);
 await page.locator('#doc').dispatchEvent('compositionend');await page.locator('#finishRevisionBtn').click();await expect(page.locator('#notice')).toContainText('草稿已保留');await expect(page.locator('#doc')).toContainText('中文輸入保留');
 await page.locator('#finishRevisionBtn').click();await expect(page.locator('#suggestionPanel')).toContainText('S001');expect(ids).toHaveLength(2);expect(ids[0]).toBe(ids[1]);expect((await collab(gh,'/suggestions/list')).body.suggestions).toHaveLength(1);
});
test('preview expires on changed decision, rejects empty adoption and preserves formal versions',async({page})=>{
 const gh=await fixture(page),s=await create(gh);await collab(gh,'/suggestions/decide',{id:s.id,itemIds:[s.items[0].id],decision:'adopt',expectedRevision:1});
 await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 S001'}).click();await page.getByRole('button',{name:'發布新版',exact:true}).click();
 await collab(gh,'/suggestions/decide',{id:s.id,itemIds:[s.items[0].id],decision:'decline',expectedRevision:2});await page.getByRole('button',{name:'確認並發布',exact:true}).click();
 await expect(page.locator('#publicationPreview [role=status]')).toContainText('重新');expect(gh.commits).toHaveLength(0);await page.getByRole('button',{name:'返回修訂建議'}).click();
 await page.getByRole('button',{name:'返回正式版'}).click();await page.getByRole('button',{name:'確認返回',exact:true}).click();await expect(page.locator('#versionLabel')).toContainText('v0.7');
});
test('three adopted two pending, reload resumes saved publication and PDF appears later',async({page})=>{
 await page.addInitScript(()=>{window.__EDOC_POLL_MS=100;});let live=false,pdfReady=false;
 await page.route(url=>url.pathname.endsWith('/pdf/v0.8.pdf'),route=>route.fulfill({status:pdfReady?200:404,contentType:pdfReady?'application/pdf':'text/plain',body:pdfReady?'%PDF-1.7':'not yet'}));
 await page.route(url=>url.searchParams.has('edoc-check')&&!url.pathname.includes('/pdf/'),async route=>{const r=await route.fetch();let body=await r.text();if(live)body=body.replace('"latestVersion":"v0.7"','"latestVersion":"v0.8"');await route.fulfill({response:r,body});});
 const gh=await fixture(page),s=await create(gh);await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 S001'}).click();for(let i=0;i<3;i++)await page.locator('[data-suggestion-item]').nth(i).getByRole('button',{name:'採納',exact:true}).click();
 await page.getByRole('button',{name:'發布新版',exact:true}).click();await expect(page.locator('#publicationPreview')).toContainText('待討論 2');await page.getByRole('button',{name:'確認並發布',exact:true}).click();await expect(page.locator('#versionLabel')).toContainText('v0.8');
 await expect(page.locator('#publishNote')).toContainText('公開網址更新中');await expect(page.locator('#pdfBtn')).toHaveAttribute('aria-disabled','true');expect((await collab(gh,'/suggestions/get',{id:s.id})).body.items.filter(i=>i.decision==='pending')).toHaveLength(2);
 await page.reload();await expect(page.locator('#versionLabel')).toContainText('v0.8');expect(gh.commits).toHaveLength(1);
 live=true;await expect(page.locator('#publishNote')).toContainText('PDF 仍在產生');await expect(page.locator('#pdfBtn')).toHaveAttribute('aria-disabled','true');
 pdfReady=true;await expect(page.locator('#pdfBtn')).toHaveAttribute('aria-disabled','false');await expect.poll(()=>page.evaluate(()=>localStorage.getItem('edoc-publication:qa-senior-game-qa-engineer'))).toBeNull();await expect(page.locator('#pdfBtn')).toHaveAttribute('href','pdf/v0.8.pdf');
 await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 S001'}).click();await openMore(page);await page.getByRole('button',{name:'重新比較並建立草稿'}).click();await page.getByRole('button',{name:'以最新正式版建立草稿'}).click();await expect(page.locator('#versionLabel')).toHaveText('Draft · Base v0.8');await expect(page.locator('#doc')).toContainText('丁');await expect(page.locator('#doc')).not.toContainText('四');
 await page.locator('#doc').press('ControlOrMeta+End');await page.keyboard.insertText('第二輪補充');await page.locator('#finishRevisionBtn').click();await expect(page.locator('#suggestionPanel')).toHaveText('S002');await expect(page.locator('#revisionMarkup')).toContainText('來源建議：S001');expect(gh.read().latestVersion).toBe('v0.8');
});
test('public read-only page never fetches private collaboration data',async({page})=>{
 const urls=[];page.on('request',r=>urls.push(r.url()));await page.goto('/documents/qa-senior-game-qa/');await expect(page.locator('#suggestionsBtn')).toBeHidden();expect(urls.filter(u=>u.includes('/suggestions/')||u.includes('/collaboration/'))).toHaveLength(0);
});
test('complete browser workflow uses actual local workerd SQLite service',async({page})=>{
 const {startRuntime}=await import('./worker-runtime.mjs'),{enablePublishing}=await import('./publish-mock.js');const rt=await startRuntime();
 const request=(path,b={},token=ADMIN_TOKEN)=>rt.call(path,{doc:'qa-senior-game-qa',token,requestId:crypto.randomUUID(),...b});
 try{
  const d=rt.gh.read();d.versions['v0.7'].html=BASE;rt.gh.write('documents/qa-senior-game-qa/document.json',d);
  await request('/collaboration/settings',{enabled:true,expectedRevision:0});
  const s=(await request('/suggestions/create',{baseVersion:'v0.7',baseHash:await hashContent(trustedContent(BASE)),proposedHtml:PROPOSED},TEST_TOKEN)).body;
  await enablePublishing(page,{gh:rt.gh,onRequest:async route=>{const r=await rt.call(new URL(route.request().url()).pathname,JSON.parse(route.request().postData()));await route.fulfill({status:r.status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':new URL(page.url()).origin},body:JSON.stringify(r.body)});return false;}});
  await page.goto('/documents/qa-senior-game-qa/#edit='+ADMIN_TOKEN);await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 S001'}).click();
  for(let i=0;i<3;i++)await page.locator('[data-suggestion-item]').nth(i).getByRole('button',{name:'採納',exact:true}).click();for(let i=3;i<5;i++)await page.locator('[data-suggestion-item]').nth(i).getByRole('button',{name:'不採納',exact:true}).click();
  await page.getByRole('button',{name:'發布新版',exact:true}).click();await page.getByRole('button',{name:'確認並發布',exact:true}).click();await expect(page.locator('#versionLabel')).toContainText('v0.8');expect(rt.gh.commits).toHaveLength(1);
  const saved=(await request('/suggestions/get',{id:s.id})).body;expect(saved.items.filter(i=>i.publishedIn)).toHaveLength(3);expect(saved.items.filter(i=>i.decision==='decline')).toHaveLength(2);
 }finally{await rt.close();}
});
test('revoking publish capability after acceptance still completes the accepted version',async({page})=>{
 const gh=createFakeGithub();const d=gh.read();d.versions['v0.7'].html=BASE;gh.write('documents/qa-senior-game-qa/document.json',d);await collab(gh,'/collaboration/settings',{enabled:true,expectedRevision:0});
 const publisher=(await collab(gh,'/collaboration/links/create',{name:'發布者',capabilities:{view:true,propose:false,decide:false,publish:true,manage:false}})).body;
 const s=await create(gh);await collab(gh,'/suggestions/decide',{id:s.id,itemIds:s.items.map(i=>i.id),decision:'adopt',expectedRevision:1});
 const {enablePublishing}=await import('./publish-mock.js');await enablePublishing(page,{gh,onResponse:async(route,res)=>{if(route.request().url().endsWith('/suggestions/publish'))await collab(gh,'/collaboration/links/update',{id:publisher.id,expectedRevision:1,capabilities:{view:true,propose:false,decide:false,publish:false,manage:false}});}});
 await page.goto('/documents/qa-senior-game-qa/#edit='+publisher.token);await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 S001'}).click();await page.getByRole('button',{name:'發布新版',exact:true}).click();await page.getByRole('button',{name:'確認並發布',exact:true}).click();await expect(page.locator('#versionLabel')).toContainText('v0.8');expect(gh.commits).toHaveLength(1);
});
test('zero changes does not create a suggestion or a formal version',async({page})=>{
 const gh=await setup(page,{token:TEST_TOKEN});await page.locator('#newRevisionBtn').click();await expect(page.locator('#doc')).toHaveAttribute('contenteditable','true');await page.locator('#finishRevisionBtn').click();await expect(page.locator('#notice')).toContainText('沒有有效修訂內容');expect((await collab(gh,'/suggestions/list')).body.suggestions).toHaveLength(0);expect(gh.commits).toHaveLength(0);
});
test('saved publication recovery never rolls back a newer formal version',async({page})=>{
 const gh=await fixture(page),s=await create(gh);await collab(gh,'/suggestions/decide',{id:s.id,itemIds:s.items.map(i=>i.id),decision:'adopt',expectedRevision:1});
 await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 S001'}).click();await page.getByRole('button',{name:'發布新版',exact:true}).click();await page.getByRole('button',{name:'確認並發布',exact:true}).click();await expect(page.locator('#versionLabel')).toContainText('v0.8');
 const doc=gh.read();doc.latestVersion='v0.9';doc.versions['v0.9']={html:'<p>較新的正式內容</p>',previous:'v0.8',summary:'新正式版',details:[]};gh.write('documents/qa-senior-game-qa/document.json',doc);
 await page.route(url=>url.pathname==='/documents/qa-senior-game-qa/'&&!url.searchParams.has('edoc-check'),async route=>{const r=await route.fetch();const body=(await r.text()).replace(/(<script id="versionData" type="application\/json">)[\s\S]*?(<\/script>)/,(_,a,b)=>a+JSON.stringify(doc.versions)+b).replace('"latestVersion":"v0.7"','"latestVersion":"v0.9"');await route.fulfill({response:r,body});});
 await page.reload();await expect(page.locator('#versionLabel')).toHaveText('v0.9 · Current');await expect(page.locator('#doc')).toContainText('較新的正式內容');await page.locator('#newRevisionBtn').click();await expect(page.locator('#versionLabel')).toHaveText('Draft · Base v0.9');
});
test('private suggestion controls survive marker toggles and opening from simple markup',async({page})=>{
 const gh=await fixture(page);await create(gh);await page.locator('#toggleChanges').click();await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 S001'}).click();await expect(page.locator('#suggestionPanel')).toBeVisible();
 await openMore(page);for(let i=0;i<2;i++){await page.locator('#toggleChanges').click();await expect(page.locator('#suggestionPanel')).toBeVisible();await expect(page.getByRole('button',{name:'完整歷程'})).toBeVisible();await expect(page.locator('[data-suggestion-item]')).toHaveCount(5);}
 await page.locator('[data-suggestion-item]').first().getByRole('button',{name:'採納',exact:true}).click();await expect(page.locator('[data-suggestion-item]').first()).toContainText('Vic 已採納');
});
test('recompare capability loss preserves the existing local draft and never claims success',async({page})=>{
 const gh=await fixture(page);await create(gh);await page.locator('#newRevisionBtn').click();await expect(page.locator('#doc')).toHaveAttribute('contenteditable','true');await page.locator('#doc').press('ControlOrMeta+End');await page.keyboard.insertText('原草稿不可遺失');
 await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 S001'}).click();await openMore(page);await page.getByRole('button',{name:'重新比較並建立草稿'}).click();
 const extra=(await collab(gh,'/collaboration/links/create',{name:'新主控',capabilities:{view:true,propose:true,decide:true,publish:true,manage:true}})).body;await collab(gh,'/collaboration/settings',{enabled:true,ownerId:extra.id,expectedRevision:1});
 await collab(gh,'/collaboration/links/update',{id:'Ladmin',expectedRevision:1,capabilities:{view:true,propose:false,decide:true,publish:true,manage:false}},extra.token);
 await page.getByRole('button',{name:'以最新正式版建立草稿'}).click();await expect(page.getByRole('alert')).toContainText('草稿');
 expect(await page.evaluate(()=>localStorage.getItem('edoc-draft:qa-senior-game-qa-engineer'))).toContain('原草稿不可遺失');await expect(page.locator('#notice')).not.toContainText('已開啟最新草稿');
});

test('compact cards show inline changes, paired decisions and bidirectional selection',async({page})=>{
 const gh=await fixture(page);await create(gh);await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 S001'}).click();
 const first=page.locator('[data-suggestion-item]').first();await expect(first.locator('details')).toHaveCount(0);await expect(first).toContainText('修改前：甲');await expect(first).toContainText('建議內容：一');await expect(first.getByRole('button',{name:'採納',exact:true})).toBeVisible();await expect(first.getByRole('button',{name:'不採納',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'採納可見項目',exact:true})).not.toBeVisible();
 await first.click();await expect(first).toHaveClass(/selected/);await expect(page.locator('#doc .suggestion-target')).toContainText('一');
 await page.locator('#doc p').filter({hasText:'二'}).click();await expect(page.locator('[data-suggestion-item]').nth(1)).toHaveClass(/selected/);
 await first.getByRole('button',{name:'採納',exact:true}).click();await expect(first).toContainText('Vic 已採納');await first.locator('.suggestion-card-toggle').click();await first.getByRole('button',{name:'改回待討論',exact:true}).click();await expect(first).toContainText('待討論');
 await first.getByRole('button',{name:'不採納',exact:true}).click();await expect(first).toContainText('Vic 已不採納');await expect(first).toContainText('一');await openMore(page);await page.getByRole('button',{name:'完整歷程'}).click();await expect(page.locator('#suggestionHistory')).toContainText('採納');
 await page.setViewportSize({width:390,height:844});await first.locator('.suggestion-card-toggle').click();await expect(first.getByRole('button',{name:'採納',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('same paragraph changes share one card and deleted paragraphs locate original text',async({page})=>{
 const gh=createFakeGithub(),d=gh.read();d.versions['v0.7'].html='<p>甲方支付費用，乙方交付文件。</p>';gh.write('documents/qa-senior-game-qa/document.json',d);await setup(page,{gh});
 await collab(gh,'/suggestions/create',{baseVersion:'v0.7',baseHash:await hashContent(trustedContent(d.versions['v0.7'].html)),proposedHtml:'<p>甲方支付款項，乙方交付報告。</p>'},TEST_TOKEN);
 await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 S001'}).click();await page.locator('#doc .changed').filter({hasText:'報告'}).click();await expect(page.locator('[data-suggestion-item]')).toHaveCount(1);await expect(page.locator('[data-suggestion-item]').first()).toContainText('甲方支付費用，乙方交付文件。');await expect(page.locator('[data-suggestion-item]').first()).toContainText('甲方支付款項，乙方交付報告。');await expect(page.locator('[data-suggestion-item]').first()).toHaveClass(/selected/);
 await page.locator('#doc .changed').filter({hasText:'款項'}).click();await expect(page.locator('[data-suggestion-item]').first()).toHaveClass(/selected/);
 const gh2=createFakeGithub(),d2=gh2.read();d2.versions['v0.7'].html='<p>保留甲</p><p>整段刪除乙</p><p>保留丙</p>';gh2.write('documents/qa-senior-game-qa/document.json',d2);await setup(page,{gh:gh2});
 await collab(gh2,'/suggestions/create',{baseVersion:'v0.7',baseHash:await hashContent(trustedContent(d2.versions['v0.7'].html)),proposedHtml:'<p>保留甲</p><p>保留丙</p>'},TEST_TOKEN);
 await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 S001'}).click();await page.locator('[data-suggestion-item]').first().click();await expect(page.locator('#doc .suggestion-target')).toContainText('整段刪除乙');await expect(page.locator('#doc .suggestion-target')).toBeVisible();
});

test('declined deletion and addition retain explicit before and proposed content',async({page})=>{
 const gh=await fixture(page),s=await create(gh);await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 S001'}).click();const card=page.locator('[data-suggestion-item]').first();await card.getByRole('button',{name:'不採納',exact:true}).click();await page.getByLabel('顯示項目').selectOption('decline');await expect(card).toContainText('修改前：甲');await expect(card).toContainText('建議內容：一');await expect(card).toContainText('Vic 已不採納');
});

test('declined structural deletion shows visible descriptions instead of blank rows',async({page})=>{
 const gh=createFakeGithub(),d=gh.read();d.versions['v0.7'].html='<p>保留甲</p><hr><p>保留丙</p>';gh.write('documents/qa-senior-game-qa/document.json',d);await setup(page,{gh});
 await collab(gh,'/suggestions/create',{baseVersion:'v0.7',baseHash:await hashContent(trustedContent(d.versions['v0.7'].html)),proposedHtml:'<p>保留甲</p><p>保留丙</p>'},TEST_TOKEN);
 await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 S001'}).click();const card=page.locator('[data-suggestion-item]').first();await card.getByRole('button',{name:'不採納',exact:true}).click();await page.getByLabel('顯示項目').selectOption('decline');await expect(card).toContainText('修改前：分隔線');await expect(card).toContainText('建議內容：無（刪除內容）');
});

for(const [kind,original] of [['bare','主動溝通風險'],['inline','<strong>主動溝通風險</strong>']])test('deleted '+kind+' text retains actual original wording in private cards',async({page})=>{
  const gh=createFakeGithub(),d=gh.read();const base='<h2>需求條件</h2><p>'+original+'<br>保留文字</p>';d.versions['v0.7'].html=base;gh.write('documents/qa-senior-game-qa/document.json',d);await setup(page,{gh});
  const created=await collab(gh,'/suggestions/create',{baseVersion:'v0.7',baseHash:await hashContent(trustedContent(base)),proposedHtml:'<h2>需求條件</h2><p><br>保留文字</p>'},TEST_TOKEN);expect(created.status).toBe(201);
  await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 S001'}).click();const card=page.locator('[data-suggestion-item]').first();await expect(card).toContainText('修改前：主動溝通風險');await expect(card).not.toContainText('格式或結構內容');
  await card.getByRole('button',{name:'不採納',exact:true}).click();await page.getByLabel('顯示項目').selectOption('decline');await expect(card).toContainText('修改前：主動溝通風險');await expect(card).toContainText('建議內容：');
});

test('two changed paragraphs and one deletion produce three separately reviewable cards',async({page})=>{
 const gh=createFakeGithub(),d=gh.read(),base='<h2>需求條件</h2><p>具遊戲測試經驗。</p><p>能獨立規劃測試。</p><p>善用 AI 協作。</p><p>清楚回報問題。</p><p>主動溝通風險。</p>';
 const proposed=base.replace('具遊戲','具備網路遊戲').replace('規劃測試。','規劃測試案例。').replace('<p>主動溝通風險。</p>','');d.versions['v0.7'].html=base;gh.write('documents/qa-senior-game-qa/document.json',d);await setup(page,{gh});
 await collab(gh,'/suggestions/create',{baseVersion:'v0.7',baseHash:await hashContent(trustedContent(base)),proposedHtml:proposed},TEST_TOKEN);
 await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 S001'}).click();const cards=page.locator('[data-suggestion-item]');await expect(cards).toHaveCount(3);
 await expect(cards.nth(0)).toContainText('修改前：具遊戲測試經驗。');await expect(cards.nth(0)).toContainText('建議內容：具備網路遊戲測試經驗。');await expect(cards.nth(1)).toContainText('修改前：能獨立規劃測試。');await expect(cards.nth(2)).toContainText('修改前：主動溝通風險。');
 expect((await cards.allTextContents()).join('')).not.toContain('善用 AI');expect((await cards.allTextContents()).join('')).not.toContain('清楚回報');
 await cards.nth(0).getByRole('button',{name:'採納',exact:true}).click();await cards.nth(1).getByRole('button',{name:'不採納',exact:true}).click();await cards.nth(2).getByRole('button',{name:'不採納',exact:true}).click();
 await page.getByRole('button',{name:'發布新版',exact:true}).click();await expect(page.locator('.preview-document')).toContainText('具備網路遊戲');await expect(page.locator('.preview-document')).toContainText('能獨立規劃測試。');await expect(page.locator('.preview-document')).toContainText('主動溝通風險。');
 await page.getByRole('button',{name:'確認並發布',exact:true}).click();await expect(page.locator('#versionLabel')).toContainText('v0.8');expect(gh.read().versions['v0.8'].contentHash).toBe(await hashContent(base.replace('具遊戲','具備網路遊戲')));expect((await collab(gh,'/suggestions/get',{id:'S001'})).body.items).toHaveLength(3);
});

test('duplicate paragraph text locates the changed occurrence after sibling insertion',async({page})=>{
 const gh=createFakeGithub(),d=gh.read(),base='<p>重複</p><p>原文</p>';d.versions['v0.7'].html=base;gh.write('documents/qa-senior-game-qa/document.json',d);await setup(page,{gh});
 await collab(gh,'/suggestions/create',{baseVersion:'v0.7',baseHash:await hashContent(trustedContent(base)),proposedHtml:'<p>前方新增</p><p>重複</p><p>重複</p>'},TEST_TOKEN);
 await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 S001'}).click();await page.locator('[data-suggestion-item]').filter({hasText:'修改前：原文'}).click();await expect(page.locator('#doc p:not(.deleted)').nth(1)).not.toHaveClass(/suggestion-target/);await expect(page.locator('#doc p:not(.deleted)').nth(2)).toHaveClass(/suggestion-target/);
});

test('all markup shows inline red deletions and blue insertions while simple keeps cards and black text',async({page})=>{
 const gh=createFakeGithub(),d=gh.read(),base='<h2>需求條件</h2><p>能獨立規劃測試。</p><p>主動溝通風險。</p>';d.versions['v0.7'].html=base;gh.write('documents/qa-senior-game-qa/document.json',d);await setup(page,{gh});
 await collab(gh,'/suggestions/create',{baseVersion:'v0.7',baseHash:await hashContent(trustedContent(base)),proposedHtml:'<h2>需求條件</h2><p>能獨立規劃Test Case。</p>'},TEST_TOKEN);
 await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 S001'}).click();const deletions=page.locator('#doc .deleted'),insertions=page.locator('#doc .changed');await expect(deletions).toHaveCount(2);
 for(const mark of await deletions.all()){await expect(mark).toBeVisible();await expect(mark).toHaveCSS('color','rgb(185, 28, 28)');await expect(mark).toHaveCSS('text-decoration-line','line-through');}
 await expect(insertions).toHaveCSS('color','rgb(29, 78, 216)');await expect(insertions).toHaveCSS('text-decoration-line','underline');const source=JSON.stringify(gh.read());
 await page.locator('[data-suggestion-item]').last().click();await page.locator('#toggleChanges').click();for(const mark of await deletions.all())await expect(mark).toBeHidden();await expect(insertions).toHaveCSS('color','rgb(31, 31, 31)');await expect(insertions).toHaveCSS('text-decoration-line','none');await expect(page.locator('#doc p:not(.deleted)').first()).toHaveCSS('border-left-color','rgb(185, 28, 28)');await expect(page.locator('[data-suggestion-item]')).toHaveCount(2);await expect(page.locator('#suggestionPanel')).toBeVisible();
 await page.locator('#toggleChanges').click();for(const mark of await deletions.all())await expect(mark).toBeVisible();await expect(insertions).toHaveCSS('color','rgb(29, 78, 216)');await expect(page.locator('[data-suggestion-item]')).toHaveCount(2);
 expect((await collab(gh,'/suggestions/get',{id:'S001'})).body.items.every(i=>i.decision==='pending')).toBe(true);
 expect(JSON.stringify(gh.read())).toBe(source);await page.emulateMedia({media:'print'});for(const mark of await deletions.all())await expect(mark).toBeHidden();
});

test('simple markup keeps a side red line for a whole paragraph deletion',async({page})=>{
 const gh=createFakeGithub(),d=gh.read(),base='<p>保留內容</p><p>刪除整段</p>';d.versions['v0.7'].html=base;gh.write('documents/qa-senior-game-qa/document.json',d);await setup(page,{gh});
 await collab(gh,'/suggestions/create',{baseVersion:'v0.7',baseHash:await hashContent(trustedContent(base)),proposedHtml:'<p>保留內容</p>'},TEST_TOKEN);await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 S001'}).click();await page.locator('#toggleChanges').click();
 await expect(page.locator('#doc .deleted')).toBeHidden();await expect(page.locator('#doc p:not(.deleted)')).toHaveCSS('border-left-width','3px');await expect(page.locator('#doc p:not(.deleted)')).toHaveCSS('border-left-color','rgb(185, 28, 28)');await expect(page.locator('#doc p:not(.deleted)')).toHaveCSS('color','rgb(31, 31, 31)');
});
