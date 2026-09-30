# EDoc — Editable Document

Human edits content. The system handles versioning.

- Library: https://vichsieh9-beep.github.io/edoc/
- 【QA】資深遊戲測試工程師: https://vichsieh9-beep.github.io/edoc/documents/qa-senior-game-qa/

Anyone with the public URL can read every version and download its official A4 PDF.
Holders of an **edit link** can revise the document on the page and publish the next version;
LINE (or anything else) is only used to tell each other "done". The **admin link** opens the
Library with management controls: new documents, rename, archive / restore, and edit links. Product rules and history are in
`EDOC_HANDOFF.md`; working rules for AI agents are in `CLAUDE.md`.

## Layout

```text
documents/<slug>/document.json   content SSOT: every formal version (append-only)
edit-links.json                  edit links (SHA-256 of each token only)
edoc.config.json                 public site URL and publish API URL
src/engine/                      diff, changes, ai-summary, revision (html filtering), import + docx (new documents), text, hash, version, publish, meta (R2.x)
src/ui/                          document page: header, edit access, draft + publishing, version view, sharing, styles.css
src/library.js, src/library/     Library page: rows, dialogs (new document, share), styles.css
templates/                       HTML shells for documents, archived documents and the Library
worker/                          publish API (Cloudflare Worker): appends versions, manages documents and edit links on GitHub
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

Local tests serve isolated HTML from `_site/test/`, with QA pinned to the immutable v0.7 baseline; publishing newer real documents does not change the test starting point.

The golden tests (`tests/__golden__/`) lock version hashes and exact diff output; update them
only for an intended behavior change (`npx playwright test tests/golden.spec.js --update-snapshots`).
Engine changes that reach `main` bump `ENGINE_VERSION` in `src/engine/meta.js` (R2.x).

## Editing and publishing

1. Once: `npm run edit-link -- new --name Vic --admin` prints the admin link (shown once), push
   `edit-links.json`. Opening it shows the Library with 「＋ 新增文件」, 「分享」 and 「⋯」.
2. Give a person an edit link: 分享 → name → 產生編輯連結 (shown once; send it by LINE). It works
   right away. In the terminal: `npm run edit-link -- new --name 客戶法務 [--doc <slug>]`, push.
3. They open the link, 開始修訂, edit, 完成修訂-版本更新 → 發布. The Worker appends the version to
   `document.json` on GitHub; CI rebuilds and redeploys (about 2–3 minutes), then the page shows ✓ 已上線.
4. Stop a link: 分享 → 停用 (or `npm run edit-link -- revoke <id>`, push). Admin links: terminal only.

New documents (空白、複製、貼上文字、上傳 Word) get the address `documents/d-xxxx/` and appear
after the next deploy. Archived documents leave the Library and their page only says so; every
version stays in `document.json` (and in the public git history).

The document offers 「所有標記」 (insertions underlined in the body, deletions in the revision rail) and 「簡單標記」 (current wording with revision margin lines). On narrow screens, the revision rail moves below the document. Draft insertion highlights use the CSS Highlight API without rewriting editable text nodes; browsers without that API retain the margin hints and deletion rail.

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
files or `edit-links.json` changed), then build, official PDFs, and deploy of the site files only.

The publish API is deployed separately from `worker/` (`npx wrangler deploy`, secret `GITHUB_TOKEN`:
a fine-grained token with Contents read/write on this repo only). Its URL goes into
`edoc.config.json` → `publishApi`; until then the site is read-only for everyone.
Never put a GitHub token or any API key in the HTML.
