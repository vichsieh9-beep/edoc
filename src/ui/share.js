// Sharing: public URL, copy the clean text, download the official PDF of the version on screen.
import { el } from './elements.js';
import { state } from './state.js';
import { flash } from './format.js';
import { cleanSnapshot } from '../engine/dom.js';
import { sanitizeRevisionHtml } from '../engine/revision.js';
import { clipboardHtml, toPlainText } from '../engine/text.js';
import { isPublished, shareableUrl } from '../engine/publish.js';

async function copyContent() {
  // Only the latest wording: deletions and change marks are left out.
  const html = state.activeRevision ? cleanSnapshot(el.doc.innerHTML) : cleanSnapshot(state.versions[state.activeVersion].html);
  const rich = clipboardHtml(sanitizeRevisionHtml(html));
  const plain = toPlainText(rich);
  try {
    if (window.ClipboardItem && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([rich], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      })]);
    } else await navigator.clipboard.writeText(plain);
    flash(el.copyBtn, '已複製');
  } catch {
    alert('瀏覽器未允許直接複製');
  }
}

export function updatePdfLink() {
  const v = state.activeVersion, drafting = !!state.activeRevision;
  const ok = !drafting && (state.meta.pdfVersions || []).includes(v);
  el.pdfBtn.classList.toggle('disabled', !ok);
  el.pdfBtn.setAttribute('aria-disabled', String(!ok));
  el.pdfBtn.setAttribute('href', ok ? `pdf/${v}.pdf` : '#');
  el.pdfBtn.setAttribute('download', `${state.meta.title}_${v}.pdf`);
  el.pdfBtn.title = drafting ? '完成修訂後才會有新版本的 PDF' : ok ? '' : '這個版本的 PDF 會在公開網址更新後產生';
}

export function initShare() {
  el.shareUrlBtn.disabled = !isPublished(location);
  el.shareUrlBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareableUrl(location));
      flash(el.shareUrlBtn, '已複製網址');
    } catch {
      alert('無法直接複製網址，請從瀏覽器網址列複製。');
    }
  });
  el.copyBtn.addEventListener('click', copyContent);
  el.pdfBtn.addEventListener('click', (e) => { if (el.pdfBtn.classList.contains('disabled')) e.preventDefault(); });
}
