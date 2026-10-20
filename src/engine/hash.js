import { cleanSnapshot } from './dom.js';
import { layoutHashSuffix } from './layout.js';

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
// Version integrity hash: SHA-256 of the content without diff marks, plus the document format
// when the version has one (R2.17; versions without one keep their hash).
export function snapshotHash(html, layout = null) { return sha256(cleanSnapshot(html) + layoutHashSuffix(layout)); }
