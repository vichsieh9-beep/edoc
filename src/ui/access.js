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
    const { name,role,actorId,capabilities,policy } = await api('/session', { token, doc: state.meta.slug });
    state.session = { token, name,role,actorId,capabilities,policy };
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

export const capability = key => !!state.session && (state.session.capabilities ? !!state.session.capabilities[key] : key==='propose'||key==='publish'||key==='view'||key==='manage'&&state.session.role==='admin');
export const loadCollaborationSession=checkAccess;
export async function refreshCapabilities(){await checkAccess();const {renderEditBar}=await import('./edit-bar.js');renderEditBar();return state.session;}
const failedOperations=new Map();
export async function collaborationApi(path,payload={}){
 if(!state.session)throw new Error('沒有有效編輯連結');
 const fingerprint=payload.requestId?JSON.stringify([path,Object.fromEntries(Object.entries(payload).filter(([k])=>k!=='requestId'))]):null;
 if(fingerprint){if(failedOperations.has(fingerprint))payload={...payload,requestId:failedOperations.get(fingerprint)};else failedOperations.set(fingerprint,payload.requestId);}
 try{const result=await api(path,{token:state.session.token,doc:state.meta.slug,...payload});if(fingerprint)failedOperations.delete(fingerprint);return result;}
 catch(e){if(fingerprint&&e.status>0&&e.status<500)failedOperations.delete(fingerprint);if(e.status===401||e.status===403){await refreshCapabilities();const {showNotice}=await import('./notice.js');showNotice(e.message+'；草稿已保留。',[{label:'重新確認權限',onClick:refreshCapabilities}],'warn');}throw e;}
}
