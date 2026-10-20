// Formatting toolbar of a Draft (R2.16): Word's Home tab essentials. Every command is a native
// editing command, so the browser's undo history keeps working; comparison fragments are
// cleared first (see doc-surface.js) and the live DOM is never rewritten afterwards. What gets
// stored is decided by the content model when the draft is compared and published.
import { el } from './elements.js';
import { state } from './state.js';
import { prepareForCommand } from './doc-surface.js';
import { BLOCK_SELECTOR } from '../engine/dom.js';
import { FONTS, DEFAULT_FONT, FONT_SIZES, TYPE_SCALE, TEXT_COLORS, HIGHLIGHT_COLORS, fontFor } from '../engine/content-model.js';
import { normalizePastedHtml } from '../engine/import.js';
import { fontStylesheet } from '../engine/typography.js';

const svg = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const CHEVRON = '<svg class="chev" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const ICONS = {
  undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>'),
  redo: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/>'),
  left: svg('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'),
  center: svg('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'),
  right: svg('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'),
  justify: svg('<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>'),
  bullet: svg('<circle cx="5" cy="7" r="1.2" fill="currentColor"/><circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="5" cy="17" r="1.2" fill="currentColor"/><path d="M9 7h11M9 12h11M9 17h11"/>'),
  number: svg('<path d="M10 7h10M10 12h10M10 17h10"/><path d="M4 5.5l1.5-1v5" stroke-width="1.5"/><path d="M3.8 14h2.6l-2.6 4h2.8" stroke-width="1.5"/>'),
  outdent: svg('<path d="M4 5h16M11 10h9M11 14h9M4 19h16"/><path d="M8 9l-3 3 3 3"/>'),
  indent: svg('<path d="M4 5h16M11 10h9M11 14h9M4 19h16"/><path d="M5 9l3 3-3 3"/>'),
  link: svg('<path d="M10 14a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 00-6.4-6.4l-1.2 1.2"/><path d="M14 10a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 006.4 6.4l1.2-1.2"/>'),
  clear: svg('<path d="M5 5h12M11 5l-3 14"/><path d="M15 14l5 5M20 14l-5 5"/>'),
  marker: svg('<path d="M14.5 4.5l5 5-7.5 7.5h-5v-5z"/><path d="M7 17l-2.5 2.5"/>'),
};
const letter = (ch, style) => `<span class="fmt-letter" style="${style}">${ch}</span>`;
const PARAGRAPH_STYLES = [
  { tag: 'p', label: '內文', size: TYPE_SCALE.P, weight: 400 },
  { tag: 'h1', label: '標題 1', size: TYPE_SCALE.H1, weight: 800 },
  { tag: 'h2', label: '標題 2', size: TYPE_SCALE.H2, weight: 700 },
  { tag: 'h3', label: '標題 3', size: TYPE_SCALE.H3, weight: 700 },
];
const DEFAULT_TEXT = '#1f1f1f';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const mod = isMac ? '⌘' : 'Ctrl+';
let bar = null, sheet = null, pop = null, savedRange = null, lastColor = TEXT_COLORS[0].value, lastHighlight = HIGHLIGHT_COLORS[0].value;

const drafting = () => !!state.activeRevision && el.doc.isContentEditable;
function selectionInDoc() {
  const s = getSelection();
  return s && s.rangeCount && el.doc.contains(s.anchorNode) ? s.getRangeAt(0) : null;
}
function remember() { const r = selectionInDoc(); if (r) savedRange = r.cloneRange(); }
function restore() {
  if (selectionInDoc()) return;
  el.doc.focus({ preventScroll: true });
  if (savedRange && el.doc.contains(savedRange.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); }
}
function anchorElement() {
  const r = selectionInDoc() || savedRange;
  if (!r) return null;
  const n = r.startContainer;
  return n.nodeType === 3 ? n.parentElement : n;
}
const currentBlock = () => anchorElement()?.closest(BLOCK_SELECTOR) || null;
const inList = () => !!anchorElement()?.closest('li');

