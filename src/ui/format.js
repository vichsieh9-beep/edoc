const pad=n=>String(n).padStart(2,'0');
export function localDate(iso) {
  const d=new Date(iso);
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}
export function localDateTime(iso) {
  const d=new Date(iso);
  return localDate(iso)+' '+pad(d.getHours())+':'+pad(d.getMinutes());
}
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
