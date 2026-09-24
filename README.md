# EDoc — Editable Document

Human edits content. The system handles versioning.

- Library: https://vichsieh9-beep.github.io/edoc/
- 【QA】資深遊戲測試工程師: https://vichsieh9-beep.github.io/edoc/documents/qa-senior-game-qa/

Anyone with the public URL can read every version and download its official A4 PDF.
Holders of an **edit link** can revise the document on the page and publish the next version;
LINE (or anything else) is only used to tell each other "done". Product rules and history are in
`EDOC_HANDOFF.md`; working rules for AI agents are in `CLAUDE.md`.

## Layout

```text
documents/<slug>/document.json   content SSOT: every formal version (append-only)
edit-links.json                  edit links (SHA-256 of each token only)
edoc.config.json                 public site URL and publish API URL
src/engine/                      diff, changes, ai-summary, revision (html filtering), text, hash, version, publish, meta (R2.x)
src/ui/                          header, edit access, draft + publishing, version view, sharing, styles.css
templates/                       HTML shells for documents and the Library
worker/                          publish API (Cloudflare Worker) that appends versions on GitHub
scripts/                         build, pdf, changelog (AI summaries), edit-link, local server
tests/                           Playwright: P0 diff cases, engine contract, golden output, features, worker, tools
```

Build output (`index.html`, `documents/*/index.html`, `documents/*/pdf/`) is not committed.

## Develop

```sh
npm install
npx playwright install chromium webkit
npm run build   # documents/*/index.html and the Library
npm run pdf     # build + official PDFs in documents/<slug>/pdf/
npm run serve   # build + http://127.0.0.1:4173/
npm test        # Chromium + WebKit; publishing runs the real Worker code against a fake GitHub
EDOC_BASE_URL=https://vichsieh9-beep.github.io/edoc/ npm test   # read-only checks against the live site
```

The golden tests (`tests/__golden__/`) lock version hashes and exact diff output; update them
only for an intended behavior change (`npx playwright test tests/golden.spec.js --update-snapshots`).
Engine changes that reach `main` bump `ENGINE_VERSION` in `src/engine/meta.js` (R2.x).

## Editing and publishing

1. Create a link for a person: `npm run edit-link -- new --name 客戶法務` (shown once), push `edit-links.json`.
2. They open the link, 開始修訂, edit, 完成修訂-版本更新 → 發布. The Worker appends the version to
   `document.json` on GitHub; CI rebuilds and redeploys (about 2–3 minutes), then the page shows ✓ 已上線.
3. Stop a link: `npm run edit-link -- revoke <id>`, push.

Drafts are saved in the editor's browser as they type. The Worker only appends the next version,
checks the link and the version chain, and never edits older versions.

## AI semantic summaries

```sh
npm run changelog                                # versions still waiting for an AI summary
npm run changelog -- v0.8                        # change list + writing rules for the AI
npm run changelog -- v0.8 --apply summary.json   # validate, store in document.json, rebuild
```

## Deploy

Pushing to `main` runs `.github/workflows/pages.yml`: tests (skipped when only `document.json`
changed), then build, official PDFs, and deploy of the site files only.

The publish API is deployed separately from `worker/` (`npx wrangler deploy`, secret `GITHUB_TOKEN`:
a fine-grained token with Contents read/write on this repo only). Its URL goes into
`edoc.config.json` → `publishApi`; until then the site is read-only for everyone.
Never put a GitHub token or any API key in the HTML.
