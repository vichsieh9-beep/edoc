# CLAUDE.md

## Project

EDoc — Editable Document.

Read `EDOC_HANDOFF.md` before making architectural or UX changes.

## Product rule

**Human edits content. The system handles versioning.**

Do not add mandatory revision metadata forms.

Formal versions are immutable/read-only.
Editing always occurs in Draft / Revision.

Since 2026-09-24 (engine R2.7) editing happens on the public page: holders of an edit link
(`#edit=<token>`, name bound to the link) publish new versions through the Worker in `worker/`;
the plain URL is read-only. There is no offline editing, export or import any more; the
official output is the system-generated A4 PDF of each version.

Since 2026-09-29 (engine R2.8) the site is a library of documents. Vic's admin link
(`<site>/#edit=<token>`, role `admin`) manages it from the Library page: create a document
(blank, copy, pasted text or Word .docx converted in the browser), rename (name only: no new
version, same address), archive / restore, and create or revoke per-document edit links.
New documents get a generated address (`documents/d-xxxx/`). Archiving keeps every version;
the page only says it is archived. There is no hard delete from the web: the repo is public,
so archived content stays in git history anyway.

## Current priority

1. Protect diff correctness: keep golden and P0 regression tests passing. Fix correctness before adding features or refactoring; extend coverage for nested lists, inline formatting, tables, images, heading reordering and multi-block paste.
2. Complete and validate the publish-to-PDF flow: after the public page goes live, the newly published version's PDF must be downloadable without reloading. Preserve draft restrictions and historical-version downloads.
3. Protect public editing and library administration: keep secrets out of client code, enforce admin/document-scoped permissions in the Worker, and sanitize stored/imported HTML before rendering.
4. Require Vic's approval of a current-vs-proposed comparison before changes to visual presentation. Preserve immutable formal versions and separate document versions from engine versions.
5. Maintain operational readiness: keep GitHub Pages/CI regression checks healthy and track renewal of the GitHub credential due in September 2027. Treat completed deployment and modularization work as baseline, not pending tasks.

## Critical diff invariant

When a user changes a few characters, only those actual changes may be highlighted.

- Added/modified text: blue
- Deleted text: red strikethrough
- Unchanged text: white
- Previous version changes become white in the next version unless changed again.

Never treat programmatic DOM rendering as user edits.

When accepting a Draft, recompute the formal diff from:

`Base Version Snapshot` vs `Draft Snapshot`

Do not trust transient MutationObserver flags as the formal version diff.

## Versions

Keep these separate:

- Document version: v0.1, v0.2, ...
- EDoc engine version: R2.x

Engine/UI changes must not increment the document version.

EDoc uses R2.x for the engine version, not the global `YYMMDDHHX` build number
(RULES.md §0.6): this project has no UAT/Prod split — pushing to `main` deploys
the public site directly. Every engine/UI change that reaches `main` bumps R2.x;
the document version (v0.x) only changes when the document body is formally revised.

## Deployment

Target repository:

`vichsieh9-beep/edoc`

Target GitHub Pages URL:

`https://vichsieh9-beep.github.io/edoc/`

Document URL:

`https://vichsieh9-beep.github.io/edoc/documents/qa-senior-game-qa/`

Never expose a GitHub PAT/token in client-side code.

## Project board

Trello: https://trello.com/b/RRBl2OX8/edoc (workspace `01_V's`).
Track decisions, releases (one 🚀 card per engine version) and deliverables there;
card references follow RULES.md §4.2. The board is a progress log, not the SSOT.

## Source layout

Edit `src/`, `templates/` or `documents/<slug>/document.json`, then run `npm run build`.
`documents/*/index.html`, `index.html` and `documents/*/pdf/` are build output: not committed,
never edited by hand; CI builds them (and the PDFs) before every deploy. The build must keep
producing one self-contained HTML per document.

Versions published from the web page are committed straight to `document.json` on GitHub by
the Worker, so always `git pull` before changing anything locally (`changelog` and `edit-link`
refuse to write when the local branch is behind).

Edit links: `npm run edit-link -- new --name <名字>` (the link is printed once; `edit-links.json`
stores only its hash), `list`, `revoke <id>`. Vic should run `new`: whoever runs it sees the link.
The admin link comes from `npm run edit-link -- new --name Vic --admin` (terminal only, once);
after that edit links are normally created on the Library page. Admin links can only be revoked
in the terminal.

Golden tests (`tests/__golden__/`) lock version hashes and exact diff output.
Update them only for an intended engine behavior change.

When asked to 「補 vX.Y 摘要」 (AI semantic summary), run `npm run changelog -- vX.Y`,
follow the rules it prints, and write back with `npm run changelog -- vX.Y --apply <file>`.
Never put an AI API key in the site.
