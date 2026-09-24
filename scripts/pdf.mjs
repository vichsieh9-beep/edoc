// npm run pdf → build the site, then write documents/<slug>/pdf/<version>.pdf for every formal version.
import { relative } from 'node:path';
import { buildSite, ROOT } from './lib/site.mjs';
import { generatePdfs } from './lib/pdf.mjs';

await buildSite();
const written = await generatePdfs();
console.log(`PDF ${written.length} 份：\n` + written.map((p) => '  ' + relative(ROOT, p)).join('\n'));
