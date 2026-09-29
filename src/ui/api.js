// Calls to the publish API (worker/). Simple CORS request (text/plain body): no preflight round trip.
// The library page keeps an admin link under LIBRARY_TOKEN_KEY; document pages fall back to it.
export const LIBRARY_TOKEN_KEY = 'edoc-edit:*';

export async function callApi(base, path, payload) {
  let res;
  try {
    res = await fetch(base + path, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(payload),
    });
  } catch {
    throw Object.assign(new Error('連不上發布服務，請確認網路後再試。'), { status: 0 });
  }
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw Object.assign(new Error(data.message || `發布服務錯誤（${res.status}）`), { status: res.status, code: data.error });
  return data;
}

/** Take the token from an #edit=<token> link out of the address bar, so it is not shared by accident. */
export function takeEditToken() {
  const m = location.hash.match(/[#&]edit=([^&]+)/);
  if (!m) return null;
  history.replaceState(null, '', location.pathname + location.search);
  return decodeURIComponent(m[1]);
}
