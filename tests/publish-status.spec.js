import {test,expect} from '@playwright/test';
import {openDoc,startRevision,acceptRevision,placeCaret,openVersion} from './helpers.js';

async function publish(page){
  await openDoc(page);
  await startRevision(page);
  await placeCaret(page,'資深遊戲測試工程師');
  await page.keyboard.type('嚴謹');
  await acceptRevision(page,'v0.8');
}

test('reloading an old public copy retains the saved version and resumes checking without claiming rollback',async({page},testInfo)=>{
  await publish(page);
  await page.reload();
  await expect(page.locator('#versionLabel')).toHaveText('v0.7 · Current');
  await expect(page.locator('#publishNote')).toBeVisible();
  await expect(page.locator('#publishNote')).toContainText('v0.8 已儲存');
  await expect(page.locator('#publishNote')).toContainText('v0.7');
  await expect(page.locator('#publishNote')).toContainText('不代表退版');
  await page.screenshot({path:testInfo.outputPath('after-reload.png')});
  // The site becomes available after reload; the continued poll must detect it.
  await page.route(url=>url.searchParams.has('edoc-check'),async route=>{
    const res=await route.fetch();
    await route.fulfill({response:res,body:(await res.text()).replace('"latestVersion":"v0.7"','"latestVersion":"v0.8"')});
  });
  await expect(page.locator('#publishBadge')).toContainText('已上線');
  await expect(page.locator('#publishNote')).toContainText('載入最新版');
  await page.screenshot({path:testInfo.outputPath('now-live.png')});
  await openVersion(page,'v0.6');
  await expect(page.locator('#publishNote')).toBeHidden();
});

test('saved publishing status never overwrites an unfinished draft after reload',async({page})=>{
  await publish(page);
  await page.reload();
  await startRevision(page);
  await placeCaret(page,'資深遊戲測試工程師');
  await page.keyboard.type('保留草稿');
  await page.route(url=>url.searchParams.has('edoc-check'),async route=>{
    const res=await route.fetch();
    await route.fulfill({response:res,body:(await res.text()).replace('"latestVersion":"v0.7"','"latestVersion":"v0.8"')});
  });
  await expect(page.locator('#notice')).toContainText('v0.8');
  await expect(page.locator('#doc')).toHaveAttribute('contenteditable','true');
  await expect(page.locator('#doc')).toContainText('保留草稿');
});

test('loading a newer public copy is blocked while a draft is being edited',async({page})=>{
  await page.route(url=>url.searchParams.has('edoc-check'),async route=>{
    const res=await route.fetch();
    await route.fulfill({response:res,body:(await res.text()).replace('"latestVersion":"v0.7"','"latestVersion":"v0.8"')});
  });
  await openDoc(page);
  await expect(page.locator('#noticeActions button')).toHaveText('載入最新版');
  await startRevision(page);
  await placeCaret(page,'資深遊戲測試工程師');
  await page.keyboard.type('保護中的草稿');
  await page.locator('#noticeActions button').click();
  await expect(page.locator('#doc')).toHaveAttribute('contenteditable','true');
  await expect(page.locator('#doc')).toContainText('保護中的草稿');
});

test('timed out publication remains saved and can be checked again without publishing twice',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('edoc-publish-status:qa-senior-game-qa-engineer',JSON.stringify({version:'v0.8',since:Date.now()-11*60*1000})));
  await openDoc(page,{edit:false});
  await expect(page.locator('#publishBadge')).toContainText('尚未確認上線');
  await expect(page.locator('#publishNote')).toContainText('無需再次發布');
  await page.locator('#publishNote button').click();
  await expect(page.locator('#publishBadge')).toContainText('網站更新中');
});

test('HTTP errors cannot confirm that a version is live',async({page})=>{
  await page.route(url=>url.searchParams.has('edoc-check'),route=>route.fulfill({status:503,body:'<script id="documentState" type="application/json">{"latestVersion":"v0.8"}</script>'}));
  await publish(page);
  await page.reload();
  await expect(page.locator('#publishNote')).toBeVisible();
  await expect(page.locator('#publishBadge')).toContainText('網站更新中');
});

test('after reload a live page is confirmed while the official PDF keeps being checked separately',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('edoc-publish-status:qa-senior-game-qa-engineer',JSON.stringify({version:'v0.7',since:Date.now(),verifyPdf:true})));
  let ready=false;
  await page.route('**/pdf/v0.7.pdf?edoc-check=*',route=>route.fulfill({status:ready?200:404,contentType:ready?'application/pdf':'text/plain',body:''}));
  await openDoc(page,{edit:false});
  await expect(page.locator('#publishBadge')).toContainText('已上線');
  await expect(page.locator('#publishNote')).toContainText('PDF 仍在產生');
  ready=true;
  await expect(page.locator('#publishNote')).not.toContainText('PDF 仍在產生');
});
