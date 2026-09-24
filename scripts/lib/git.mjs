import { execFileSync } from 'node:child_process';

// Versions can be published from the web straight to GitHub, so local edits to
// document.json / edit-links.json must start from the latest origin state.
export function ensureUpToDate(cwd) {
  try {
    execFileSync('git', ['fetch', '--quiet'], { cwd, stdio: 'ignore' });
  } catch {
    return; // offline: nothing to compare against
  }
  let behind = 0;
  try {
    behind = Number(execFileSync('git', ['rev-list', '--count', 'HEAD..@{u}'], { cwd, encoding: 'utf8' }).trim());
  } catch {
    return;
  }
  if (behind > 0) {
    throw new Error(`本機落後 GitHub ${behind} 個 commit（可能有人在網頁上發布了新版本），請先 git pull 再執行。`);
  }
}
