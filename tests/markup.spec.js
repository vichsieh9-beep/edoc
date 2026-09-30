import { test, expect } from '@playwright/test';
import { openDoc, startRevision, selectText, acceptRevision } from './helpers.js';

const highlighted = page => page.evaluate(() => [...(CSS.highlights?.get('edoc-insertions') || [])].map(r => r.toString()).join(''));

test('draft replacements mark only inserted text and keep deletions outside editable content', async ({ page }) => {
  await openDoc(page);
  await startRevision(page);
  await selectText(page, '初步');
  await page.keyboard.insertText('深入');
  await expect(page.locator('#revisionMarkup .markup-deletion')).toHaveText(['初步']);
  await expect.poll(() => highlighted(page)).toBe('深入');
  await expect(page.locator('#doc')).not.toContainText('初步');
  await page.keyboard.insertText('有效');
  await expect.poll(() => highlighted(page)).toBe('深入有效');
  const html = await page.locator('#doc').innerHTML();
  await page.locator('#toggleChanges').click();
  await expect(page.locator('#revisionMarkup')).toBeHidden();
  expect(await page.locator('#doc').innerHTML()).toBe(html);
  await expect.poll(() => highlighted(page)).toBe('');
  await page.locator('#toggleChanges').click();
  await expect.poll(() => highlighted(page)).toBe('深入有效');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('edoc-draft:' + JSON.parse(document.querySelector('#documentState').textContent).documentId))).toContain('深入有效');
  await page.reload();
  await expect(page.locator('#versionLabel')).toContainText('Draft');
  await expect.poll(() => highlighted(page)).toBe('深入有效');
  await acceptRevision(page, 'v0.8');
  await expect(page.locator('#doc .deleted')).toBeHidden();
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

test('whole-block deletion stays out of the body and print while appearing in the revision rail', async ({ page }) => {
  await openDoc(page); await startRevision(page);
  const phrase='具良好的跨職能溝通能力，能與 PM、RD、Game Designer 等角色有效合作。';
  await selectText(page,phrase); await page.keyboard.press('Backspace');
  await expect(page.locator('#revisionMarkup .markup-deletion')).toContainText([phrase]);
  await acceptRevision(page,'v0.8');
  await expect(page.locator('#doc .deleted')).toBeHidden();
  await page.emulateMedia({media:'print'});
  await expect(page.locator('#revisionMarkup')).toBeHidden();
  await expect(page.locator('#doc .deleted')).toBeHidden();
});
