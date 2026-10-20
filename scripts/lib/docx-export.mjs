// Word (.docx) copy of a formal version (R2.16): the clean content with EDoc's formatting
// (headings, lists, alignment, bold/italic/underline/strikethrough, colours, highlights, fonts,
// sizes, links, tables; R2.17: page breaks and the version's document format). Word lays the
// text out itself, so line and page breaks can differ from the PDF; the footer says the PDF is
// the official version.
import { parseHTML } from 'linkedom';
import { zip } from './zip.mjs';
import { DEFAULT_FONT, FONTS, TYPE_SCALE, HIGHLIGHT_COLORS, fontFor } from '../../src/engine/content-model.js';
import { layoutValues } from '../../src/engine/layout.js';

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
// Text Word accepts: no control characters except tab and line breaks.
const esc = (s) => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const halfPoints = (pt) => Math.round(Number(pt) * 2);
// Word's highlighter names for EDoc's highlight colours.
const HIGHLIGHT_NAMES = { '#ffff00': 'yellow', '#00ff00': 'green', '#00ffff': 'cyan', '#ff00ff': 'magenta', '#c0c0c0': 'lightGray' };
const ALIGN = { center: 'center', right: 'right', justify: 'both' };
const HEADING_SIZE = { 1: TYPE_SCALE.H1, 2: TYPE_SCALE.H2, 3: TYPE_SCALE.H3 };

