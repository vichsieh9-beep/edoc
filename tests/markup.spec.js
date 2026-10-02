import { test, expect } from '@playwright/test';
import { openDoc, startRevision, selectText, acceptRevision } from './helpers.js';

const highlighted = page => page.evaluate(() => [...(CSS.highlights?.get('edoc-insertions') || [])].map(r => r.toString()).join(''));
async function openDraftFixture(page,html) {
  const {createFakeGithub,TEST_TOKEN}=await import('./fake-github.js');
  const {setup}=await import('./collaboration-browser.js');
  const gh=createFakeGithub(),data=gh.read();data.versions['v0.7'].html=html;
  gh.write('documents/qa-senior-game-qa/document.json',data);
  await page.route(url=>url.pathname.endsWith('/documents/qa-senior-game-qa/'),async route=>{
    const response=await route.fetch(),body=await response.text();
    await route.fulfill({response,body:body.replace(/(<script id="versionData" type="application\/json">)[\s\S]*?(<\/script>)/,(_,a,b)=>a+JSON.stringify(data.versions)+b)});
  });
  await setup(page,{gh,token:TEST_TOKEN});await startRevision(page);return gh;
}


test('draft replacements show inline deletions and preserve continued typing', async ({ page }) => {
  await openDoc(page);
  await startRevision(page);
  await selectText(page, '初步');
  await page.keyboard.insertText('深入');
  await expect(page.locator('#revisionMarkup .markup-deletion')).toHaveText(['初步']);
  await expect.poll(() => highlighted(page)).toBe('深入');
  await expect(page.locator('#doc .draft-deletion')).toHaveText('初步');
  await expect(page.locator('#doc .draft-deletion')).toBeVisible();
  await expect(page.locator('#doc .draft-deletion')).toHaveCSS('color','rgb(185, 28, 28)');
  await page.keyboard.insertText('有效');
  await expect.poll(() => highlighted(page)).toBe('深入有效');
  const html = await page.locator('#doc').innerHTML();
  await page.locator('#toggleChanges').click();
  await expect(page.locator('#revisionMarkup')).toBeVisible();
  expect(await page.locator('#doc').innerHTML()).toBe(html);
  await expect.poll(() => highlighted(page)).toBe('');
  await page.locator('#toggleChanges').click();
  await expect.poll(() => highlighted(page)).toBe('深入有效');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('edoc-draft:' + JSON.parse(document.querySelector('#documentState').textContent).documentId))).toContain('深入有效');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('edoc-draft:' + JSON.parse(document.querySelector('#documentState').textContent).documentId)).html)).not.toContain('draft-deletion');
  await page.reload();
  await expect(page.locator('#versionLabel')).toContainText('Draft');
  await expect.poll(() => highlighted(page)).toBe('深入有效');
  await acceptRevision(page, 'v0.8');
  await expect(page.locator('#doc .deleted')).toBeVisible();
  await expect(page.locator('#doc .deleted')).toHaveCSS('color','rgb(185, 28, 28)');
  await expect(page.locator('#doc .deleted')).toHaveCSS('text-decoration-line','line-through');
  await expect(page.locator('#revisionMarkup .markup-deletion')).toHaveText(['初步']);
  await expect(page.locator('#doc .changed')).toHaveCSS('text-decoration-line', 'underline');
});

test('reverting a draft edit clears revision cards and insertion highlights', async ({ page }) => {
  await openDoc(page); await startRevision(page);
  await selectText(page, '初步'); await page.keyboard.insertText('縝密');
  await expect(page.locator('#revisionMarkup .markup-deletion')).toHaveText(['初步']);
  await selectText(page, '縝密'); await page.keyboard.insertText('初步');
  await expect(page.locator('#revisionMarkup')).toContainText('沒有內容變更');
  await expect.poll(() => highlighted(page)).toBe('');
});

