// npm run build            → regenerate documents/*/index.html and the Library index.html
// npm run build -- --check → fail if the committed files are not what the sources produce (CI)
import { buildSite } from './lib/site.mjs';

const check = process.argv.includes('--check');
const { outputs, changed } = await buildSite({ check });
if (check && changed.length) {
  console.error('Built files are out of date. Run `npm run build` and commit:\n' + changed.map((f) => '  ' + f).join('\n'));
  process.exit(1);
}
console.log(check ? `Up to date: ${outputs.join(', ')}` : `Built ${outputs.length} file(s); changed: ${changed.join(', ') || 'none'}`);
