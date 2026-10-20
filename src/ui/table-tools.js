// Tables in a Draft (R2.17): insert one from a rows × columns grid, then add or delete rows and
// columns from the small bar above the table, and move between cells with Tab. Every change
// replaces the whole table with one insertHTML, so a single undo puts the previous table back
// (Chromium and WebKit). Merged cells of imported tables are kept: a row or column added next
// to them extends the merge, deleting one shrinks it.
import { el } from './elements.js';
import { drafting, selectionInDoc, anchorElement, begin, select, commandDone, insertBetweenBlocks, topLevel, draftTextNodes, isTextBlock, emptyParagraphAfter } from './editing.js';

export const GRID_MAX = 6;
const FRAGMENTS = '.deletion-record,.draft-deletion';
let tableBar = null;

export function tableHtml(rows, cols) {
  const row = (tag) => `<tr>${`<${tag}><br></${tag}>`.repeat(cols)}</tr>`;
  return `<table><tbody>${row('th')}${row('td').repeat(rows - 1)}</tbody></table>`;
}
const ownCell = (node) => {
  const cell = (node?.nodeType === 3 ? node.parentElement : node)?.closest?.('td,th');
  return cell && el.doc.contains(cell) && !cell.closest(FRAGMENTS) ? cell : null;
};
export const currentCell = () => ownCell(anchorElement());

function caretIn(cell, { atEnd = true } = {}) {
  const r = document.createRange();
  const texts = draftTextNodes(cell);
  if (atEnd && texts.length) r.setStart(texts.at(-1), texts.at(-1).length);
  else r.setStart(cell, 0);
  r.collapse(true);
  select(r);
}

/** Insert a table of `rows` × `cols` after the current paragraph, caret in its first cell. */
export function insertTable(rows, cols) {
  const before = new Set(el.doc.querySelectorAll('table'));
  const top = topLevel(anchorElement());
  // Like Word, a table always has a paragraph after it, so writing can go on below it.
  const html = tableHtml(rows, cols) + (top?.nextElementSibling ? '' : '<p><br></p>');
  insertBetweenBlocks(html);
  const table = [...el.doc.querySelectorAll('table')].find((t) => !before.has(t));
  if (table) { caretIn(table.querySelector('th,td'), { atEnd: false }); commandDone(); }
}

// ---------- The table as a grid of cells ----------
// Each cell has its first row and column and its spans; rows remember their section (thead…).
function readGrid(table) {
  const rows = [...table.querySelectorAll('tr')].filter((tr) => tr.closest('table') === table && !tr.closest(FRAGMENTS));
  const cells = [], taken = new Set();
  rows.forEach((tr, r) => {
    let c = 0;
    for (const td of tr.children) {
      if (!/^T[DH]$/.test(td.tagName) || td.matches(FRAGMENTS)) continue;
      while (taken.has(r + ',' + c)) c++;
      const rs = Math.max(1, Number(td.getAttribute('rowspan')) || 1), cs = Math.max(1, Number(td.getAttribute('colspan')) || 1);
      for (let y = r; y < r + rs; y++) for (let x = c; x < c + cs; x++) taken.add(y + ',' + x);
      cells.push({ el: td, r, c, rs, cs });
      c += cs;
    }
  });
  const height = Math.max(rows.length, ...cells.map((x) => x.r + x.rs));
  const width = Math.max(0, ...cells.map((x) => x.c + x.cs));
  return { table, rows: rows.map((tr) => ({ section: tr.parentElement.tagName, tr })), cells, height, width };
}
const covers = (x, r, c) => x.r <= r && r < x.r + x.rs && x.c <= c && c < x.c + x.cs;
const at = (g, r, c) => g.cells.find((x) => covers(x, r, c));
const newCell = (tag) => ({ el: Object.assign(document.createElement(tag), { innerHTML: '<br>' }), fresh: true });