test('whole-block deletion appears inline in all markup, remains hidden in print', async ({ page }) => {
  await openDoc(page); await startRevision(page);
  const phrase='具良好的跨職能溝通能力，能與 PM、RD、Game Designer 等角色有效合作。';
  await selectText(page,phrase); await page.keyboard.press('Backspace');
  await expect(page.locator('#revisionMarkup .markup-deletion')).toContainText([phrase]);
  await expect(page.locator('#doc .draft-deletion')).toContainText(phrase);
  await expect(page.locator('#doc .draft-deletion')).toBeVisible();
  await expect(page.locator('#doc .draft-deletion')).toHaveCSS('text-decoration-line','line-through');
  await page.locator('#toggleChanges').click();
  await expect(page.locator('#doc .draft-deletion')).toBeHidden();
  await page.locator('#toggleChanges').click();
  await expect(page.locator('#doc .draft-deletion')).toBeVisible();
  await acceptRevision(page,'v0.8');
  await expect(page.locator('#doc .deleted')).toBeVisible();
  await page.locator('#toggleChanges').click();await expect(page.locator('#doc .deleted')).toBeHidden();await expect(page.locator('#revisionMarkup')).toBeVisible();await page.locator('#toggleChanges').click();await expect(page.locator('#doc .deleted')).toBeVisible();
  await page.emulateMedia({media:'print'});
  await expect(page.locator('#revisionMarkup')).toBeHidden();
  await expect(page.locator('#doc .deleted')).toBeHidden();
});

test('draft whole deleted paragraphs keep their original order and stay out of submitted content', async ({page})=>{
  const {createFakeGithub,TEST_TOKEN}=await import('./fake-github.js');
  const {setup,collab}=await import('./collaboration-browser.js');
  const gh=createFakeGithub(),data=gh.read();
  data.versions['v0.7'].html='<h1>測試</h1><p>第一句保留。</p><p>中間整句刪除。</p><p>第三句保留。</p><p>主動溝通風險。</p>';
  gh.write('documents/qa-senior-game-qa/document.json',data);
  await page.route(url=>url.pathname.endsWith('/documents/qa-senior-game-qa/'),async route=>{
    const response=await route.fetch(),html=await response.text();
    await route.fulfill({response,body:html.replace(/(<script id="versionData" type="application\/json">)[\s\S]*?(<\/script>)/,(_,a,b)=>a+JSON.stringify(data.versions)+b)});
  });
  await setup(page,{gh,token:TEST_TOKEN});await startRevision(page);
  await selectText(page,'中間整句刪除。');await page.keyboard.press('Backspace');
  await expect(page.locator('#doc .draft-deletion')).toHaveText('中間整句刪除。');
  await selectText(page,'主動溝通風險。');await page.keyboard.press('Backspace');
  await expect(page.locator('#doc .draft-deletion')).toHaveText(['中間整句刪除。','主動溝通風險。']);
  expect((await page.locator('#doc > p').allTextContents()).filter(Boolean)).toEqual(['第一句保留。','中間整句刪除。','第三句保留。','主動溝通風險。']);
  await page.locator('#toggleChanges').click();
  for(const ghost of await page.locator('#doc .draft-deletion').all()) await expect(ghost).toBeHidden();
  await expect(page.locator('#revisionMarkup .markup-deletion')).toHaveText(['中間整句刪除。','主動溝通風險。']);
  await page.locator('#toggleChanges').click();
  for(const ghost of await page.locator('#doc .draft-deletion').all()) await expect(ghost).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('edoc-draft:'+JSON.parse(document.querySelector('#documentState').textContent).documentId))).toContain('第三句保留');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('edoc-draft:'+JSON.parse(document.querySelector('#documentState').textContent).documentId)).html);
  expect(saved).not.toContain('draft-deletion');expect(saved).not.toContain('中間整句刪除');expect(saved).not.toContain('主動溝通風險');
  await page.reload();await expect(page.locator('#versionLabel')).toContainText('Draft');
  await expect(page.locator('#doc .draft-deletion')).toHaveText(['中間整句刪除。','主動溝通風險。']);
  await page.locator('#finishRevisionBtn').click();await expect(page.locator('#suggestionPanel')).toHaveText('S001');
  const s=(await collab(gh,'/suggestions/get',{id:'S001'})).body;
  expect(s.proposedHtml).toBe('<h1>測試</h1><p>第一句保留。</p><p></p><p>第三句保留。</p><p></p>');
  expect(s.proposedHtml).not.toContain('draft-deletion');expect(s.proposedHtml).not.toContain('中間整句刪除');expect(s.proposedHtml).not.toContain('主動溝通風險');
  expect(s.items).toHaveLength(2);expect(gh.read().latestVersion).toBe('v0.7');
});

