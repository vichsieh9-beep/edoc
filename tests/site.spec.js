// Library page: unlisted documents (the sandbox for live tests) are not shown.
import { test, expect } from '@playwright/test';
import { loadTemplates, renderLibrary } from '../scripts/lib/site.mjs';

test('the Library lists only listed documents', async () => {
  const templates = await loadTemplates();
  const html = renderLibrary([
    { slug: 'qa-senior-game-qa', doc: { title: '正式文件', subtitle: 'A', latestVersion: 'v0.7' } },
    { slug: 'edoc-sandbox', doc: { title: '測試文件', subtitle: 'B', latestVersion: 'v0.1', unlisted: true } },
  ], { templates });
  expect(html).toContain('./documents/qa-senior-game-qa/');
  expect(html).not.toContain('edoc-sandbox');
});
