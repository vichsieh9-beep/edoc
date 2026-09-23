// Pages served over http(s) are "Published"; a file:// copy is "Local".
export function isPublished(loc) { return loc.protocol==='https:' || loc.protocol==='http:'; }
export function shareableUrl(loc) { return loc.href.split('#')[0]; }