test('draft whole deletion keeps native undo and redo',async({page})=>{
  await openDoc(page);await startRevision(page);
  const phrase='具良好的跨職能溝通能力，能與 PM、RD、Game Designer 等角色有效合作。';
  await selectText(page,phrase);await page.keyboard.press('Backspace');
  await expect(page.locator('#doc .draft-deletion')).toHaveText(phrase);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#revisionMarkup')).toContainText('沒有內容變更');
  await expect(page.locator('#doc .draft-deletion')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(page.locator('#doc .draft-deletion')).toHaveText(phrase);
});

for(const fixture of [
  {name:'whole list',base:'<h1>標題</h1><ul><li>刪除清單甲。</li><li>刪除清單乙。</li></ul><p>後文保留。</p>',draft:'<h1>標題</h1><p>後文保留。</p>',tag:'UL',words:'刪除清單甲。刪除清單乙。'},
  {name:'whole table row',base:'<h1>標題</h1><table><tbody><tr><td>刪除列甲。</td><td>刪除列乙。</td></tr><tr><td>儲存格保留。</td></tr></tbody></table>',draft:'<h1>標題</h1><table><tbody><tr><td>儲存格保留。</td></tr></tbody></table>',tag:'TR',words:'刪除列甲。刪除列乙。'},
  {name:'nested list depth',base:'<ul><li><ul><li>保留內層。</li></ul></li><li>刪除外層。</li></ul>',draft:'<ul><li><ul><li>保留內層。</li></ul></li></ul>',tag:'LI',words:'刪除外層。'},
  {name:'browser div paragraph order',base:'<h1>標題</h1><p>第一句保留。</p><p>中間刪除。</p><p>最後一句保留。</p>',draft:'<h1>標題</h1><div>第一句保留。</div><div>最後一句保留。</div>',tag:'P',words:'中間刪除。'},
])test('draft comparison positions '+fixture.name,async({page})=>{
  await openDoc(page);await startRevision(page);
  await page.evaluate(({base,draft})=>{
    EDoc.versions['v0.7'].html=base;
    const doc=document.querySelector('#doc');doc.innerHTML=draft;doc.dispatchEvent(new InputEvent('input',{bubbles:true}));
  },fixture);
  const ghost=page.locator('#doc .draft-deletion');await expect(ghost).toHaveText(fixture.words);
  await expect(ghost).toBeVisible();expect(await ghost.evaluate(n=>n.tagName)).toBe(fixture.tag);
  if(fixture.name.includes('depth')) expect(await ghost.evaluate(n=>n.parentElement===document.querySelector('#doc > ul'))).toBe(true);
  if(fixture.name.includes('order')) expect(await page.locator('#doc > *').allTextContents()).toEqual(['標題','第一句保留。','中間刪除。','最後一句保留。']);
  expect(await page.evaluate(()=>EDoc.cleanSnapshot(document.querySelector('#doc').innerHTML))).toBe(fixture.draft);
});

test('partial draft deletion preserves caret, native undo redo and IME',async({page})=>{
  await openDoc(page);await startRevision(page);
  await selectText(page,'初步');await page.keyboard.press('Backspace');
  await expect(page.locator('#doc .draft-deletion')).toHaveText('初步');
  await page.keyboard.insertText('深入');
  await expect.poll(()=>highlighted(page)).toBe('深入');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(()=>highlighted(page)).toBe('');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#revisionMarkup')).toContainText('沒有內容變更');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(page.locator('#doc .draft-deletion')).toHaveText('初步');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(()=>highlighted(page)).toBe('深入');
  await page.locator('#doc').dispatchEvent('compositionstart');
  await page.keyboard.insertText('中文');
  await page.locator('#doc').dispatchEvent('compositionend');
  await expect.poll(()=>highlighted(page)).toBe('深入中文');
  await expect(page.locator('#doc .draft-deletion')).toHaveText('初步');
});

test('mixed whole and partial deletions show together and never enter submitted wording',async({page})=>{
  const {collab}=await import('./collaboration-browser.js');
  const gh=await openDraftFixture(page,'<h1>測試</h1><p>善用 AI 協作。</p><p>清楚回報問題。</p><p>主動溝通風險。</p>');
  await selectText(page,'善用');await page.keyboard.press('Backspace');
  await expect(page.locator('#doc .draft-deletion')).toHaveText('善用');
  await selectText(page,'主動溝通風險。');await page.keyboard.press('Backspace');
  await expect(page.locator('#doc .draft-deletion')).toHaveText(['善用','主動溝通風險。']);
  for(const ghost of await page.locator('#doc .draft-deletion').all()){
    await expect(ghost).toBeVisible();await expect(ghost).toHaveCSS('text-decoration-line','line-through');
  }
  await page.locator('#toggleChanges').click();
  for(const ghost of await page.locator('#doc .draft-deletion').all())await expect(ghost).toBeHidden();
  await expect(page.locator('#revisionMarkup .markup-deletion')).toHaveText(['善用','主動溝通風險。']);
  await page.locator('#toggleChanges').click();
  await selectText(page,'AI');await page.keyboard.insertText('AI測試');
  await expect.poll(()=>highlighted(page)).toBe('測試');
  await expect(page.locator('#doc .draft-deletion')).toHaveText(['善用','主動溝通風險。']);
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('edoc-draft:'+JSON.parse(document.querySelector('#documentState').textContent).documentId))).toContain('AI測試');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('edoc-draft:'+JSON.parse(document.querySelector('#documentState').textContent).documentId)).html);
  expect(saved).not.toContain('善用');expect(saved).not.toContain('主動溝通風險');expect(saved).not.toContain('draft-deletion');
  await page.reload();await expect(page.locator('#doc .draft-deletion')).toHaveText(['善用','主動溝通風險。']);
  await page.locator('#finishRevisionBtn').click();await expect(page.locator('#suggestionPanel')).toHaveText('S001');
  const s=(await collab(gh,'/suggestions/get',{id:'S001'})).body;
  expect(s.proposedHtml).not.toContain('善用');expect(s.proposedHtml).not.toContain('主動溝通風險');expect(s.proposedHtml).not.toContain('draft-deletion');expect(s.proposedHtml).toContain('AI測試');
});

