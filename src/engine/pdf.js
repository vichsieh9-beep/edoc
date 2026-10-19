// PDF → EDoc html, entirely in the browser: the file itself is never uploaded.
// A PDF only knows where each piece of text sits on the page, so the structure is inferred:
// lines are grouped by position, larger text becomes headings, bullets (text or small drawn
// shapes) and "1." become lists, a line that wrapped joins the next one into one paragraph,
// bold comes from the font name, and text repeated at the top or bottom of most pages
// (running headers, page numbers) is dropped.
// pdf.js is inlined as text and only started the first time a PDF is converted.
import pdfSource from 'pdfjs-dist/build/pdf.min.mjs' with { type: 'text' };
import workerSource from 'pdfjs-dist/build/pdf.worker.min.mjs' with { type: 'text' };
import { escapeText } from './import.js';
import { blocksToHtml } from './docx.js';

export class PdfError extends Error {}

let pdfjs = null;
function loadPdfJs() {
  const url = (src) => URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  pdfjs ||= import(url(pdfSource)).then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = url(workerSource);
    return lib;
  });
  return pdfjs;
}

const CJK = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]/;
const BULLET = /^[\u2022\u25cf\u25aa\u25a0\u25e6\u25cb\u30fb\u2027\u2219\u00b7\u25ba\u25b8\u27a2\u2713\u2714*\-\u2013]\s*/;
const NUMBERED = /^(?:\d{1,3}[.)]|[\uff08(]\d{1,3}[)\uff09])\s*/;
const PAGE_NUMBER = /^(?:\u7b2c\s*)?[-\u2013]?\s*\d{1,4}\s*[-\u2013]?(?:\s*\u9801)?(?:\s*(?:\/|of|\u5171)\s*\d{1,4}\s*\u9801?)?$|^page\s+\d{1,4}(?:\s+of\s+\d{1,4})?$/i;
const UNREADABLE = /[\ufffd\ue000-\uf8ff]/g;
// Some fonts map common characters to their Kangxi radical look-alikes (⼀ for 一).
const RADICALS = /[\u2e80-\u2fdf]/g;
const BOLD = /bold|semibold|demi|heavy|black|,b$/i;
const ITALIC = /italic|oblique/i;

const cleanText = (s) => s.replace(RADICALS, (c) => c.normalize('NFKC'));
const glue = (a, b) => (!a || !b || CJK.test(a.slice(-1)) || CJK.test(b[0]) || /\s$/.test(a) || /^\s/.test(b) ? '' : ' ');

// ---- page geometry: 2D matrices [a, b, c, d, e, f] as in the PDF spec ----
const mul = (m, n) => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
];
const apply = (m, x, y) => [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];

/** Small filled or stroked shapes on the page (bullet candidates), in page coordinates. */
function pageShapes(ops, OPS) {
  const paints = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.stroke, OPS.closeStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const shapes = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  ops.fnArray.forEach((fn, i) => {
    const args = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || ctm;
    else if (fn === OPS.transform) ctm = mul(args, ctm);
    else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (args?.[0]) ctm = mul(args[0], ctm); }
    else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || ctm;
    else if (fn === OPS.constructPath && paints.has(args?.[0]) && args[2]?.length === 4) {
      const [x0, y0, x1, y1] = args[2];
      const corners = [apply(ctm, x0, y0), apply(ctm, x1, y1), apply(ctm, x0, y1), apply(ctm, x1, y0)];
      const xs = corners.map((p) => p[0]), ys = corners.map((p) => p[1]);
      shapes.push({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
    }
  });
  return shapes;
}

function imageCount(ops, OPS) {
  const paint = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintImageXObjectRepeat]);
  return ops.fnArray.filter((fn) => paint.has(fn)).length;
}

/**
 * Text items of one page → lines { segs: [{ text, b, i }], text, x, right, y, size, shapeBullet },
 * in reading order.
 */
