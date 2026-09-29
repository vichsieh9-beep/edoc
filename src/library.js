// Library page runtime: search for everyone; with an admin link (#edit=<token>) also create,
// rename, archive and restore documents and hand out edit links.
// Bundled by scripts/build.mjs into the Library's single self-contained index.html.
import { readStore, writeStore, removeStore } from './ui/storage.js';
import { callApi, takeEditToken, LIBRARY_TOKEN_KEY } from './ui/api.js';
import { isPublished } from './engine/publish.js';
import { normalizeImportedHtml, textToHtml } from './engine/import.js';
import { docxToHtml } from './engine/docx.js';
import { rowsHtml } from './library/rows.js';
import { h, openModal } from './library/modal.js';
import { openCreateDialog } from './library/create.js';
import { openShareDialog } from './library/share.js';

const $ = (id) => document.getElementById(id);
const data = JSON.parse($('libraryData').textContent);
const state = { admin: null, showArchived: false, query: '' };
const POLL_MS = () => window.__EDOC_POLL_MS || 10000;
const LIVE_TIMEOUT_MS = 10 * 60 * 1000;
const api = (path, payload) => callApi(data.publishApi, path, { token: state.admin.token, ...payload });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const docBySlug = (slug) => data.docs.find((d) => d.slug === slug);

// Stable surface for tests and tooling.
window.EDocLibrary = { docxToHtml, normalizeImportedHtml, textToHtml, get docs() { return data.docs; } };

function notice(message, kind = 'info', link = null) {
  const box = $('notice');
  box.replaceChildren(message, ...(link ? [' ', h('a', { href: link.href }, link.label)] : []));
  box.className = 'notice' + (kind === 'warn' ? ' warn' : '');
  box.hidden = !message;
}

function render() {
  const admin = !!state.admin;
  $('who').hidden = !admin;
  if (admin) $('who').textContent = `管理員・${state.admin.name}`;
  $('newBtn').hidden = !admin;
  $('archToggle').hidden = !admin;
  $('archCount').textContent = data.docs.filter((d) => d.archived).length;
  $('visitorNote').hidden = admin;
  closeMenu();
  const rows = rowsHtml(data.docs, { admin, showArchived: admin && state.showArchived, query: state.query });
  $('list').innerHTML = rows;
  const empty = $('empty');
  empty.hidden = !!rows;
  empty.textContent = state.query.trim() ? '找不到符合的文件' : admin ? '還沒有文件，按「＋ 新增文件」建立第一份。' : '目前沒有公開的文件。';
}

let menu = null;
function closeMenu() {
  menu?.remove();
  menu = null;
}
function openMenu(button, doc) {
  closeMenu();
  const item = (id, label, run, cls) => h('button', { 'data-menu': id, class: cls || null, role: 'menuitem', onclick: () => { closeMenu(); run(); } }, label);
  menu = h('div', { class: 'menu', role: 'menu', 'data-slug': doc.slug },
    item('rename', '改名', () => rename(doc)),
    item('copy', '複製成新文件', () => create('copy', doc.slug)),
    h('a', { role: 'menuitem', 'data-menu': 'pdf', href: `./documents/${doc.slug}/pdf/${doc.latestVersion}.pdf`, download: `${doc.title}_${doc.latestVersion}.pdf` }, '下載最新版 PDF'),
    item('archive', '封存', () => archive(doc), 'danger'));
  const list = $('list');
  menu.style.top = `${button.getBoundingClientRect().bottom - list.getBoundingClientRect().top + 6}px`;
  list.append(menu);
}

function rename(doc) {
  const input = h('input', { class: 'input', id: 'renameInput', value: doc.title, maxlength: 80, 'data-submit': true });
  openModal({
    title: '改名',
    body: [h('div', { class: 'field' }, h('label', { for: 'renameInput' }, '文件名稱'), input),
      h('div', { class: 'box' }, '只改文件庫與頁首顯示的名稱：不會產生新版本，網址也不變。文件內文的大標題請用「開始修訂」修改。')],
    actions: [{ label: '取消' }, {
      label: '儲存', primary: true, id: 'save',
      run: async () => {
        const title = input.value.trim();
        if (!title) throw new Error('請輸入文件名稱。');
        if (title === doc.title) return;
        await api('/documents/rename', { doc: doc.slug, title });
        doc.title = title;
        render();
        notice(`已改名為「${title}」；公開網址約 1～2 分鐘後更新。`);
      },
    }],
  });
  input.select();
}