test('multiple inline deletion splits support further selection, line break and undo',async({page})=>{
  await openDraftFixture(page,'<h1>測試</h1><p>前甲中乙後丙尾。</p>');
  await selectText(page,'甲');await page.keyboard.press('Backspace');await expect(page.locator('#doc .draft-deletion')).toHaveText('甲');
  await selectText(page,'丙');await page.keyboard.press('Backspace');await expect(page.locator('#doc .draft-deletion')).toHaveText(['甲','丙']);
  await page.keyboard.press('ControlOrMeta+z');await expect.poll(()=>page.evaluate(()=>EDoc.cleanSnapshot(document.querySelector('#doc').innerHTML))).toContain('丙');
  await page.keyboard.press('ControlOrMeta+Shift+z');await expect(page.locator('#doc .draft-deletion')).toHaveText(['甲','丙']);
  await selectText(page,'乙');await page.keyboard.type('B');await expect.poll(()=>highlighted(page)).toBe('B');
  const clean=()=>page.evaluate(()=>EDoc.cleanSnapshot(document.querySelector('#doc').innerHTML));
  expect(await clean()).toContain('前中B後尾。');
  await page.locator('#doc').press('ControlOrMeta+End');await page.keyboard.press('Enter');await page.keyboard.type('new');
  await expect.poll(clean).toContain('new');expect(await clean()).not.toContain('甲');expect(await clean()).not.toContain('丙');
  await page.emulateMedia({media:'print'});for(const ghost of await page.locator('#doc .draft-deletion').all())await expect(ghost).toBeHidden();
});

