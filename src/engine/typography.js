// One type scale for the document on screen and in the official PDF (R2.16): the same font
// and the same sizes in pt, so text wraps the same way in both. Spacing stays per medium,
// except inside tables (R2.17): full width, equal columns, the same cell padding and borders.
import { DEFAULT_FONT, FONTS, LEVEL_SIZES, TYPE_SCALE } from './content-model.js';

export const DOCUMENT_FONT = DEFAULT_FONT.css;
// The site's font files (see scripts/lib/fonts.mjs): one stylesheet per font, relative to a page.
export const fontStylesheet = (font) => `../../fonts/${font.pkg}.css`;
/** Fonts a page needs for `htmls`: the document font plus every bundled font they or `layouts` use. */
export function fontsUsedIn(htmls, layouts = []) {
  const text = htmls.join('\n');
  return FONTS.filter((f) => f === DEFAULT_FONT || text.includes(f.family) || layouts.some((l) => l?.font === f.id));
}

/** Font, sizes and the browser's fontSize command levels for the document root `scope`. */
export function documentTypographyCss(scope) {
  const s = (sel) => sel.split(',').map((x) => `${scope} ${x.trim()}`).join(',');
  return [
    `${scope}{font-family:${DOCUMENT_FONT};font-size:${TYPE_SCALE.P}pt}`,
    `${s('h1')}{font-size:${TYPE_SCALE.H1}pt}`,
    `${s('h2')}{font-size:${TYPE_SCALE.H2}pt}`,
    `${s('h3')}{font-size:${TYPE_SCALE.H3}pt;margin:1.1em 0 .45em}`,
    // <font size="1–7"> is what the editor's size command writes before the draft is stored.
    ...LEVEL_SIZES.map((pt, i) => `${scope} font[size="${i + 1}"]{font-size:${pt}pt}`),
    // A page break: the PDF and Word copies start a new page here.
    `${scope} hr[data-edoc-break]{break-after:page}`,
    `${scope} table{width:100%;table-layout:fixed;border-collapse:collapse}`,
    `${s('td,th')}{border:0.6pt solid #999;padding:3pt 5pt;vertical-align:top;overflow-wrap:anywhere}`,
    `${scope} th{background:#f2f2f2;font-weight:700;text-align:left}`,
    `${s('td>:first-child,th>:first-child')}{margin-top:0}`,
    `${s('td>:last-child,th>:last-child')}{margin-bottom:0}`,
  ].join('\n');
}
