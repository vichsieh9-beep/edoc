// localStorage can be missing or blocked (private windows, previews): never let that break the page.
export function readStore(key) { try { return localStorage.getItem(key); } catch { return null; } }
export function writeStore(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }
export function removeStore(key) { try { localStorage.removeItem(key); } catch {} }