function pageLines(items, fontStyle, shapes) {
  const lines = [];
  let line = null;
  const add = (text, style) => {
    const last = line.segs[line.segs.length - 1];
    if (last && last.b === style.b && last.i === style.i) last.text += text;
    else line.segs.push({ text, ...style });
    line.text += text;
  };
  const close = () => {
    if (line && line.text.trim()) lines.push(line);
    line = null;
  };
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    const [a, b, , , x, y] = item.transform;
    const size = Math.hypot(a, b) || item.height || 0;
    if (item.str.trim()) {
      const style = fontStyle(item.fontName);
      const newLine = !line || Math.abs(line.y - y) > Math.max(line.size, size) * 0.5 || x < line.right - Math.max(line.size, size) * 2;
      if (newLine) {
        close();
        line = { segs: [], text: '', x, right: x + item.width, y, size };
        add(item.str, style);
      } else {
        const gap = x - line.right;
        const space = /\s$/.test(line.text) ? '' : (gap > size * 0.6 || (gap > size * 0.2 && glue(line.text, item.str))) ? ' ' : '';
        if (space) add(space, line.segs[line.segs.length - 1]);
        add(item.str, style);
        line.right = Math.max(line.right, x + item.width);
        line.size = Math.max(line.size, size);
      }
    } else if (line && item.str && !/\s$/.test(line.text)) {
      add(' ', line.segs[line.segs.length - 1]);
    }
    if (item.hasEOL) close();
  }
  close();
  // A small round or square shape just left of a line, level with its text: a drawn bullet.
  for (const l of lines) {
    const s = l.size;
    l.shapeBullet = shapes.some((sh) => {
      const w = sh.x1 - sh.x0, h = sh.y1 - sh.y0, cy = (sh.y0 + sh.y1) / 2;
      return w >= s * 0.12 && h >= s * 0.12 && w <= s * 0.7 && h <= s * 0.7 && w / h > 0.6 && w / h < 1.6
        && sh.x1 <= l.x && l.x - sh.x1 <= s * 2.5 && cy >= l.y - s * 0.1 && cy <= l.y + s * 0.9;
    });
  }
  return lines;
}

/** Running headers/footers and page numbers: near the top or bottom edge, repeated on most pages. */
function dropRunningText(pages) {
  const edge = (line, page) => line.y > page.height * 0.9 || line.y < page.height * 0.1;
  const key = (line) => `${Math.round(line.y / 4)}|${line.text.trim().replace(/\d+/g, '#')}`;
  const counts = new Map();
  for (const page of pages) {
    for (const k of new Set(page.lines.filter((l) => edge(l, page)).map(key))) counts.set(k, (counts.get(k) || 0) + 1);
  }
  const repeated = Math.max(2, Math.ceil(pages.length * 0.6));
  let dropped = 0;
  for (const page of pages) {
    page.lines = page.lines.filter((l) => {
      const drop = edge(l, page) && (PAGE_NUMBER.test(l.text.trim()) || (pages.length > 1 && counts.get(key(l)) >= repeated));
      if (drop) dropped++;
      return !drop;
    });
  }
  return dropped;
}

/** The most common text size, weighted by text length: the body size. Bold lines (mostly headings) only count when nothing else does. */
function bodySize(lines) {
  const weight = new Map();
  const plain = lines.filter((l) => l.segs.some((s) => !s.b && s.text.trim()));
  for (const l of plain.length ? plain : lines) {
    const s = Math.round(l.size * 2) / 2;
    weight.set(s, (weight.get(s) || 0) + l.text.length);
  }
  return [...weight].sort((a, b) => b[1] - a[1])[0]?.[0] || 12;
}

