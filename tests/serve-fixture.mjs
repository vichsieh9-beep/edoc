// Serve isolated test HTML; never overwrite the user's current local preview.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bundleRuntime, loadTemplates, loadDocuments, loadConfig, renderDocument, renderArchived, renderLibrary } from '../scripts/lib/site.mjs';
import { repoDocument } from './fake-github.js';
const output='_site/test';
const [templates,script,libraryScript,entries,config]=await Promise.all([
  loadTemplates(),bundleRuntime(),bundleRuntime('src/library.js'),loadDocuments(),loadConfig(),
]);
// Library scenarios assume the original QA document plus the unlisted sandbox.
const fixtures=entries.filter(entry=>['qa-senior-game-qa','edoc-sandbox'].includes(entry.slug));
for(const entry of fixtures) {
  if(entry.slug==='qa-senior-game-qa') entry.doc=repoDocument();
  const dir=join(output,'documents',entry.slug); await mkdir(dir,{recursive:true});
  const html=entry.doc.archived ? renderArchived(entry.doc,{templates}) : renderDocument(entry.doc,{templates,script,slug:entry.slug,config});
  await writeFile(join(dir,'index.html'),html);
}
await writeFile(join(output,'index.html'),renderLibrary(fixtures,{templates,script:libraryScript,config}));
process.env.EDOC_SITE_DIR=output;
await import('../scripts/serve.mjs');
