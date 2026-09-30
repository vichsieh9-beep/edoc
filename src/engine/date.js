// Display dates use Taipei time; persisted timestamps remain ISO 8601.
function parts(iso) {
  const d=new Date(iso);
  if(!iso || Number.isNaN(d.getTime())) return null;
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone:'Asia/Taipei',year:'2-digit',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23',
  }).formatToParts(d).map(p=>[p.type,p.value]));
}
export function displayDate(iso) {
  const p=parts(iso);
  return p ? `${p.year}/${p.month}/${p.day}` : '';
}
export function displayDateTime(iso) {
  const p=parts(iso);
  return p ? `${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}` : '';
}
