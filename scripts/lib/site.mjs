// Builds the static site: each documents/<slug>/document.json → documents/<slug>/index.html
// (one self-contained file: CSS, data and the bundled engine inline) plus the Library index.html.
// Archived documents get a short "已封存" page instead of their content.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { displayDate } from '../../src/engine/date.js';
import { ENGINE_VERSION } from '../../src/engine/meta.js';
import { versionOrder } from '../../src/engine/version.js';
import { rowsHtml } from '../../src/library/rows.js';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export async function bundleRuntime(entry = 'src/main.js') {
  const result = await build({
    entryPoints: [join(ROOT, entry)],
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
  return {
    document: await read('templates/document.html'),
    archived: await read('templates/archived.html'),
    library: await read('templates/library.html'),
    style: await read('src/ui/styles.css'),
    libraryStyle: await read('src/library/styles.css'),
  };
}

// Dates on the site are Taipei dates, whatever machine builds it.
export function taipeiDate(iso) { return displayDate(iso) || null; }

/** Last update shown in the Library: the latest version's time and editor when it records them. */
export function updatedInfo(doc, fallbackIso = null) {
  const details = doc.versions?.[doc.latestVersion]?.details || [];
  const find = (prefix) => {
    const line = details.find((d) => typeof d === 'string' && d.startsWith(prefix));
    return line ? line.slice(prefix.length).trim() : null;
  };
  const date = taipeiDate(find('建立時間：') || fallbackIso);
  return date ? { date, by: find('編輯者：') } : null;
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

export function renderArchived(doc, { templates }) {
  return fill(templates.archived, {
    title: escapeHtml(doc.title),
    archivedDate: escapeHtml(taipeiDate(doc.archived.at) || ''),
    style: templates.style,
  });
}

/** What the Library page knows about each document (never the content itself). */
export function libraryEntries(entries) {
  return entries
    .filter(({ doc }) => !doc.unlisted) // e.g. the sandbox used for live publishing tests
    .map(({ slug, doc, updated }) => ({
      slug,
      title: doc.title,
      subtitle: doc.subtitle || '',
      latestVersion: doc.latestVersion,
      updated: updated === undefined ? updatedInfo(doc) : updated,
      archived: doc.archived ? { date: taipeiDate(doc.archived.at), by: doc.archived.by || null } : null,
    }))
    .sort((a, b) => (b.updated?.date || '').localeCompare(a.updated?.date || '') || a.title.localeCompare(b.title));
}

export function renderLibrary(entries, { templates, script = '', config = {} }) {
  const docs = libraryEntries(entries);
  return fill(templates.library, {
    style: templates.libraryStyle,
    rows: rowsHtml(docs),
    libraryData: embedJson({ publishApi: config.publishApi || '', docs }),
    script,
  });
}

export async function loadDocuments() {
  const dir = join(ROOT, 'documents');
  const slugs = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const entries = [];
  for (const slug of slugs) {
    const file = join(dir, slug, 'document.json');
    if (!existsSync(file)) continue;
    const doc = JSON.parse(await readFile(file, 'utf8'));
    // Versions made before R2.7 record no time: fall back to the commit that introduced the version.
    entries.push({ slug, file, doc, updated: updatedInfo(doc, versionCommitTime(file, doc.latestVersion)) });
  }
  return entries;
}

function versionCommitTime(file, version) {
  try {
    const out = execFileSync('git', ['log', '--format=%cI', `-S"latestVersion": "${version}"`, '--', file],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.trim().split('\n').pop() || null;
  } catch {
    return null;
  }
}

/** Render every output file (build output is not committed; CI builds before deploying). */
export async function buildSite() {
  const [templates, script, libraryScript, entries, config] = await Promise.all([
    loadTemplates(), bundleRuntime(), bundleRuntime('src/library.js'), loadDocuments(), loadConfig(),
  ]);
  const outputs = entries.map(({ slug, doc }) => [
    join('documents', slug, 'index.html'),
    doc.archived ? renderArchived(doc, { templates }) : renderDocument(doc, { templates, script, slug, config }),
  ]);
  outputs.push(['index.html', renderLibrary(entries, { templates, script: libraryScript, config })]);
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