test('partial deletion keeps original whitespace and element-boundary selection',async({page})=>{
  await openDraftFixture(page,'<h1>測試</h1><p>善用 AI 協作。</p>');
  await selectText(page,'善用');await page.keyboard.press('Backspace');
  await expect(page.locator('#doc > p')).toHaveText('善用 AI 協作。');
  await page.evaluate(()=>{
    const p=document.querySelector('#doc > p'),range=document.createRange();range.selectNodeContents(p);
    document.querySelector('#doc').focus();getSelection().removeAllRanges();getSelection().addRange(range);
  });
  await page.keyboard.insertText('全新內容');
  await expect.poll(()=>page.evaluate(()=>EDoc.cleanSnapshot(document.querySelector('#doc').innerHTML))).toContain('<p>全新內容</p>');
  await expect(page.locator('#doc .draft-deletion')).toContainText('善用 AI 協作。');
});

test('native editing without keyboard preparation preserves target after partial deletion',async({page})=>{
  await openDraftFixture(page,'<h1>測試</h1><p>前甲後尾。</p>');
  await selectText(page,'甲');await page.keyboard.press('Backspace');await expect(page.locator('#doc .draft-deletion')).toHaveText('甲');
  // Simulates a platform edit that reaches beforeinput without the keyboard hook.
  await page.evaluate(()=>document.querySelector('#doc').addEventListener('keydown',e=>e.stopImmediatePropagation(),{capture:true}));
  await page.keyboard.press('Backspace');
  await expect.poll(()=>page.evaluate(()=>EDoc.cleanSnapshot(document.querySelector('#doc').innerHTML))).toContain('<p>後尾。</p>');
  await expect(page.locator('#doc .draft-deletion')).toHaveText('前甲');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(()=>page.evaluate(()=>EDoc.cleanSnapshot(document.querySelector('#doc').innerHTML))).toContain('前');
  await page.keyboard.press('ControlOrMeta+Shift+z');await expect(page.locator('#doc .draft-deletion')).toHaveText('前甲');
  await page.keyboard.press('Enter');await page.keyboard.insertText('新增');
  await expect.poll(()=>page.evaluate(()=>EDoc.cleanSnapshot(document.querySelector('#doc').innerHTML))).toContain('新增');
});

for(const phrase of ['Word 後。','前 Word'])test('inline deletion preserves word spacing: '+phrase,async({page})=>{
  await openDraftFixture(page,'<h1>測試</h1><p>'+phrase+'</p>');
  await selectText(page,'Word');await page.keyboard.press('Backspace');
  await expect(page.locator('#doc .draft-deletion')).toHaveText('Word');
  await expect(page.locator('#doc > p')).toHaveText(phrase);
});

