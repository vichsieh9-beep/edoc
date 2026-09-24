// Edit link registry (scripts/lib/edit-links.mjs): only hashes are stored; links can be revoked.
import { test, expect } from '@playwright/test';
import { createLink, revokeLink, editUrl, sha256Hex } from '../scripts/lib/edit-links.mjs';

test('a new link stores only the hash of its token and yields a URL with the token in the fragment', () => {
  const { registry, link, token } = createLink({ links: [] }, { name: ' 客戶法務 ', documents: ['qa-senior-game-qa'], now: new Date('2026-09-24T00:00:00Z') });
  expect(token.length).toBeGreaterThanOrEqual(32);
  expect(link).toMatchObject({ name: '客戶法務', documents: ['qa-senior-game-qa'], tokenHash: sha256Hex(token), revoked: false, createdAt: '2026-09-24T00:00:00.000Z' });
  expect(JSON.stringify(registry)).not.toContain(token);
  const url = editUrl('https://vichsieh9-beep.github.io/edoc/', 'qa-senior-game-qa', token);
  expect(url).toBe(`https://vichsieh9-beep.github.io/edoc/documents/qa-senior-game-qa/#edit=${token}`);
  const second = createLink(registry, { name: 'PM', documents: ['*'] });
  expect(second.registry.links).toHaveLength(2);
  expect(second.token).not.toBe(token);
});

test('names are required and short; revoking marks the link and refuses repeats', () => {
  expect(() => createLink({ links: [] }, { name: '', documents: ['x'] })).toThrow(/--name/);
  expect(() => createLink({ links: [] }, { name: '字'.repeat(41), documents: ['x'] })).toThrow(/40 字/);
  const { registry, link } = createLink({ links: [] }, { name: 'PM', documents: ['x'] });
  const revoked = revokeLink(registry, link.id);
  expect(revoked.links[0].revoked).toBe(true);
  expect(() => revokeLink(revoked, link.id)).toThrow(/已經停用/);
  expect(() => revokeLink(revoked, 'Lnope')).toThrow(/找不到/);
});
