// Built pages (scripts/lib/site.mjs): the Library lists documents without their content;
// archived documents keep only a short notice; unlisted ones (the live-test sandbox) stay out.
import { test, expect } from '@playwright/test';
import { loadTemplates, renderLibrary, renderArchived, renderDocument, libraryEntries, updatedInfo, taipeiDate } from '../scripts/lib/site.mjs';
import { repoDocument } from './fake-github.js';

const data = (html) => JSON.parse(html.match(/<script id="libraryData" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const version = (details) => ({ summary: 's', details, previous: null, html: '<h1>秘密內容</h1>', uiChanges: [], aiSummary: null });

test('the Library lists listed documents, newest update first, and never embeds their content', async () => {
  const templates = await loadTemplates();
  const html = renderLibrary([
    { slug: 'qa-senior-game-qa', doc: { title: '正式文件', subtitle: 'A', latestVersion: 'v0.7', versions: { 'v0.7': version([]) } }, updated: { date: '26/09/23', by: null } },
    { slug: 'edoc-sandbox', doc: { title: '測試文件', subtitle: 'B', latestVersion: 'v0.1', unlisted: true, versions: {} } },
    { slug: 'd-new1', doc: { title: '新文件 <b>', subtitle: '', latestVersion: 'v0.1', versions: { 'v0.1': version(['編輯者：Vic', '建立時間：2026-09-28T17:30:00.000Z']) } } },
    { slug: 'd-old1', doc: { title: '舊文件', latestVersion: 'v0.2', archived: { at: '2026-09-10T02:00:00.000Z', by: 'Vic' }, versions: { 'v0.2': version([]) } }, updated: null },
  ], { templates, config: { publishApi: 'https://api.example' } });
  expect(html).toContain('./documents/qa-senior-game-qa/');
  expect(html).not.toContain('edoc-sandbox');
  expect(html).not.toContain('秘密內容');
  expect(html).toContain('新文件 &lt;b&gt;');
  expect(data(html)).toEqual({
    publishApi: 'https://api.example',
    docs: [
      { slug: 'd-new1', title: '新文件 <b>', subtitle: '', latestVersion: 'v0.1', updated: { date: '26/09/29', by: 'Vic' }, archived: null },
      { slug: 'qa-senior-game-qa', title: '正式文件', subtitle: 'A', latestVersion: 'v0.7', updated: { date: '26/09/23', by: null }, archived: null },
      { slug: 'd-old1', title: '舊文件', subtitle: '', latestVersion: 'v0.2', updated: null, archived: { date: '26/09/10', by: 'Vic' } },
    ],
  });
  // Visitors (no script needed) do not see archived rows.
  expect(html.match(/class="row[^"]*"/g)).toEqual(['class="row"', 'class="row"']);
});

test('last update: the latest version records time and editor; dates are Taipei dates', () => {
  expect(updatedInfo({ latestVersion: 'v0.8', versions: { 'v0.8': version(['x', '編輯者：客戶法務', '建立時間：2026-09-24T16:30:00.000Z']) } }))
    .toEqual({ date: '26/09/25', by: '客戶法務' });
  expect(updatedInfo({ latestVersion: 'v0.7', versions: { 'v0.7': version(['x']) } }, '2026-09-23T14:57:21+08:00')).toEqual({ date: '26/09/23', by: null });
  expect(updatedInfo({ latestVersion: 'v0.7', versions: { 'v0.7': version([]) } })).toBeNull();
  expect(taipeiDate('nope')).toBeNull();
  expect(libraryEntries([{ slug: 'a', doc: { title: 'A', latestVersion: 'v0.1', versions: { 'v0.1': version([]) } } }])[0].updated).toBeNull();
});

test('an archived document page shows a notice and none of its versions', async () => {
  const templates = await loadTemplates();
  const doc = { ...repoDocument(), archived: { at: '2026-09-28T17:00:00.000Z', by: 'Vic' } };
  const html = renderArchived(doc, { templates });
  expect(html).toContain('這份文件已於 26/09/29 封存');
  expect(html).toContain('<a class="back-link" href="../../">← 文件庫</a>');
  expect(html).not.toContain('職務簡述');
  expect(html).not.toMatch(/versionData|<script/);
});

test('document pages link back to the Library', async () => {
  const templates = await loadTemplates();
  const html = renderDocument(repoDocument(), { templates, script: '', slug: 'qa-senior-game-qa' });
  expect(html).toContain('<a class="back-link" id="backLink" href="../../">← 文件庫</a>');
});
