import {test,expect} from '@playwright/test';
import {openDoc,startRevision,selectText,acceptRevision} from './helpers.js';
import {createFakeGithub,TEST_TOKEN} from './fake-github.js';
import {setup,collab} from './collaboration-browser.js';
import {trustedContent,hashContent} from '../worker/src/content.js';

const BASE='<h1>測試</h1><p>具遊戲測試經驗。</p><p>能規劃測試。</p><p>清楚回報問題。</p><p>主動溝通風險。</p>';
const markers=page=>page.locator('#revisionNavigation .revision-number');
const cards=page=>page.locator('#revisionMarkup .markup-card');
async function fixture(page,html=BASE){
 const gh=createFakeGithub(),data=gh.read();data.versions['v0.7'].html=html;gh.write('documents/qa-senior-game-qa/document.json',data);
 await page.route(url=>url.pathname.endsWith('/documents/qa-senior-game-qa/'),async route=>{
  const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace(/(<script id="versionData" type="application\/json">)[\s\S]*?(<\/script>)/,(_,a,b)=>a+JSON.stringify(data.versions)+b)});
 });
 await setup(page,{gh});return gh;
}
async function editThree(page){
 await startRevision(page);
 await selectText(page,'具遊戲');await page.keyboard.insertText('具手機遊戲');
 await selectText(page,'能規劃測試。');await page.keyboard.insertText('能規劃測試案例。');
 await selectText(page,'主動溝通風險。');await page.keyboard.press('Backspace');
 await expect(cards(page)).toHaveCount(3);
}
async function selected(page,number){
 await expect(page.locator('#revisionMarkup [data-revision-number].selected')).toHaveAttribute('data-revision-number',number);
 await expect(markers(page).filter({hasText:new RegExp('^'+number+'$')})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#revisionNavigation .revision-focus')).toHaveAttribute('data-active-revision-number',number);
}

test('draft matching numbers select both sides and preserve caret, numbering and clean saved content',async({page})=>{
 await fixture(page);await editThree(page);
 await expect(markers(page)).toHaveText(['01','02','03']);
 await expect(cards(page).locator('.revision-number')).toHaveText(['01','02','03']);
 await cards(page).nth(1).click();await selected(page,'02');
 await markers(page).first().click();await selected(page,'01');
 // A pointer click on either navigation surface must not steal the editor's insertion point.
 await selectText(page,'案例');await page.keyboard.insertText('案例B');
 await cards(page).first().click();await page.keyboard.insertText('持續');
 await expect.poll(()=>page.evaluate(()=>EDoc.cleanSnapshot(document.querySelector('#doc').innerHTML))).toContain('案例B持續');
 await page.keyboard.press('ControlOrMeta+z');
 await expect.poll(()=>page.evaluate(()=>EDoc.cleanSnapshot(document.querySelector('#doc').innerHTML))).not.toContain('持續');
 // WebKit may coalesce earlier typing into the same native undo group.
 // If that also reverts the selected revision, selection correctly clears.
 const selectedStillChanged=(await page.locator('#doc').innerText()).includes('手機');
 await page.keyboard.press('ControlOrMeta+Shift+z');
 await expect.poll(()=>page.evaluate(()=>EDoc.cleanSnapshot(document.querySelector('#doc').innerHTML))).toContain('持續');
 if(selectedStillChanged)await selected(page,'01');
 else {await expect(page.locator('#revisionNavigation .revision-focus')).toBeHidden();await markers(page).first().click();await selected(page,'01');}
});

test('identical paragraphs keep distinct numbered targets, including keyboard navigation',async({page})=>{
 await fixture(page,'<h1>測試</h1><p>具遊戲測試經驗。</p><p>具遊戲測試經驗。</p>');await startRevision(page);
 await page.evaluate(()=>{
  document.querySelectorAll('#doc p').forEach(p=>p.textContent='具手機遊戲測試經驗。');document.querySelector('#doc').dispatchEvent(new InputEvent('input',{bubbles:true}));
 });
 await expect(markers(page)).toHaveText(['01','02']);
 await cards(page).nth(1).click();await selected(page,'02');
 const top=await page.locator('#doc p').nth(1).evaluate(p=>p.getBoundingClientRect().top);
 const selectedTop=await page.locator('#revisionNavigation .revision-focus').evaluate(p=>p.getBoundingClientRect().top);
 expect(Math.abs(top-selectedTop)).toBeLessThan(8);
 await markers(page).first().focus();await page.keyboard.press('Enter');await selected(page,'01');
});

test('deleted duplicate keeps selection when an identical preceding modification is reverted',async({page})=>{
 await fixture(page,'<h1>測試</h1><h2>第一類</h2><p>具遊戲測試經驗。</p><h2>第二類</h2><p>具遊戲測試經驗。</p><p>後段</p>');await startRevision(page);
 await page.evaluate(()=>{
  const doc=document.querySelector('#doc'),paragraphs=doc.querySelectorAll('p');paragraphs[0].textContent='具手機遊戲測試經驗。';paragraphs[1].remove();doc.dispatchEvent(new InputEvent('input',{bubbles:true}));
 });
 await expect(cards(page)).toHaveCount(2);await cards(page).filter({hasText:'刪除：'}).click();
 await selectText(page,'手機');await page.keyboard.press('Backspace');await expect(cards(page)).toHaveCount(1);
 await selected(page,'01');await expect(cards(page).first()).toContainText('刪除：具遊戲測試經驗。');
});

test('consecutive deleted paragraphs keep ascending numbers at the simple-markup gap',async({page})=>{
 await fixture(page,'<h1>測試</h1><p>前段</p><p>甲</p><p>乙</p><p>丙</p><p>後段</p>');await startRevision(page);
 await page.evaluate(()=>{const doc=document.querySelector('#doc');[...doc.querySelectorAll('p')].slice(1,4).forEach(p=>p.remove());doc.dispatchEvent(new InputEvent('input',{bubbles:true}));});
 await expect(markers(page)).toHaveText(['01','02','03']);await page.locator('#toggleChanges').click();
 const tops=await markers(page).evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));
 expect(tops[0]).toBeLessThan(tops[1]);expect(tops[1]).toBeLessThan(tops[2]);
 for(let i=0;i<3;i++){await markers(page).nth(i).click();await selected(page,String(i+1).padStart(2,'0'));await expect(page.locator('#revisionNavigation .revision-focus')).toHaveAttribute('data-gap','true');}
});

