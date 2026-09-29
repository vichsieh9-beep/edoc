// New documents from pasted text or Word: map incoming html onto the EDoc content model
// (one h1 title, h2 sections, paragraphs, lists, tables), then run the regular sanitizer.
import { inertContainer } from './dom.js';
import { sanitizeRevisionHtml } from './revision.js';

export const escapeText = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const BLOCKS = 'p,h1,h2,h3,h4,h5,h6,ul,ol,li,table,div,blockquote';
const KEEP_ATTRS = { A: ['href'], TD: ['colspan', 'rowspan'], TH: ['colspan', 'rowspan'] };
const INLINE_TOP = /^(STRONG|EM|B|I|A|SPAN|BR)$/;

/** Plain text: one paragraph per line; lines starting with "- ", "* ", "•" or "・" become a bullet list. */
export function textToHtml(text) {
  const out = [];
  let list = false;
  for (const raw of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    const item = line.match(/^(?:[-*]\s+|[•・●‧]\s*)(.+)$/);
    if (list && !item) { out.push('</ul>'); list = false; }
    if (!line) continue;
    if (item) {
      if (!list) { out.push('<ul>'); list = true; }
      out.push(`<li>${escapeText(item[1])}</li>`);
    } else out.push(`<p>${escapeText(line)}</p>`);
  }
  if (list) out.push('</ul>');
  return out.join('\n');
}

function rename(el, tag) {
  const next = el.ownerDocument.createElement(tag);
  for (const a of KEEP_ATTRS[tag.toUpperCase()] || []) if (el.hasAttribute(a)) next.setAttribute(a, el.getAttribute(a));
  next.append(...el.childNodes);
  el.replaceWith(next);
  return next;
}
function wrapChildren(el, tag) {
  const w = el.ownerDocument.createElement(tag);
  w.append(...el.childNodes);
  el.append(w);
}

// Word's own clipboard html marks list paragraphs with mso-list styles instead of <li>.
function wordLists(root) {
  root.querySelectorAll('[style*="mso-list:Ignore" i],[style*="mso-list: Ignore" i]').forEach((e) => e.remove());
  const isItem = (n) => n && n.nodeType === 1 && n.tagName === 'P' && /mso-list:\s*l\d+\s+level\d/i.test(n.getAttribute('style') || '');
  for (const p of [...root.querySelectorAll('p')]) {
    if (!root.contains(p) || !isItem(p) || isItem(p.previousElementSibling)) continue;
    const doc = p.ownerDocument;
    const top = doc.createElement('ul');
    p.before(top);
    const stack = [top];
    for (let n = p; isItem(n);) {
      const next = n.nextElementSibling;
      const level = Math.min(Number((n.getAttribute('style').match(/level(\d)/i) || [])[1] || 1), stack.length + 1);
      while (stack.length > level) stack.pop();
      if (stack.length < level) {
        const nested = doc.createElement('ul');
        (stack[stack.length - 1].lastElementChild || stack[stack.length - 1]).append(nested);
        stack.push(nested);
      }
      const li = doc.createElement('li');
      li.append(...n.childNodes);
      stack[stack.length - 1].append(li);
      n.remove();
      n = next;
    }
  }
}

// Google Docs and Word express bold/italic with inline styles; turn those into tags before styles go.
function styleToTags(root) {
  for (const el of [...root.querySelectorAll('[style]')]) {
    const style = el.getAttribute('style');
    const weight = (style.match(/font-weight:\s*(\w+)/i) || [])[1];
    const bold = weight && (/bold/i.test(weight) || Number(weight) >= 600);
    const normal = weight && (/normal/i.test(weight) || Number(weight) <= 500);
    if (el.tagName === 'B' && normal) { el.replaceWith(...el.childNodes); continue; }
    if (bold && !/^(B|STRONG|H\d|TH)$/.test(el.tagName)) wrapChildren(el, 'strong');
    if (/font-style:\s*italic/i.test(style) && !/^(I|EM)$/.test(el.tagName)) wrapChildren(el, 'em');
  }
}

/**
 * Normalize html for a new document. Returns { html, images }: images counts pictures left out
 * (the first version keeps text only). Unless it starts with an h1, the document name becomes the title.
 */
export function normalizeImportedHtml(html, { title = '' } = {}) {
  const root = inertContainer(html);
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 128 /* NodeFilter.SHOW_COMMENT */);
  const comments = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((c) => c.remove());
  const pictures = root.querySelectorAll('img,picture,svg,video,canvas');
  const images = [...pictures].filter((e) => !e.parentElement.closest('picture')).length;
  pictures.forEach((e) => e.remove());
  root.querySelectorAll('script,style,meta,link,title,head').forEach((e) => e.remove());

  wordLists(root);
  styleToTags(root);
  // Inline wrappers around whole blocks (common in clipboard html) are dropped.
  root.querySelectorAll('span,b,strong,i,em,u,font,a').forEach((e) => { if (e.querySelector(BLOCKS)) e.replaceWith(...e.childNodes); });
  root.querySelectorAll('h3,h4,h5,h6').forEach((h) => wrapChildren(rename(h, 'p'), 'strong'));
  root.querySelectorAll('div').forEach((d) => {
    if (d.querySelector(BLOCKS)) d.replaceWith(...d.childNodes);
    else rename(d, 'p');
  });
  for (const el of root.querySelectorAll('*')) {
    const keep = KEEP_ATTRS[el.tagName] || [];
    for (const a of [...el.attributes]) if (!keep.includes(a.name)) el.removeAttribute(a.name);
  }
  root.querySelectorAll('p,h1,h2,li').forEach((b) => {
    if (!b.textContent.trim() && !b.querySelector('ul,ol,table')) b.remove();
  });

  // Loose text and inline elements at the top level become paragraphs.
  let run = null;
  for (const n of [...root.childNodes]) {
    const inline = n.nodeType === 3 ? n.textContent.trim() !== '' : n.nodeType === 1 && INLINE_TOP.test(n.tagName);
    if (inline) {
      if (!run) { run = doc.createElement('p'); n.before(run); }
      run.append(n);
    } else if (n.nodeType === 3) n.remove();
    else run = null;
  }
  root.querySelectorAll(':scope > p').forEach((p) => { if (!p.textContent.trim()) p.remove(); });

  // One title: an h1 at the very start is the document's own; every other h1 becomes a section.
  const own = root.firstElementChild && root.firstElementChild.tagName === 'H1' ? root.firstElementChild : null;
  root.querySelectorAll('h1').forEach((h) => { if (h !== own) rename(h, 'h2'); });
  if (!own && title.trim()) {
    const h1 = doc.createElement('h1');
    h1.textContent = title.trim();
    root.prepend(h1);
  }
  const clean = inertContainer(sanitizeRevisionHtml(root.innerHTML));
  // Attribute-free spans and links whose address was unsafe carry nothing.
  clean.querySelectorAll('span,a:not([href])').forEach((e) => e.replaceWith(...e.childNodes));
  return { html: [...clean.childNodes].map((n) => (n.nodeType === 1 ? n.outerHTML : n.textContent.trim())).filter(Boolean).join('\n'), images };
}
