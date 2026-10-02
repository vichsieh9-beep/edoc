import {test,expect} from '@playwright/test';
import {setup,collab} from './collaboration-browser.js';
import {createFakeGithub,TEST_TOKEN} from './fake-github.js';
import {hashContent,trustedContent} from '../worker/src/content.js';
const BASE='<p>測試經驗。</p><p>主動溝通風險。</p>',PROPOSED='<p>遊戲測試經驗。</p>';
async function fixture(page){const gh=createFakeGithub(),d=gh.read();d.versions['v0.7'].html=BASE;gh.write('documents/qa-senior-game-qa/document.json',d);await setup(page,{gh});const s=(await collab(gh,'/suggestions/create',{baseVersion:'v0.7',baseHash:await hashContent(trustedContent(BASE)),proposedHtml:PROPOSED},TEST_TOKEN)).body;await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 '+s.id,exact:true}).click();return {gh,s};}
test('switching markup modes clears both revision selections and focus rectangles without changing decisions',async({page})=>{
 const {gh,s}=await fixture(page);
 for(let n=0;n<2;n++){
  await page.locator('#revisionNavigation button').first().click();await expect(page.locator('.revision-focus')).toBeVisible();await page.locator('#toggleChanges').click();
  await expect(page.locator('.revision-focus')).toBeHidden();await expect(page.locator('#revisionNavigation [aria-pressed=true]')).toHaveCount(0);await expect(page.locator('.suggestion-item.selected,#doc .suggestion-target')).toHaveCount(0);
 }
 expect((await collab(gh,'/suggestions/get',{id:s.id})).body.items.map(i=>i.decision)).toEqual(['pending','pending']);
});
test('status filter remains usable without the inert display-items caption; full history toggles closed',async({page})=>{
 await fixture(page);await expect(page.getByText('顯示項目',{exact:true})).toHaveCount(0);await page.getByLabel('顯示項目').selectOption('decline');await expect(page.locator('[data-suggestion-item]')).toHaveCount(0);await page.getByLabel('顯示項目').selectOption('all');await expect(page.locator('[data-suggestion-item]')).toHaveCount(2);
 await page.locator('.suggestion-more>summary').click();const button=page.getByRole('button',{name:'完整歷程',exact:true});await button.click();await expect(page.locator('#suggestionHistory')).toContainText('提出修訂建議');await expect(button).toHaveAttribute('aria-expanded','true');await button.click();await expect(page.locator('#suggestionHistory')).toBeHidden();await expect(button).toHaveAttribute('aria-expanded','false');await button.click();await expect(page.locator('#suggestionHistory')).toBeVisible();
});
test('return requires confirmation and preserves submitted changes, decisions, notes and local note draft',async({page})=>{
 const {gh,s}=await fixture(page);const first=page.locator('[data-suggestion-item]').first();await first.getByRole('button',{name:'不採納',exact:true}).click();await first.locator('.suggestion-notes>summary').click();await first.getByLabel('新增備註').fill('尚未儲存的說明');
 const before=(await collab(gh,'/suggestions/get',{id:s.id})).body;
 await page.getByRole('button',{name:'返回正式版',exact:true}).click();const dialog=page.getByRole('dialog',{name:'返回正式版？',exact:true});await expect(dialog).toBeVisible();await expect(dialog).toContainText('不會刪除');await expect(dialog).toContainText('未儲存');await dialog.getByRole('button',{name:'繼續檢視',exact:true}).click();await expect(page.locator('#versionLabel')).toContainText(s.id);await expect(first.getByLabel('新增備註')).toHaveValue('尚未儲存的說明');
 await page.getByRole('button',{name:'返回正式版',exact:true}).click();await dialog.getByRole('button',{name:'確認返回',exact:true}).click();await expect(page.locator('#versionLabel')).toContainText('v0.7');
 expect((await collab(gh,'/suggestions/get',{id:s.id})).body).toEqual(before);
 await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 '+s.id,exact:true}).click();await expect(first.locator('.suggestion-card-decision')).toHaveText('不採納');await expect(first.getByLabel('新增備註')).toHaveValue('尚未儲存的說明');
});
