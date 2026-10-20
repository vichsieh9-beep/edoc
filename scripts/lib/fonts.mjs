// The bundled document fonts (OFL, from @fontsource): fonts/fonts.css plus the woff2 slices it
// names. Each font is split by unicode-range, so a page downloads only the characters it shows.
// Build output like the pages: not committed, copied into the site by CI.
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export const FONT_SOURCES = {
  'noto-sans-tc': ['400', '700'],
  'noto-serif-tc': ['400', '700'],
  'lxgw-wenkai-tc': ['400', '700'],
  arimo: ['400', '700', '400-italic', '700-italic'],
  tinos: ['400', '700', '400-italic', '700-italic'],
};

/** Write fonts.css and copy the woff2 files it references into `outDir`. */
export async function buildFonts({ outDir = join(ROOT, 'fonts') } = {}) {
  await mkdir(outDir, { recursive: true });
  const css = [], sheets = {};
  let copied = 0;
  for (const [pkg, weights] of Object.entries(FONT_SOURCES)) {
    const dir = join(ROOT, 'node_modules', '@fontsource', pkg);
    sheets[pkg] = [];
    for (const weight of weights) {
      const text = await readFile(join(dir, `${weight}.css`), 'utf8');
      // Keep woff2 only (every supported browser reads it) and flatten the paths.
      sheets[pkg].push(text.replace(/src:\s*url\(\.\/files\/([^)]+\.woff2)\)\s*format\('woff2'\)(?:,\s*url\([^)]+\)\s*format\('woff'\))?/g, "src: url(./$1) format('woff2')"));
      for (const [, file] of text.matchAll(/url\(\.\/files\/([^)]+\.woff2)\)/g)) {
        const from = join(dir, 'files', file), to = join(outDir, file);
        if (existsSync(to) && (await stat(to)).size === (await stat(from)).size) continue;
        await copyFile(from, to);
        copied++;
      }
    }
  }
  // One stylesheet per font (pages load only the fonts they show) and fonts.css with all of them (PDF).
  let changed = false;
  const write = async (name, text) => {
    const file = join(outDir, name);
    if (existsSync(file) && (await readFile(file, 'utf8')) === text) return;
    await writeFile(file, text); changed = true;
  };
  for (const [pkg, parts] of Object.entries(sheets)) { await write(`${pkg}.css`, `/* ${pkg} (OFL, @fontsource) */\n` + parts.join('\n')); css.push(...parts); }
  await write('fonts.css', `/* EDoc document fonts (OFL): ${Object.keys(FONT_SOURCES).join(', ')} */\n` + css.join('\n'));
  return { copied, changed };
}