test('selection stays on the second identical deletion when the first is restored',async({page})=>{
 await fixture(page,'<h1>測試</h1><h2>第一類</h2><p>相同文字</p><h2>第二類</h2><p>相同文字</p><p>後段</p>');await startRevision(page);
 await page.evaluate(()=>{const doc=document.querySelector('#doc');[...doc.querySelectorAll('p')].slice(0,2).forEach(p=>p.remove());doc.dispatchEvent(new InputEvent('input',{bubbles:true}));});
 await expect(cards(page)).toHaveCount(2);await cards(page).last().click();await selected(page,'02');
 await page.evaluate(()=>{const doc=document.querySelector('#doc'),p=document.createElement('p');p.textContent='相同文字';doc.querySelectorAll('h2')[0].after(p);doc.dispatchEvent(new InputEvent('input',{bubbles:true}));});
 await expect(cards(page)).toHaveCount(1);await selected(page,'01');await expect(cards(page).first()).toContainText('第二類');
});

for(const media of ['hr','image'])test('added '+media+' and following edited paragraph have distinct numbered targets',async({page})=>{
 await fixture(page,'<h1>測試</h1><p>甲</p><p>乙</p>');await startRevision(page);
 await page.evaluate(kind=>{
  const doc=document.querySelector('#doc'),second=doc.querySelectorAll('p')[1],node=document.createElement(kind==='hr'?'hr':'p');
  if(kind==='image')node.innerHTML='<img src="/test-image.png" alt="新增圖片">';second.before(node);second.textContent='乙新增';doc.dispatchEvent(new InputEvent('input',{bubbles:true}));
 },media);
 await expect(cards(page)).toHaveCount(2);await expect(markers(page)).toHaveText(['01','02']);
 await expect(markers(page).first()).toBeVisible();await cards(page).first().click();await selected(page,'01');
 const delta=await page.evaluate(kind=>Math.abs(document.querySelector('#revisionNavigation .revision-focus').getBoundingClientRect().top-document.querySelector(kind==='hr'?'#doc hr':'#doc img').closest(kind==='hr'?'hr':'p').getBoundingClientRect().top),media);
 expect(delta).toBeLessThan(8);await cards(page).last().click();await selected(page,'02');
});