/** Segments → inline html, without the first `skip` characters (a bullet or "1."). */
function segsHtml(segs, { skip = 0, plain = false } = {}) {
  let html = '';
  for (const seg of segs) {
    let text = seg.text;
    if (skip) { const cut = Math.min(skip, text.length); text = text.slice(cut); skip -= cut; }
    if (!text) continue;
    const lead = text.match(/^\s*/)[0], trail = text.slice(lead.length).match(/\s*$/)[0];
    let inner = escapeText(text.slice(lead.length, text.length - trail.length));
    if (inner && !plain && seg.i) inner = `<em>${inner}</em>`;
    if (inner && !plain && seg.b) inner = `<strong>${inner}</strong>`;
    html += lead + inner + trail;
  }
  return html.replace(/<\/strong>(\s*)<strong>/g, '$1').replace(/<\/em>(\s*)<em>/g, '$1').replace(/\s+/g, ' ').trim();
}

/** Lines of every page → EDoc blocks (headings, list items, paragraphs). */
function linesToBlocks(pages) {
  const all = pages.flatMap((p) => p.lines);
  const body = bodySize(all);
  const rounded = (l) => Math.round(l.size * 2) / 2;
  const headingSizes = [...new Set(all.filter((l) => l.size >= body * 1.15 && l.text.length <= 80).map(rounded))].sort((a, b) => b - a);
  const blocks = [];
  let last = null; // { block, line, page, right, kind }
  let listXs = []; // bullet positions of the current list, outermost first

  // Width the first word of `line` needs: if it would have fitted after `prev`, prev did not wrap.
  const firstWord = (line) => {
    // CJK punctuation right after the word may not start a line, so it travels with the word.
    const word = line.text.trim().match(/^[^\s\u2e80-\u9fff\uff00-\uffef\u3000-\u303f]+[\u3000-\u303f\uff00-\uffef]?|^./)[0];
    return [...word].reduce((w, c) => w + (CJK.test(c) ? 1 : 0.55), 0) * line.size;
  };
  const continues = (line, page, index) => {
    const prev = last.line;
    if (Math.abs(prev.size - line.size) >= Math.max(prev.size, line.size) * 0.1) return false;
    const below = last.page === page
      ? prev.y - line.y > 0 && prev.y - line.y <= line.size * 1.9
      : last.page.lines[last.page.lines.length - 1] === prev && index === 0;
    return below && prev.right + firstWord(line) >= last.right - prev.size * 0.5;
  };

  for (const page of pages) {
    // Right edge of the text in this size on this page: a line that wrapped reaches (almost) to it.
    const rightFor = (size) => Math.max(0, ...page.lines.filter((l) => Math.abs(l.size - size) < size * 0.1).map((l) => l.right));
    page.lines.forEach((line, index) => {
      const right = rightFor(line.size);
      const heading = headingSizes.indexOf(rounded(line));
      const text = line.text.trim();
      const bullet = text.match(BULLET);
      const number = !bullet && text.match(NUMBERED);
      const marker = bullet || number;
      const skip = marker ? line.text.length - text.length + marker[0].length : 0;
      const isItem = heading < 0 && (marker || line.shapeBullet);

      if (heading >= 0) {
        const html = segsHtml(line.segs, { plain: true });
        if (last?.kind === 'heading' && last.block.level === heading + 1 && continues(line, page, index)) {
          last.block.html += glue(last.block.html, html) + html;
        } else blocks.push({ type: 'heading', level: heading + 1, html });
        last = { block: blocks[blocks.length - 1], line, page, right, kind: 'heading' };
        listXs = [];
        return;
      }
      if (isItem) {
        while (listXs.length && line.x < listXs[listXs.length - 1] - line.size * 0.5) listXs.pop();
        if (!listXs.length || line.x > listXs[listXs.length - 1] + line.size * 0.5) listXs.push(line.x);
        const block = { type: 'item', ilvl: listXs.length - 1, tag: number ? 'ol' : 'ul', html: segsHtml(line.segs, { skip }) };
        blocks.push(block);
        last = { block, line, page, right, kind: 'item' };
        return;
      }
      // Wrapped text carrying on the previous paragraph or list item.
      if (last && (last.kind === 'p' || last.kind === 'item') && continues(line, page, index)
        && (last.kind === 'p' || line.x >= listXs[listXs.length - 1] - line.size * 0.3)) {
        const html = segsHtml(line.segs);
        const prevText = last.line.text.trim();
        if (/[a-z]-$/i.test(prevText) && /^[a-z]/.test(text)) last.block.html = last.block.html.replace(/-(<\/\w+>)*$/, '$1') + html;
        else last.block.html += glue(prevText, text) + html;
        last = { ...last, line, page, right };
        return;
      }
      listXs = [];
      const block = { type: 'p', html: segsHtml(line.segs) };
      blocks.push(block);
      last = { block, line, page, right, kind: 'p' };
    });
  }
  // Bold or italic runs that a line break split in two become one again.
  for (const b of blocks) b.html = b.html.replace(/<\/strong>(\s*)<strong>/g, '$1').replace(/<\/em>(\s*)<em>/g, '$1');
  return blocks;
}

