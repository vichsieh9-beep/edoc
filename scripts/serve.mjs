// Minimal static server that mimics GitHub Pages path handling
// (directory → index.html, missing trailing slash → 301).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)), process.env.EDOC_SITE_DIR || '.');
const PORT = Number(process.env.PORT || 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = normalize(join(ROOT, path));
    if (file !== ROOT && !file.startsWith(ROOT + sep)) return res.writeHead(403).end();
    let info = await stat(file).catch(() => null);
    if (info?.isDirectory()) {
      if (!path.endsWith('/')) return res.writeHead(301, { Location: path + '/' }).end();
      file = join(file, 'index.html');
      info = await stat(file).catch(() => null);
    }
    if (!info) return res.writeHead(404).end('Not found');
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(await readFile(file));
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
}).listen(PORT, '127.0.0.1', () => console.log(`EDoc site: http://127.0.0.1:${PORT}/`));
