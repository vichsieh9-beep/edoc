// 尋找與取代 (R2.17): ⌘⇧H or the magnifier opens the panel. Every match in the draft is marked
// yellow, the current one orange; the overview lists each match with its section and the words
// around it, and a click there scrolls the document to it. Replacing is native typing (one undo
// step per replacement), so it is marked as a change like any other edit. The browser's own ⌘F
// keeps working. Comparison fragments (deleted text shown in red) are never matched.
import { el } from './elements.js';
import { begin, commandDone, draftBlocks, draftTextNodes, rangeOf, select } from './editing.js';
import { openPanel, closePanel, openPanelKind } from './panel.js';
import { sectionNameFor } from '../engine/diff.js';

const CONTEXT = 14;
let find = '', replace = '', matches = [], current = -1, panel = null, refreshTimer = null, status = '';

// Case-insensitive for Latin letters, one character for one character.
const fold = (s) => [...s].map((c) => { const l = c.toLowerCase(); return l.length === c.length ? l : c; }).join('');
const blockText = (block) => draftTextNodes(block).map((t) => t.data).join('');
const sectionOf = (block) => (block.tagName === 'H1' ? '標題' : sectionNameFor(block, el.doc));

function search() {
  matches = [];
  if (!find) return;
  const needle = fold(find);
  for (const block of draftBlocks()) {
    // A nested block (a list inside a list item) is searched on its own.
    const text = blockText(block), hay = fold(text);
    for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) {
      matches.push({ block, start: i, end: i + needle.length, text });
    }
  }
}
function paint() {
  if (!CSS.highlights || typeof Highlight === 'undefined') return;
  CSS.highlights.delete('edoc-find'); CSS.highlights.delete('edoc-find-current');
  if (!panel) return;
  const ranges = matches.map(rangeOf);
  CSS.highlights.set('edoc-find', new Highlight(...ranges.filter((_, i) => i !== current)));
  if (ranges[current]) CSS.highlights.set('edoc-find-current', new Highlight(ranges[current]));
}
function scrollToCurrent() {
  const m = matches[current];
  if (!m) return;
  const rect = rangeOf(m).getBoundingClientRect();
  const head = document.querySelector('.doc-head')?.getBoundingClientRect().bottom || 0;
  // On a phone the panel covers the lower part of the screen: the match goes near the top.
  const phone = matchMedia('(max-width: 720px)').matches;
  const want = phone ? head + 48 : Math.max(head + 48, innerHeight / 3);
  if (rect.top < head + 8 || rect.bottom > (phone ? innerHeight * 0.38 : innerHeight - 24) || !phone && rect.top > innerHeight * 0.7) {
    scrollTo({ top: scrollY + rect.top - want, behavior: 'smooth' });
  }
}

function render({ keepScroll = false } = {}) {
  if (!panel) return;
  if (current >= matches.length) current = matches.length - 1;
  if (current < 0 && matches.length) current = 0;
  // "已取代 N 筆" stays until the next search or move.
  panel.querySelector('.find-count').textContent = status || (!find ? '' : matches.length ? `第 ${current + 1} 筆／共 ${matches.length} 筆` : '找不到');
  for (const k of ['prev', 'next', 'one', 'all']) panel.querySelector(`[data-k=${k}]`).disabled = !matches.length;
  const list = panel.querySelector('.find-list');
  list.replaceChildren();
  list.hidden = !matches.length;
  panel.querySelector('.find-overview').hidden = !matches.length;
  matches.forEach((m, i) => {
    const row = Object.assign(document.createElement('button'), { type: 'button', className: 'find-row' + (i === current ? ' on' : '') });
    row.dataset.i = i;
    const before = m.text.slice(Math.max(0, m.start - CONTEXT), m.start), after = m.text.slice(m.end, m.end + CONTEXT);
    const num = Object.assign(document.createElement('span'), { className: 'find-num', textContent: i + 1 });
    const body = document.createElement('span'); body.className = 'find-body';
    const sec = Object.assign(document.createElement('span'), { className: 'find-sec', textContent: sectionOf(m.block) });
    const ctx = document.createElement('span'); ctx.className = 'find-ctx';
    const mark = Object.assign(document.createElement('mark'), { textContent: m.text.slice(m.start, m.end) });
    ctx.append((m.start > CONTEXT ? '…' : '') + before, mark, after + (m.end + CONTEXT < m.text.length ? '…' : ''));
    body.append(sec, ctx);
    row.append(num, body);
    row.addEventListener('click', () => go(i));
    list.append(row);
  });
  paint();
  const on = list.querySelector('.find-row.on');
  if (on && !keepScroll) on.scrollIntoView({ block: 'nearest' });
}
function go(i) {
  if (!matches.length) return;
  status = '';
  current = (i + matches.length) % matches.length;
  render();
  scrollToCurrent();
}
function refresh() {
  if (!panel) return;
  const at = matches[current];
  search();
  // Stay on the same match (or the next one) after the document changed.
  if (at) {
    const order = draftBlocks();
    const pos = (m) => [order.indexOf(m.block), m.start];
    const [b, s] = pos(at);
    const k = matches.findIndex((m) => { const [mb, ms] = pos(m); return mb > b || (mb === b && ms >= s); });
    current = k < 0 ? matches.length - 1 : k;
  }
  render({ keepScroll: true });
}

