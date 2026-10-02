import {test,expect} from '@playwright/test';
import {setup,collab} from './collaboration-browser.js';
import {createFakeGithub,TEST_TOKEN} from './fake-github.js';
import {hashContent,trustedContent} from '../worker/src/content.js';
const BASE='<h2>需求條件</h2><p>具遊戲測試經驗。</p><p>能獨立規劃測試。</p><p>主動溝通風險。</p>';
const PROPOSED=BASE.replace('具遊戲','具手機遊戲').replace('規劃測試','規劃測試案例').replace('主動','積極');
const card=(page,index=0)=>page.locator('[data-suggestion-item]').nth(index);
async function fixture(page,{token,onResponse}={}){
 const gh=createFakeGithub(),doc=gh.read();doc.versions['v0.7'].html=BASE;gh.write('documents/qa-senior-game-qa/document.json',doc);
 await setup(page,{gh,token,onResponse});const s=(await collab(gh,'/suggestions/create',{baseVersion:'v0.7',baseHash:await hashContent(trustedContent(BASE)),proposedHtml:PROPOSED},TEST_TOKEN)).body;
 await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 '+s.id,exact:true}).click();return {gh,s};
}
async function openNotes(page,index=0){const notes=card(page,index).locator('.suggestion-notes');await expect(notes).toBeAttached();if(!await notes.evaluate(n=>n.open))await notes.locator('summary').click();return notes;}
async function addNote(page,index,text){const notes=await openNotes(page,index);await notes.getByLabel('新增備註').fill(text);await notes.getByRole('button',{name:'儲存備註',exact:true}).click();await expect(notes.getByLabel('新增備註')).toHaveValue('');return notes;}
async function more(page){await page.locator('.suggestion-more>summary').click();}
// Catch a lost decision color or status icon after selecting a number/card.
test('status colors distinguish decisions on both sides; secondary actions and old comments are tucked away',async({page})=>{
 const {gh,s}=await fixture(page);await collab(gh,'/suggestions/comment',{id:s.id,text:'原整份討論保留'});
 await card(page).getByRole('button',{name:'採納',exact:true}).click();await card(page,1).getByRole('button',{name:'不採納',exact:true}).click();
 for(const [index,color,symbol]of [[0,'rgb(240, 253, 244)','✓'],[1,'rgb(254, 242, 242)','×'],[2,'rgb(239, 246, 255)','▴']]){
  const mark=page.locator('#revisionNavigation button').nth(index);await expect(mark).toHaveCSS('background-color',color);await expect.poll(()=>mark.evaluate(n=>getComputedStyle(n,'::after').content)).toContain(symbol);
  await mark.click();await expect(mark).toHaveCSS('background-color',color);await expect(card(page,index).locator('.revision-number')).toHaveCSS('background-color',color);
 }
 await expect(page.getByLabel('討論內容',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'預覽採納內容',exact:true})).toHaveCount(0);
 for(const name of ['完整歷程','重新比較並建立草稿','撤回修訂建議'])await expect(page.getByRole('button',{name,exact:true})).toBeHidden();
 await more(page);await page.getByRole('button',{name:'完整歷程',exact:true}).click();await expect(page.locator('#suggestionHistory')).toContainText('原整份討論保留');await expect(page.locator('#suggestionHistory')).toContainText('Vic');
});
// Catch incorrect item binding, note markup execution, or coupling note expansion to the change body.
test('item notes persist with names, stay independent of card folding and never enter formal content',async({page})=>{
 const {gh,s}=await fixture(page),formal=JSON.stringify(gh.read().versions);const note='不採納：需保留風險溝通。\n<img src=x onerror="window.noteExecuted=true">';
 const notes=await addNote(page,1,note);await expect(notes).toContainText('Vic');await expect(notes).toContainText('不採納：需保留風險溝通。');expect(await page.evaluate(()=>window.noteExecuted)).toBeUndefined();await expect(notes.locator('img')).toHaveCount(0);
 await card(page,1).getByRole('button',{name:'不採納',exact:true}).click();await expect(card(page,1).locator('.suggestion-card-toggle')).toHaveAttribute('aria-expanded','false');await expect(notes).toHaveAttribute('open','');
 await notes.locator('summary').click();await expect(notes.getByLabel('新增備註')).toBeHidden();await expect(card(page,1).locator('.suggestion-card-toggle')).toHaveAttribute('aria-expanded','false');
 await page.locator('#revisionNavigation button').nth(1).click();await expect(notes.getByLabel('新增備註')).toBeHidden();
 const history=(await collab(gh,'/suggestions/history',{id:s.id})).body.events;const event=history.find(e=>e.note===note);expect(event.itemIds).toEqual([s.items[1].id]);expect(event.actorSnapshot.name).toBe('Vic');expect(JSON.stringify(gh.read().versions)).toBe(formal);
 await page.reload();await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 '+s.id,exact:true}).click();await expect(card(page,1).locator('.suggestion-notes summary')).toContainText('1');await expect(card(page).locator('.suggestion-notes summary')).toContainText('0');await expect(await openNotes(page,1)).toContainText(note);
});
// Catch draft loss on render/filter and a duplicated comment after an uncertain network response.
test('failed note response preserves draft across filtering and decisions; retry appends only one event',async({page})=>{
 let drop=true;const ids=[];const {gh,s}=await fixture(page,{onResponse:async(route)=>{if(route.request().url().endsWith('/suggestions/comment')){ids.push(JSON.parse(route.request().postData()).requestId);if(drop){drop=false;await route.abort();return false;}}}});
 const notes=await openNotes(page);await notes.getByLabel('新增備註').fill('待討論：確認測試範圍');await notes.getByRole('button',{name:'儲存備註',exact:true}).click();await expect(page.locator('#notice')).toBeVisible();await expect(notes.getByLabel('新增備註')).toHaveValue('待討論：確認測試範圍');
 await card(page).getByRole('button',{name:'不採納',exact:true}).click();await page.getByLabel('顯示項目').selectOption('pending');await page.getByLabel('顯示項目').selectOption('all');
 await expect(card(page).locator('.suggestion-notes').getByLabel('新增備註')).toHaveValue('待討論：確認測試範圍');await card(page).locator('.suggestion-notes').getByRole('button',{name:'儲存備註',exact:true}).click();await expect(card(page).locator('.suggestion-notes').getByLabel('新增備註')).toHaveValue('');
 const events=(await collab(gh,'/suggestions/history',{id:s.id})).body.events.filter(e=>e.action==='suggestion.comment');expect(events).toHaveLength(1);expect(events[0].itemIds).toEqual([s.items[0].id]);expect(ids).toHaveLength(2);expect(ids[0]).toBe(ids[1]);
});
// Catch accidental immediate publication, pending adoption, or lost rejection/history after publication.
test('header publication previews selected adoption and retains declined pending and item notes',async({page})=>{
 const {gh,s}=await fixture(page),old=JSON.stringify(gh.read().versions);const publish=page.locator('#publishSuggestionBtn');await expect(publish).toBeVisible();await expect(publish).toBeDisabled();
 await addNote(page,1,'不採納：本輪維持原規劃。');await card(page).getByRole('button',{name:'採納',exact:true}).click();await card(page,1).getByRole('button',{name:'不採納',exact:true}).click();await expect(publish).toBeEnabled();await publish.click();
 const dialog=page.getByRole('dialog',{name:'發布新版'});await expect(dialog).toBeVisible();await expect(page.locator('#publicationPreview')).toContainText('採納 1');await expect(page.locator('#publicationPreview')).toContainText('不採納 1');await expect(page.locator('#publicationPreview')).toContainText('待討論 1');await expect(page.locator('.preview-document')).toContainText('具手機遊戲');await expect(page.locator('.preview-document')).toContainText('主動溝通');expect(JSON.stringify(gh.read().versions)).toBe(old);
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.locator('#stateChip')).toHaveText('修訂建議・唯讀');await expect(publish).toBeEnabled();await publish.click();await page.getByRole('button',{name:'確認並發布',exact:true}).click();await expect(page.locator('#versionLabel')).toContainText('v0.8');await expect(dialog).toHaveCount(0);
 expect(trustedContent(gh.read().versions['v0.8'].html).replace(/<\/?span>/g,'')).toBe(BASE.replace('具遊戲','具手機遊戲'));expect(gh.read().versions['v0.8'].html).not.toContain('本輪維持');expect(JSON.stringify(Object.fromEntries(Object.entries(gh.read().versions).filter(([v])=>v!=='v0.8')))).toBe(old);
 const saved=(await collab(gh,'/suggestions/get',{id:s.id})).body;expect(saved.items.map(i=>i.decision)).toEqual(['adopt','decline','pending']);expect(saved.items[0].publishedIn).toBe('v0.8');expect((await collab(gh,'/suggestions/history',{id:s.id})).body.events.some(e=>e.note==='不採納：本輪維持原規劃。')).toBe(true);
});
// Catch leaked publish controls and loss of named member commenting.
test('proposer can leave named item notes but never sees publisher controls',async({page})=>{
 const {gh,s}=await fixture(page,{token:TEST_TOKEN});await expect(page.locator('#publishSuggestionBtn')).toBeHidden();await expect(card(page).getByRole('button',{name:'採納',exact:true})).toHaveCount(0);
 await expect(await addNote(page,2,'待討論：請確認風險範圍。')).toContainText('客戶法務');const events=(await collab(gh,'/suggestions/history',{id:s.id})).body.events;expect(events.find(e=>e.note==='待討論：請確認風險範圍。').itemIds).toEqual([s.items[2].id]);
});
// Catch horizontal overflow and a publish action lost below a long review rail.
test('long notes collapse independently at narrow width and header action remains visible while scrolling',async({page})=>{
 await page.setViewportSize({width:390,height:844});await fixture(page);const long='不同意原因與待討論事項'.repeat(80)+' longword'.repeat(10);const notes=await addNote(page,1,long);await expect(notes).toContainText(long);await card(page,1).getByRole('button',{name:'不採納',exact:true}).click();await expect(card(page,1).locator('.suggestion-card-details')).toBeHidden();await expect(notes).toHaveAttribute('open','');await notes.locator('summary').click();await expect(notes.locator('.suggestion-note-entry')).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await card(page).getByRole('button',{name:'採納',exact:true}).click();await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));const box=await page.locator('#publishSuggestionBtn').boundingBox();expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThan(844);await page.locator('#publishSuggestionBtn').click();await expect(page.getByRole('dialog',{name:'發布新版'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
