// 文件格式 (R2.17): the document format of the draft, one setting for the whole document
// (see engine/layout.js). It is applied with 套用, saved with the draft and published with it.
import { el } from './elements.js';
import { state } from './state.js';
import { applyLayout } from './doc-surface.js';
import { openPanel, closePanel } from './panel.js';
import { LAYOUT_FIELDS, layoutValues, canonicalLayout } from '../engine/layout.js';

export function openLayoutPanel(anchor, onApplied) {
  const r = state.activeRevision;
  if (!r) return;
  const values = layoutValues(r.layout);
  openPanel('layout', {
    anchor, title: '文件格式（整份文件）', width: 400, closeOnOutside: true,
    build(panel) {
      for (const f of LAYOUT_FIELDS) {
        const row = document.createElement('div'); row.className = 'fmt-panel-row';
        const label = document.createElement('label'); label.textContent = f.label;
        row.append(label);
        if (f.key === 'font' || f.key === 'size') {
          const sel = document.createElement('select'); sel.className = 'fmt-select'; sel.dataset.k = f.key;
          label.htmlFor = sel.id = 'layout-' + f.key;
          for (const v of f.values) sel.append(new Option(f.text(v) + (v === f.default ? '（預設）' : ''), v, false, v === values[f.key]));
          sel.addEventListener('change', () => { values[f.key] = sel.value; });
          row.append(sel);
        } else {
          const seg = document.createElement('div'); seg.className = 'fmt-seg'; seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', f.label); seg.dataset.k = f.key;
          for (const v of f.values) {
            const b = Object.assign(document.createElement('button'), { type: 'button', textContent: f.text(v) });
            b.dataset.v = v;
            b.setAttribute('role', 'radio');
            const mark = () => seg.querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x.dataset.v === values[f.key]); x.setAttribute('aria-checked', String(x.dataset.v === values[f.key])); });
            b.addEventListener('click', () => { values[f.key] = v; mark(); });
            seg.append(b);
            mark();
          }
          row.append(seg);
        }
        panel.append(row);
      }
      const note = document.createElement('p'); note.className = 'fmt-panel-note';
      note.textContent = '套用到整份文件、PDF 與 Word 檔。改了會在版本差異寫「文件格式：行距 1.7→1.5」，跟內文修改一起發布成新版本。';
      const defaults = document.createElement('p'); defaults.className = 'fmt-panel-note muted';
      defaults.textContent = '預設：' + LAYOUT_FIELDS.map((f) => (f.key === 'font' || f.key === 'size' ? '' : f.label + ' ') + f.text(f.default)).join('、');
      const actions = document.createElement('div'); actions.className = 'fmt-panel-actions';
      const cancel = Object.assign(document.createElement('button'), { type: 'button', textContent: '取消' });
      const ok = Object.assign(document.createElement('button'), { type: 'button', textContent: '套用', className: 'primary' });
      cancel.addEventListener('click', closePanel);
      ok.addEventListener('click', () => {
        r.layout = canonicalLayout(values);
        applyLayout(r.layout);
        el.doc.dispatchEvent(new Event('edoc-layout-changed'));
        closePanel();
        onApplied?.();
      });
      actions.append(cancel, ok);
      panel.append(note, defaults, actions);
    },
  });
}
