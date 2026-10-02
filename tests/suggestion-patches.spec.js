import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { createSuggestionItems, applySuggestionItems } from '../src/engine/suggestion-patches.js';
import { contentContext, prepareContent, buildPublishedContent } from '../worker/src/content.js';

const items = (a,b) => createSuggestionItems(a,b,contentContext());
const apply = (a,i,ids=i.map(x=>x.id)) => applySuggestionItems(a,i,ids,contentContext());
test('replacement_is_atomic',()=>{
 const i=items('<p>比如測試</p>','<p>譬如測試</p>'); expect(i).toHaveLength(1);
 expect(i[0]).toMatchObject({before:'<p>比如測試</p>',after:'<p>譬如測試</p>',type:'modified'});
 expect(apply('<p>比如測試</p>',i,[])).toBe('<p>比如測試</p>');
 expect(apply('<p>比如測試</p>',i)).toBe('<p>譬如測試</p>');
});
test('five_items_apply_three',()=>{
 const a='<p>甲</p><p>乙</p><p>丙</p><p>丁</p><p>戊</p>';
 const i=items(a,'<p>一</p><p>二</p><p>三</p><p>四</p><p>五</p>');
 expect(i).toHaveLength(5); expect(apply(a,i,i.slice(0,3).map(x=>x.id))).toBe('<p>一</p><p>二</p><p>三</p><p>丁</p><p>戊</p>');
});
test('two edits in one paragraph form one complete review record',()=>{
 const a='<p>甲測試乙</p>', i=items(a,'<p>一測試二</p>'); expect(i).toHaveLength(1);
 expect(i[0].before).toBe(a);expect(i[0].after).toBe('<p>一測試二</p>');
 expect(apply(a,i)).toBe('<p>一測試二</p>');
});
for(const [name,a,b] of [
 ['format','<p>甲<strong>乙</strong>丙</p>','<p>甲<em>乙</em>丙</p>'],
 ['nested','<ul><li>甲<ul><li>乙</li></ul></li></ul>','<ol><li>甲</li><li>乙</li></ol>'],
 ['table','<table><tbody><tr><td>甲</td></tr></tbody></table>','<table><tbody><tr><td>乙</td><td>丙</td></tr></tbody></table>'],
 ['image','<p><img src="https://example.com/a.png" alt="甲"></p>','<p><img src="https://example.com/b.png" alt="乙"></p>'],
 ['reorder','<h2>甲</h2><p>乙</p>','<p>乙</p><h2>甲</h2>'],
 ['insert','<p>甲</p>','<p>甲</p><p>乙</p>'],
 ['delete','<p>甲</p><p>乙</p>','<p>乙</p>'],
]) test(`structural_dependency_group ${name}`,()=>{
 const i=items(a,b); expect(i.length).toBeGreaterThan(0); expect(apply(a,i)).toBe(prepareContent(b)); expect(apply(a,i,[])).toBe(prepareContent(a));
});
test('content rejects forged marks and cleans executable HTML',()=>{
 expect(prepareContent('<p class="deleted" onclick="bad()">保留<span class="changed">文字</span><script>bad()</script><a href="javascript:bad()">連結</a></p>')).toBe('<p>保留<span>文字</span><a>連結</a></p>');
});
test('invalid IDs and stale base fail instead of overwriting unrelated text',()=>{
 const i=items('<p>甲測試</p>','<p>乙測試</p>'); expect(()=>apply('<p>甲測試</p>',i,['fake'])).toThrow();
 expect(()=>apply('<p>甲測試</p>',i,[i[0].id,i[0].id])).toThrow();
 expect(()=>apply('<p>丙測試</p>',i)).toThrow();
});
test('worker_browser_parity for clean content, patches and formal statistics',async({page})=>{
 const out=await build({stdin:{contents:`import {createSuggestionItems,applySuggestionItems} from './src/engine/suggestion-patches.js'; import {buildFormalDiff,analyzeFormalDiff} from './src/engine/diff.js'; window.verify={createSuggestionItems,applySuggestionItems,buildFormalDiff,analyzeFormalDiff};`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife'});
 await page.goto('/'); await page.addScriptTag({content:out.outputFiles[0].text});
 const a='<h2>測試</h2><ul><li>比如<strong>測試</strong></li></ul><table><tbody><tr><td>甲</td></tr></tbody></table>';
 const b=a.replace('比如','譬如').replace('甲','乙');
 const i=items(a,b), clean=apply(a,i), worker=await buildPublishedContent(a,clean);
 const browser=await page.evaluate(([a,b])=>{ const v=window.verify, i=v.createSuggestionItems(a,b); const clean=v.applySuggestionItems(a,i,i.map(x=>x.id)); const html=v.buildFormalDiff(a,clean);return {i,clean,html,stats:v.analyzeFormalDiff(html)};},[a,b]);
 expect(browser.i).toEqual(i); expect(browser.clean).toBe(clean); expect(browser.html).toBe(worker.html); expect(browser.stats.summary).toBe(worker.summary);
});

for (const proposed of ['<p>&lt;x&gt;<strong>乙</strong></p>', '<p>&amp;copy;<em>乙</em></p>']) test('mixed text HTML escaping '+proposed,()=>{
 const base='<p>甲</p>', i=items(base,proposed);expect(apply(base,i)).toBe(prepareContent(proposed));
});

test('mixed edits and paragraph deletion never absorb unchanged paragraphs',()=>{
 const base='<h2>需求條件</h2><p>具遊戲測試經驗。</p><p>能獨立規劃測試。</p><p>善用 AI 協作。</p><p>清楚回報問題。</p><p>主動溝通風險。</p>';
 const proposed='<h2>需求條件</h2><p>具備網路遊戲測試經驗。</p><p>能獨立規劃測試案例。</p><p>善用 AI 協作。</p><p>清楚回報問題。</p>';
 const changes=items(base,proposed);expect(changes).toHaveLength(3);expect(changes.map(i=>i.type)).toEqual(['modified','modified','deleted']);
 expect(changes[0].before).toBe('<p>具遊戲測試經驗。</p>');expect(changes[1].before).toBe('<p>能獨立規劃測試。</p>');expect(changes[2].before).toBe('<p>主動溝通風險。</p>');
 expect(JSON.stringify(changes)).not.toContain('善用 AI');expect(JSON.stringify(changes)).not.toContain('清楚回報');
 expect(apply(base,changes,[changes[0].id])).toBe(base.replace('具遊戲','具備網路遊戲'));expect(apply(base,changes)).toBe(proposed);
});
test('multiple inserted and deleted list entries apply independently in order',()=>{
 const base='<ul><li>原一</li><li>刪二</li><li>刪三</li><li>原四</li></ul>',proposed='<ul><li>原一</li><li>新增甲</li><li>新增乙</li><li>新增丙</li><li>原四</li></ul>';
 const changes=items(base,proposed);expect(changes.every(i=>!i.before.includes('原四')&&!i.after.includes('原四'))).toBe(true);expect(apply(base,changes)).toBe(proposed);
});

test('parent list entry owns one record while nested entry stays independent',()=>{
 const a='<ul><li>甲<strong>固定</strong>乙<ul><li>子項不變</li></ul></li></ul>',b=a.replace('甲','一').replace('乙','二').replace('子項不變','子項修改');
 const changes=items(a,b);expect(changes).toHaveLength(2);expect(changes[0].before).toContain('甲');expect(changes[0].before).toContain('乙');expect(changes[0].before).not.toContain('子項');
 expect(apply(a,changes,[changes[0].id])).toBe(a.replace('甲','一').replace('乙','二'));expect(apply(a,changes,[changes[1].id])).toBe(a.replace('子項不變','子項修改'));expect(apply(a,changes)).toBe(b);
});

test('frozen legacy text and grouped children patches retain their original semantics',()=>{
 const base='<p>甲乙</p><p>舊</p>',legacy=[{id:'S001-01',patch:{kind:'text',path:[0,0],start:0,end:1,before:'甲',after:'一'}},{id:'S001-02',patch:{kind:'children',path:[],start:1,count:1,before:'<p>舊</p>',after:'<p>新增</p><p>新二</p>'}}],saved=JSON.stringify(legacy);
 expect(apply(base,legacy,['S001-01'])).toBe('<p>一乙</p><p>舊</p>');expect(apply(base,legacy)).toBe('<p>一乙</p><p>新增</p><p>新二</p>');expect(JSON.stringify(legacy)).toBe(saved);
});
