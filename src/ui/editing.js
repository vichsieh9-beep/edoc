// Editing commands shared by the toolbar, tables, find & replace and the format painter.
// Every change is a native editing command (execCommand), so the browser's undo history keeps
// working; comparison fragments are cleared first (see doc-surface.js) and the live DOM is
// never rewritten behind the editor's back. What gets stored is decided by the content model
// when the draft is compared and published.
import { el } from './elements.js';
import { state } from './state.js';
import { prepareForCommand, withObserverPaused } from './doc-surface.js';
import { BLOCK_SELECTOR, ownedTextNodes } from '../engine/dom.js';

let savedRange = null, afterCommand = () => {};
/** What the toolbar does after every command (close its menus, show the new state). */
export function onCommandDone(fn) { afterCommand = fn; }
export function commandDone() { remember(); afterCommand(); }

export const drafting = () => !!state.activeRevision && el.doc.isContentEditable;
export function selectionInDoc() {
  const s = getSelection();
  return s && s.rangeCount && el.doc.contains(s.anchorNode) ? s.getRangeAt(0) : null;
}
export function remember() { const r = selectionInDoc(); if (r) savedRange = r.cloneRange(); }
/** Put the selection back into the document (a menu or input may have taken the focus). */
export function restore() {
  if (selectionInDoc()) return;
  el.doc.focus({ preventScroll: true });
  if (savedRange && el.doc.contains(savedRange.startContainer)) select(savedRange);
}
export function select(range) { const s = getSelection(); s.removeAllRanges(); s.addRange(range); }
export function anchorElement() {
  const r = selectionInDoc() || savedRange;
  if (!r) return null;
  const n = r.startContainer;
  return n.nodeType === 3 ? n.parentElement : n;
}
export const currentBlock = () => anchorElement()?.closest(BLOCK_SELECTOR) || null;
export const inList = () => !!anchorElement()?.closest('li');
/** Get ready for a command: selection back in the document, comparison fragments cleared. */
export function begin() {
  if (!drafting()) return false;
  restore();
  prepareForCommand();
  return true;
}

/** Run one native editing command on the draft, keeping the selection and undo history. */
export function runCommand(command, value = null, { css = false } = {}) {
  if (!begin()) return;
  document.execCommand('styleWithCSS', false, css);
  document.execCommand(command, false, value);
  document.execCommand('styleWithCSS', false, false);
  commandDone();
}

// ---------- Text of the draft, as offsets per paragraph ----------
// Comparison fragments (deleted text shown in red) are not part of the draft's text.
const outsideFragments = (t) => !t.parentElement.closest('.deletion-record,.draft-deletion');
export const draftTextNodes = (block) => ownedTextNodes(block).filter(outsideFragments);
export const draftBlocks = () => [...el.doc.querySelectorAll(BLOCK_SELECTOR)].filter((b) => !b.closest('.deletion-record,.draft-deletion'));
/** Runs of a block's own text inside the range, as character offsets of that block. */
export function pieces(range) {
  const out = [];
  for (const block of draftBlocks()) {
    if (!range.intersectsNode(block)) continue;
    let pos = 0, start = null, end = null;
    for (const t of draftTextNodes(block)) {
      const a = t === range.startContainer ? range.startOffset : range.comparePoint(t, 0) >= 0 ? 0 : t.length;
      const b = t === range.endContainer ? range.endOffset : range.comparePoint(t, t.length) <= 0 ? t.length : 0;
      if (b > a) { if (start === null) start = pos + a; end = pos + b; }
      pos += t.length;
    }
    if (start !== null && end > start) out.push({ block, start, end });
  }
  return out;
}
export function pointAt(block, offset) {
  const nodes = draftTextNodes(block);
  for (const t of nodes) { if (offset <= t.length) return [t, offset]; offset -= t.length; }
  const last = nodes.at(-1);
  return last ? [last, last.length] : [block, block.childNodes.length];
}
export function rangeOf({ block, start, end }) {
  const r = document.createRange();
  r.setStart(...pointAt(block, start));
  r.setEnd(...pointAt(block, end));
  return r;
}

