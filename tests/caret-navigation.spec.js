import {test,expect} from '@playwright/test';
import {startRevision,selectText,placeCaret} from './helpers.js';
import {createFakeGithub} from './fake-github.js';
import {setup} from './collaboration-browser.js';

async function mixedDraft(page){
 const gh=createFakeGithub(),data=gh.read();
 data.versions['v0.7'].html='<h1>測試</h1><h2>需求條件</h2><p>具遊戲測試經驗。</p><p>能獨立規劃測試。</p><p>善用 AI 協作。</p><p>清楚回報問題。</p>';
 gh.write('documents/qa-senior-game-qa/document.json',data);
 await page.route(url=>url.pathname.endsWith('/documents/qa-senior-game-qa/'),async route=>{
  const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace(/(<script id="versionData" type="application\/json">)[\s\S]*?(<\/script>)/,(_,a,b)=>a+JSON.stringify(data.versions)+b)});
 });
 await setup(page,{gh});await startRevision(page);
 await selectText(page,'具遊戲');await page.keyboard.insertText('具手機遊戲');
 await selectText(page,'能獨立規劃測試。');await page.keyboard.press('Backspace');
 await selectText(page,'協');await page.keyboard.press('Backspace');
 await expect(page.locator('#revisionMarkup .markup-card')).toHaveCount(3);
 await expect(page.locator('#doc .draft-deletion')).toHaveCount(2);
 await placeCaret(page,'作','start');
}

for(const simple of [false,true])test('caret navigation keeps mixed revision text and numbering stable in '+(simple?'simple':'all')+' markup',async({page})=>{
 await mixedDraft(page);
 if(simple){await page.locator('#toggleChanges').click();await placeCaret(page,'作','start');}
 await page.evaluate(()=>{
  const doc=document.querySelector('#doc'),nav=document.querySelector('#revisionNavigation');
  const retained=[doc.querySelector('.draft-deletion'),nav.querySelector('.revision-number'),document.querySelector('#revisionMarkup .markup-card')];
  const paragraph=[...doc.querySelectorAll('p')].find(p=>p.textContent.includes('清楚回報'));
  const baseline=paragraph.getBoundingClientRect().top+scrollY;window.caretProbe={mutations:0,displaced:false,retained,paragraph,baseline};
  const observer=new MutationObserver(records=>{window.caretProbe.mutations+=records.length;});
  for(const node of [doc,nav,document.querySelector('#revisionMarkup')])observer.observe(node,{childList:true,subtree:true,characterData:true});
  // Sample document coordinates: native caret scrolling is expected, while a
  // redraw that changes paragraph layout and then restores it is still a failure.
  const sample=()=>{const p=window.caretProbe;if(!p)return;p.displaced ||= Math.abs(p.paragraph.getBoundingClientRect().top+scrollY-p.baseline)>1;requestAnimationFrame(sample);};requestAnimationFrame(sample);
 });
 for(const key of ['ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Shift+ArrowLeft','Shift+ArrowRight','ControlOrMeta+ArrowLeft','ControlOrMeta+ArrowRight','ControlOrMeta+a'])await page.keyboard.press(key);
 const result=await page.evaluate(()=>({mutations:window.caretProbe.mutations,displaced:window.caretProbe.displaced,retained:window.caretProbe.retained.every(n=>n.isConnected),ghosts:document.querySelectorAll('#doc .draft-deletion').length}));
 expect(result).toEqual({mutations:0,displaced:false,retained:true,ghosts:2});
});

// A following, unedited paragraph must not rise while old deletion markers are
// removed, then fall back after the delayed diff render.
for(const composing of [false,true])test('typing keeps deleted paragraph space stable '+(composing?'during composition':'between keystrokes'),async({page})=>{
 await mixedDraft(page);await placeCaret(page,'清楚回報問題','end');
 await page.evaluate(()=>{
  const p=[...document.querySelectorAll('#doc p')].find(n=>n.textContent.includes('清楚回報'));
  const baseline=p.getBoundingClientRect().top+scrollY;window.typingProbe={p,baseline,maxShift:0};
  function sample(){const v=window.typingProbe;if(!v)return;v.maxShift=Math.max(v.maxShift,Math.abs(v.p.getBoundingClientRect().top+scrollY-v.baseline));requestAnimationFrame(sample);}requestAnimationFrame(sample);
 });
 if(composing){await page.locator('#doc').dispatchEvent('compositionstart');await page.keyboard.insertText('補充');await page.waitForTimeout(180);await page.locator('#doc').dispatchEvent('compositionend');}
 else {await page.keyboard.type('abc',{delay:180});await page.keyboard.press('Backspace');}
 await page.waitForTimeout(220);
 expect(await page.evaluate(()=>window.typingProbe.maxShift)).toBeLessThan(2);
 await expect(page.locator('#doc .draft-deletion')).toHaveCount(2);
 await expect(page.locator('#doc')).toContainText(composing?'清楚回報問題補充':'清楚回報問題ab');
});

test('cancelled composition restores all comparison fragments without changing the draft',async({page})=>{
 await mixedDraft(page);await placeCaret(page,'清楚回報問題','end');
 const before=await page.locator('#doc').evaluate(n=>window.EDoc.cleanSnapshot(n.innerHTML));
 await page.locator('#doc').dispatchEvent('compositionstart');await page.waitForTimeout(180);await page.locator('#doc').dispatchEvent('compositionend');
 await expect(page.locator('#doc .draft-deletion')).toHaveCount(2);
 expect(await page.locator('#doc').evaluate(n=>window.EDoc.cleanSnapshot(n.innerHTML))).toBe(before);
});
