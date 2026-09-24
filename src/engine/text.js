// Clipboard copies of a clean version: rich HTML without EDoc markup, and plain text with bullets.
import { unwrapElement } from './dom.js';

export function clipboardHtml(html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  t.content.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) if (!['href', 'src', 'alt'].includes(a.name)) el.removeAttribute(a.name);
  });
  t.content.querySelectorAll('span').forEach(unwrapElement);
  return t.innerHTML;
}

export function toPlainText(html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  const out = [];
  const own = (el) => {
    let s = '';
    for (const n of el.childNodes) {
      if (n.nodeType === 3) s += n.textContent;
      else if (n.nodeType === 1 && !/^(UL|OL)$/.test(n.tagName)) s += n.tagName === 'BR' ? ' ' : n.textContent;
    }
    return s.replace(/\s+/g, ' ').trim();
  };
  const list = (ul, depth) => {
    let i = 0;
    for (const li of ul.children) {
      if (li.tagName !== 'LI') continue;
      i++;
      const mark = ul.tagName === 'OL' ? `${i}.` : depth ? '◦' : '•';
      out.push('  '.repeat(depth) + mark + ' ' + own(li));
      for (const sub of li.children) if (/^(UL|OL)$/.test(sub.tagName)) list(sub, depth + 1);
    }
  };
  const blocks = (parent) => {
    for (const el of parent.children) {
      const tag = el.tagName;
      if (/^H[1-6]$/.test(tag)) {
        if (out.length) out.push('');
        out.push(own(el));
      } else if (tag === 'P' || tag === 'BLOCKQUOTE') out.push(own(el));
      else if (tag === 'UL' || tag === 'OL') list(el, 0);
      else if (tag === 'HR') out.push('');
      else if (tag === 'TABLE') {
        for (const tr of el.querySelectorAll('tr')) out.push([...tr.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim()).join('\t'));
      } else blocks(el);
    }
  };
  blocks(t.content);
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