// ---------- Formatting a selection with insertHTML ----------
// insertHTML is undoable in every browser, but replacing content that spans several paragraphs
// breaks lists apart; so each paragraph's part of the selection is replaced on its own (one undo
// step per paragraph). Chrome drops a styled span at the top level of inserted html inside a list
// item: a bare <font> carries it (the content model unwraps it when the draft is stored).
/**
 * Re-wrap the text of the selection. `decorate(span, text)` styles the span around each piece
 * of text; `clear` lists properties removed from the existing markup first, `unwrapTags` the
 * elements unwrapped first (selector).
 */
export function wrapSelection(decorate, clear = [], { unwrapTags = null } = {}) {
  if (!begin()) return;
  const sel = getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return;
  const parts = pieces(sel.getRangeAt(0));
  for (const part of parts) {
    const range = rangeOf(part);
    select(range);
    const box = document.createElement('div');
    box.append(range.cloneContents());
    for (const n of box.querySelectorAll('[style]')) { for (const p of clear) n.style.removeProperty(p); if (!n.getAttribute('style')) n.removeAttribute('style'); }
    for (const f of box.querySelectorAll('font')) { if (clear.includes('font-size')) f.removeAttribute('size'); if (clear.includes('color')) f.removeAttribute('color'); if (clear.includes('font-family')) f.removeAttribute('face'); }
    if (unwrapTags) box.querySelectorAll(unwrapTags).forEach((n) => n.replaceWith(...n.childNodes));
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    const texts = []; let t;
    while ((t = walker.nextNode())) if (t.data.length) texts.push(t);
    for (const text of texts) {
      const span = document.createElement('span');
      const carrier = document.createElement('font');
      text.replaceWith(carrier); carrier.append(span); span.append(text);
      decorate(span, text);
    }
    document.execCommand('insertHTML', false, box.innerHTML);
  }
  // Keep the formatted text selected, like Word does.
  if (parts.length) {
    const first = parts[0], last = parts.at(-1), r = document.createRange();
    r.setStart(...pointAt(first.block, first.start)); r.setEnd(...pointAt(last.block, last.end));
    select(r);
  }
  commandDone();
}

/** The top-level element of the document (paragraph, list, table…) that holds `node`. */
export function topLevel(node) {
  let top = node?.nodeType === 3 ? node.parentElement : node;
  while (top && top.parentElement && top.parentElement !== el.doc) top = top.parentElement;
  return top && top.parentElement === el.doc ? top : null;
}
// An editable paragraph or heading (not a comparison fragment showing deleted text).
export const isTextBlock = (n) => n?.nodeType === 1 && /^(P|H1|H2|H3)$/.test(n.tagName) && !n.matches('.deletion-record,.draft-deletion');
/**
 * An empty paragraph after `node`, added outside the undo history like the other draft
 * fragments: a place for an insertion to land. It is not content: the comparison and the
 * stored version drop empty paragraphs.
 */
export function emptyParagraphAfter(node) {
  const p = document.createElement('p');
  p.append(document.createElement('br'));
  withObserverPaused(() => node.after(p));
  return p;
}
// Page breaks, dividers and tables go between top-level blocks: after the paragraph, heading,
// list or table the caret is in (a list keeps its items together). Browsers move a caret placed
// between blocks into the next one (a list item, say), so it goes to the end of the paragraph
// (Chromium and WebKit then insert after it) or to the start of the paragraph that follows.
export function insertBetweenBlocks(html) {
  if (!begin()) return null;
  const top = topLevel(anchorElement());
  if (!top) { document.execCommand('insertHTML', false, html); commandDone(); return null; }
  const r = document.createRange();
  if (isTextBlock(top)) { r.selectNodeContents(top); r.collapse(false); }
  else { r.selectNodeContents(isTextBlock(top.nextElementSibling) ? top.nextElementSibling : emptyParagraphAfter(top)); r.collapse(true); }
  select(r);
  document.execCommand('insertHTML', false, html);
  commandDone();
  return top;
}
