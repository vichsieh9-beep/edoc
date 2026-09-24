// Builds the static site: each documents/<slug>/document.json → documents/<slug>/index.html
// (one self-contained file: CSS, data and the bundled engine inline) plus the Library index.html.
import { build } from 'esbuild';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION } from '../../src/engine/meta.js';
import { versionOrder } from '../../src/engine/version.js';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export async function bundleRuntime() {
  const result = await build({
    entryPoints: [join(ROOT, 'src/main.js')],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    charset: 'utf8',
    legalComments: 'none',
    write: false,
    logLevel: 'silent',
  });
  const js = result.outputFiles[0].text;
  if (/<\/script|<!--/i.test(js)) throw new Error('Bundle contains "</script" or "<!--" and cannot be inlined.');
  return js;
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// JSON for <script type="application/json">: readable, but never able to end or confuse the script element.
export const embedJson = (value) =>
  JSON.stringify(value).replace(/<(\/|!--|script)/gi, (m, g) => (g === '/' ? '<\\/' : '\\u003c' + g));

function fill(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (m, key) => {
    if (!(key in values)) throw new Error(`Missing template value: ${key}`);
    return values[key];
  });
}

export async function loadTemplates() {
  const read = (p) => readFile(join(ROOT, p), 'utf8');
  return { document: await read('templates/document.html'), library: await read('templates/library.html'), style: await read('src/ui/styles.css') };
}

// edoc.config.json; EDOC_PUBLISH_API overrides the publish API (tests use a fake one).
export async function loadConfig() {
  const config = JSON.parse(await readFile(join(ROOT, 'edoc.config.json'), 'utf8'));
  const publishApi = process.env.EDOC_PUBLISH_API ?? config.publishApi ?? '';
  return { ...config, publishApi: publishApi.replace(/\/+$/, '') };
}

export function renderDocument(doc, { templates, script, slug, config = {} }) {
  const { documentId, title, latestVersion, nextRevisionIndex, versions } = doc;
  return fill(templates.document, {
    title: escapeHtml(title),
    latestVersion: escapeHtml(latestVersion),
    engineVersion: ENGINE_VERSION,
    style: templates.style,
    // pdfVersions: every formal version gets a PDF when the site is deployed (npm run pdf).
    documentMeta: embedJson({ title, slug, publishApi: config.publishApi || '', pdfVersions: versionOrder(versions) }),
    versionData: embedJson(versions),
    documentState: embedJson({ documentId, latestVersion, nextRevisionIndex }),
    revisionData: embedJson([]),
    script,
  });
}

export function renderLibrary(entries, { templates }) {
  const cards = entries
    .filter(({ doc }) => !doc.unlisted) // e.g. the sandbox used for live publishing tests
    .map(({ slug, doc }) => `<a class="card" href="./documents/${slug}/">
  <div class="row">
    <span class="title">${escapeHtml(doc.title)}</span>
    <span class="badge">${escapeHtml(doc.latestVersion)} Current</span>
  </div>
  <div class="meta">${escapeHtml(doc.subtitle)}</div>
</a>
`)
    .join('');
  return fill(templates.library, { cards });
}

export async function loadDocuments() {
  const dir = join(ROOT, 'documents');
  const slugs = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const entries = [];
  for (const slug of slugs) {
    const file = join(dir, slug, 'document.json');
    if (existsSync(file)) entries.push({ slug, file, doc: JSON.parse(await readFile(file, 'utf8')) });
  }
  return entries;
}

/** Render every output file (build output is not committed; CI builds before deploying). */
export async function buildSite() {
  const [templates, script, entries, config] = await Promise.all([loadTemplates(), bundleRuntime(), loadDocuments(), loadConfig()]);
  const outputs = entries.map(({ slug, doc }) => [join('documents', slug, 'index.html'), renderDocument(doc, { templates, script, slug, config })]);
  outputs.push(['index.html', renderLibrary(entries, { templates })]);
  const changed = [];
  for (const [rel, html] of outputs) {
    const file = join(ROOT, rel);
    const current = existsSync(file) ? await readFile(file, 'utf8') : null;
    if (current === html) continue;
    changed.push(rel);
    await writeFile(file, html);
  }
  return { outputs: outputs.map(([rel]) => rel), changed };
}
