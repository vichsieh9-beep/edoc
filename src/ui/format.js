export { displayDate as localDate, displayDateTime as localDateTime } from '../engine/date.js';
export function downloadText(name, text, type) {
  const url=URL.createObjectURL(new Blob([text],{type}));
  const a=document.createElement('a');
  a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
export function flash(button, text) {
  const old=button.textContent;
  button.textContent=text;
  setTimeout(()=>{ button.textContent=old; },1200);
}
