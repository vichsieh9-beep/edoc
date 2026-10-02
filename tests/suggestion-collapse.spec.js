import {test,expect} from '@playwright/test';
import {setup,collab} from './collaboration-browser.js';
import {TEST_TOKEN,createFakeGithub} from './fake-github.js';
import {hashContent,trustedContent} from '../worker/src/content.js';
const BASE='<p>原甲</p><p>原乙</p><p>原丙</p>',PROPOSED='<p>新甲</p><p>新乙</p><p>新丙</p>';
const cards=page=>page.locator('[data-suggestion-item]');
const markers=page=>page.locator('#revisionNavigation button');
async function fixture(page,{base=BASE,proposed=PROPOSED,decided=false}={}){
 const gh=createFakeGithub(),doc=gh.read();doc.versions['v0.7'].html=base;gh.write('documents/qa-senior-game-qa/document.json',doc);await setup(page,{gh});
 let s=(await collab(gh,'/suggestions/create',{baseVersion:'v0.7',baseHash:await hashContent(trustedContent(base)),proposedHtml:proposed},TEST_TOKEN)).body;
 if(decided){await collab(gh,'/suggestions/decide',{id:s.id,itemIds:[s.items[0].id],decision:'adopt',expectedRevision:s.revision});s=(await collab(gh,'/suggestions/get',{id:s.id})).body;await collab(gh,'/suggestions/decide',{id:s.id,itemIds:[s.items[1].id],decision:'decline',expectedRevision:s.revision});}
 await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 '+s.id,exact:true}).click();return {gh,s};
}
test('saved decisions are visible on aligned body numbers; selection retains their status',async({page})=>{
 await fixture(page,{decided:true});
 for(const [index,decision,label,symbol]of [[0,'adopt','Vic 已採納','✓'],[1,'decline','Vic 已不採納','×'],[2,'pending','待討論','▴']]){
  const marker=markers(page).nth(index);await expect(marker).toHaveAttribute('data-decision',decision);await expect(marker).toHaveAttribute('title',new RegExp(label));await expect(marker).toHaveAccessibleName(new RegExp(label));
  expect(await marker.evaluate(n=>getComputedStyle(n,'::after').content)).toContain(symbol);
 }
 const before=await markers(page).first().evaluate(n=>getComputedStyle(n).backgroundColor);await markers(page).first().click();await expect(markers(page).first()).toHaveAttribute('aria-pressed','true');
 expect(await markers(page).first().evaluate(n=>getComputedStyle(n).backgroundColor)).toBe(before);
 const geometry=await markers(page).evaluateAll(nodes=>nodes.map(n=>({x:n.getBoundingClientRect().left,w:n.getBoundingClientRect().width})));
 expect(new Set(geometry.map(r=>r.x)).size).toBe(1);expect(new Set(geometry.map(r=>r.w)).size).toBe(1);
 await page.locator('#toggleChanges').click();await expect(markers(page).nth(1)).toHaveAttribute('data-decision','decline');
 await page.getByLabel('顯示項目').selectOption('pending');await expect(markers(page).first()).toHaveAccessibleName(/Vic 已採納/);
});
test('successful decision folds its card; number and keyboard header reopen it; resetting unfolds without losing history',async({page})=>{
 const {gh,s}=await fixture(page),formal=JSON.stringify(gh.read().versions),before=(await collab(gh,'/suggestions/get',{id:s.id})).body;
 const first=cards(page).first();await expect(first.locator('.suggestion-card-toggle')).toHaveAttribute('aria-expanded','true');await first.getByRole('button',{name:'不採納',exact:true}).click();
 await expect(first.locator('.suggestion-card-toggle')).toHaveAttribute('aria-expanded','false');await expect(first.getByRole('button',{name:'改回待討論',exact:true})).toBeHidden();await expect(first.locator('.suggestion-card-excerpt')).toHaveText('新甲');
 await first.locator('.suggestion-card-toggle').press('Enter');await expect(first.locator('.suggestion-card-toggle')).toHaveAttribute('aria-expanded','true');await expect(first.locator('.suggestion-before')).toHaveText('原甲');
 await first.getByRole('button',{name:'不採納',exact:true}).click();await expect(first.locator('.suggestion-card-toggle')).toHaveAttribute('aria-expanded','false');await first.locator('.suggestion-card-toggle').click();
 await first.locator('.suggestion-card-toggle').click();await expect(first.locator('.suggestion-card-toggle')).toHaveAttribute('aria-expanded','false');await markers(page).first().click();await expect(first.locator('.suggestion-card-toggle')).toHaveAttribute('aria-expanded','true');
 await first.getByRole('button',{name:'改回待討論',exact:true}).click();await expect(first.locator('.suggestion-card-toggle')).toHaveAttribute('aria-expanded','true');await expect(markers(page).first()).toHaveAttribute('data-decision','pending');
 const after=(await collab(gh,'/suggestions/get',{id:s.id})).body;
 expect(after.items.map(i=>[i.id,i.before,i.after])).toEqual(before.items.map(i=>[i.id,i.before,i.after]));expect(JSON.stringify(gh.read().versions)).toBe(formal);
 await page.locator('.suggestion-more>summary').click();await page.getByRole('button',{name:'完整歷程',exact:true}).click();await expect(page.locator('#suggestionHistory')).toContainText('Vic');await expect(page.locator('#suggestionHistory')).toContainText('不採納');
});
test('pending and failed requests leave the card expanded and status unchanged until a successful save',async({page})=>{
 const {gh,s}=await fixture(page);let release;const gate=new Promise(resolve=>release=resolve);
 await page.route('**/suggestions/decide',async route=>{await gate;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'unavailable',message:'暫時無法儲存'})});});
 const first=cards(page).first();await first.getByRole('button',{name:'採納',exact:true}).click();await expect(first.getByRole('button',{name:'採納',exact:true})).toBeDisabled();
 await expect(first.locator('.suggestion-card-toggle')).toHaveAttribute('aria-expanded','true');await expect(markers(page).first()).toHaveAttribute('data-decision','pending');release();
 await expect(page.locator('#notice')).toContainText('暫時無法儲存');await expect(first.getByRole('button',{name:'採納',exact:true})).toBeEnabled();await expect(first.locator('.suggestion-card-toggle')).toHaveAttribute('aria-expanded','true');
 expect((await collab(gh,'/suggestions/get',{id:s.id})).body.items[0].decision).toBe('pending');await page.unroute('**/suggestions/decide');
 await first.getByRole('button',{name:'採納',exact:true}).click();await expect(first.locator('.suggestion-card-toggle')).toHaveAttribute('aria-expanded','false');await expect(markers(page).first()).toHaveAttribute('data-decision','adopt');
});
test('handled cards default folded on reopen; filtered marker reveals its card without renumbering',async({page})=>{
 await fixture(page,{decided:true});await expect(cards(page).first().locator('.suggestion-card-toggle')).toHaveAttribute('aria-expanded','false');await expect(cards(page).nth(1).locator('.suggestion-card-toggle')).toHaveAttribute('aria-expanded','false');await expect(cards(page).last().locator('.suggestion-card-toggle')).toHaveAttribute('aria-expanded','true');
 await markers(page).first().click();await expect(cards(page).first().locator('.suggestion-card-toggle')).toHaveAttribute('aria-expanded','true');await page.getByLabel('顯示項目').selectOption('pending');await expect(cards(page)).toHaveCount(1);
 await markers(page).nth(1).click();await expect(page.getByLabel('顯示項目')).toHaveValue('all');await expect(cards(page).nth(1).locator('.suggestion-card-toggle')).toHaveAttribute('aria-expanded','true');await expect(cards(page).nth(1)).toHaveAttribute('data-revision-number','02');
 await markers(page).first().click();await cards(page).last().getByRole('button',{name:'採納',exact:true}).click();await expect(cards(page).first().locator('.suggestion-card-toggle')).toHaveAttribute('aria-expanded','true');
 await page.getByRole('button',{name:'返回正式版',exact:true}).click();await page.getByRole('button',{name:'確認返回',exact:true}).click();await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 S001',exact:true}).click();await expect(cards(page).first().locator('.suggestion-card-toggle')).toHaveAttribute('aria-expanded','false');
 await page.reload();await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 S001',exact:true}).click();await expect(cards(page).nth(1).locator('.suggestion-card-toggle')).toHaveAttribute('aria-expanded','false');
});
test('folding a reviewed card in a long panel keeps its screen anchor and keyboard focus',async({page})=>{
 const base=Array.from({length:20},(_,i)=>'<p>原條文'+i+' '+('合約說明'.repeat(8))+'</p>').join(''),proposed=base.replaceAll('原條文','新條文');await fixture(page,{base,proposed});
 let release;const gate=new Promise(resolve=>release=resolve);await page.route('**/suggestions/decide',async route=>{await gate;await route.fallback();});
 const card=cards(page).nth(10);await card.getByRole('button',{name:'採納',exact:true}).click();await expect(card.getByRole('button',{name:'採納',exact:true})).toBeDisabled();
 const before=await card.evaluate(n=>n.getBoundingClientRect().top);release();await expect(card.locator('.suggestion-card-toggle')).toHaveAttribute('aria-expanded','false');
 const after=await card.evaluate(n=>n.getBoundingClientRect().top);expect(Math.abs(after-before)).toBeLessThan(2);await expect(card.locator('.suggestion-card-toggle')).toBeFocused();
});
test('narrow folded rows show deletion source or proposed prefix on one line with complete content still accessible',async({page})=>{
 await page.setViewportSize({width:390,height:844});const long='完整合約內容'.repeat(50),other='履約說明'.repeat(50),base='<p>保留條文</p><p>原條文'+other+'</p><p>刪除來源'+long+'</p>',proposed='<p>保留條文</p><p>修正內容'+other+'</p>';
 await fixture(page,{base,proposed,decided:true});await expect(cards(page)).toHaveCount(2);
 for(let i=0;i<2;i++){const card=cards(page).nth(i);await expect(card.locator('.suggestion-card-toggle')).toHaveAttribute('aria-expanded','false');const geometry=await card.locator('.suggestion-card-excerpt').evaluate(n=>({height:n.getBoundingClientRect().height,line:parseFloat(getComputedStyle(n).lineHeight),overflow:n.scrollWidth>n.clientWidth}));expect(geometry.height).toBeLessThanOrEqual(geometry.line+1);expect(geometry.overflow).toBe(true);}
 await expect(cards(page).nth(1).locator('.suggestion-card-excerpt')).toContainText('刪除來源');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await cards(page).nth(1).locator('.suggestion-card-toggle').click();await expect(cards(page).nth(1).locator('.suggestion-before')).toContainText(long);await expect(cards(page).nth(1).locator('.suggestion-after')).toHaveText('無（刪除內容）');
});
