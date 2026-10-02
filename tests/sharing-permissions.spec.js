import {test,expect} from '@playwright/test';
import {setup,collab} from './collaboration-browser.js';
import {TEST_TOKEN} from './fake-github.js';
test('named sharing defaults and mutable capabilities keep dependency',async({page})=>{
 const gh=await setup(page);await page.getByRole('button',{name:'分享權限',exact:true}).click();
 await page.locator('#collaborationName').fill('B');await page.locator('#collaborationCompany').fill('乙公司');await page.getByRole('button',{name:'產生具名連結'}).click();
 await expect(page.locator('#onceLink')).toContainText('#edit=');
 const row=page.locator('[data-link-row]').filter({has:page.locator('input[value="B"]')});
 await expect(row.getByLabel('提出修訂')).toBeChecked();await expect(row.getByLabel('採納修訂')).not.toBeChecked();
 await row.getByLabel('採納修訂').check();await row.getByLabel('發布版本').check();await row.getByRole('button',{name:'儲存權限'}).click();
 const links=(await collab(gh,'/collaboration/links/list')).body.links;expect(links.find(l=>l.name==='B').capabilities).toMatchObject({view:true,propose:true,decide:true,publish:true,manage:false});
 await row.getByLabel('檢視').uncheck();await expect(row.getByLabel('提出修訂')).not.toBeChecked();
});
test('old tab permission refusal retains draft and names in past events',async({page})=>{
 const gh=await setup(page,{token:TEST_TOKEN});await page.locator('#newRevisionBtn').click();await expect(page.locator('#doc')).toHaveAttribute('contenteditable','true');await page.locator('#doc').press('ControlOrMeta+End');await page.keyboard.insertText('保留草稿');
 await collab(gh,'/collaboration/links/update',{id:'Ltest',expectedRevision:1,name:'新名字',capabilities:{view:true,propose:false,decide:false,publish:false,manage:false}});
 await page.locator('#finishRevisionBtn').click();await expect(page.locator('#notice')).toContainText('權限');await expect(page.locator('#doc')).toContainText('保留草稿');
 expect(await page.evaluate(()=>localStorage.getItem('edoc-draft:qa-senior-game-qa-engineer'))).toContain('保留草稿');
 const events=(await collab(gh,'/suggestions/history')).body.events;expect(events[0].actorSnapshot.name).toBe('Vic');
});

test('lost link response retries once and rotates atomically without keeping raw token',async({page})=>{
 let lost=true;const gh=await setup(page,{onResponse:async(route,res)=>{if(lost&&route.request().url().endsWith('/collaboration/links/create')){lost=false;await route.abort();return false;}}});
 await page.getByRole('button',{name:'分享權限',exact:true}).click();await page.locator('#collaborationName').fill('Lost');await page.getByRole('button',{name:'產生具名連結'}).click();await expect(page.getByRole('alert')).toContainText('連不上');
 await page.getByRole('button',{name:'產生具名連結'}).click();await expect(page.locator('#linkOnce')).toContainText('連結已建立');
 let links=(await collab(gh,'/collaboration/links/list')).body.links;expect(links.filter(l=>l.name==='Lost'&&l.enabled)).toHaveLength(1);
 await page.getByRole('button',{name:'重新產生這條連結'}).click();await expect(page.locator('#onceLink')).toContainText('#edit=');
 links=(await collab(gh,'/collaboration/links/list')).body.links;expect(links.filter(l=>l.name==='Lost'&&l.enabled)).toHaveLength(1);expect(links.filter(l=>l.name==='Lost'&&!l.enabled)).toHaveLength(1);
 const token=(await page.locator('#onceLink').textContent()).split('#edit=')[1];expect(JSON.stringify((await collab(gh,'/suggestions/history')).body)).not.toContain(token);
});
