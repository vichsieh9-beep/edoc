// 章節 (R2.18, after Pages' table of contents and bookmarks): the sections of the shown document
// in a menu next to the version menu, the one being read highlighted. A section's link
// (<page>#sec=<name>) opens the page at that section; the name, not a number, so a section added
// in front does not move the link. Nothing here is written into the document: the menu, the link
// button on a heading and the highlight on arrival are page chrome only.
import { el } from './elements.js';
import { state } from './state.js';
import { showNotice } from './notice.js';
import { shareableUrl } from '../engine/publish.js';

const FRAGMENTS = '.deleted,.deletion-record,.draft-deletion';
const LINK_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 00-6.4-6.4l-1.2 1.2"/><path d="M14 10a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 006.4 6.4l1.2-1.2"/></svg>';
let control = null, button = null, menu = null, hoverBtn = null, hoverFor = null, toastTimer = null;

const nameOf = (h) => h.textContent.replace(/[【】]/g, '').replace(/\s+/g, ' ').trim();
/** Sections of the shown document: headings 2 and 3, not deleted wording; repeated names get -2, -3… */
export function sectionList(root = el.doc) {
  const seen = new Map(), out = [];
  for (const h of root.querySelectorAll('h2,h3')) {
    if (h.closest(FRAGMENTS)) continue;
    const name = nameOf(h);
    if (!name) continue;
    const n = (seen.get(name) || 0) + 1;
    seen.set(name, n);
    out.push({ el: h, level: h.tagName === 'H3' ? 3 : 2, name, key: n > 1 ? `${name}-${n}` : name });
  }
  return out.some((s) => s.level === 2) ? out : [];
}
export const sectionUrl = (key) => shareableUrl(location) + '#sec=' + key.replace(/[\s%#]/g, encodeURIComponent);

const headerBottom = () => document.querySelector('.doc-head')?.getBoundingClientRect().bottom || 0;
function scrollToHeading(h, behavior = 'smooth') {
  scrollTo({ top: Math.max(0, h.getBoundingClientRect().top + scrollY - headerBottom() - 18), behavior });
}
// The section being read: the last heading above the upper part of the screen.
function currentKey(list) {
  const line = headerBottom() + 80;
  let key = list[0]?.key || null;
  for (const s of list) if (s.el.getBoundingClientRect().top <= line) key = s.key;
  return key;
}

function toast(text) {
  let t = document.getElementById('sectionToast');
  if (!t) { t = Object.assign(document.createElement('div'), { id: 'sectionToast', className: 'section-toast' }); t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}
export async function copySectionLink(s) {
  const url = sectionUrl(s.key);
  try { await navigator.clipboard.writeText(url); toast(`已複製「${s.name}」這一節的連結`); }
  catch { prompt('複製這一節的連結', url); }
}

function closeMenu() { menu?.classList.remove('open'); button?.setAttribute('aria-expanded', 'false'); }
function openMenu() {
  const list = sectionList();
  const on = currentKey(list);
  menu.replaceChildren();
  const title = Object.assign(document.createElement('div'), { className: 'section-menu-title', textContent: '章節（點一下跳過去；🔗 複製這一節的連結）' });
  menu.append(title);
  for (const s of list) {
    const row = document.createElement('div');
    row.className = 'section-item' + (s.level === 3 ? ' sub' : '') + (s.key === on ? ' active' : '');
    row.setAttribute('role', 'menuitem');
    const go = Object.assign(document.createElement('button'), { type: 'button', className: 'section-go', textContent: s.name });
    go.addEventListener('click', () => { closeMenu(); scrollToHeading(s.el); });
    const link = Object.assign(document.createElement('button'), { type: 'button', className: 'section-link', title: '複製這一節的連結' });
    link.innerHTML = LINK_ICON;
    link.setAttribute('aria-label', `複製「${s.name}」這一節的連結`);
    link.addEventListener('click', () => { closeMenu(); copySectionLink(s); });
    row.append(go, link);
    menu.append(row);
  }
  menu.classList.add('open');
  button.setAttribute('aria-expanded', 'true');
  menu.querySelector('.section-item.active')?.scrollIntoView({ block: 'nearest' });
}

/** Show the 章節 button when the shown document has sections (after every render). */
export function renderSections() {
  if (!control) return;
  control.hidden = !sectionList().length;
  if (control.hidden) closeMenu();
  hideHoverLink();
}

// Desktop reading: a link button after the heading under the mouse (never while editing).
function hideHoverLink() { if (hoverBtn) hoverBtn.hidden = true; hoverFor = null; }
function showHoverLink(h) {
  const s = sectionList().find((x) => x.el === h);
  if (!s) return hideHoverLink();
  if (!hoverBtn) {
    hoverBtn = Object.assign(document.createElement('button'), { type: 'button', className: 'section-hover-link', title: '複製這一節的連結' });
    hoverBtn.innerHTML = LINK_ICON;
    hoverBtn.addEventListener('click', () => { const t = sectionList().find((x) => x.el === hoverFor); if (t) copySectionLink(t); });
    hoverBtn.addEventListener('mouseleave', (e) => { if (!hoverFor?.contains(e.relatedTarget)) hideHoverLink(); });
    document.body.append(hoverBtn);
  }
  hoverFor = h;
  const r = document.createRange();
  r.selectNodeContents(h);
  const rects = [...r.getClientRects()], last = rects.at(-1) || h.getBoundingClientRect();
  hoverBtn.setAttribute('aria-label', `複製「${s.name}」這一節的連結`);
  hoverBtn.style.left = Math.round(last.right + scrollX + 8) + 'px';
  hoverBtn.style.top = Math.round(last.top + scrollY + (last.height - 26) / 2) + 'px';
  hoverBtn.hidden = false;
}

/** Open the section named in the address (#sec=…); a section that is gone says so. */
export function goToSectionFromAddress() {
  const m = location.hash.match(/^#(?:.*&)?sec=([^&]*)/);
  if (!m) return;
  let key;
  try { key = decodeURIComponent(m[1]); } catch { key = m[1]; }
  const s = sectionList().find((x) => x.key === key);
  if (!s) { showNotice(`找不到「${key}」這一節（可能已改名或刪除），顯示的是文件開頭。`, [], 'warn'); return; }
  scrollToHeading(s.el, 'auto');
  // A soft highlight over the heading for a moment; the document itself is not touched.
  const box = s.el.getBoundingClientRect();
  const mark = Object.assign(document.createElement('div'), { className: 'section-arrive' });
  Object.assign(mark.style, { left: box.left + scrollX - 8 + 'px', top: box.top + scrollY - 4 + 'px', width: box.width + 16 + 'px', height: box.height + 8 + 'px' });
  document.body.append(mark);
  setTimeout(() => mark.classList.add('fade'), 1800);
  setTimeout(() => mark.remove(), 2600);
}

export function initSections() {
  control = document.getElementById('sectionControl');
  button = document.getElementById('sectionButton');
  menu = document.getElementById('sectionMenu');
  if (!control) return;
  button.addEventListener('click', (e) => { e.stopPropagation(); if (menu.classList.contains('open')) closeMenu(); else { el.versionMenu.classList.remove('open'); openMenu(); } });
  menu.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', closeMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  el.versionButton.addEventListener('click', closeMenu);
  addEventListener('hashchange', goToSectionFromAddress);
  // Headings added or removed while revising.
  let timer = null;
  el.doc.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(renderSections, 300); });
  if (matchMedia('(hover: hover)').matches) {
    el.doc.addEventListener('mouseover', (e) => {
      const h = e.target.closest?.('h2,h3');
      if (!h || state.activeRevision || h.closest(FRAGMENTS)) return;
      if (h !== hoverFor) showHoverLink(h);
    });
    el.doc.addEventListener('mouseleave', (e) => { if (!hoverBtn?.contains(e.relatedTarget)) hideHoverLink(); });
    el.doc.addEventListener('mouseover', (e) => { if (hoverFor && !e.target.closest?.('h2,h3')) hideHoverLink(); });
    addEventListener('resize', hideHoverLink);
  }
}
