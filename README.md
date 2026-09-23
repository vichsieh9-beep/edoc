# EDoc — Editable Document

Human edits content. The system handles versioning.

- Library: `/index.html` → https://vichsieh9-beep.github.io/edoc/
- 【QA】資深遊戲測試工程師: `/documents/qa-senior-game-qa/` → https://vichsieh9-beep.github.io/edoc/documents/qa-senior-game-qa/

Each document is published as a single self-contained HTML file that works offline
(`file://`) and on GitHub Pages. Product rules and the engineering plan are in
`EDOC_HANDOFF.md`; working rules for AI agents are in `CLAUDE.md`.

## Layout

```text
documents/<slug>/document.json   content SSOT: every formal version (never edit a formal version)
documents/<slug>/index.html      BUILT — single-file document (do not edit by hand)
index.html                       BUILT — Library page
src/engine/                      diff, revision (import sanitizing, conflicts), hash, version, publish, meta (engine version R2.x)
src/ui/                          editor, version view, draft, revision import/export, styles.css
src/main.js                      runtime entry (bundled with esbuild into each document)
templates/                       HTML shells for documents and the Library
scripts/                         build, ingest, local server
tests/                           Playwright: P0 diff cases, engine contract, golden output, features, ingest
```

## Develop

```sh
npm install
npx playwright install chromium webkit
npm run build   # regenerate documents/*/index.html and index.html from sources
npm run serve   # http://127.0.0.1:4173/
npm test        # Chromium + WebKit
EDOC_BASE_URL=https://vichsieh9-beep.github.io/edoc/ npm test   # same tests against the live site
```

Change `src/`, `templates/` or `document.json`, then run `npm run build` and commit the
built files too. CI fails if the built files do not match the sources.

Engine changes that reach `main` bump `ENGINE_VERSION` in `src/engine/meta.js` (R2.x).
The golden tests (`tests/__golden__/`) lock version hashes and exact diff output; update them
only for an intended behavior change (`npx playwright test tests/golden.spec.js --update-snapshots`).

## New versions created in the browser

1. Open the document, 開始修訂, edit, 建立新版本.
2. 匯出審閱版 to download the HTML.
3. `npm run ingest -- <downloaded.html>` adds the new version(s) to `document.json` and rebuilds.
   It refuses files whose existing formal versions differ from `document.json`.

## Deploy

Pushing to `main` runs `.github/workflows/pages.yml`: build check and tests first, then only the
site files (`index.html`, `.nojekyll`, `documents/**/index.html`) are published to GitHub Pages.
Never put a GitHub token or any API key in the HTML.