// The new row goes in the same section (thead, tbody…) as the row of the caret.
function insertRow(g, r, from) {
  for (const x of g.cells) { if (x.r >= r) x.r++; else if (x.r + x.rs > r) x.rs++; }
  g.rows.splice(r, 0, { section: g.rows[from]?.section || 'TBODY', tr: null });
  g.height++;
  for (let c = 0; c < g.width; c++) if (!at(g, r, c)) g.cells.push({ ...newCell('td'), r, c, rs: 1, cs: 1 });
}
function deleteRow(g, r) {
  g.cells = g.cells.filter((x) => !(x.r === r && x.rs === 1));
  for (const x of g.cells) { if (x.r > r) x.r--; else if (x.r + x.rs > r) x.rs--; }
  g.rows.splice(r, 1);
  g.height--;
}
function insertColumn(g, c) {
  for (const x of g.cells) { if (x.c >= c) x.c++; else if (x.c + x.cs > c) x.cs++; }
  g.width++;
  for (let r = 0; r < g.height; r++) {
    if (at(g, r, c)) continue;
    // A header row stays a header row.
    const side = at(g, r, c + 1) || at(g, r, c - 1);
    g.cells.push({ ...newCell(side?.el.tagName === 'TH' ? 'th' : 'td'), r, c, rs: 1, cs: 1 });
  }
}
function deleteColumn(g, c) {
  g.cells = g.cells.filter((x) => !(x.c === c && x.cs === 1));
  for (const x of g.cells) { if (x.c > c) x.c--; else if (x.c + x.cs > c) x.cs--; }
  g.width--;
}
/** The rebuilt table, or null when nothing is left of it. */
function writeGrid(g) {
  // A row without cells of its own (all covered by merged cells above) is dropped.
  for (let r = g.height - 1; r >= 0; r--) if (!g.cells.some((x) => x.r === r)) deleteRow(g, r);
  if (!g.cells.length) return null;
  const table = g.table.cloneNode(false);
  const caption = [...g.table.children].find((n) => n.tagName === 'CAPTION');
  if (caption) table.append(caption.cloneNode(true));
  let section = null;
  g.rows.forEach((row, r) => {
    if (!section || section.tagName !== row.section) table.append(section = document.createElement(row.section.toLowerCase()));
    const tr = row.tr ? row.tr.cloneNode(false) : document.createElement('tr');
    for (const x of g.cells.filter((y) => y.r === r).sort((a, b) => a.c - b.c)) {
      const cell = x.fresh ? x.el : x.el.cloneNode(true);
      cell.querySelectorAll(FRAGMENTS).forEach((n) => n.remove());
      for (const [name, n] of [['rowspan', x.rs], ['colspan', x.cs]]) n > 1 ? cell.setAttribute(name, n) : cell.removeAttribute(name);
      tr.append(cell);
    }
    section.append(tr);
  });
  return table;
}

// One insertHTML replaces the table (or, with no html, deletes it). Browsers merge what follows a
// selection into what comes before it: a divider after the table would be lost, a list after it
// would take the new table in. So the selection runs on to the next paragraph or table, and the
// dividers and lists in between are inserted again unchanged; with no paragraph after, an empty
// one is added first (empty paragraphs are not content: the comparison drops them).
const stopsReplace = (n) => isTextBlock(n) || n.nodeName === 'TABLE';
const escapeText = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
function replaceTable(table, html) {
  const after = () => { const out = []; for (let n = table.nextSibling; n && !stopsReplace(n); n = n.nextSibling) out.push(n); return out; };
  let skipped = after();
  const last = skipped.at(-1) || table;
  if (!last.nextSibling) { emptyParagraphAfter(last); skipped = after(); }
  const r = document.createRange();
  r.selectNode(table);
  if (skipped.length) r.setEndAfter(skipped.at(-1));
  select(r);
  const all = html + skipped.map((n) => n.nodeType === 1 ? n.outerHTML : escapeText(n.textContent)).join('');
  if (all.trim()) document.execCommand('insertHTML', false, all);
  else document.execCommand('delete');
}