test('selection follows its paragraph when numbers change, clears when that revision is reverted',async({page})=>{
 await fixture(page);await editThree(page);await cards(page).nth(1).click();await selected(page,'02');
 await page.evaluate(()=>{
  const h=document.querySelector('#doc h1'),r=document.createRange();r.selectNodeContents(h);document.querySelector('#doc').focus();getSelection().removeAllRanges();getSelection().addRange(r);
 });
 await page.keyboard.insertText('職缺測試');
 await expect(markers(page)).toHaveText(['01','02','03','04']);await selected(page,'03');
 await selectText(page,'案例');await page.keyboard.press('Backspace');
 await expect(markers(page)).toHaveText(['01','02','03']);
 await expect(page.locator('#revisionMarkup .selected')).toHaveCount(0);
 await expect(page.locator('#revisionNavigation .revision-focus')).toBeHidden();
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('edoc-draft:'+JSON.parse(document.querySelector('#documentState').textContent).documentId))).toContain('職缺測試');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('edoc-draft:'+JSON.parse(document.querySelector('#documentState').textContent).documentId)).html);
 expect(saved).not.toContain('revision-number');expect(saved).not.toContain('revision-focus');expect(saved).not.toContain('data-revision-number');
 await expect(page.locator('#doc .revision-number')).toHaveCount(0);
});

test('simple markup retains deleted paragraph number at the gap and hides navigation in print',async({page})=>{
 await fixture(page);await editThree(page);await cards(page).last().click();await selected(page,'03');
 await page.locator('#toggleChanges').click();await expect(page.locator('#revisionNavigation .revision-focus')).toBeHidden();
 await expect(page.locator('#doc .draft-deletion')).toBeHidden();await expect(markers(page).last()).toBeVisible();
 await markers(page).last().click();await expect(page.locator('#revisionNavigation .revision-focus')).toHaveAttribute('data-gap','true');
 const rects=await page.evaluate(()=>({focus:document.querySelector('.revision-focus').getBoundingClientRect().toJSON(),unchanged:[...document.querySelectorAll('#doc p')].find(p=>p.textContent==='清楚回報問題。').getBoundingClientRect().toJSON()}));
 expect(rects.focus.top).toBeGreaterThanOrEqual(rects.unchanged.bottom);
 await page.locator('#toggleChanges').click();await expect(page.locator('#revisionNavigation .revision-focus')).toBeHidden();await expect(page.locator('#doc .draft-deletion')).toBeVisible();
 await page.emulateMedia({media:'print'});await expect(page.locator('#revisionNavigation')).toBeHidden();
});

test('formal comparison has bidirectional numbered cards without changing historical content',async({page})=>{
 const dialogs=await openDoc(page);await startRevision(page);await selectText(page,'初步');await page.keyboard.insertText('深入');await acceptRevision(page,'v0.8');
 const before=JSON.stringify(dialogs.gh.read());
 await expect(markers(page)).toHaveText(['01']);await cards(page).first().click();await selected(page,'01');
 await page.locator('#toggleChanges').click();await markers(page).first().click();await selected(page,'01');
 expect(JSON.stringify(dialogs.gh.read())).toBe(before);
 expect(dialogs.gh.read().versions['v0.8'].html).not.toContain('revision-number');
 await page.locator('#versionButton').click();await page.locator('#versionMenu .version-item').filter({hasText:/^v0\.7/}).click();
 await expect(page.locator('#revisionNavigation .revision-focus')).toBeHidden();
});