test('draft revision rail includes paragraph modifications, additions and deletions',async({page})=>{
  await openDraftFixture(page,'<h1>測試</h1><h2>需求條件</h2><p>具遊戲測試經驗。</p><p>能独立規劃測試。</p><p>善用 AI 協作。</p><p>清楚回報問題。</p><p>主動溝通風險。</p>');
  await selectText(page,'具遊戲');await page.keyboard.insertText('具手機遊戲');
  await expect(page.locator('#revisionMarkup .markup-card')).toHaveCount(1);
  await expect(page.locator('#revisionMarkup .markup-card')).toContainText('具手機遊戲測試經驗。');
  await selectText(page,'能独立規劃測試。');await page.keyboard.insertText('能独立規劃測試案例。');
  await selectText(page,'善用');await page.keyboard.press('Backspace');
  await selectText(page,'主動溝通風險。');await page.keyboard.press('Backspace');
  await page.evaluate(()=>{
    const p=document.createElement('p');p.textContent='了解多類型遊戲。';const doc=document.querySelector('#doc');
    doc.querySelectorAll('p:not(.deletion-record)')[2].before(p);doc.dispatchEvent(new InputEvent('input',{bubbles:true}));
  });
  const cards=page.locator('#revisionMarkup .markup-card');await expect(cards).toHaveCount(5);
  await expect(cards).toHaveText([
    /需求條件.*修改.*具遊戲測試經驗。.*具手機遊戲測試經驗。/,
    /需求條件.*修改.*能独立規劃測試。.*能独立規劃測試案例。/,
    /需求條件.*新增.*了解多類型遊戲。/,
    /需求條件.*修改.*善用\s+AI 協作。.*AI 協作。/,
    /需求條件.*刪除.*主動溝通風險。/,
  ]);
  await expect(page.locator('#revisionMarkup .markup-insertion')).toHaveText(['手機','案例','了解多類型遊戲。']);
  await expect(page.locator('#revisionMarkup .markup-deletion')).toHaveText(['善用','主動溝通風險。']);
  await page.locator('#toggleChanges').click();await expect(cards).toHaveCount(5);
  await page.locator('#toggleChanges').click();await expect(cards).toHaveCount(5);
  await selectText(page,'具手機遊戲');await page.keyboard.insertText('具遊戲');await expect(cards).toHaveCount(4);
});

test('revision rail targets editor div paragraphs without rewriting their structure',async({page})=>{
  await openDraftFixture(page,'<h1>測試</h1><p>第一句保留。</p><p>第二句。</p>');
  await page.evaluate(()=>{
    const doc=document.querySelector('#doc');doc.innerHTML='<h1>測試</h1><div>第一句保留。</div><div>第二新句。</div>';
    doc.dispatchEvent(new InputEvent('input',{bubbles:true}));
  });
  await expect(page.locator('#revisionMarkup .markup-card')).toHaveCount(1);
  await page.locator('#revisionMarkup .markup-card').click();
  // A visible paragraph no longer needs scrolling; verify the selected rectangle itself.
  const bounds=await page.evaluate(()=>({focus:document.querySelector('#revisionNavigation .revision-focus').getBoundingClientRect().toJSON(),target:document.querySelectorAll('#doc > div')[1].getBoundingClientRect().toJSON()}));
  expect(Math.abs(bounds.focus.top-bounds.target.top)).toBeLessThan(8);
  expect(bounds.focus.bottom).toBeGreaterThanOrEqual(bounds.target.bottom);
  await expect(page.locator('#doc > div')).toHaveCount(2);
});

test('nested deleted divider has one revision card',async({page})=>{
  await openDraftFixture(page,'<h1>測試</h1><p>保留前段。</p><table><tbody><tr><td><hr></td></tr></tbody></table><p>保留後段。</p>');
  await page.evaluate(()=>{
    const doc=document.querySelector('#doc');doc.querySelector('table').remove();
    doc.dispatchEvent(new InputEvent('input',{bubbles:true}));
  });
  await expect(page.locator('#revisionMarkup .markup-card')).toHaveCount(1);
  await expect(page.locator('#revisionMarkup .markup-card')).toContainText('刪除：分隔線');
});
