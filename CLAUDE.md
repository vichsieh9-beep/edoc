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

## Current priority

1. Publish current site to GitHub Pages.
2. Add regression tests for diff correctness.
3. Fix correctness before refactoring.
4. Only then modularize the engine.

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

Golden tests (`tests/__golden__/`) lock version hashes and exact diff output.
Update them only for an intended engine behavior change.

When asked to 「補 vX.Y 摘要」 (AI semantic summary), run `npm run changelog -- vX.Y`,
follow the rules it prints, and write back with `npm run changelog -- vX.Y --apply <file>`.
Never put an AI API key in the site.