/** Run one native editing command on the draft, keeping the selection and undo history. */
export function runCommand(command, value = null, { css = false } = {}) {
  if (!drafting()) return;
  restore();
  prepareForCommand();
  document.execCommand('styleWithCSS', false, css);
  document.execCommand(command, false, value);
  document.execCommand('styleWithCSS', false, false);
  remember();
  closePop();
  refresh();
}

// ---------- Toolbar ----------
function button(key, inner, title, onClick, extra = '') {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'fmt-btn' + extra; b.dataset.k = key; b.title = title; b.setAttribute('aria-label', title.split(' ')[0]);
  b.innerHTML = inner;
  // Keep the caret in the document: the editor selection must not move to the button.
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => { e.preventDefault(); onClick(b, e); });
  return b;
}
const sep = () => Object.assign(document.createElement('span'), { className: 'fmt-sep' });
function dropdown(key, title, width, open) {
  const b = button(key, `<span class="fmt-label"></span>${CHEVRON}`, title, open, ' drop');
  b.style.width = width + 'px';
  return b;
}

function closePop() { pop?.remove(); pop = null; }
function openPop(anchor, build, { wide = false } = {}) {
  if (pop?.dataset.k === anchor.dataset.k) { closePop(); return; }
  closePop();
  remember();
  pop = document.createElement('div');
  pop.className = 'fmt-pop' + (wide ? ' wide' : ''); pop.dataset.k = anchor.dataset.k; pop.setAttribute('role', 'menu');
  pop.addEventListener('mousedown', (e) => { if (!e.target.closest('input')) e.preventDefault(); });
  build(pop);
  document.body.append(pop);
  const r = anchor.getBoundingClientRect(), w = pop.offsetWidth;
  const left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
  // Above the bar when the bar sits at the bottom of a phone screen.
  const below = r.bottom + 6 + pop.offsetHeight < innerHeight || r.top < innerHeight / 2;
  pop.style.left = left + 'px';
  pop.style.top = (below ? r.bottom + 6 : r.top - 6 - pop.offsetHeight) + 'px';
}
function option(label, { selected = false, hint = '', style = '', onPick }) {
  const o = document.createElement('button');
  o.type = 'button'; o.className = 'fmt-opt' + (selected ? ' sel' : ''); o.setAttribute('role', 'menuitem');
  o.innerHTML = `<span style="${style}">${label}</span>${hint ? `<span class="fmt-hint">${hint}</span>` : ''}`;
  o.addEventListener('click', () => onPick());
  return o;
}
function swatches(title, list, current, apply, none) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="fmt-pop-title">${title}</div>`;
  const grid = document.createElement('div'); grid.className = 'fmt-swatches';
  const add = (label, color, value) => {
    const s = document.createElement('button');
    s.type = 'button'; s.className = 'fmt-swatch' + (value === current ? ' sel' : ''); s.title = label; s.setAttribute('aria-label', label);
    s.style.background = color;
    if (!value) s.textContent = none.short;
    s.addEventListener('click', () => apply(value));
    grid.append(s);
  };
  add(none.label, none.color, null);
  for (const c of list) add(c.label, c.value, c.value);
  wrap.append(grid);
  return wrap;
}

const applyStyle = (tag) => runCommand('formatBlock', `<${tag}>`);
const applyFont = (font) => runCommand('fontName', font.css, { css: true });
const applySize = (pt) => runCommand('fontSize', String(FONT_SIZES.indexOf(pt) + 1));
function applyColor(value) { if (value) lastColor = value; runCommand('foreColor', value || DEFAULT_TEXT, { css: true }); }
function applyHighlight(value) { if (value) lastHighlight = value; runCommand('hiliteColor', value || 'transparent', { css: true }); }

function stylePop(p) {
  const tag = (currentBlock()?.tagName || 'P').toLowerCase();
  for (const s of PARAGRAPH_STYLES) p.append(option(s.label, { selected: s.tag === tag, hint: s.size + 'pt', style: `font-size:${Math.min(Number(s.size), 17)}pt;font-weight:${s.weight}`, onPick: () => applyStyle(s.tag) }));
}
function fontPop(p) {
  const current = currentFont();
  for (const f of FONTS) p.append(option(f.label, { selected: f === current, hint: f.hint, style: `font-family:${f.css};font-size:16px`, onPick: () => applyFont(f) }));
}
function sizePop(p) {
  const current = currentSize();
  for (const s of FONT_SIZES) p.append(option(s, { selected: s === current, hint: s === TYPE_SCALE.P ? '內文預設' : '', onPick: () => applySize(s) }));
}
function colorPop(p) {
  p.append(swatches('文字色彩', TEXT_COLORS, null, applyColor, { label: '自動', short: '自動', color: DEFAULT_TEXT }));
  p.append(swatches('螢光筆', HIGHLIGHT_COLORS, null, applyHighlight, { label: '無', short: '無', color: '#fff' }));
}
function linkPop(p) {
  const a = anchorElement()?.closest('a');
  p.innerHTML = '<div class="fmt-pop-title">連結網址</div>';
  const input = Object.assign(document.createElement('input'), { type: 'url', placeholder: 'https://', value: a?.getAttribute('href') || '' });
  input.className = 'fmt-input';
  const row = document.createElement('div'); row.className = 'fmt-row';
  const ok = Object.assign(document.createElement('button'), { type: 'button', textContent: '確定', className: 'primary' });
  const remove = Object.assign(document.createElement('button'), { type: 'button', textContent: '移除連結', hidden: !a });
  const apply = () => {
    let url = input.value.trim();
    if (!url) return;
    if (!/^(https?:|mailto:)/i.test(url)) url = (/^[^\s@]+@[^\s@]+$/.test(url) ? 'mailto:' : 'https://') + url;
    if (!/^(https?:\/\/[^\s]+|mailto:[^\s]+)$/i.test(url)) { input.setCustomValidity('網址格式不對'); input.reportValidity(); return; }
    runCommand('createLink', url);
  };
  ok.addEventListener('click', apply);
  remove.addEventListener('click', () => runCommand('unlink'));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } if (e.key === 'Escape') { closePop(); restore(); } });
  row.append(ok, remove);
  p.append(input, row);
  setTimeout(() => input.focus(), 0);
}
function openLink(anchor = bar.querySelector('[data-k=link]')) {
  if (!drafting()) return;
  if (!selectionInDoc()?.toString() && !anchorElement()?.closest('a')) { alert('請先選取要加上連結的文字。'); return; }
  openPop(anchor, linkPop);
}

// Phone: the "Aa" sheet gathers paragraph style, font, size, colours and alignment.
function openSheet() {
  if (sheet) { closeSheet(); return; }
  remember();
  sheet = document.createElement('div');
  sheet.className = 'fmt-sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', '文字格式');
  sheet.addEventListener('mousedown', (e) => e.preventDefault());
  const row = (title, items) => { const h = document.createElement('div'); h.className = 'fmt-sheet-title'; h.textContent = title; const r = document.createElement('div'); r.className = 'fmt-sheet-row'; r.append(...items); sheet.append(h, r); };
  const chip = (label, selected, onPick, style = '') => { const c = document.createElement('button'); c.type = 'button'; c.className = 'fmt-chip' + (selected ? ' sel' : ''); c.innerHTML = `<span style="${style}">${label}</span>`; c.addEventListener('click', () => { onPick(); renderSheet(); }); return c; };
  const swatch = (label, color, onPick) => { const c = document.createElement('button'); c.type = 'button'; c.className = 'fmt-swatch'; c.title = label; c.setAttribute('aria-label', label); c.style.background = color; c.addEventListener('click', onPick); return c; };
  function renderSheet() {
    if (!sheet) return;
    sheet.replaceChildren();
    const grab = document.createElement('div'); grab.className = 'fmt-grab'; sheet.append(grab);
    const head = document.createElement('div'); head.className = 'fmt-sheet-head'; head.innerHTML = '<b>文字格式</b>';
    const done = Object.assign(document.createElement('button'), { type: 'button', textContent: '完成' }); done.addEventListener('click', closeSheet); head.append(done); sheet.append(head);
    const tag = (currentBlock()?.tagName || 'P').toLowerCase(), font = currentFont(), size = currentSize();
    row('段落樣式', PARAGRAPH_STYLES.map((s) => chip(s.label, s.tag === tag, () => applyStyle(s.tag))));
    row('字型', FONTS.map((f) => chip(f.label, f === font, () => applyFont(f), `font-family:${f.css}`)));
    row('字級', FONT_SIZES.map((s) => chip(s, s === size, () => applySize(s))));
    row('文字色彩', [swatch('自動', DEFAULT_TEXT, () => applyColor(null)), ...TEXT_COLORS.map((c) => swatch(c.label, c.value, () => applyColor(c.value)))]);
    row('螢光筆', [swatch('無', '#fff', () => applyHighlight(null)), ...HIGHLIGHT_COLORS.map((c) => swatch(c.label, c.value, () => applyHighlight(c.value)))]);
    const aligns = [['left', '靠左', 'justifyLeft'], ['center', '置中', 'justifyCenter'], ['right', '靠右', 'justifyRight'], ['justify', '左右對齊', 'justifyFull']];
    row('對齊與縮排', [...aligns.map(([k, label, cmd]) => chip(ICONS[k], queryState(cmd), () => runCommand(cmd), '') ),
      chip(ICONS.outdent, false, () => inList() && runCommand('outdent')), chip(ICONS.indent, false, () => inList() && runCommand('indent'))]);
  }
  renderSheet();
  sheet.renderSheet = renderSheet;
  document.body.append(sheet);
}
function closeSheet() { sheet?.remove(); sheet = null; }

function queryState(cmd) { try { return document.queryCommandState(cmd); } catch { return false; } }
function currentFont() {
  const a = anchorElement();
  if (!a) return DEFAULT_FONT;
  return fontFor(getComputedStyle(a).fontFamily) || DEFAULT_FONT;
}
function currentSize() {
  const a = anchorElement();
  if (!a) return TYPE_SCALE.P;
  const pt = Math.round(parseFloat(getComputedStyle(a).fontSize) * 0.75 * 2) / 2;
  return FONT_SIZES.find((s) => Math.abs(Number(s) - pt) < 0.3) || String(pt);
}

/** Reflect the formatting at the caret: active buttons and dropdown labels. */
function refresh() {
  if (!bar || bar.hidden) return;
  const on = (k, v) => bar.querySelectorAll(`[data-k="${k}"]`).forEach((b) => { b.classList.toggle('on', !!v); b.setAttribute('aria-pressed', String(!!v)); });
  for (const [k, cmd] of [['bold', 'bold'], ['italic', 'italic'], ['underline', 'underline'], ['strike', 'strikeThrough'], ['bullet', 'insertUnorderedList'], ['number', 'insertOrderedList']]) on(k, queryState(cmd));
  const block = currentBlock(), align = block ? getComputedStyle(block).textAlign : 'left';
  on('left', !['center', 'right', 'justify'].includes(align)); on('center', align === 'center'); on('right', align === 'right'); on('justify', align === 'justify');
  const tag = (block?.tagName || 'P').toLowerCase();
  const label = (k, text) => { const l = bar.querySelector(`[data-k="${k}"] .fmt-label`); if (l) l.textContent = text; };
  label('style', (PARAGRAPH_STYLES.find((s) => s.tag === tag) || PARAGRAPH_STYLES[0]).label);
  label('font', currentFont().label);
  label('size', currentSize());
  const listOnly = !inList();
  bar.querySelectorAll('[data-k=indent],[data-k=outdent]').forEach((b) => { b.disabled = listOnly; });
  const styleBtn = bar.querySelector('[data-k=style]');
  if (styleBtn) styleBtn.disabled = !!block && !/^(P|H1|H2|H3)$/.test(block.tagName);
  bar.querySelector('[data-k=color] .fmt-bar-color').style.background = lastColor;
  bar.querySelector('[data-k=mark] .fmt-bar-color').style.background = lastHighlight;
  sheet?.renderSheet?.();
}

function build() {
  bar = document.getElementById('formatBar');
  const b = (k, inner, title, fn, extra) => button(k, inner, title, fn, extra);
  const colorInner = `<span class="fmt-stack">${letter('A', 'font-weight:700')}<span class="fmt-bar-color"></span></span>${CHEVRON}`;
  const markInner = `<span class="fmt-stack">${ICONS.marker}<span class="fmt-bar-color"></span></span>${CHEVRON}`;
  bar.append(
    b('undo', ICONS.undo, `復原 ${mod}Z`, () => runCommand('undo')),
    b('redo', ICONS.redo, `重做 ${isMac ? '⇧⌘Z' : 'Ctrl+Y'}`, () => runCommand('redo')),
    sep(),
    b('aa', '<span class="fmt-aa">Aa</span>', '文字格式', openSheet, ' phone-only'),
    dropdown('style', '段落樣式', 84, (btn) => openPop(btn, stylePop)),
    sep(),
    dropdown('font', '字型', 104, (btn) => openPop(btn, fontPop)),
    dropdown('size', '字級', 58, (btn) => openPop(btn, sizePop)),
    sep(),
    b('bold', letter('B', 'font-weight:700'), `粗體 ${mod}B`, () => runCommand('bold')),
    b('italic', letter('I', 'font-style:italic;font-family:Tinos,serif'), `斜體 ${mod}I`, () => runCommand('italic')),
    b('underline', letter('U', 'text-decoration:underline'), `底線 ${mod}U`, () => runCommand('underline')),
    b('strike', letter('S', 'text-decoration:line-through'), `刪除線 ${isMac ? '⇧⌘X' : 'Ctrl+Shift+X'}`, () => runCommand('strikeThrough')),
    b('color', colorInner, '文字色彩', (btn) => openPop(btn, colorPop, { wide: true })),
    b('mark', markInner, '螢光筆', (btn) => openPop(btn, colorPop, { wide: true })),
    b('clear', ICONS.clear, '清除格式', () => runCommand('removeFormat')),
    sep(),
    b('left', ICONS.left, '靠左', () => runCommand('justifyLeft')),
    b('center', ICONS.center, '置中', () => runCommand('justifyCenter')),
    b('right', ICONS.right, '靠右', () => runCommand('justifyRight')),
    b('justify', ICONS.justify, '左右對齊', () => runCommand('justifyFull')),
    sep(),
    b('bullet', ICONS.bullet, `項目符號 ${isMac ? '⇧⌘8' : 'Ctrl+Shift+8'}`, () => runCommand('insertUnorderedList')),
    b('number', ICONS.number, `編號 ${isMac ? '⇧⌘7' : 'Ctrl+Shift+7'}`, () => runCommand('insertOrderedList')),
    b('outdent', ICONS.outdent, '減少縮排 ⇧Tab', () => runCommand('outdent')),
    b('indent', ICONS.indent, '增加縮排 Tab', () => runCommand('indent')),
    sep(),
    b('link', ICONS.link, `連結 ${mod}K`, (btn) => openLink(btn)),
  );
}

// ---------- Keyboard and paste ----------
function onKeydown(e) {
  if (!drafting() || state.composing) return;
  const m = isMac ? e.metaKey : e.ctrlKey;
  const key = e.key.toLowerCase();
  const take = (fn) => { e.preventDefault(); e.stopImmediatePropagation(); fn(); };
  if (e.key === 'Tab' && !m && !e.altKey && inList()) return take(() => runCommand(e.shiftKey ? 'outdent' : 'indent'));
  if (!m) return;
  // Bold / italic / underline: the same command in every browser (Safari's are menu shortcuts).
  if (!e.shiftKey && !e.altKey && (key === 'b' || key === 'i' || key === 'u')) return take(() => runCommand({ b: 'bold', i: 'italic', u: 'underline' }[key]));
  if (key === 'k' && !e.shiftKey) return take(() => openLink());
  if (e.shiftKey && (e.code === 'Digit7' || key === '7' || key === '&')) return take(() => runCommand('insertOrderedList'));
  if (e.shiftKey && (e.code === 'Digit8' || key === '8' || key === '*')) return take(() => runCommand('insertUnorderedList'));
  if (e.shiftKey && key === 'x') return take(() => runCommand('strikeThrough'));
  if (e.altKey && /^Digit[0-3]$/.test(e.code)) return take(() => applyStyle(e.code === 'Digit0' ? 'p' : 'h' + e.code.slice(5)));
  if (e.shiftKey && key === 'v') return take(async () => {
    try { const text = await navigator.clipboard.readText(); restore(); prepareForCommand(); document.execCommand('insertText', false, text); }
    catch { alert('瀏覽器未允許讀取剪貼簿，請改用一般貼上。'); }
  });
}
// insertHTML is the undoable way to paste html, but Chrome drops a styled span that sits at the
// top level of the inserted html inside a list item. A bare <font> carries it through (the
// content model unwraps it again when the draft is stored); one pasted paragraph is merged as text.
export function pasteCarrier(html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  const only = t.content.children.length === 1 && t.content.firstElementChild;
  if (only && /^(P|H1|H2|H3)$/.test(only.tagName) && ![...t.content.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) only.replaceWith(...only.childNodes);
  for (const span of t.content.querySelectorAll('span[style]')) {
    const parent = span.parentNode;
    if (parent === t.content || parent.matches?.(BLOCK_SELECTOR)) { const font = document.createElement('font'); span.replaceWith(font); font.append(span); }
  }
  return t.innerHTML;
}
function onPaste(e) {
  if (!drafting()) return;
  const html = e.clipboardData?.getData('text/html');
  if (!html) return; // plain text: the browser inserts it as typed text
  e.preventDefault();
  const clean = normalizePastedHtml(html);
  if (clean.trim()) document.execCommand('insertHTML', false, pasteCarrier(clean));
  else document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
}

// Readers load only the fonts a document uses; an editor can pick any of them.
function loadAllFonts() {
  for (const f of FONTS) {
    if (document.querySelector(`link[data-font="${f.id}"]`)) continue;
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: fontStylesheet(f) });
    link.dataset.font = f.id;
    document.head.append(link);
  }
}
export function renderToolbar() {
  if (!bar) return;
  const show = drafting();
  bar.hidden = !show;
  document.body.classList.toggle('formatting', show);
  if (!show) { closePop(); closeSheet(); return; }
  loadAllFonts();
  refresh();
}

export function initToolbar() {
  if (!document.getElementById('formatBar')) return;
  build();
  el.doc.addEventListener('keydown', onKeydown);
  el.doc.addEventListener('paste', onPaste);
  document.addEventListener('selectionchange', () => { if (selectionInDoc()) { remember(); refresh(); } });
  el.doc.addEventListener('input', () => refresh());
  document.addEventListener('mousedown', (e) => { if (pop && !pop.contains(e.target) && !e.target.closest('#formatBar')) closePop(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePop(); closeSheet(); } });
  addEventListener('resize', closePop);
}
