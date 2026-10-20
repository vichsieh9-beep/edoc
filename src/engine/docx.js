// Word (.docx) → EDoc html, entirely in the browser: the file itself is never uploaded.
// A .docx is a zip of XML parts; word/document.xml holds the body, styles.xml names the
// headings, numbering.xml tells bullets from numbered lists, and the relationships hold links.
import { escapeText, normalizeImportedHtml } from './import.js';
import { textColor, highlightColor, fontFor, fontSizeFor } from './content-model.js';

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
// Word's highlighter colours; EDoc's palette has the same five.
const HIGHLIGHTS = { yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', lightGray: '#c0c0c0' };
const JUSTIFY = { center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' };
const KEPT_NAMES = { u: '底線', s: '刪除線', sup: '上標', sub: '下標', color: '文字色彩', bg: '螢光筆', font: '字型', size: '字級', align: '對齊', h3: '標題 3' };

// A run's formatting (R2.17): what EDoc can keep, as tags and span styles.
function runFormat(rPr, href) {
  const f = { b: on(kid(rPr, 'b')), i: on(kid(rPr, 'i')), href };
  if (!rPr) return f;
  const u = kid(rPr, 'u');
  if (u && val(u) !== 'none') f.u = true;
  if (on(kid(rPr, 'strike')) || on(kid(rPr, 'dstrike'))) f.s = true;
  const va = val(kid(rPr, 'vertAlign'));
  if (va === 'superscript') f.sup = true; else if (va === 'subscript') f.sub = true;
  const color = val(kid(rPr, 'color'));
  // Black is Word's automatic text colour, not a choice.
  if (color && /^[0-9a-f]{6}$/i.test(color) && color !== '000000') f.color = '#' + color.toLowerCase();
  const hl = val(kid(rPr, 'highlight'));
  const fill = kid(rPr, 'shd')?.getAttributeNS(W, 'fill');
  if (hl && hl !== 'none') f.bg = HIGHLIGHTS[hl] || hl;
  else if (fill && /^[0-9a-f]{6}$/i.test(fill)) f.bg = '#' + fill.toLowerCase();
  const sz = val(kid(rPr, 'sz'));
  if (sz && /^\d+$/.test(sz)) f.size = String(Number(sz) / 2);
  const fonts = kid(rPr, 'rFonts');
  const font = fonts && (fonts.getAttributeNS(W, 'eastAsia') || fonts.getAttributeNS(W, 'ascii') || fonts.getAttributeNS(W, 'hAnsi'));
  if (font) f.font = font;
  return f;
}
const formatId = (f) => JSON.stringify([f.b, f.i, f.href, f.u, f.s, f.sup, f.sub, f.color, f.bg, f.size, f.font]);

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
    // Formatting EDoc cannot keep: colours outside the palette, fonts and sizes it does not have.
    dropped: { color: 0, bg: 0, fonts: [], sizes: [] },
  };
  const fontChars = new Map(), sizeChars = new Map();
  const count = (map, key, n) => map.set(key, (map.get(key) || 0) + n);
  const unsupported = (f, n) => {
    if (f.color && !textColor(f.color)) report.dropped.color++;
    if (f.bg && !highlightColor(f.bg)) report.dropped.bg++;
    count(fontChars, f.font || '', n);
    count(sizeChars, f.size || '', n);
  };

  // Runs → inline html; neighbouring runs with the same formatting are merged.
  function inline(p) {
    const parts = [];
    const push = (html, fmt) => {
      const last = parts[parts.length - 1];
      if (last && last.id === formatId(fmt)) last.html += html;
      else parts.push({ html, fmt, id: formatId(fmt) });
    };
    const walk = (node, href) => {
      for (const c of node.children) {
        if (isW(c, 'r')) {
          const fmt = runFormat(kid(c, 'rPr'), href);
          const chars = [...c.children].filter((x) => isW(x, 't')).reduce((n, x) => n + x.textContent.trim().length, 0);
          if (chars) unsupported(fmt, chars);
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
    return parts.map(({ html, fmt: f }) => {
      let h = html;
      const style = [f.color && `color:${f.color}`, f.bg && `background-color:${f.bg}`, f.font && `font-family:'${escapeText(f.font.replace(/['\\;]/g, ''))}'`, f.size && `font-size:${f.size}pt`].filter(Boolean).join(';');
      if (style) h = `<span style="${style}">${h}</span>`;
      for (const tag of ['sub', 'sup', 's', 'u', 'em', 'strong']) if (f[{ em: 'i', strong: 'b' }[tag] || tag]) h = `<${tag}>${h}</${tag}>`;
      if (f.href) h = `<a href="${escapeText(f.href)}">${h}</a>`;
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
    const align = JUSTIFY[val(kid(pPr, 'jc'))] || null;
    if (level !== null) return { type: 'heading', level, html, align };
    if (numPr && numPr.numId && numPr.numId !== '0') {
      return { type: 'item', ilvl: numPr.ilvl, tag: ordered(numPr.numId, numPr.ilvl) ? 'ol' : 'ul', html, align };
    }
    return { type: 'p', html, align };
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

  const html = blocksToHtml(blocks, report, title, { formatting: true });
  report.kept = keptFormats(html);
  // The body's own font and size become the document's (see dropSourceBody); other fonts and
  // sizes EDoc does not have are reported.
  const mostUsed = (map) => [...map].sort((a, b) => b[1] - a[1])[0]?.[0];
  const bodyFont = mostUsed(fontChars), bodySize = mostUsed(sizeChars);
  report.dropped.fonts = [...fontChars.keys()].filter((f) => f && f !== bodyFont && !fontFor(f));
  report.dropped.sizes = [...sizeChars.keys()].filter((z) => z && z !== bodySize && !fontSizeFor(z + 'pt'));
  return { html, report };
}

/** Names of the formatting kinds an imported html keeps (for the conversion report). */
export function keptFormats(html) {
  const found = new Set();
  const tags = { u: /<u>/, s: /<s>/, sup: /<sup>/, sub: /<sub>/, h3: /<h3[ >]/, align: /text-align:/ };
  for (const [k, re] of Object.entries(tags)) if (re.test(html)) found.add(k);
  for (const [k, prop] of [['color', /[;"]color:/], ['bg', /background-color:/], ['font', /font-family:/], ['size', /font-size:/]]) if (prop.test(html)) found.add(k);
  return [...Object.keys(KEPT_NAMES)].filter((k) => found.has(k)).map((k) => KEPT_NAMES[k]);
}

/**
 * Blocks → EDoc html, shared by the Word and PDF importers. A block is a heading (level: 0 for a
 * title, 1… for heading sizes), a list item (ilvl, tag ul/ol), a paragraph or a ready-made table.
 * Counts headings, paragraphs and list items into `report`.
 */
export function blocksToHtml(blocks, report, title = '', { formatting = false } = {}) {
  // EDoc has one title (h1) and one section level (h2). A single top-level heading at the very
  // start is the title; otherwise the top level becomes sections and the document name the title.
  const levels = blocks.filter((b) => b.type === 'heading').map((b) => b.level);
  const top = Math.min(...levels);
  const titled = levels.length > 0 && levels.filter((l) => l === top).length === 1 && blocks[0].type === 'heading' && blocks[0].level === top;
  const rest = levels.filter((l) => !titled || l !== top);
  const section = titled ? (rest.length ? Math.min(...rest) : Infinity) : top;
  const deeper = levels.filter((l) => l > section);
  const subsection = deeper.length ? Math.min(...deeper) : Infinity;
  const attrs = (b) => (formatting && b.align ? ` style="text-align:${b.align}"` : '');

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
      out.push(`<li${attrs(b)}>${b.html}`);
      continue;
    }
    closeAll();
    if (b.type === 'heading') {
      report.headings++;
      if (titled && b === blocks[0]) out.push(`<h1${attrs(b)}>${b.html}</h1>`);
      else if (b.level === section) out.push(`<h2${attrs(b)}>${b.html}</h2>`);
      // With formatting (Word, R2.17), the level below the sections is 標題 3.
      else if (formatting && b.level === subsection) out.push(`<h3${attrs(b)}>${b.html}</h3>`);
      else out.push(`<p${attrs(b)}><strong>${b.html}</strong></p>`);
    } else if (b.type === 'p') {
      report.paragraphs++;
      out.push(`<p${attrs(b)}>${b.html}</p>`);
    } else out.push(b.html);
  }
  closeAll();
  return normalizeImportedHtml(out.join(''), { title, formatting }).html;
}
