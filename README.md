# EDoc — Editable Document

Human edits content. The system handles versioning.

- Library: `/index.html` → https://vichsieh9-beep.github.io/edoc/
- 【QA】資深遊戲測試工程師: `/documents/qa-senior-game-qa/` → https://vichsieh9-beep.github.io/edoc/documents/qa-senior-game-qa/

Each document is a single self-contained HTML file (`documents/<document-id>/index.html`)
that works offline (`file://`) and on GitHub Pages. Product rules and the engineering plan
are in `EDOC_HANDOFF.md`; working rules for AI agents are in `CLAUDE.md`.

## Develop

```sh
npm install
npx playwright install chromium webkit
npm run serve   # http://127.0.0.1:4173/
npm test        # diff regression + feature parity tests (Chromium, WebKit)
```

## Deploy

Pushing to `main` runs `.github/workflows/pages.yml`: tests first, then only the site files
(`index.html`, `.nojekyll`, `documents/`) are published to GitHub Pages.
Never put a GitHub token or any API key in the HTML.
