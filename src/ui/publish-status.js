// After publishing: "發布中…" until the redeployed public page carries the new version, then "✓ 已上線".
import { el } from './elements.js';
import { state } from './state.js';
import { showNotice } from './notice.js';
import { updatePdfLink } from './share.js';
import { readStore, writeStore, removeStore } from './storage.js';

const POLL_MS = () => window.__EDOC_POLL_MS || 10000;
const TIMEOUT_MS = 10 * 60 * 1000;
const num = (v) => parseFloat(String(v).slice(1));
const storageKey = () => 'edoc-publish-status:' + state.docState.documentId;
let timer = null;
function savePublishing() {
  const p = state.publishing;
  writeStore(storageKey(), JSON.stringify({ version:p.version, since:p.since, verifyPdf:p.verifyPdf }));
}
function loadLatest() {
  if(state.activeRevision){showNotice('目前有未完成的草稿；請完成或備份草稿後再載入最新版。',[],'warn');return;}
  location.replace(location.pathname + '?v=' + Date.now() + location.hash);
}

async function latestOnSite() {
  const res = await fetch(location.pathname + '?edoc-check=' + Date.now(), { cache: 'no-store' });
  if(!res.ok)throw new Error('公開頁面暫時無法確認');
  const m = (await res.text()).match(/<script id="documentState" type="application\/json">([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]).latestVersion : null;
}

export function renderPublishState(v) {
  const p = state.publishing;
  const show = !!p && (p.version === v || v === state.docState.latestVersion) && !state.privateView && !state.activeRevision;
  el.publishBadge.hidden = !show;
  el.publishNote.hidden = !show;
  if (!show) return;
  const live = p.status === 'live';
  el.publishBadge.textContent = live ? '✓ 已上線' : p.status === 'timeout' ? '已儲存・尚未確認上線' : '已儲存・網站更新中';
  el.publishBadge.classList.toggle('live', live);
  el.publishNote.classList.toggle('live', live);
  const oldPage = num(state.docState.latestVersion) < num(p.version);
  el.publishNote.textContent = live
    ? oldPage ? `${p.version} 已上線；本頁仍顯示 ${state.docState.latestVersion}，請載入最新版。`
      : p.verifyPdf&&!p.pdfReady?'公開網址已更新，PDF 仍在產生；完成後即可下載。':'公開網址已更新，可以用 LINE 通知對方了。'
    : p.status === 'timeout'
      ? `${p.version} 已儲存，但尚未確認網站更新。${oldPage ? `本頁仍顯示 ${state.docState.latestVersion}，不代表退版或修改遺失。` : ''}可重新查詢，無需再次發布。`
      : `${p.version} 已儲存，網站更新中（約 2～3 分鐘）。${oldPage ? `本頁仍顯示 ${state.docState.latestVersion}，不代表退版或修改遺失。` : ''}重新整理後會繼續確認發布進度。`;
  if (live && oldPage) {
    const b=document.createElement('button');b.textContent='載入最新版';b.addEventListener('click',loadLatest);el.publishNote.append(' ',b);
  } else if (p.status === 'timeout') {
    const b=document.createElement('button');b.textContent='重新查詢';b.addEventListener('click',()=>{
      p.status='publishing';p.since=Date.now();savePublishing();renderPublishState(state.activeVersion);clearTimeout(timer);void poll();
    });el.publishNote.append(' ',b);
  }
}

async function poll() {
  const p = state.publishing;
  if (!p || (p.status !== 'publishing' && !(p.verifyPdf&&p.status==='live'&&!p.pdfReady))) return;
  try {
    const live = await latestOnSite();
    if(p!==state.publishing)return;
    if (live && num(live) >= num(p.version)) {
      p.status = 'live';
      if(p.verifyPdf){const res=await fetch(`pdf/${p.version}.pdf?edoc-check=${Date.now()}`,{method:'HEAD',cache:'no-store'});if(p!==state.publishing)return;p.pdfReady=res.ok&&(res.headers.get('Content-Type')||'').includes('application/pdf');}else p.pdfReady=true;
      if(p.pdfReady){state.meta.pdfVersions ||= [];if (!state.meta.pdfVersions.includes(p.version)) state.meta.pdfVersions.push(p.version);}
      updatePdfLink();renderPublishState(state.activeVersion);
      if(num(live)>num(state.docState.latestVersion) && state.activeRevision) {
        showNotice(`${live} 已上線；目前草稿已保留，請完成或備份草稿後再載入最新版。`);
      }
      if(p.pdfReady){p.onComplete?.();return;}
    }
  } catch {}
  if(p!==state.publishing)return;
  if (Date.now() - p.since > TIMEOUT_MS) {
    p.status = 'timeout';
    renderPublishState(state.activeVersion);
    return;
  }
  timer=setTimeout(poll, POLL_MS());
}

export function markPublishing(version,{verifyPdf=false,onComplete=null}={}) {
  clearTimeout(timer);
  state.publishing = { version, status: 'publishing', since: Date.now(),verifyPdf,pdfReady:false,onComplete };
  savePublishing();
  timer=setTimeout(poll, POLL_MS());
}

// Only version/status metadata is persisted; document text and edit tokens are not.
export function resumePublishing() {
  let p;try { p=JSON.parse(readStore(storageKey())||'null'); } catch {}
  if(!p)return;
  if(!/^v\d+\.\d+$/.test(p.version)||!Number.isFinite(p.since)||p.since>Date.now()||Date.now()-p.since>7*24*60*60*1000) {removeStore(storageKey());return;}
  clearTimeout(timer);
  state.publishing={version:p.version,since:p.since,verifyPdf:p.verifyPdf===true,pdfReady:false,status:'publishing'};
  renderPublishState(state.activeVersion);
  timer=setTimeout(poll,0);
}
addEventListener('pagehide',()=>clearTimeout(timer));

// The page may be a cached copy while someone else already published: offer a reload.
export async function checkForNewerVersion() {
  if (!/^https?:$/.test(location.protocol)) return null;
  try {
    const live = await latestOnSite();
    if (live && num(live) > num(state.docState.latestVersion)) {
      showNotice(`已經有更新的版本 ${live}。`, [{ label: '載入最新版', onClick: loadLatest }]);
      return live;
    }
  } catch {}
  return null;
}