function fontsXml(font) {
  // Latin fonts keep the bundled CJK font for Chinese text.
  const east = /^(Arimo)$/.test(font.family) ? 'Noto Sans TC' : /^(Tinos)$/.test(font.family) ? 'Noto Serif TC' : font.family;
  return `<w:rFonts w:ascii="${esc(font.family)}" w:hAnsi="${esc(font.family)}" w:eastAsia="${esc(east)}" w:cs="${esc(font.family)}"/>`;
}
function styleProps(style) {
  const out = {};
  for (const part of String(style || '').split(';')) {
    const i = part.indexOf(':');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
// CT_RPr element order matters to Word.
function runProps(f) {
  const p = [];
  if (f.link) p.push('<w:rStyle w:val="Hyperlink"/>');
  if (f.font) p.push(fontsXml(f.font));
  if (f.b) p.push('<w:b/><w:bCs/>');
  if (f.i) p.push('<w:i/><w:iCs/>');
  if (f.s) p.push('<w:strike/>');
  if (f.color) p.push(`<w:color w:val="${f.color.slice(1).toUpperCase()}"/>`);
  if (f.size) p.push(`<w:sz w:val="${halfPoints(f.size)}"/><w:szCs w:val="${halfPoints(f.size)}"/>`);
  if (f.highlight) p.push(`<w:highlight w:val="${f.highlight}"/>`);
  if (f.u) p.push('<w:u w:val="single"/>');
  if (f.vert) p.push(`<w:vertAlign w:val="${f.vert}"/>`);
  return p.length ? `<w:rPr>${p.join('')}</w:rPr>` : '';
}

class Builder {
  constructor() { this.links = []; this.lists = []; this.firstLine = 0; }
  link(href) { this.links.push(href); return 'rIdLink' + this.links.length; }

  // Inline content of a block as runs; nested lists and blocks are left to the caller.
  runs(node, f = {}, out = []) {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) {
        const text = n.textContent.replace(/\s+/g, ' ');
        if (text) out.push({ text, f });
        continue;
      }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName;
      if (/^(UL|OL|TABLE|P|H1|H2|H3|LI|BLOCKQUOTE|HR|IMG)$/.test(tag)) continue;
      if (tag === 'BR') { out.push({ br: true, f }); continue; }
      const g = { ...f };
      if (tag === 'STRONG' || tag === 'B') g.b = true;
      else if (tag === 'EM' || tag === 'I') g.i = true;
      else if (tag === 'U') g.u = true;
      else if (tag === 'S') g.s = true;
      else if (tag === 'SUP') g.vert = 'superscript';
      else if (tag === 'SUB') g.vert = 'subscript';
      else if (tag === 'A' && n.getAttribute('href')) g.link = this.link(n.getAttribute('href'));
      else if (tag === 'SPAN' && n.getAttribute('style')) {
        const s = styleProps(n.getAttribute('style'));
        if (s.color) g.color = s.color;
        if (s['background-color'] && HIGHLIGHT_NAMES[s['background-color']]) g.highlight = HIGHLIGHT_NAMES[s['background-color']];
        if (s['font-family']) { const font = fontFor(s['font-family']); if (font && font !== DEFAULT_FONT) g.font = font; }
        if (s['font-size']) g.size = parseFloat(s['font-size']);
      }
      this.runs(n, g, out);
    }
    return out;
  }
  runsXml(runs) {
    // Collapse the spaces at the edges of a paragraph, as a browser does.
    while (runs.length && runs[0].text !== undefined && !runs[0].text.trim()) runs.shift();
    while (runs.length && runs.at(-1).text !== undefined && !runs.at(-1).text.trim()) runs.pop();
    if (runs[0]?.text) runs[0] = { ...runs[0], text: runs[0].text.replace(/^ /, '') };
    if (runs.at(-1)?.text) runs[runs.length - 1] = { ...runs.at(-1), text: runs.at(-1).text.replace(/ $/, '') };
    let xml = '', link = null;
    for (const r of runs) {
      const run = r.br ? `<w:r>${runProps(r.f)}<w:br/></w:r>` : `<w:r>${runProps(r.f)}<w:t xml:space="preserve">${esc(r.text)}</w:t></w:r>`;
      if (r.f.link !== link) { if (link) xml += '</w:hyperlink>'; link = r.f.link || null; if (link) xml += `<w:hyperlink r:id="${link}">`; }
      xml += run;
    }
    if (link) xml += '</w:hyperlink>';
    return xml;
  }
  para(node, { style, numId, level, indent, border, firstLine } = {}) {
    const p = [];
    if (style) p.push(`<w:pStyle w:val="${style}"/>`);
    if (numId) p.push(`<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${numId}"/></w:numPr>`);
    if (border) p.push('<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BBBBBB"/></w:pBdr>');
    if (indent) p.push(`<w:ind w:left="${indent}"/>`);
    // The document format's first-line indent of 2 characters (body paragraphs only).
    else if (firstLine && !style && !numId) p.push(`<w:ind w:firstLineChars="200" w:firstLine="${firstLine}"/>`);
    const align = node && ALIGN[styleProps(node.getAttribute?.('style'))['text-align']];
    if (align) p.push(`<w:jc w:val="${align}"/>`);
    return `<w:p>${p.length ? `<w:pPr>${p.join('')}</w:pPr>` : ''}${node ? this.runsXml(this.runs(node)) : ''}</w:p>`;
  }
  // One numbering instance per top-level list; each depth takes the type of the first list there.
  list(el, depth = 0, numId = null) {
    if (numId === null) {
      const kinds = [];
      const scan = (l, d) => { kinds[d] ??= l.tagName === 'OL' ? 'decimal' : 'bullet'; for (const li of l.children) for (const c of li.children) if (/^(UL|OL)$/.test(c.tagName)) scan(c, d + 1); };
      scan(el, 0);
      this.lists.push(kinds);
      numId = this.lists.length;
    }
    let xml = '';
    for (const li of el.children) {
      if (li.tagName !== 'LI') continue;
      xml += this.para(li, { numId, level: Math.min(depth, 8) });
      for (const c of li.children) {
        if (/^(UL|OL)$/.test(c.tagName)) xml += this.list(c, depth + 1, numId);
        else if (/^(P|H1|H2|H3|BLOCKQUOTE)$/.test(c.tagName)) xml += this.para(c, { indent: 480 * (depth + 1) });
      }
    }
    return xml;
  }
  table(el) {
    const rows = [...el.querySelectorAll('tr')].filter((tr) => tr.closest('table') === el);
    const width = Math.max(1, ...rows.map((tr) => [...tr.children].reduce((n, c) => n + (Number(c.getAttribute('colspan')) || 1), 0)));
    const merged = new Array(width).fill(0);
    // Full width, equal columns, 3pt × 5pt cell padding and a grey header row: as on screen and in the PDF.
    let xml = '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>' +
      ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`).join('') +
      '</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' +
      new Array(width).fill(`<w:gridCol w:w="${Math.floor(9638 / width)}"/>`).join('') + '</w:tblGrid>';
    for (const tr of rows) {
      const cells = [...tr.children];
      // A row of header cells repeats at the top of each page.
      xml += cells.length && cells.every((c) => c.tagName === 'TH') ? '<w:tr><w:trPr><w:tblHeader/></w:trPr>' : '<w:tr>';
      let col = 0;
      const cont = () => { while (col < width && merged[col] > 0) { xml += '<w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc>'; merged[col]--; col++; } };
      for (const cell of cells) {
        cont();
        const span = Number(cell.getAttribute('colspan')) || 1, rows = Number(cell.getAttribute('rowspan')) || 1;
        const head = cell.tagName === 'TH';
        const pr = (span > 1 ? `<w:gridSpan w:val="${span}"/>` : '') + (rows > 1 ? '<w:vMerge w:val="restart"/>' : '') + (head ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : '');
        const runs = this.runs(cell, head ? { b: true } : {});
        xml += `<w:tc>${pr ? `<w:tcPr>${pr}</w:tcPr>` : ''}<w:p>${this.runsXml(runs)}</w:p></w:tc>`;
        if (rows > 1) for (let k = 0; k < span; k++) merged[col + k] = rows - 1;
        col += span;
      }
      cont();
      xml += '</w:tr>';
    }
    return xml + '</w:tbl><w:p/>';
  }
  blocks(root) {
    let xml = '';
    for (const n of root.childNodes) {
      if (n.nodeType === 3) { if (n.textContent.trim()) xml += `<w:p>${this.runsXml([{ text: n.textContent.replace(/\s+/g, ' '), f: {} }])}</w:p>`; continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName;
      if (/^H[1-3]$/.test(tag)) xml += this.para(n, { style: 'Heading' + tag[1] });
      else if (tag === 'P') xml += this.para(n, { firstLine: this.firstLine });
      else if (tag === 'UL' || tag === 'OL') xml += this.list(n);
      else if (tag === 'TABLE') xml += this.table(n);
      else if (tag === 'HR' && n.getAttribute('data-edoc-break') === 'page') xml += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      else if (tag === 'HR') xml += this.para(null, { border: true });
      else if (tag === 'BLOCKQUOTE') xml += n.querySelector('p,ul,ol,h1,h2,h3') ? this.blocks(n) : this.para(n, { indent: 720 });
      else if (tag !== 'IMG') xml += this.blocks(n);
    }
    return xml;
  }
}

// Readers often do not have the bundled fonts installed: say what kind of font each one is
// and name a common equivalent, so Word picks a close substitute rather than its default serif.
const FONT_TABLE = [
  ['Noto Sans TC', 'swiss', '微軟正黑體', '020B0200000000000000'],
  ['Noto Serif TC', 'roman', '新細明體', '02020200000000000000'],
  ['LXGW WenKai TC', 'script', '標楷體', '02010600000000000000'],
  ['Arimo', 'swiss', 'Arial', '020B0604020202020204'],
  ['Tinos', 'roman', 'Times New Roman', '02020603050405020304'],
];
function fontTableXml() {
  return `${XML}<w:fonts ${W}>` + FONT_TABLE.map(([name, family, alt, panose]) =>
    `<w:font w:name="${esc(name)}"><w:altName w:val="${esc(alt)}"/><w:panose1 w:val="${panose}"/><w:charset w:val="88"/><w:family w:val="${family}"/><w:pitch w:val="variable"/></w:font>`).join('') + '</w:fonts>';
}

function numberingXml(lists) {
  const bullets = ['•', '◦', '▪'];
  const decimal = ['decimal', 'lowerLetter', 'lowerRoman'];
  const abstract = lists.map((kinds, i) => `<w:abstractNum w:abstractNumId="${i}"><w:multiLevelType w:val="hybridMultilevel"/>` +
    Array.from({ length: 9 }, (_, l) => {
      const bullet = (kinds[l] ?? kinds.at(-1)) === 'bullet';
      const fmt = bullet ? 'bullet' : decimal[l % 3];
      const text = bullet ? bullets[l % 3] : `%${l + 1}.`;
      return `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/>` +
        `<w:pPr><w:ind w:left="${480 * (l + 1)}" w:hanging="360"/></w:pPr></w:lvl>`;
    }).join('') + '</w:abstractNum>').join('');
  const nums = lists.map((_, i) => `<w:num w:numId="${i + 1}"><w:abstractNumId w:val="${i}"/></w:num>`).join('');
  return `${XML}<w:numbering ${W}>${abstract}${nums}</w:numbering>`;
}

// Document format (R2.17) in Word terms: line spacing is "at least" the PDF's line height, so
// Word keeps its own (taller) single spacing for 1.0 and 1.15 and never clips large text.
const SPACING_AFTER = { compact: 40, standard: 120, wide: 240 };
function stylesXml(layout) {
  const L = layoutValues(layout);
  const font = fontsXml(FONTS.find((f) => f.id === L.font) || DEFAULT_FONT);
  const size = layout?.size ? L.size : TYPE_SCALE.P;
  const line = layout?.lineHeight ? `w:line="${Math.round(Number(L.lineHeight) * Number(size) * 20)}" w:lineRule="atLeast"` : 'w:line="360" w:lineRule="auto"';
  const heading = (n) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${n === 1 ? 0 : 320}" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="${halfPoints(HEADING_SIZE[n])}"/><w:szCs w:val="${halfPoints(HEADING_SIZE[n])}"/></w:rPr></w:style>`;
  return `${XML}<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr>${font}<w:sz w:val="${halfPoints(size)}"/><w:szCs w:val="${halfPoints(size)}"/><w:lang w:val="zh-TW" w:eastAsia="zh-TW"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="${SPACING_AFTER[L.spacing]}" ${line}/></w:pPr></w:pPrDefault></w:docDefaults>` +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    heading(1) + heading(2) + heading(3) +
    '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="777777"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr></w:style>' +
    '</w:styles>';
}

/**
 * The .docx bytes for one version. `html` is the clean, sanitized content (what the PDF shows).
 */
export function docxFromHtml({ html, title, version, hash, created, layout = null }) {
  const { document } = parseHTML('<!doctype html><html><body></body></html>');
  const root = document.createElement('div');
  root.innerHTML = html;
  const b = new Builder();
  const L = layoutValues(layout);
  if (L.indent === '2') b.firstLine = Math.round(2 * Number(L.size) * 20);
  const body = b.blocks(root);
  const short = `${hash.slice(0, 8)}…${hash.slice(-8)}`;
  const footer = `${XML}<w:ftr ${W}><w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr><w:r><w:t xml:space="preserve">${esc(`版本 ${version}｜SHA-256 ${short}｜正式版以 PDF 為準　第 `)}</w:t></w:r>` +
    '<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple><w:r><w:t xml:space="preserve"> 頁</w:t></w:r></w:p></w:ftr>';
  // A4 with the PDF's margins (20 mm sides, 22 mm top).
  const sect = '<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1247" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>';
  const documentXml = `${XML}<w:document ${W}><w:body>${body}${sect}</w:body></w:document>`;
  const rels = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
    '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
    '<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
    '<Relationship Id="rIdFonts" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>' +
    b.links.map((href, i) => `<Relationship Id="rIdLink${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(href)}" TargetMode="External"/>`).join('') +
    '</Relationships>';
  const created8601 = created && !Number.isNaN(Date.parse(created)) ? new Date(created).toISOString().replace(/\.\d+Z$/, 'Z') : '2026-01-01T00:00:00Z';
  const files = [
    { name: '[Content_Types].xml', data: `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
      '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
      '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
      '<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>' },
    { name: '_rels/.rels', data: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>' },
    { name: 'word/document.xml', data: documentXml },
    { name: 'word/_rels/document.xml.rels', data: rels },
    { name: 'word/styles.xml', data: stylesXml(layout) },
    { name: 'word/numbering.xml', data: numberingXml(b.lists.length ? b.lists : [['bullet']]) },
    { name: 'word/settings.xml', data: `${XML}<w:settings ${W}><w:defaultTabStop w:val="480"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>` },
    { name: 'word/footer1.xml', data: footer },
    { name: 'word/fontTable.xml', data: fontTableXml() },
    { name: 'docProps/core.xml', data: `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<dc:title>${esc(`${title} ${version}`)}</dc:title><dc:creator>EDoc</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${created8601}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${created8601}</dcterms:modified></cp:coreProperties>` },
    { name: 'docProps/app.xml', data: `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>EDoc</Application></Properties>` },
  ];
  return zip(files);
}
