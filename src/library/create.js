// 新增文件: blank, copy of a published document, pasted text, or a Word or PDF file.
// The page prepares the html; the publish API picks the address and stores it as v0.1.
// Files are converted in the browser: only the resulting html is sent, never the file.
import { h, openModal } from './modal.js';
import { cleanSnapshot, inertContainer } from '../engine/dom.js';
import { escapeText, normalizeImportedHtml, textToHtml } from '../engine/import.js';
import { docxToHtml } from '../engine/docx.js';
import { pdfToHtml } from '../engine/pdf.js';

const METHODS = [['blank', '空白文件'], ['copy', '複製現有文件'], ['paste', '貼上文字'], ['file', '上傳 Word／PDF']];
const MAX_FILE = 20 * 1024 * 1024;
// One upload tab: the file type picks the converter and the method recorded in v0.1.
const KINDS = { docx: { name: 'Word', convert: docxToHtml }, pdf: { name: 'PDF', convert: pdfToHtml } };
const kindOf = (name) => (/\.docx$/i.test(name) ? 'docx' : /\.pdf$/i.test(name) ? 'pdf' : null);

/** Latest version of a published document, without change marks (read from its public page). */
export async function latestContent(slug) {
  const res = await fetch(`documents/${encodeURIComponent(slug)}/?edoc-copy=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('讀不到來源文件，請稍後再試。');
  const page = new DOMParser().parseFromString(await res.text(), 'text/html');
  const read = (id) => JSON.parse(page.getElementById(id)?.textContent || 'null');
  const versions = read('versionData');
  const state = read('documentState');
  if (!versions || !state || !versions[state.latestVersion]) throw new Error('來源文件已封存或格式不符，無法複製。');
  return { version: state.latestVersion, html: cleanSnapshot(versions[state.latestVersion].html) };
}

const hasBody = (html) => {
  const root = inertContainer(html);
  root.querySelectorAll('h1').forEach((e) => e.remove());
  return root.textContent.trim() !== '';
};

function insertHtml(box, html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const sel = getSelection();
  if (sel.rangeCount && box.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(tpl.content);
    range.collapse(false);
  } else box.append(tpl.content);
}

function reportItems(r, kind) {
  if (kind === 'pdf') return pdfReportItems(r);
  const ok = [`標題 ${r.headings} 個、段落 ${r.paragraphs} 段、條列 ${r.listItems} 項`];
  const warn = [];
  if (r.tables) warn.push(`表格 ${r.tables} 個：保留內容與合併儲存格，框線、底色改用 EDoc 樣式`);
  if (r.images) warn.push(`圖片 ${r.images} 張：第一版不匯入`);
  if (r.textBoxes) warn.push(`文字方塊 ${r.textBoxes} 個：未匯入`);
  if (r.headersFooters) warn.push('頁首頁尾：未匯入');
  if (r.comments) warn.push(`註解 ${r.comments} 則：未匯入`);
  if (r.trackedChanges) warn.push(`追蹤修訂 ${r.trackedChanges} 處：以目前顯示的文字匯入，修訂標記不保留`);
  return [...ok.map((t) => h('li', {}, t)), ...warn.map((t) => h('li', { class: 'warn' }, t))];
}

function pdfReportItems(r) {
  const warn = [];
  if (r.runningLines) warn.push(`頁首頁尾與頁碼 ${r.runningLines} 行：未匯入`);
  warn.push('表格與多欄排版會變成一般段落，請對照下方預覽');
  if (r.images) warn.push(`圖片 ${r.images} 張：第一版不匯入`);
  if (r.emptyPages.length) warn.push(`第 ${r.emptyPages.join('、')} 頁沒有文字（可能是掃描頁）：未匯入`);
  if (r.unreadable) warn.push(`${r.unreadable} 個字無法辨識，已略過`);
  return [h('li', {}, `共 ${r.pages} 頁：標題 ${r.headings} 個、段落 ${r.paragraphs} 段、條列 ${r.listItems} 項`), ...warn.map((t) => h('li', { class: 'warn' }, t))];
}

export function openCreateDialog({ docs, api, method: initial = 'blank', source = null, onCreated }) {
  let method = initial;
  let upload = null; // { html, report, fileName, kind }
  let autoName = null;
  const listed = docs.filter((d) => !d.archived && !d.pending);

  const nameInput = h('input', { class: 'input', id: 'newName', maxlength: 80, placeholder: '例如：【GDD】Mini Game 規格書', 'data-submit': true });
  nameInput.addEventListener('input', () => { autoName = null; });
  const suggestName = (name) => {
    if (!nameInput.value.trim() || nameInput.value === autoName) { nameInput.value = name; autoName = name; }
  };

  const sourceSelect = h('select', { class: 'input', id: 'copySource' },
    listed.map((d) => h('option', { value: d.slug }, `${d.title} · 最新版 ${d.latestVersion}`)));
  if (source) sourceSelect.value = source;
  const copyInfo = h('div', { class: 'box', style: 'margin-top:8px' });
  const updateCopy = () => {
    const d = listed.find((x) => x.slug === sourceSelect.value);
    copyInfo.textContent = d ? `新文件的 v0.1 = 這份文件 ${d.latestVersion} 的內容；原文件的版本歷史不會帶過去。` : '目前沒有可以複製的文件。';
    if (d && method === 'copy') suggestName(`${d.title}（複本）`);
  };
  sourceSelect.addEventListener('change', updateCopy);

  const pasteBox = h('div', { class: 'paste', id: 'pasteBox', contenteditable: 'true', 'data-placeholder': '在這裡貼上內容（Ctrl／⌘＋V）' });
  // Pasted or dropped content goes through the import filter before it touches the page.
  const take = (data) => insertHtml(pasteBox, normalizeImportedHtml(data.getData('text/html') || textToHtml(data.getData('text/plain'))).html);
  pasteBox.addEventListener('paste', (e) => { e.preventDefault(); take(e.clipboardData); });
  pasteBox.addEventListener('drop', (e) => { e.preventDefault(); take(e.dataTransfer); });

  const fileInput = h('input', { type: 'file', id: 'fileInput', accept: '.docx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf' });
  const fileLabel = h('span', { id: 'fileName' }, '📄 選擇 Word（.docx）或 PDF 檔');
  const drop = h('label', { class: 'drop', id: 'fileDrop' }, fileInput, fileLabel, h('br'), h('span', { class: 'hint' }, 'Word（.docx）或 PDF 都可以；拖拉檔案到這裡，或按此選擇'));
  const report = h('div', { class: 'box report', id: 'fileReport', hidden: true });
  const preview = h('div', { class: 'preview', id: 'filePreview', hidden: true });
  let loading = 0;
  async function loadFile(file) {
    const turn = ++loading; // a newer file wins over a slower earlier one
    modal.setError('');
    upload = null;
    report.hidden = preview.hidden = true;
    fileLabel.textContent = `📄 ${file.name}（${Math.max(1, Math.round(file.size / 1024))} KB）`;
    const kind = kindOf(file.name);
    if (!kind) return modal.setError('只支援 Word 的 .docx 檔與 PDF；舊版 .doc 請先在 Word 另存成 .docx。');
    const { name, convert } = KINDS[kind];
    if (file.size > MAX_FILE) return modal.setError(`${name} 檔超過 20 MB，請先移除圖片再上傳。`);
    report.replaceChildren(`${name} 轉換中…`);
    report.hidden = false;
    let result;
    try {
      result = await convert(await file.arrayBuffer());
      if (!hasBody(result.html) && !inertContainer(result.html).textContent.trim()) throw new Error(`${name} 檔裡沒有可以匯入的文字。`);
    } catch (e) {
      if (turn !== loading) return;
      report.hidden = true;
      return modal.setError(e.message || `${name} 檔讀取失敗。`);
    }
    if (turn !== loading) return;
    upload = { ...result, fileName: file.name, kind };
    suggestName(file.name.replace(/\.(docx|pdf)$/i, ''));
    report.replaceChildren(h('b', {}, '轉換結果'), h('ul', {}, reportItems(upload.report, kind)), '下面是預覽；按「建立文件」後才成為 v0.1。');
    preview.innerHTML = upload.html;
    report.hidden = preview.hidden = false;
  }
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });

  const panels = {
    blank: h('div', { class: 'field' }, h('div', { class: 'box' }, '建立 v0.1：只有文件名稱當標題。建立後按「開始修訂」撰寫內容，完成後就是 v0.2。')),
    copy: h('div', { class: 'field' }, h('label', { for: 'copySource' }, '以哪一份文件為起點'), sourceSelect, copyInfo),
    paste: h('div', { class: 'field' }, h('div', { class: 'label' }, '把 Word／Google 文件的內容複製後貼在下面（標題、條列、粗體、表格會保留）'), pasteBox),
    file: h('div', { class: 'field' }, drop, report, preview),
  };
  const seg = h('div', { class: 'seg', role: 'tablist' }, METHODS.map(([key, label]) =>
    h('button', { type: 'button', role: 'tab', 'data-method': key, onclick: () => select(key) }, label)));
  function select(key) {
    method = key;
    modal?.setError('');
    seg.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('on', b.dataset.method === key);
      b.setAttribute('aria-selected', String(b.dataset.method === key));
    });
    for (const [k, panel] of Object.entries(panels)) panel.hidden = k !== key;
    if (key === 'copy') updateCopy();
  }

  async function create() {
    const title = nameInput.value.trim();
    if (!title) throw new Error('請輸入文件名稱。');
    const payload = { title, method: method === 'file' ? upload?.kind : method };
    if (method === 'blank') payload.html = `<h1>${escapeText(title)}</h1>`;
    else if (method === 'copy') {
      if (!sourceSelect.value) throw new Error('請選擇要複製的文件。');
      const from = await latestContent(sourceSelect.value);
      payload.html = normalizeImportedHtml(from.html, { title }).html;
      payload.source = { doc: sourceSelect.value, version: from.version };
    } else if (method === 'paste') {
      payload.html = normalizeImportedHtml(pasteBox.innerHTML, { title }).html;
      if (!hasBody(payload.html)) throw new Error('請先貼上內容。');
    } else {
      if (!upload) throw new Error('請先選擇 Word 或 PDF 檔。');
      payload.html = normalizeImportedHtml(upload.html, { title }).html;
      payload.fileName = upload.fileName;
    }
    const res = await api('/documents', payload);
    onCreated({ slug: res.slug, title, latestVersion: res.version });
  }

  const modal = openModal({
    title: '新增文件',
    body: [h('div', { class: 'field' }, h('label', { for: 'newName' }, '文件名稱'), nameInput),
      h('div', { class: 'field' }, h('div', { class: 'label' }, '建立方式'), seg), ...Object.values(panels)],
    actions: [{ label: '取消' }, { label: '建立文件', primary: true, id: 'create', run: create }],
    note: '建立後約 1～2 分鐘出現在文件庫與公開網址。',
  });
  select(method);
  nameInput.focus();
  return modal;
}
