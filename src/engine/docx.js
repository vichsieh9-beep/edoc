// Word (.docx) → EDoc html, entirely in the browser: the file itself is never uploaded.
// A .docx is a zip of XML parts; word/document.xml holds the body, styles.xml names the
// headings, numbering.xml tells bullets from numbered lists, and the relationships hold links.
import { escapeText, normalizeImportedHtml } from './import.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

export class DocxError extends Error {}

/** Minimal zip reader (stored and deflate entries; enough for Office files). */
export function readZip(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new DocxError('這不是 Word（.docx）檔；舊版 .doc 請先在 Word 另存成 .docx。');
  const count = view.getUint16(eocd + 10, true);
  const entries = new Map();
  const utf8 = new TextDecoder();
  for (let p = view.getUint32(eocd + 16, true), n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new DocxError('Word 檔已損毀，無法讀取。');
    const nameLen = view.getUint16(p + 28, true);
    entries.set(utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen)), {
      method: view.getUint16(p + 10, true), size: view.getUint32(p + 20, true), local: view.getUint32(p + 42, true),
    });
    p += 46 + nameLen + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
  }
  return {
    names: () => [...entries.keys()],
    async text(name) {
      const e = entries.get(name);
      if (!e) return null;
      const start = e.local + 30 + view.getUint16(e.local + 26, true) + view.getUint16(e.local + 28, true);
      const data = bytes.subarray(start, start + e.size);
      if (e.method === 0) return utf8.decode(data);
      if (e.method !== 8) throw new DocxError('Word 檔使用了不支援的壓縮方式。');
      return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    },
  };
}

const parseXml = (text) => (text ? new DOMParser().parseFromString(text, 'application/xml') : null);
const isW = (n, name) => n && n.nodeType === 1 && n.namespaceURI === W && n.localName === name;
const kids = (el, name) => (el ? [...el.children].filter((c) => isW(c, name)) : []);
const kid = (el, name) => kids(el, name)[0] || null;
const val = (el) => (el ? el.getAttributeNS(W, 'val') : null);
const on = (el) => !!el && !/^(0|false|off|none)$/i.test(val(el) || '');

function readStyles(xml) {
  const headings = {}, numbering = {};
  for (const s of xml ? xml.getElementsByTagNameNS(W, 'style') : []) {
    const id = s.getAttributeNS(W, 'styleId');
    const name = (val(kid(s, 'name')) || '').toLowerCase();
    const m = name.match(/^heading\s*(\d)$/);
    if (name === 'title') headings[id] = 0;
    else if (m) headings[id] = Number(m[1]);
    const numPr = kid(kid(s, 'pPr'), 'numPr');
    if (numPr) numbering[id] = { numId: val(kid(numPr, 'numId')), ilvl: Number(val(kid(numPr, 'ilvl')) || 0) };
  }
  return { headings, numbering };
}

function readNumbering(xml) {
  const abstract = {}, nums = {};
  if (!xml) return () => false;
  for (const a of xml.getElementsByTagNameNS(W, 'abstractNum')) {
    abstract[a.getAttributeNS(W, 'abstractNumId')] = Object.fromEntries(
      kids(a, 'lvl').map((l) => [l.getAttributeNS(W, 'ilvl'), val(kid(l, 'numFmt'))]),
    );
  }
  for (const n of xml.getElementsByTagNameNS(W, 'num')) nums[n.getAttributeNS(W, 'numId')] = val(kid(n, 'abstractNumId'));
  return (numId, ilvl) => {
    const fmt = (abstract[nums[numId]] || {})[String(ilvl)];
    return !!fmt && fmt !== 'bullet' && fmt !== 'none';
  };
}

function readLinks(xml) {
  const links = {};
  for (const r of xml ? xml.getElementsByTagName('Relationship') : []) {
    if (/\/hyperlink$/.test(r.getAttribute('Type') || '')) links[r.getAttribute('Id')] = r.getAttribute('Target');
  }
  return links;
}