function archive(doc) {
  openModal({
    title: `封存「${doc.title}」？`,
    body: h('div', { class: 'box' }, '文件庫會隱藏這份文件，公開網址改顯示「此文件已封存」；所有版本都保留，管理員隨時可以在「顯示已封存」裡還原。'),
    actions: [{ label: '取消' }, {
      label: '封存', primary: true, id: 'confirm',
      run: async () => {
        await api('/documents/archive', { doc: doc.slug });
        doc.archived = { date: today(), by: state.admin.name };
        render();
        notice(`已封存「${doc.title}」；公開網址約 1～2 分鐘後改顯示「已封存」。`);
      },
    }],
  });
}

async function restore(doc, button) {
  button.disabled = true;
  try {
    await api('/documents/restore', { doc: doc.slug });
    doc.archived = null;
    render();
    notice(`已還原「${doc.title}」；公開網址約 1～2 分鐘後恢復。`);
  } catch (e) {
    button.disabled = false;
    notice(e.message, 'warn');
  }
}

function create(method, source) {
  openCreateDialog({
    docs: data.docs, api, method, source,
    onCreated: ({ slug, title, latestVersion }) => {
      data.docs.unshift({ slug, title, subtitle: '', latestVersion, updated: { date: today(), by: state.admin.name }, archived: null, pending: true });
      state.query = '';
      $('search').value = '';
      render();
      notice(`已建立「${title}」，約 1～2 分鐘後出現在公開網址。這個頁面可以先關掉，不影響建立。`);
      watchLive(slug);
    },
  });
}

// A new document is live once the redeployed site serves its page.
async function watchLive(slug) {
  const start = Date.now();
  while (Date.now() - start < LIVE_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS()));
    try {
      const res = await fetch(`documents/${slug}/?edoc-check=${Date.now()}`, { cache: 'no-store' });
      if (res.ok && /id="documentState"/.test(await res.text())) {
        const doc = docBySlug(slug);
        if (doc) doc.pending = 'live';
        render();
        notice(`「${doc ? doc.title : slug}」已上線。`, 'info', { href: `./documents/${slug}/`, label: '開啟文件' });
        return;
      }
    } catch {}
  }
  notice('已建立，但還沒偵測到公開網址更新；請稍後重新整理確認。', 'warn');
}

$('list').addEventListener('click', (e) => {
  const button = e.target.closest('[data-act]');
  if (!button || !state.admin) return;
  const doc = docBySlug(button.closest('.row').dataset.slug);
  if (!doc) return;
  const act = button.dataset.act;
  if (act === 'more') {
    e.stopPropagation();
    if (menu && menu.dataset.slug === doc.slug) closeMenu();
    else openMenu(button, doc);
  } else if (act === 'share') openShareDialog({ doc, api });
  else if (act === 'restore') restore(doc, button);
});
document.addEventListener('click', (e) => { if (menu && !menu.contains(e.target)) closeMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
$('search').addEventListener('input', (e) => { state.query = e.target.value; render(); });
$('archCheck').addEventListener('change', (e) => { state.showArchived = e.target.checked; render(); });
$('newBtn').addEventListener('click', () => create('blank'));

// Boot: keep an admin link's token, then ask the publish API who it belongs to.
const fresh = takeEditToken();
if (fresh) writeStore(LIBRARY_TOKEN_KEY, fresh);
render();
(async () => {
  const token = readStore(LIBRARY_TOKEN_KEY);
  if (!token || !data.publishApi || !isPublished(location)) return;
  try {
    const { name } = await callApi(data.publishApi, '/session', { token, scope: 'library' });
    state.admin = { token, name };
    render();
  } catch (e) {
    // Only the link itself being refused forgets it (not e.g. a blocked origin or an outage).
    if (e.status === 401 || e.code === 'forbidden') {
      removeStore(LIBRARY_TOKEN_KEY);
      notice(e.status === 401 ? e.message : '這條連結不是管理員連結，文件庫只能檢視；編輯連結請在文件頁使用。', 'warn');
    } else notice('暫時連不上發布服務，文件庫目前只能檢視；請稍後重新整理。', 'warn');
  }
})();
