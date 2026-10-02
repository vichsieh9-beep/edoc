// 分享編輯權限: the read-only address, who may edit this document, and new edit links.
// A new link is shown once; GitHub keeps only its hash.
import {openSharingPermissions} from '../ui/sharing-permissions.js';
import { h, openModal } from './modal.js';

import { displayDate as day } from '../engine/date.js';

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const old = button.textContent;
    button.textContent = '已複製';
    setTimeout(() => { button.textContent = old; }, 1200);
  } catch {
    alert('瀏覽器未允許直接複製，請手動選取後複製。');
  }
}

function openLegacyShareDialog({ doc, api }) {
  const url = new URL(`documents/${doc.slug}/`, location.href).href;
  let links = [];
  const list = h('div', { class: 'links', id: 'linkList' }, h('div', { class: 'none' }, '讀取中…'));
  const once = h('div', { id: 'linkOnce' });
  const nameInput = h('input', { class: 'input', id: 'linkName', maxlength: 40, placeholder: '對方的名字，例如：客戶法務' });
  const makeBtn = h('button', { class: 'primary', id: 'makeLink', onclick: () => make() }, '產生編輯連結');
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); make(); }
  });

  function renderLinks() {
    const active = links.filter((l) => !l.revoked);
    list.replaceChildren(...(active.length ? active.map(linkRow) : [h('div', { class: 'none' }, '目前只有管理員可以修改這份文件。')]));
  }
  function linkRow(l) {
    const btn = h('button', { class: 'small', 'data-revoke': l.id }, '停用');
    btn.addEventListener('click', async () => {
      if (btn.dataset.confirm !== '1') {
        btn.dataset.confirm = '1';
        btn.textContent = '確定停用？';
        return;
      }
      btn.disabled = true;
      modal.setError('');
      try {
        await api('/links/revoke', { id: l.id });
        l.revoked = true;
        renderLinks();
      } catch (e) {
        modal.setError(e.message);
        btn.disabled = false;
      }
    });
    const meta = `${day(l.createdAt)} 建立 · 有效${l.allDocuments ? ' · 可修改全部文件' : ''}`;
    return h('div', { class: 'l' }, h('div', {}, l.name, h('div', { class: 'meta' }, meta)), btn);
  }

  async function make() {
    const name = nameInput.value.trim();
    if (!name) return modal.setError('請輸入對方的名字。');
    makeBtn.disabled = true;
    modal.setError('');
    try {
      const r = await api('/links', { doc: doc.slug, name });
      links.push({ id: r.id, name: r.name, createdAt: r.createdAt, revoked: false });
      renderLinks();
      const link = `${url}#edit=${r.token}`;
      const copy = h('button', { class: 'small primary', id: 'copyLink', onclick: () => copyText(link, copy) }, '複製連結');
      once.replaceChildren(h('div', { class: 'once' },
        h('b', {}, `已產生 ${r.name} 的編輯連結`),
        h('code', { id: 'onceLink' }, link),
        '這條連結只會顯示這一次，持有的人可以修改這份文件。請直接用 LINE 傳給對方；弄丟了就停用後再產生一條。',
        h('div', { style: 'margin-top:6px' }, copy)));
      nameInput.value = '';
    } catch (e) {
      modal.setError(e.message);
    } finally {
      makeBtn.disabled = false;
    }
  }

  const copyUrl = h('button', { class: 'small', onclick: () => copyText(url, copyUrl) }, '複製');
  const modal = openModal({
    title: '分享編輯權限',
    body: [
      h('div', { class: 'box' }, h('div', {}, doc.title), h('span', { class: 'url' }, `一般網址（只能看）：${url} `), copyUrl),
      h('div', { class: 'field' }, h('div', { class: 'label' }, '可以修改這份文件的人'), list),
      h('div', { class: 'field' }, h('label', { for: 'linkName' }, '新增一位'), h('div', { class: 'row-new' }, nameInput, makeBtn)),
      once,
    ],
    actions: [{ label: '完成', primary: true, id: 'done' }],
    note: '管理員連結可以修改全部文件，不列在這裡。',
  });
  api('/links/list', { doc: doc.slug })
    .then((r) => { links = r.links; renderLinks(); })
    .catch((e) => list.replaceChildren(h('div', { class: 'none' }, e.message)));
  return modal;
}

export async function openShareDialog({doc,api}){
 let session;try{session=await api('/session',{doc:doc.slug});}catch{}
 if(session?.policy?.enabled)return openSharingPermissions({doc,api,session});
 const modal=openLegacyShareDialog({doc,api});
 if(session?.role==='admin'){const button=h('button',{onclick:()=>{modal.close();openSharingPermissions({doc,api,session});}},'設定修訂建議權限');modal.root.append(button);}
 return modal;
}