/**
 * Convert a .docx (ArrayBuffer) to EDoc html. `title` is used as the document title when the
 * Word file has none. Returns { html, report } where report counts what was kept or left out.
 */
export async function docxToHtml(buffer, { title = '' } = {}) {
  const zip = readZip(buffer);
  const body = parseXml(await zip.text('word/document.xml'))?.getElementsByTagNameNS(W, 'body')[0];
  if (!body) throw new DocxError('Word 檔裡找不到內文。');
  const styles = readStyles(parseXml(await zip.text('word/styles.xml')));
  const ordered = readNumbering(parseXml(await zip.text('word/numbering.xml')));
  const links = readLinks(parseXml(await zip.text('word/_rels/document.xml.rels')));
  const commentsXml = parseXml(await zip.text('word/comments.xml'));
  const report = {
    headings: 0, paragraphs: 0, listItems: 0, tables: 0, images: 0, textBoxes: 0, trackedChanges: 0,
    comments: commentsXml ? commentsXml.getElementsByTagNameNS(W, 'comment').length : 0,
    headersFooters: zip.names().filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n)).length,
  };

  // Runs → inline html; neighbouring runs with the same formatting are merged.
  function inline(p) {
    const parts = [];
    const push = (html, fmt) => {
      const last = parts[parts.length - 1];
      if (last && last.b === fmt.b && last.i === fmt.i && last.href === fmt.href) last.html += html;
      else parts.push({ html, ...fmt });
    };
    const walk = (node, href) => {
      for (const c of node.children) {
        if (isW(c, 'r')) {
          const rPr = kid(c, 'rPr');
          const fmt = { b: on(kid(rPr, 'b')), i: on(kid(rPr, 'i')), href };
          for (const x of c.children) {
            if (isW(x, 't')) push(escapeText(x.textContent), fmt);
            else if (isW(x, 'tab')) push(' ', fmt);
            else if (isW(x, 'noBreakHyphen')) push('-', fmt);
            else if ((isW(x, 'br') && x.getAttributeNS(W, 'type') !== 'page') || isW(x, 'cr')) push('<br>', fmt);
            else if (isW(x, 'drawing') || isW(x, 'pict') || isW(x, 'object')) {
              if (x.getElementsByTagNameNS(W, 'txbxContent').length) report.textBoxes++;
              else report.images++;
            }
          }
        } else if (isW(c, 'hyperlink')) {
          const target = links[c.getAttributeNS(R, 'id')];
          walk(c, target && /^(https?:|mailto:)/i.test(target) ? target : href);
        } else if (isW(c, 'ins')) { report.trackedChanges++; walk(c, href); }
        else if (isW(c, 'del')) report.trackedChanges++;
        else if (isW(c, 'smartTag') || isW(c, 'fldSimple') || isW(c, 'customXml')) walk(c, href);
        else if (isW(c, 'sdt')) walk(kid(c, 'sdtContent') || c, href);
      }
    };
    walk(p, null);
    return parts.map(({ html, b, i, href }) => {
      let h = html;
      if (i) h = `<em>${h}</em>`;
      if (b) h = `<strong>${h}</strong>`;
      if (href) h = `<a href="${escapeText(href)}">${h}</a>`;
      return h;
    }).join('').replace(/^(\s|<br>)+|(\s|<br>)+$/g, '');
  }

  function paragraph(p) {
    const pPr = kid(p, 'pPr');
    const styleId = val(kid(pPr, 'pStyle'));
    const numPr = kid(pPr, 'numPr') ? { numId: val(kid(kid(pPr, 'numPr'), 'numId')), ilvl: Number(val(kid(kid(pPr, 'numPr'), 'ilvl')) || 0) } : styles.numbering[styleId];
    const level = styleId in styles.headings ? styles.headings[styleId] : null;
    const html = inline(p);
    if (!html) return null;
    if (level !== null) return { type: 'heading', level, html };
    if (numPr && numPr.numId && numPr.numId !== '0') {
      return { type: 'item', ilvl: numPr.ilvl, tag: ordered(numPr.numId, numPr.ilvl) ? 'ol' : 'ul', html };
    }
    return { type: 'p', html };
  }

  function table(tbl) {
    const spanning = {};
    const rows = kids(tbl, 'tr').map((tr) => {
      const cells = [];
      let col = 0;
      const header = on(kid(kid(tr, 'trPr'), 'tblHeader'));
      for (const tc of kids(tr, 'tc')) {
        const tcPr = kid(tc, 'tcPr');
        const span = Number(val(kid(tcPr, 'gridSpan')) || 1);
        const vMerge = kid(tcPr, 'vMerge');
        const merge = vMerge ? val(vMerge) || 'continue' : null;
        if (merge === 'continue' && spanning[col]) { spanning[col].rowspan++; col += span; continue; }
        const text = [...tc.getElementsByTagNameNS(W, 'p')].map(inline).filter(Boolean).join('<br>');
        const cell = { text, colspan: span, rowspan: 1, tag: header ? 'th' : 'td' };
        if (merge === 'restart') spanning[col] = cell; else delete spanning[col];
        cells.push(cell);
        col += span;
      }
      return cells;
    });
    report.tables++;
    return '<table><tbody>' + rows.map((cells) => '<tr>' + cells.map((c) => {
      const attrs = (c.colspan > 1 ? ` colspan="${c.colspan}"` : '') + (c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : '');
      return `<${c.tag}${attrs}>${c.text}</${c.tag}>`;
    }).join('') + '</tr>').join('') + '</tbody></table>';
  }

  const blocks = [];
  const collect = (node) => {
    for (const c of node.children) {
      if (isW(c, 'p')) { const b = paragraph(c); if (b) blocks.push(b); }
      else if (isW(c, 'tbl')) blocks.push({ type: 'table', html: table(c) });
      else if (isW(c, 'sdt')) collect(kid(c, 'sdtContent') || c);
      else if (isW(c, 'customXml')) collect(c);
    }
  };
  collect(body);

  // EDoc has one title (h1) and one section level (h2). A single top-level heading at the very
  // start is the title; otherwise the top level becomes sections and the document name the title.
  const levels = blocks.filter((b) => b.type === 'heading').map((b) => b.level);
  const top = Math.min(...levels);
  const titled = levels.length > 0 && levels.filter((l) => l === top).length === 1 && blocks[0].type === 'heading' && blocks[0].level === top;
  const rest = levels.filter((l) => !titled || l !== top);
  const section = titled ? (rest.length ? Math.min(...rest) : Infinity) : top;

  const out = [];
  const stack = [];
  const closeAll = () => { while (stack.length) out.push(`</li></${stack.pop()}>`); };
  for (const b of blocks) {
    if (b.type === 'item') {
      report.listItems++;
      const target = Math.min(b.ilvl + 1, stack.length + 1);
      while (stack.length > target) out.push(`</li></${stack.pop()}>`);
      if (stack.length === target) {
        if (stack[target - 1] === b.tag) out.push('</li>');
        else { out.push(`</li></${stack.pop()}>`, `<${b.tag}>`); stack.push(b.tag); }
      }
      while (stack.length < target) { out.push(`<${b.tag}>`); stack.push(b.tag); }
      out.push(`<li>${b.html}`);
      continue;
    }
    closeAll();
    if (b.type === 'heading') {
      report.headings++;
      if (titled && b === blocks[0]) out.push(`<h1>${b.html}</h1>`);
      else if (b.level === section) out.push(`<h2>${b.html}</h2>`);
      else out.push(`<p><strong>${b.html}</strong></p>`);
    } else if (b.type === 'p') {
      report.paragraphs++;
      out.push(`<p>${b.html}</p>`);
    } else out.push(b.html);
  }
  closeAll();
  const { html } = normalizeImportedHtml(out.join(''), { title });
  return { html, report };
}
