export function versionOrder(versions) {
  return Object.keys(versions).sort((a,b)=>parseFloat(a.slice(1))-parseFloat(b.slice(1)));
}
export function nextVersion(v) { return 'v' + (parseFloat(v.slice(1)) + 0.1).toFixed(1); }
export function nowISO() { return new Date().toISOString(); }
