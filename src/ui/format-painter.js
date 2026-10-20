// 格式刷 (R2.17): copy the text formatting at the caret (bold, italic, underline, strikethrough,
// superscript/subscript, colour, highlight, font, size), then select other text to apply it.
// One click paints once; a double click keeps painting until Esc or another click, like Word.
// Paragraph style and alignment are not copied. Applied paragraph by paragraph (wrapSelection).
import { el } from './elements.js';
import { drafting, anchorElement, currentBlock, selectionInDoc, wrapSelection } from './editing.js';
import { FONT_SIZES, TEXT_COLORS, HIGHLIGHT_COLORS, fontFor } from '../engine/content-model.js';

const TAGS = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 's', STRIKE: 's', DEL: 's', SUP: 'sup', SUB: 'sub' };
const ORDER = ['b', 'i', 'u', 's', 'sup', 'sub'];
let painter = null, lastClick = 0, onChange = () => {};

const hex = (rgb) => {
  const m = String(rgb).match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
  if (!m || m[4] === '0') return null;
  return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
};
const pt = (px) => String(Math.round(parseFloat(px) * 0.75 * 2) / 2);

/** The formatting of the text at the caret, compared with its paragraph's own. */
export function formatAtCaret() {
  const a = anchorElement(), block = currentBlock();
  if (!a || !block || !el.doc.contains(a)) return null;
  const f = { tags: new Set() };
  for (let p = a; p && p !== block; p = p.parentElement) {
    if (TAGS[p.tagName]) f.tags.add(TAGS[p.tagName]);
    const cs = getComputedStyle(p);
    if (p.tagName === 'SPAN' && Number(cs.fontWeight) >= 600 && Number(getComputedStyle(p.parentElement).fontWeight) < 600) f.tags.add('b');
    if (p.tagName === 'SPAN' && cs.fontStyle === 'italic') f.tags.add('i');
    if (!f.bg) { const bg = hex(cs.backgroundColor); if (bg && HIGHLIGHT_COLORS.some((c) => c.value === bg)) f.bg = bg; }
  }
  const cs = getComputedStyle(a), bs = getComputedStyle(block);
  const color = hex(cs.color);
  if (color !== hex(bs.color) && TEXT_COLORS.some((c) => c.value === color)) f.color = color;
  const font = fontFor(cs.fontFamily);
  if (font && font !== fontFor(bs.fontFamily)) f.font = font;
  const size = pt(cs.fontSize);
  if (size !== pt(bs.fontSize) && FONT_SIZES.includes(size) && !f.tags.has('sup') && !f.tags.has('sub')) f.size = size;
  return f;
}

function apply() {
  const f = painter.format;
  wrapSelection((span, text) => {
    if (f.color) span.style.color = f.color;
    if (f.bg) span.style.backgroundColor = f.bg;
    if (f.font) span.style.fontFamily = f.font.css;
    if (f.size) span.style.fontSize = f.size + 'pt';
    let inner = text;
    for (const tag of ORDER) if (f.tags.has(tag)) { const t = document.createElement(tag); inner.replaceWith(t); t.append(inner); inner = t; }
  }, ['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'vertical-align'],
  { unwrapTags: 'b,strong,i,em,u,s,strike,del,sup,sub' });
  if (!painter.sticky) stop();
}

export const painting = () => !!painter;
export function stop() {
  painter = null;
  el.doc.classList.remove('painting');
  onChange();
}
/** The painter button: arm (copy the format at the caret), keep painting (double click), stop. */
export function togglePainter() {
  if (!drafting()) return;
  const now = Date.now(), double = now - lastClick < 400;
  lastClick = now;
  if (painter && double) { painter.sticky = true; onChange(); return; }
  if (painter) { stop(); return; }
  const format = formatAtCaret();
  if (!format) return;
  painter = { format, sticky: false };
  el.doc.classList.add('painting');
  onChange();
}
export const painterSticky = () => !!painter?.sticky;

export function initFormatPainter(changed) {
  onChange = changed;
  // A selection made while the painter is on gets the format when the mouse or finger lifts.
  const done = () => setTimeout(() => {
    const r = selectionInDoc();
    if (painter && drafting() && r && !r.collapsed) apply();
  }, 0);
  el.doc.addEventListener('mouseup', done);
  el.doc.addEventListener('touchend', done);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && painter) stop(); });
}
