// A single notice line above the version card (restored drafts, newer versions, link problems).
import { el } from './elements.js';

export function showNotice(text, actions = [], kind = 'info') {
  el.noticeText.textContent = text;
  el.noticeActions.replaceChildren(...actions.map((a) => {
    const b = document.createElement('button');
    b.textContent = a.label;
    b.addEventListener('click', a.onClick);
    return b;
  }));
  el.notice.classList.toggle('warn', kind === 'warn');
  el.notice.hidden = false;
}
export function hideNotice() { el.notice.hidden = true; }
