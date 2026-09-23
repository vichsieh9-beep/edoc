import { cleanSnapshot } from './dom.js';

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
// Version integrity hash: SHA-256 of the content without diff marks.
export function snapshotHash(html) { return sha256(cleanSnapshot(html)); }
