// Edit access: an edit link (#edit=<token>) lets this browser publish new versions.
// The token stays in this browser only; the publish API checks it on every request.
import { state } from './state.js';
import { readStore, writeStore, removeStore } from './storage.js';
import { isPublished } from '../engine/publish.js';

const tokenKey = () => 'edoc-edit:' + state.docState.documentId;

// Keep the token from an edit link and take it out of the address bar,
// so it is not copied or shared by accident.
export function captureEditToken() {
  const m = location.hash.match(/[#&]edit=([^&]+)/);
  if (!m) return;
  writeStore(tokenKey(), decodeURIComponent(m[1]));
  history.replaceState(null, '', location.pathname + location.search);
}

export const canPublish = () => !!state.meta.publishApi && isPublished(location);

// Simple CORS request (text/plain body): no preflight round trip.
export async function api(path, payload) {
  let res;
  try {
    res = await fetch(state.meta.publishApi + path, {
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

export async function checkAccess() {
  state.session = null;
  const token = readStore(tokenKey());
  if (!token || !canPublish()) return null;
  try {
    const { name } = await api('/session', { token, doc: state.meta.slug });
    state.session = { token, name };
  } catch (e) {
    if (e.status === 401 || e.status === 403) {
      removeStore(tokenKey());
      state.linkProblem = e.message;
    } else {
      state.linkProblem = '暫時連不上發布服務，目前只能檢視；請稍後重新整理。';
    }
  }
  return state.session;
}