/** Replace one match (as typing, one undo step); the matches move on to the next one. */
function replaceAt(m) {
  el.doc.focus({ preventScroll: true });
  select(rangeOf(m));
  if (replace) document.execCommand('insertText', false, replace);
  else document.execCommand('delete');
}
function replaceOne() {
  const m = matches[current];
  if (!m || !begin()) return;
  replaceAt(m);
  commandDone();
  refresh();
  scrollToCurrent();
}
function replaceAll() {
  if (!matches.length || !begin()) return;
  const n = matches.length;
  // From the last match back, so the offsets of the earlier ones stay valid.
  for (const m of [...matches].reverse()) replaceAt(m);
  commandDone();
  status = `已取代 ${n} 筆`;
  refresh();
}

export function openFindPanel(anchor) {
  if (openPanelKind() === 'find') { panel.querySelector('input').select(); return; }
  // The selected words are what you look for, like Word.
  const picked = getSelection()?.toString().trim();
  if (picked && picked.length <= 80 && !picked.includes('\n')) find = picked;
  panel = openPanel('find', {
    anchor, title: '尋找與取代', width: 440,
    onClose: () => { panel = null; matches = []; current = -1; paint(); },
    build(p) {
      p.insertAdjacentHTML('beforeend', `
        <div class="fmt-panel-row"><label for="findText">尋找</label><input id="findText" class="fmt-input find-input" type="search" autocomplete="off" enterkeyhint="search"></div>
        <div class="fmt-panel-row"><label for="replaceText">取代為</label><input id="replaceText" class="fmt-input find-input" type="text" autocomplete="off"></div>
        <div class="find-actions"><span class="find-count" aria-live="polite"></span>
          <button type="button" data-k="prev">上一筆</button><button type="button" data-k="next">下一筆</button>
          <button type="button" data-k="one">取代</button><button type="button" data-k="all" class="primary">全部取代</button></div>
        <div class="find-overview">搜尋結果總覽（點一筆，文件跳到該處）</div>
        <div class="find-list" role="list"></div>`);
      const [f, r] = p.querySelectorAll('input');
      f.value = find; r.value = replace;
      f.addEventListener('input', () => { find = f.value; status = ''; current = 0; search(); render(); scrollToCurrent(); });
      r.addEventListener('input', () => { replace = r.value; });
      f.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(current + (e.shiftKey ? -1 : 1)); } });
      r.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); replaceOne(); } });
      p.querySelector('[data-k=prev]').addEventListener('click', () => go(current - 1));
      p.querySelector('[data-k=next]').addEventListener('click', () => go(current + 1));
      p.querySelector('[data-k=one]').addEventListener('click', replaceOne);
      p.querySelector('[data-k=all]').addEventListener('click', replaceAll);
    },
  });
  if (!panel) return;
  current = 0; status = '';
  search();
  render();
  scrollToCurrent();
  setTimeout(() => { const f = panel?.querySelector('input'); f?.focus(); f?.select(); }, 0);
}
export const closeFindPanel = () => { if (openPanelKind() === 'find') closePanel(); };

export function initFindReplace() {
  // Typing, undo and the comparison fragments change the text: look again.
  const later = () => { clearTimeout(refreshTimer); if (panel) refreshTimer = setTimeout(refresh, 120); };
  el.doc.addEventListener('input', later);
  el.doc.addEventListener('edoc-markup-invalidated', later);
}