// Replace the table the caret is in; `edit(grid)(cell)` changes the grid and returns where the
// caret goes ({ r, c }) afterwards. The cell's position is read before the grid changes.
function changeTable(edit) {
  const cell = currentCell();
  if (!cell || !begin()) return;
  const table = cell.closest('table');
  const g = readGrid(table);
  const here = g.cells.find((x) => x.el === cell);
  if (!here) return;
  const target = edit(g)({ ...here });
  const next = writeGrid(g);
  const before = new Set(el.doc.querySelectorAll('table'));
  replaceTable(table, next ? next.outerHTML : '');
  const placed = next && [...el.doc.querySelectorAll('table')].find((t) => !before.has(t));
  if (placed) {
    const ng = readGrid(placed);
    const cellAt = at(ng, Math.min(target.r, ng.height - 1), Math.min(target.c, ng.width - 1));
    if (cellAt) caretIn(cellAt.el);
  }
  commandDone();
}
export const TABLE_ACTIONS = [
  { k: 'row-above', label: '上方加列', run: () => changeTable(g => ({ r, c }) => { insertRow(g, r, r); return { r, c }; }) },
  { k: 'row-below', label: '下方加列', run: () => changeTable(g => ({ r, rs, c }) => { insertRow(g, r + rs, r); return { r: r + rs, c }; }) },
  { k: 'col-left', label: '左方加欄', run: () => changeTable(g => ({ r, c }) => { insertColumn(g, c); return { r, c }; }) },
  { k: 'col-right', label: '右方加欄', run: () => changeTable(g => ({ r, c, cs }) => { insertColumn(g, c + cs); return { r, c: c + cs }; }) },
  { k: 'row-delete', label: '刪除列', danger: true, run: () => changeTable(g => ({ r, c }) => { deleteRow(g, r); return { r, c }; }) },
  { k: 'col-delete', label: '刪除欄', danger: true, run: () => changeTable(g => ({ r, c }) => { deleteColumn(g, c); return { r, c }; }) },
  { k: 'table-delete', label: '刪除表格', danger: true, run: () => deleteTable() },
];
function deleteTable() {
  const cell = currentCell();
  if (!cell || !begin()) return;
  replaceTable(cell.closest('table'), '');
  commandDone();
}

/** Tab / Shift+Tab in a cell: the next or previous cell; Tab in the last cell adds a row. */
export function moveCell(step) {
  const cell = currentCell();
  if (!cell) return false;
  const g = readGrid(cell.closest('table'));
  const order = [...g.cells].sort((a, b) => a.r - b.r || a.c - b.c);
  const i = order.findIndex((x) => x.el === cell);
  const next = order[i + step];
  if (next) { caretIn(next.el); commandDone(); }
  // Like Word: Tab in the last cell adds a row and goes to its first cell.
  else if (step > 0) changeTable(g => ({ r, rs }) => { insertRow(g, r + rs, r); return { r: r + rs, c: 0 }; });
  return true;
}

// ---------- The bar above the table ----------
export function renderTableBar() {
  const cell = drafting() && selectionInDoc() ? currentCell() : null;
  if (!cell) { if (tableBar) tableBar.hidden = true; return; }
  if (!tableBar) {
    tableBar = document.createElement('div');
    tableBar.className = 'fmt-table-bar'; tableBar.setAttribute('role', 'toolbar'); tableBar.setAttribute('aria-label', '表格');
    for (const a of TABLE_ACTIONS) {
      const b = Object.assign(document.createElement('button'), { type: 'button', textContent: a.label });
      b.dataset.k = a.k;
      if (a.danger) b.className = 'danger';
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', (e) => { e.preventDefault(); a.run(); });
      tableBar.append(b);
    }
    document.body.append(tableBar);
  }
  tableBar.hidden = false;
  placeTableBar(cell.closest('table'));
}
function placeTableBar(table) {
  const t = table.getBoundingClientRect(), h = tableBar.offsetHeight;
  // Above the table; it stays on screen (below the sticky header, above a phone's bottom
  // toolbar) while the caret is in the table, wherever the table is scrolled.
  const head = document.querySelector('.doc-head')?.getBoundingClientRect().bottom || 0;
  const bar = document.getElementById('formatBar')?.getBoundingClientRect();
  const floor = (bar && bar.top > innerHeight / 2 ? bar.top : innerHeight) - h - 6;
  tableBar.style.top = Math.max(head + 6, Math.min(t.top - h - 6, floor)) + 'px';
  tableBar.style.left = Math.max(8, Math.min(t.left, innerWidth - tableBar.offsetWidth - 8)) + 'px';
}
export function initTableTools() {
  document.addEventListener('selectionchange', renderTableBar);
  addEventListener('scroll', () => { if (tableBar && !tableBar.hidden) renderTableBar(); }, { passive: true });
  addEventListener('resize', () => { if (tableBar && !tableBar.hidden) renderTableBar(); });
}
