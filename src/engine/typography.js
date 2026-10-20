// One type scale for the document on screen and in the official PDF (R2.16): the same font
// and the same sizes in pt, so text wraps the same way in both. Spacing stays per medium.
import { DEFAULT_FONT, FONTS, FONT_SIZES, TYPE_SCALE } from './content-model.js';

export const DOCUMENT_FONT = DEFAULT_FONT.css;
// The site's font files (see scripts/lib/fonts.mjs): one stylesheet per font, relative to a page.
export const fontStylesheet = (font) => `../../fonts/${font.pkg}.css`;
/** Fonts a page needs for `htmls`: the document font plus every bundled font they use. */
export function fontsUsedIn(htmls) {
  const text = htmls.join('\n');
  return FONTS.filter((f) => f === DEFAULT_FONT || text.includes(f.family));
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
    ...FONT_SIZES.map((pt, i) => `${scope} font[size="${i + 1}"]{font-size:${pt}pt}`),
  ].join('\n');
}
