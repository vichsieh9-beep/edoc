// Stored versions are immutable, so every engine change must keep what they produce:
// - clean: the content behind each version's SHA-256 (cleanSnapshot)
// - display: what readers and the PDF see (sanitizeRevisionHtml of the clean content)
// - trusted: what the Worker compares publications and suggestion bases against (trustedContent)
// The golden file covers the versions that existed when it was written; versions published
// later from the web are not in it and are skipped. Regenerate only for a reviewed, intended
// change: EDOC_FREEZE=1 npx playwright test tests/stored-content.spec.js --project=chromium
import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { trustedContent } from '../worker/src/content.js';

const GOLDEN = new URL('./__golden__/stored-content.json', import.meta.url);
const sha = (s) => createHash('sha256').update(s).digest('hex');

function storedVersions() {
  const out = [];
  for (const slug of readdirSync(new URL('../documents/', import.meta.url))) {
    const file = new URL(`../documents/${slug}/document.json`, import.meta.url);
    if (!existsSync(file)) continue;
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    for (const [version, data] of Object.entries(doc.versions)) out.push({ slug, version, html: data.html });
  }
  return out;
}

test('every stored version keeps its clean, displayed and trusted content', async ({ page }) => {
  const bundle = await build({
    stdin: {
      contents: `import {cleanSnapshot} from './src/engine/dom.js'; import {sanitizeRevisionHtml} from './src/engine/revision.js';
        import {prepareSuggestionContent} from './src/engine/suggestion-patches.js';
        window.freeze={cleanSnapshot,sanitizeRevisionHtml,prepareSuggestionContent};`,
      resolveDir: process.cwd(),
    },
    bundle: true, write: false, format: 'iife',
  });
  await page.goto('/');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const versions = storedVersions();
  const browser = await page.evaluate((list) => list.map(({ html }) => {
    const f = window.freeze, clean = f.cleanSnapshot(html);
    return { clean, display: f.sanitizeRevisionHtml(clean), trusted: f.prepareSuggestionContent(clean) };
  }), versions);
  const actual = {};
  versions.forEach(({ slug, version, html }, i) => {
    // Hashes and display are computed by the page; the Worker only uses trusted content,
    // so that is where linkedom and the browser must agree byte for byte. (linkedom drops
    // an empty class="" that some stored headings carry; it has no visible effect.)
    expect(trustedContent(html), `${slug} ${version} trusted parity`).toBe(browser[i].trusted);
    const { clean, display, trusted } = browser[i];
    (actual[slug] ||= {})[version] = { clean: sha(clean), display: sha(display), trusted: sha(trusted) };
  });
  if (process.env.EDOC_FREEZE) {
    writeFileSync(GOLDEN, JSON.stringify(actual, null, 1) + '\n');
    return;
  }
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  let compared = 0;
  for (const [slug, byVersion] of Object.entries(golden)) {
    for (const [version, expected] of Object.entries(byVersion)) {
      expect(actual[slug]?.[version], `${slug} ${version} is still stored`).toBeTruthy();
      expect(actual[slug][version], `${slug} ${version}`).toEqual(expected);
      compared++;
    }
  }
  expect(compared).toBeGreaterThan(0);
});
