// Floating panels of the toolbar (R2.17): the document format and find & replace. On a desktop
// a panel opens under its toolbar button; on a phone it rises from the bottom of the screen and
// leaves the upper part of the document in view.
let current = null;
const PHONE = '(max-width: 720px)';

export function closePanel() {
  if (!current) return;
  const { el, onClose } = current;
  current = null;
  el.remove();
  onClose?.();
}
export const openPanelKind = () => current?.kind || null;

/** Open the `kind` panel (a second click on its button closes it). Returns the panel element. */
export function openPanel(kind, { anchor, title, width = 380, build, onClose, closeOnOutside = false }) {
  if (current?.kind === kind) { closePanel(); return null; }
  closePanel();
  const panel = document.createElement('div');
  panel.className = 'fmt-panel ' + kind;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', title);
  panel.style.setProperty('--panel-width', width + 'px');
  // Buttons keep the document's selection; inputs and selects take the focus as usual.
  panel.addEventListener('mousedown', (e) => { if (!e.target.closest('input,select,textarea,label')) e.preventDefault(); });
  const head = document.createElement('div');
  head.className = 'fmt-panel-head';
  const h = document.createElement('b'); h.textContent = title;
  const x = Object.assign(document.createElement('button'), { type: 'button', className: 'fmt-panel-close', textContent: '×', title: '關閉' });
  x.setAttribute('aria-label', '關閉');
  x.addEventListener('click', closePanel);
  head.append(h, x);
  panel.append(head);
  build(panel);
  document.body.append(panel);
  current = { kind, el: panel, onClose, closeOnOutside, anchor };
  place();
  return panel;
}
function place() {
  if (!current) return;
  const { el, anchor } = current;
  if (matchMedia(PHONE).matches || !anchor?.isConnected) { el.style.left = el.style.top = ''; return; }
  const r = anchor.getBoundingClientRect();
  el.style.top = r.bottom + 8 + 'px';
  el.style.left = Math.max(8, Math.min(r.right - el.offsetWidth, innerWidth - el.offsetWidth - 8)) + 'px';
}
export function initPanels() {
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && current) { e.preventDefault(); closePanel(); } });
  document.addEventListener('mousedown', (e) => {
    if (current?.closeOnOutside && !current.el.contains(e.target) && !current.anchor?.contains(e.target)) closePanel();
  });
  addEventListener('resize', place);
}
