// npm run build → documents/<slug>/index.html (single self-contained file) and the Library index.html.
// Build output is not committed: CI builds it before every deploy.
import { buildSite } from './lib/site.mjs';

const { outputs, changed } = await buildSite();
console.log(`Built ${outputs.length} file(s); changed: ${changed.join(', ') || 'none'}`);
