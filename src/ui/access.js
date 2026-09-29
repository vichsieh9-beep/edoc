// Edit access: an edit link (#edit=<token>) lets this browser publish new versions.
// The token stays in this browser only; the publish API checks it on every request.
// An admin link opened on the library page also works here (it may edit every document).
import { state } from './state.js';
import { readStore, writeStore, removeStore } from './storage.js';
import { isPublished } from '../engine/publish.js';
import { callApi, takeEditToken, LIBRARY_TOKEN_KEY } from './api.js';

const tokenKey = () => 'edoc-edit:' + state.docState.documentId;

export function captureEditToken() {
  const token = takeEditToken();
  if (token) writeStore(tokenKey(), token);
}

export const canPublish = () => !!state.meta.publishApi && isPublished(location);

export const api = (path, payload) => callApi(state.meta.publishApi, path, payload);

export async function checkAccess() {
  state.session = null;
  const own = readStore(tokenKey());
  const key = own ? tokenKey() : LIBRARY_TOKEN_KEY;
  const token = own || readStore(LIBRARY_TOKEN_KEY);
  if (!token || !canPublish()) return null;
  try {
    const { name } = await api('/session', { token, doc: state.meta.slug });
    state.session = { token, name };
  } catch (e) {
    // Only the link itself being refused forgets it (not e.g. a blocked origin or an outage).
    if (e.status === 401 || (e.code === 'forbidden' && own)) {
      removeStore(key);
      state.linkProblem = e.message;
    } else if (e.code !== 'forbidden') {
      state.linkProblem = '暫時連不上發布服務，目前只能檢視；請稍後重新整理。';
    }
  }
  return state.session;
}
