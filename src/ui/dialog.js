// One reusable dialog. Resolves with the clicked action's value, or null when dismissed.
import { el } from './elements.js';

export function openDialog({ title, summary = '', note = '', actions }) {
  el.dialogTitle.textContent = title;
  el.dialogSummary.textContent = summary;
  el.dialogNote.textContent = note;
  el.dialogActions.replaceChildren();
  return new Promise((resolve) => {
    const close = (value) => {
      el.dialog.classList.remove('show');
      el.dialog.onclick = null;
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    for (const a of actions) {
      const b = document.createElement('button');
      b.textContent = a.label;
      if (a.primary) b.className = 'primary';
      b.addEventListener('click', () => close(a.value));
      el.dialogActions.appendChild(b);
    }
    el.dialog.onclick = (e) => { if (e.target === el.dialog) close(null); };
    document.addEventListener('keydown', onKey);
    el.dialog.classList.add('show');
    el.dialogActions.lastElementChild?.focus();
  });
}
