// Document data embedded in the page. syncEmbeddedState() writes it back before an export.
import { snapshotHash } from '../engine/hash.js';

function readJson(id, fallback) {
  const node=document.getElementById(id);
  return JSON.parse((node && node.textContent) || fallback);
}

export const state={
  meta: readJson('documentMeta','{}'),
  versions: readJson('versionData'),
  docState: readJson('documentState'),
  revisions: readJson('revisionData','[]'),
  activeVersion: null,
  activeRevision: null,
  clean: false,
  suppressObserver: false,
};
state.activeVersion=state.docState.latestVersion;

export function latestVersion() { return state.docState.latestVersion; }
export async function ensureHash(v) {
  const data=state.versions[v];
  if(!data.hash) data.hash=await snapshotHash(data.html);
  return data.hash;
}
