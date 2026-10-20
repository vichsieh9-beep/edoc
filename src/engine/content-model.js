// Formatting a document can carry (R2.16). Everything outside these closed lists is
// dropped, so stored html can only ever say "this text is one of these colours / fonts /
// sizes", never arbitrary CSS: no url() beacons, no fixed overlays, no hidden text.
// Values are rebuilt from the lists below rather than copied from the input, and parsing is
// plain string work, so the page (browser DOM) and the Worker (linkedom) agree byte for byte.

// Word's standard colours, minus the blue and red used for revision marks.
export const TEXT_COLORS = [
  { id: 'red', label: '紅', value: '#ff0000' },
  { id: 'orange', label: '橙', value: '#ed7d31' },
  { id: 'green', label: '綠', value: '#00b050' },
  { id: 'blue', label: '藍', value: '#0070c0' },
  { id: 'navy', label: '深藍', value: '#002060' },
  { id: 'purple', label: '紫', value: '#7030a0' },
  { id: 'gray', label: '灰', value: '#7f7f7f' },
];
// Word's highlighter colours.
export const HIGHLIGHT_COLORS = [
  { id: 'yellow', label: '黃', value: '#ffff00' },
  { id: 'lime', label: '亮綠', value: '#00ff00' },
  { id: 'cyan', label: '青綠', value: '#00ffff' },
  { id: 'pink', label: '粉紅', value: '#ff00ff' },
  { id: 'gray', label: '灰', value: '#c0c0c0' },
];
// Open-source fonts bundled with the site (OFL), so screen, phone and PDF render the same.
// The first one is the document font and is never written into the html.
export const FONTS = [
  { id: 'sans', pkg: 'noto-sans-tc', label: '思源黑體', hint: '預設・黑體', family: 'Noto Sans TC', css: "'Noto Sans TC',sans-serif" },
  { id: 'serif', pkg: 'noto-serif-tc', label: '思源宋體', hint: '明體／宋體', family: 'Noto Serif TC', css: "'Noto Serif TC',serif" },
  { id: 'kai', pkg: 'lxgw-wenkai-tc', label: '霞鶩文楷', hint: '楷體', family: 'LXGW WenKai TC', css: "'LXGW WenKai TC','Noto Serif TC',serif" },
  { id: 'arimo', pkg: 'arimo', label: 'Arimo', hint: '英文，同 Arial', family: 'Arimo', css: "Arimo,'Noto Sans TC',sans-serif" },
  { id: 'tinos', pkg: 'tinos', label: 'Tinos', hint: '英文，同 Times New Roman', family: 'Tinos', css: "Tinos,'Noto Serif TC',serif" },
];
export const DEFAULT_FONT = FONTS[0];
// Font sizes in pt. Position + 1 is the browser's fontSize command level (1–7).
export const FONT_SIZES = ['9', '10.5', '12', '14', '16', '20', '24'];
// The shared type scale: body text and headings, on screen and in the PDF.
export const TYPE_SCALE = { P: '12', LI: '12', TD: '12', TH: '12', BLOCKQUOTE: '12', H1: '20', H2: '15', H3: '13' };
export const ALIGNMENTS = ['center', 'right', 'justify'];
export const STYLED_BLOCKS = new Set(['P', 'H1', 'H2', 'H3', 'LI']);
// Classes a stored version may carry: diff marks only (everything else is page chrome).
export const CONTENT_CLASSES = new Set(['changed', 'deleted', 'deletion-record', 'revision-changed', 'format-changed']);
// data-edoc-fmt describes a format change, e.g. "+b color" (see describeFormat).
export const FORMAT_NOTE = /^[a-z0-9+ -]{1,80}$/;

const BROWSER_SIZE_KEYWORDS = { 'x-small': 1, small: 2, medium: 3, large: 4, 'x-large': 5, 'xx-large': 6, 'xxx-large': 7, '-webkit-xxx-large': 7 };

/** '#f00', '#FF0000', 'rgb(255, 0, 0)', 'rgba(255,0,0,1)' → '#ff0000'; anything else → null. */
export function parseColor(value) {
  const v = String(value).trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3})$/);
  if (m) return '#' + [...m[1]].map((c) => c + c).join('');
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  m = v.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(1|1\.0+)\s*)?\)$/);
  if (!m) return null;
  const parts = m.slice(1, 4).map(Number);
  if (parts.some((n) => n > 255)) return null;
  return '#' + parts.map((n) => n.toString(16).padStart(2, '0')).join('');
}
const inList = (list, value) => list.find((c) => c.value === value) || null;
export const textColor = (value) => inList(TEXT_COLORS, parseColor(value));
export const highlightColor = (value) => inList(HIGHLIGHT_COLORS, parseColor(value));