test('suggestion numbering survives decisions and filtering; hidden card reappears from its body number',async({page})=>{
 const gh=await fixture(page),base=trustedContent(BASE);
 const s=(await collab(gh,'/suggestions/create',{baseVersion:'v0.7',baseHash:await hashContent(base),proposedHtml:base.replace('具遊戲','具手機遊戲').replace('能規劃測試。','能規劃測試案例。').replace('<p>主動溝通風險。</p>','')},TEST_TOKEN)).body;
 await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 '+s.id}).click();
 await expect(markers(page)).toHaveText(['01','02','03']);
 const suggestions=page.locator('[data-suggestion-item]');await expect(suggestions.locator('.revision-number')).toHaveText(['01','02','03']);
 await suggestions.first().getByRole('button',{name:'採納',exact:true}).click();await selected(page,'01');
 await page.getByLabel('顯示項目').selectOption('pending');await expect(suggestions.locator('.revision-number')).toHaveText(['02','03']);
 await markers(page).first().click();await expect(page.getByLabel('顯示項目')).toHaveValue('all');await selected(page,'01');
 await page.locator('#toggleChanges').click();await markers(page).last().click();await selected(page,'03');
 await expect(page.locator('#revisionNavigation .revision-focus')).toHaveAttribute('data-gap','true');
 expect((await collab(gh,'/suggestions/get',{id:s.id})).body.items.map(i=>i.id)).toEqual(s.items.map(i=>i.id));
});

for(const width of [1280,390])for(const simple of [false,true])test('suggestion numbers share one gutter and preserve deleted source anchors at '+width+'px '+(simple?'simple':'all'),async({page})=>{
 await page.setViewportSize({width,height:900});
 const base='<h1>測試</h1><h2>需求條件</h2><p>具遊戲測試經驗。</p><p>能獨立規劃測試。</p><p>善用 AI 協作。</p><p>清楚回報問題。</p><p>主動溝通風險。</p>';
 const gh=await fixture(page,base),before=trustedContent(base);
 const proposed=before.replace('<p>具遊戲','<p>有帶過人</p><p>具遊戲').replace('<p>能獨立規劃測試。</p>','').replace('協作','作');
 const s=(await collab(gh,'/suggestions/create',{baseVersion:'v0.7',baseHash:await hashContent(before),proposedHtml:proposed},TEST_TOKEN)).body;
 expect(s.items).toHaveLength(3);const frozen=JSON.stringify(s.items);
 await page.locator('#suggestionsBtn').click();await page.getByRole('button',{name:'開啟 '+s.id}).click();
 if(simple)await page.locator('#toggleChanges').click();
 await expect(markers(page)).toHaveText(['01','02','03']);
 const rects=await markers(page).evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()));
 expect(Math.max(...rects.map(r=>r.left))-Math.min(...rects.map(r=>r.left))).toBeLessThan(1);
 if(!simple){
  const deleted=await page.locator('#doc p.deleted').filter({hasText:'能獨立規劃測試。'}).boundingBox();
  expect(Math.abs(rects[1].top-deleted.y)).toBeLessThan(8);
 }else{await markers(page).nth(1).click();await expect(page.locator('.revision-focus')).toHaveAttribute('data-gap','true');}
 await markers(page).last().click();await expect(page.locator('.revision-focus')).toHaveAttribute('data-gap','false');
 expect(JSON.stringify((await collab(gh,'/suggestions/get',{id:s.id})).body.items)).toBe(frozen);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('heading and multiline paragraph numbers align to their first line rather than the whole block',async({page})=>{
 await page.setViewportSize({width:900,height:1100});
 await fixture(page,'<h1>原標題</h1><p>'+('長段落內容'.repeat(35))+'</p>');await startRevision(page);
 await page.evaluate(()=>{const doc=document.querySelector('#doc');doc.querySelector('h1').textContent='新標題';doc.querySelector('p').append('新增');doc.dispatchEvent(new InputEvent('input',{bubbles:true}));});
 await expect(cards(page)).toHaveCount(2);
 const deltas=await page.evaluate(()=>[...document.querySelectorAll('#doc h1,#doc p:not(.draft-deletion)')].map((node,i)=>{
  const marker=document.querySelectorAll('#revisionNavigation .revision-number')[i].getBoundingClientRect(),r=node.getBoundingClientRect();return Math.abs(marker.top+marker.height/2-r.top-parseFloat(getComputedStyle(node).lineHeight)/2);
 }));
 for(const delta of deltas)expect(delta).toBeLessThan(1);
});
