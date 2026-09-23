# CLAUDE.md

## Project

EDoc — Editable Document.

Read `EDOC_HANDOFF.md` before making architectural or UX changes.

## Product rule

**Human edits content. The system handles versioning.**

Do not add mandatory revision metadata forms.

Formal versions are immutable/read-only.
Editing always occurs in Draft / Revision.

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
`documents/*/index.html` and `index.html` are build output — never edit them by hand
(CI fails when they do not match the sources). The build must keep producing one
self-contained HTML per document.

Versions created in the browser come back into `document.json` with
`npm run ingest -- <exported review .html>`.

Golden tests (`tests/__golden__/`) lock version hashes and exact diff output.
Update them only for an intended engine behavior change.