// Fonts people paste from Word and Google Docs, mapped to the closest bundled font.
const FONT_ALIASES = {
  arial: 'arimo', helvetica: 'arimo', 'helvetica neue': 'arimo', 'liberation sans': 'arimo',
  'times new roman': 'tinos', times: 'tinos', 'liberation serif': 'tinos',
  '新細明體': 'serif', pmingliu: 'serif', '細明體': 'serif', mingliu: 'serif', 'noto serif cjk tc': 'serif', 'source han serif tc': 'serif', '思源宋體': 'serif',
  '標楷體': 'kai', 'dfkai-sb': 'kai', biaukai: 'kai', 'kaiti tc': 'kai', '楷體-繁': 'kai', 'tw-kai': 'kai',
  '微軟正黑體': 'sans', 'microsoft jhenghei': 'sans', 'pingfang tc': 'sans', 'noto sans cjk tc': 'sans', 'source han sans tc': 'sans', '思源黑體': 'sans',
};
/** First family of a font-family value matched against FONTS (or a common equivalent). */
export function fontFor(value) {
  const first = String(value).split(',')[0].trim().replace(/^["']|["']$/g, '').trim().toLowerCase();
  const own = FONTS.find((f) => f.family.toLowerCase() === first);
  if (own) return own;
  const alias = FONT_ALIASES[first];
  return alias ? FONTS.find((f) => f.id === alias) : null;
}
/** '14pt' → '14'; the browser's size keywords map to the same 7 levels; px is editor residue. */
export function fontSizeFor(value) {
  const v = String(value).trim().toLowerCase();
  if (v in BROWSER_SIZE_KEYWORDS) return FONT_SIZES[BROWSER_SIZE_KEYWORDS[v] - 1];
  const m = v.match(/^(\d{1,2}(?:\.\d{1,2})?)pt$/);
  if (!m) return null;
  const n = String(Number(m[1]));
  return FONT_SIZES.includes(n) ? n : null;
}
export const fontSizeForLevel = (level) => FONT_SIZES[Number(level) - 1] || null;

function declarations(style) {
  const out = [];
  for (const part of String(style || '').split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const name = part.slice(0, i).trim().toLowerCase(), value = part.slice(i + 1).trim();
    // Never let anything that could fetch, escape or hide content through.
    if (!name || !value || /[\\<>@!]|\/\*|url\s*\(|expression|var\s*\(|attr\s*\(/i.test(value)) continue;
    out.push([name, value]);
  }
  return out;
}
const serialize = (props) => Object.keys(props).sort().map((k) => k + ':' + props[k]).join(';');

/**
 * Canonical inline style of a span: palette colour, highlight, bundled font and preset size.
 * `blockTag` is the enclosing block; a size equal to that block's own size is dropped.
 */
export function canonicalSpanStyle(style, blockTag = 'P') {
  const props = {};
  for (const [name, value] of declarations(style)) {
    if (name === 'color') { const c = textColor(value); if (c) props.color = c.value; }
    else if (name === 'background-color' || name === 'background') { const c = highlightColor(value); if (c) props['background-color'] = c.value; }
    else if (name === 'font-family') { const f = fontFor(value); if (f && f !== DEFAULT_FONT) props['font-family'] = f.css; }
    else if (name === 'font-size') { const s = fontSizeFor(value); if (s && s !== (TYPE_SCALE[blockTag] || '12')) props['font-size'] = s + 'pt'; }
  }
  return serialize(props);
}
/** Canonical style of a paragraph, heading or list item: alignment. */
export function canonicalBlockStyle(style, align = '') {
  const props = {};
  for (const [name, value] of declarations(style)) {
    if (name === 'text-align' && ALIGNMENTS.includes(value.toLowerCase())) props['text-align'] = value.toLowerCase();
  }
  // Firefox writes alignment as an attribute.
  if (!props['text-align'] && ALIGNMENTS.includes(String(align).toLowerCase())) props['text-align'] = String(align).toLowerCase();
  return serialize(props);
}
/** <font color face size> written by the browser's commands → the equivalent span style. */
export function fontElementStyle(el) {
  const parts = [];
  if (el.getAttribute('color')) parts.push('color:' + el.getAttribute('color'));
  if (el.getAttribute('face')) parts.push('font-family:' + el.getAttribute('face'));
  const size = fontSizeForLevel(el.getAttribute('size'));
  if (size) parts.push('font-size:' + size + 'pt');
  return parts.join(';');
}

/** The enclosing block's tag, used for size defaults. */
export function blockTagOf(el) {
  for (let p = el.parentElement; p; p = p.parentElement) if (/^(P|H1|H2|H3|LI|TD|TH|BLOCKQUOTE)$/.test(p.tagName)) return p.tagName;
  return 'P';
}

// Format keys used by the diff: one token per effective format of a piece of text.
const TAG_FORMAT = { STRONG: 'b', B: 'b', EM: 'i', I: 'i', U: 'u', S: 's', SUP: 'sup', SUB: 'sub' };
const STYLE_FORMAT = { color: 'color', 'background-color': 'bg', 'font-family': 'font', 'font-size': 'size' };
/** Effective inline formats of a text node inside `block`: { b:true, color:'#ff0000', … }. */
export function inlineFormats(textNode, block) {
  const f = {};
  for (let p = textNode.parentElement; p && p !== block; p = p.parentElement) {
    const tag = TAG_FORMAT[p.tagName];
    if (tag) f[tag] = true;
    else if (p.tagName === 'A') { if (!('link' in f)) f.link = p.getAttribute('href') || ''; }
    else if (p.tagName === 'SPAN' && p.getAttribute('style')) {
      for (const [name, value] of declarations(p.getAttribute('style'))) {
        const key = STYLE_FORMAT[name];
        if (key && !(key in f)) f[key] = value; // the innermost wins
      }
    }
  }
  return f;
}
export const formatKey = (f) => Object.keys(f).sort().map((k) => (f[k] === true ? k : k + '=' + f[k])).join('|');
/** What changed between two format sets, as a data-edoc-fmt note: "+b -i color". */
export function formatNote(before, after) {
  const out = [];
  for (const k of ['b', 'i', 'u', 's', 'sup', 'sub']) {
    if (!before[k] && after[k]) out.push('+' + k);
    else if (before[k] && !after[k]) out.push('-' + k);
  }
  for (const k of ['color', 'bg', 'font', 'size', 'link']) if ((before[k] ?? null) !== (after[k] ?? null)) out.push(k);
  return out.join(' ');
}
/** Block-level formats: heading level, alignment, list type and depth. */
export function blockFormats(block) {
  const f = { tag: /^H[1-3]$/.test(block.tagName) ? block.tagName.toLowerCase() : 'p' };
  const align = declarations(block.getAttribute('style')).find(([n]) => n === 'text-align');
  if (align) f.align = align[1];
  if (block.tagName === 'LI') {
    const path = [];
    for (let p = block.parentElement; p; p = p.parentElement) if (p.tagName === 'UL' || p.tagName === 'OL') path.unshift(p.tagName.toLowerCase());
    f.list = path.join('>');
  }
  return f;
}
export function blockFormatNote(before, after) {
  const out = [];
  if (before.tag !== after.tag) out.push('style');
  if ((before.align || '') !== (after.align || '')) out.push('align');
  if ((before.list || '') !== (after.list || '')) {
    const depth = (l) => (l || '').split('>').length;
    out.push(depth(before.list) !== depth(after.list) ? 'indent' : 'list');
  }
  return out.join(' ');
}

const NOTE_LABELS = {
  '+b': '粗體', '-b': '取消粗體', '+i': '斜體', '-i': '取消斜體', '+u': '底線', '-u': '取消底線',
  '+s': '刪除線', '-s': '取消刪除線', '+sup': '上標', '-sup': '取消上標', '+sub': '下標', '-sub': '取消下標',
  color: '文字色彩', bg: '螢光筆', font: '字型', size: '字級', link: '連結',
  style: '段落樣式', align: '對齊', list: '清單類型', indent: '縮排', layout: '換行或圖片',
};
/** "+b color" → "粗體、文字色彩". */
export function describeFormat(note) {
  const words = String(note || '').split(/\s+/).filter(Boolean).map((t) => NOTE_LABELS[t]).filter(Boolean);
  return [...new Set(words)].join('、') || '格式';
}
