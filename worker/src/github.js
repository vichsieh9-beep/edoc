import { HttpError } from './errors.js';
export function github(env, fetchImpl) {
  const api = `https://api.github.com/repos/${env.GITHUB_REPO}/`;
  const base = api + 'contents/';
  const branch = env.GITHUB_BRANCH || 'main';
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'edoc-publish',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const url = (path) => base + path.split('/').map(encodeURIComponent).join('/');
  const unavailable = () => new HttpError(502, 'github', 'GitHub 暫時無法讀取，請稍後再試');
  return {
    async readJson(path) {
      const res = await fetchImpl(`${url(path)}?ref=${encodeURIComponent(branch)}`, { headers });
      if (res.status === 404) throw new HttpError(404, 'not_found', '找不到這份文件');
      if (!res.ok) throw unavailable();
      const data = await res.json();
      let text;
      if (data.encoding === 'base64' && data.content) text = fromBase64Utf8(data.content);
      else {
        // Files over 1 MB come without inline content.
        const raw = await fetchImpl(`${url(path)}?ref=${encodeURIComponent(branch)}`, {
          headers: { ...headers, Accept: 'application/vnd.github.raw' },
        });
        if (!raw.ok) throw unavailable();
        text = await raw.text();
      }
      return { json: JSON.parse(text), sha: data.sha };
    },
    async exists(path) {
      const res = await fetchImpl(`${url(path)}?ref=${encodeURIComponent(branch)}`, { headers });
      if (res.status === 404) return false;
      if (!res.ok) throw unavailable();
      return true;
    },
    // Messages of the commits touching `path` since `since` (ISO time).
    async recentCommits(path, since) {
      const q = new URLSearchParams({ sha: branch, path, since, per_page: '100' });
      const res = await fetchImpl(`${api}commits?${q}`, { headers });
      if (!res.ok) throw unavailable();
      return (await res.json()).map((c) => (c.commit && c.commit.message) || '');
    },
    // sha undefined creates the file (GitHub refuses if it already exists).
    async writeJson(path, value, sha, message, conflictMessage) {
      const res = await fetchImpl(url(path), {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, content: toBase64Utf8(JSON.stringify(value, null, 2) + '\n'), sha, branch }),
      });
      if (res.status === 409 || res.status === 422) throw new HttpError(409, 'conflict', conflictMessage);
      if (!res.ok) throw new HttpError(502, 'github', 'GitHub 暫時無法寫入，請稍後再試');
      const data = await res.json();
      return data.commit && data.commit.sha;
    },
  };
}

function toBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64Utf8(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
