// Library dialogs. An action's handler may be async: its buttons wait, an Error is shown in the
// dialog, and returning false keeps the dialog open.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

export function openModal({ title, body = [], actions = [], note = '', label = title, onClose }) {
  let busy = false;
  const error = h('div', { class: 'error', role: 'alert', hidden: true });
  const buttons = h('div', { class: 'actions' });
  const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': label },
    h('h3', {}, title), body, error, buttons, note ? h('div', { class: 'note' }, note) : null);
  const backdrop = h('div', { class: 'backdrop' }, modal);
  const onKey = (e) => { if (e.key === 'Escape' && !busy) close(); };
  const close = () => {
    backdrop.remove();
    onClose?.();
    document.removeEventListener('keydown', onKey);
  };
  const api = {
    root: modal,
    close,
    setError(message) { error.textContent = message || ''; error.hidden = !message; },
    setBusy(on) { busy = on; buttons.querySelectorAll('button').forEach((b) => { b.disabled = on; }); },
    setActions(list) {
      buttons.replaceChildren(...list.map((a) => h('button', {
        class: a.primary ? 'primary' : null,
        'data-action': a.id || null,
        onclick: async () => {
          if (busy) return;
          api.setError('');
          if (!a.run) return close();
          api.setBusy(true);
          try {
            if ((await a.run(api)) !== false) close();
          } catch (e) {
            api.setError(e.message || String(e));
          } finally {
            api.setBusy(false);
          }
        },
      }, a.label)));
    },
  };
  api.setActions(actions);
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop && !busy) close(); });
  // Enter in an input marked data-submit runs the primary action (not while an IME is composing).
  modal.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229 || !e.target.matches('input[data-submit]')) return;
    e.preventDefault();
    buttons.querySelector('button.primary')?.click();
  });
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  (modal.querySelector('input,[contenteditable="true"]') || buttons.lastElementChild)?.focus();
  return api;
}
