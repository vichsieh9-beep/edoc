import {expect} from '@playwright/test';
import {enablePublishing,WORKER_ENV} from './publish-mock.js';
import {createFakeGithub,ADMIN_TOKEN,TEST_TOKEN} from './fake-github.js';
import {localCollaboration} from './local-collaboration.js';
const DOC='qa-senior-game-qa',URL=`/documents/${DOC}/`;
export async function collab(gh,path,body={},token=ADMIN_TOKEN){const r=await localCollaboration(gh,WORKER_ENV).fetch(new Request('http://test',{method:'POST',body:JSON.stringify({path,body:{doc:DOC,token,requestId:crypto.randomUUID(),...body}})}));return {status:r.status,body:await r.json()};}
export async function setup(page,{gh=createFakeGithub(),token=ADMIN_TOKEN,onResponse}={}){await collab(gh,'/collaboration/settings',{enabled:true,expectedRevision:0});await enablePublishing(page,{gh,onResponse});await page.goto(URL+'#edit='+token);await expect(page.locator('#suggestionsBtn')).toBeVisible();return gh;}
