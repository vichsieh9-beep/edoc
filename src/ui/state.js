// Document data embedded in the page, plus what this browser is doing with it.
import { snapshotHash } from '../engine/hash.js';

function readJson(id, fallback) {
  const node=document.getElementById(id);
  return JSON.parse((node && node.textContent) || fallback);
}

export const state={
  meta: readJson('documentMeta','{}'),      // title, slug, publishApi, pdfVersions
  versions: readJson('versionData'),
  docState: readJson('documentState'),
  revisions: readJson('revisionData','[]'),
  activeVersion: null,
  activeRevision: null,
  clean: false,
  suppressObserver: false,
  session: null,        // { token, name } when this browser holds a valid edit link
  linkProblem: null,    // message when an edit link was rejected
  publishing: null,     // { version, status: 'publishing' | 'live' | 'timeout', since }
};
state.activeVersion=state.docState.latestVersion;

export function latestVersion() { return state.docState.latestVersion; }
export async function ensureHash(v) {
  const data=state.versions[v];
  if(!data.hash) data.hash=await snapshotHash(data.html);
  return data.hash;
}
