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
  if(state.privateView){alert('請返回正式版，再複製正式全文。');return;}
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

// The official PDF, plus a Word copy and the PDF's pages as images, all generated with the
// site for every formal version (scripts/lib/pdf.mjs): available together, never for a draft.
export function updatePdfLink() {
  const v = state.activeVersion, drafting = !!state.activeRevision;
  const ok = !state.privateView && !drafting && (state.meta.pdfVersions || []).includes(v);
  const why = state.privateView ? '修訂建議與私人預覽沒有官方 PDF' : drafting ? '完成修訂後才會有新版本的 PDF' : ok ? '' : '這個版本的 PDF 會在公開網址更新後產生';
  const set = (a, href, name) => {
    a.classList.toggle('disabled', !ok);
    a.setAttribute('aria-disabled', String(!ok));
    a.setAttribute('href', ok ? href : '#');
    a.setAttribute('download', name);
    a.title = why;
  };
  set(el.pdfBtn, `pdf/${v}.pdf`, `${state.meta.title}_${v}.pdf`);
  set(el.docxBtn, `export/${v}.docx`, `${state.meta.title}_${v}.docx`);
  set(el.pngBtn, `export/${v}.png`, `${state.meta.title}_${v}.png`);
  el.downloadBtn.disabled = !ok;
  el.downloadBtn.title = why;
  el.downloadNote.textContent = `下載的都是目前選的版本（${v}）。Word、圖片是方便用的副本，正式版以 PDF 為準。`;
  if (!ok) closeDownloadMenu();
  el.copyBtn.disabled=!!state.privateView;
}
function closeDownloadMenu() { el.downloadMenu.hidden = true; el.downloadBtn.setAttribute('aria-expanded', 'false'); }
// A document longer than one page comes as a zip of its pages.
async function downloadImages(e) {
  if (el.pngBtn.classList.contains('disabled')) { e.preventDefault(); return; }
  e.preventDefault();
  const v = state.activeVersion;
  let href = `export/${v}.png`, name = `${state.meta.title}_${v}.png`;
  try {
    const res = await fetch(href, { method: 'HEAD', cache: 'no-store' });
    if (!res.ok) { href = `export/${v}.zip`; name = `${state.meta.title}_${v}_圖片.zip`; }
  } catch {}
  const a = Object.assign(document.createElement('a'), { href, download: name });
  document.body.append(a); a.click(); a.remove();
  closeDownloadMenu();
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
  for (const a of [el.pdfBtn, el.docxBtn]) a.addEventListener('click', (e) => { if (a.classList.contains('disabled')) e.preventDefault(); else closeDownloadMenu(); });
  el.pngBtn.addEventListener('click', downloadImages);
  el.downloadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = el.downloadMenu.hidden;
    el.downloadMenu.hidden = !open;
    el.downloadBtn.setAttribute('aria-expanded', String(open));
    if (!open) return;
    // Keep the menu on screen: it opens under the button, shifted in on narrow phones.
    el.downloadMenu.style.right = '0px';
    const r = el.downloadMenu.getBoundingClientRect(), margin = 12;
    if (r.left < margin) el.downloadMenu.style.right = `${r.left - margin}px`;
  });
  el.downloadMenu.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', closeDownloadMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDownloadMenu(); });
}
