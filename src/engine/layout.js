// Document format (R2.17): one setting for the whole document, like Word's 段落 basics: default
// font, body size, line spacing, paragraph spacing and first-line indent. Each version stores its
// own as `layout`, holding only what differs from the default; no layout is the look every
// version had before. The same CSS applies on screen and in the PDF; the Word copy maps it.
// Per-paragraph spacing is deliberately not offered: WebKit's undo of a per-paragraph style
// change on a list item deletes the whole list.
import { FONTS, DEFAULT_FONT, TYPE_SCALE } from './content-model.js';

const fontLabel = (id) => FONTS.find((f) => f.id === id)?.label || id;
export const LAYOUT_FIELDS = [
  { key: 'font', label: '預設字型', values: FONTS.map((f) => f.id), default: DEFAULT_FONT.id, text: fontLabel },
  { key: 'size', label: '內文字級', values: ['10', '10.5', '11', '12', '14', '16'], default: TYPE_SCALE.P, text: (v) => v },
  { key: 'lineHeight', label: '行距', values: ['1.0', '1.15', '1.5', '1.7', '2.0'], default: '1.7', text: (v) => v },
  { key: 'spacing', label: '段落間距', values: ['compact', 'standard', 'wide'], default: 'standard', text: (v) => ({ compact: '緊', standard: '標準', wide: '寬' })[v] },
  { key: 'indent', label: '首行縮排', values: ['0', '2'], default: '0', text: (v) => (v === '2' ? '2 字' : '無') },
];

/** Only valid values that differ from the default, in a fixed order; null when nothing is set. */
export function canonicalLayout(layout) {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) return null;
  const out = {};
  for (const f of LAYOUT_FIELDS) {
    const v = layout[f.key];
    if (typeof v === 'string' && f.values.includes(v) && v !== f.default) out[f.key] = v;
  }
  return Object.keys(out).length ? out : null;
}
/** Every field's value, defaults included. */
export function layoutValues(layout) {
  const c = canonicalLayout(layout) || {};
  return Object.fromEntries(LAYOUT_FIELDS.map((f) => [f.key, c[f.key] ?? f.default]));
}
/**
 * What the version hash adds for the layout: nothing without one, so the hashes of the
 * versions published before R2.17 stay the same. Stored html never holds an <edoc-layout>
 * element (the content model drops unknown tags), so the suffix cannot be confused with content.
 */
export function layoutHashSuffix(layout) {
  const c = canonicalLayout(layout);
  return c ? '\n<edoc-layout ' + Object.entries(c).map(([k, v]) => `${k}=${v}`).join(';') + '>' : '';
}
/** "行距 1.7→1.5" for each field that differs between two layouts. */
export function layoutChanges(before, after) {
  const a = layoutValues(before), b = layoutValues(after);
  return LAYOUT_FIELDS.filter((f) => a[f.key] !== b[f.key]).map((f) => `${f.label} ${f.text(a[f.key])}→${f.text(b[f.key])}`);
}
export const layoutChangeLine = (changes) => '文件格式：' + changes.join('、');

/** CSS for the document root `scope`; empty without a layout. */
export function layoutCss(scope, layout) {
  const c = canonicalLayout(layout);
  if (!c) return '';
  const rules = [];
  const font = c.font && FONTS.find((f) => f.id === c.font);
  if (font) rules.push(`${scope}{font-family:${font.css}}`);
  if (c.size) rules.push(`${scope}{font-size:${c.size}pt}`);
  if (c.lineHeight) rules.push(`${scope} :is(p,li,td,th,blockquote){line-height:${Number(c.lineHeight)}}`);
  if (c.spacing === 'compact') rules.push(`${scope} p{margin:.3em 0}`, `${scope} li{margin:0}`, `${scope} :is(ul,ol){margin:.3em 0}`);
  if (c.spacing === 'wide') rules.push(`${scope} p{margin:1.2em 0}`, `${scope} li{margin:.6em 0}`);
  // Body paragraphs only: not list items, table cells or headings.
  if (c.indent === '2') rules.push(`${scope}>p,${scope} blockquote>p{text-indent:2em}`);
  return rules.join('\n');
}