/**
 * Convert a PDF (ArrayBuffer) to EDoc html. Returns { html, report } where report counts what
 * was kept or left out. A PDF without any text (a scan) is refused with a clear message.
 */
export async function pdfToHtml(buffer, { title = '' } = {}) {
  const bytes = new Uint8Array(buffer);
  if (!new TextDecoder().decode(bytes.subarray(0, 1024)).includes('%PDF-')) throw new PdfError('這不是 PDF 檔。');
  const lib = await loadPdfJs();
  const task = lib.getDocument({ data: bytes.slice(), isEvalSupported: false, disableFontFace: true, fontExtraProperties: true, stopAtErrors: false });
  let pdf;
  try {
    pdf = await task.promise;
  } catch (e) {
    task.destroy();
    if (e?.name === 'PasswordException') throw new PdfError('這份 PDF 有密碼保護，請先移除密碼再上傳。');
    throw new PdfError('PDF 檔已損毀或格式不支援，無法讀取。');
  }
  const report = { pages: pdf.numPages, headings: 0, paragraphs: 0, listItems: 0, images: 0, emptyPages: [], runningLines: 0, unreadable: 0 };
  const pages = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const { height } = page.getViewport({ scale: 1 });
      // The operator list first: it also loads the page's fonts, whose names tell bold apart.
      const ops = await page.getOperatorList().catch(() => ({ fnArray: [], argsArray: [] }));
      const fontStyle = (id) => {
        let name = '';
        try { name = page.commonObjs.get(id)?.name || ''; } catch { /* font not loaded */ }
        return { b: BOLD.test(name), i: ITALIC.test(name) };
      };
      const lines = pageLines((await page.getTextContent()).items, fontStyle, pageShapes(ops, lib.OPS));
      report.images += imageCount(ops, lib.OPS);
      if (!lines.length) report.emptyPages.push(n);
      pages.push({ height, lines });
      page.cleanup();
    }
  } finally {
    task.destroy();
  }
  if (!pages.some((p) => p.lines.length)) {
    throw new PdfError('這份 PDF 沒有文字層（多半是掃描檔），目前無法匯入。請先用 Acrobat 或「預覽程式」做文字辨識（OCR）後再上傳。');
  }
  report.runningLines = dropRunningText(pages);
  for (const line of pages.flatMap((p) => p.lines)) {
    // Word's Symbol/Wingdings bullets come out as private-use characters.
    if (/^\s*[\ue000-\uf8ff]\s*\S/.test(line.text)) {
      line.segs[0].text = line.segs[0].text.replace(/^(\s*)[\ue000-\uf8ff]/, '$1\u2022');
    }
    for (const seg of line.segs) {
      seg.text = cleanText(seg.text);
      report.unreadable += (seg.text.match(UNREADABLE) || []).length;
      seg.text = seg.text.replace(UNREADABLE, '');
    }
    line.text = line.segs.map((s) => s.text).join('');
  }
  const blocks = linesToBlocks(pages.map((p) => ({ ...p, lines: p.lines.filter((l) => l.text.trim()) })));
  return { html: blocksToHtml(blocks, report, title), report };
}
