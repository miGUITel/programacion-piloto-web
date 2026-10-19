const node = (tag, text, className = '') => {
  const e = document.createElement(tag); e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
};
export function renderMeetingDetails(parent, meeting, record, error = '') {
  parent.replaceChildren();
  if (!meeting) { parent.append(node('p', 'No hay reuniones confirmadas en el horario para esta fecha.', 'scope-note')); return; }
  const title = node('h2', meeting.title, 'meeting-title'); title.tabIndex = -1;
  parent.append(title, node('p', `${meeting.date.split('-').reverse().join('/')} · ${meeting.start}–${meeting.end}`, 'scope-note'));
  if (error) { const p = node('p', error, 'message warning'); p.setAttribute('role','status'); parent.append(p); }
  for (const [field, label] of [['topics','Temas previstos'],['requests','Mis ruegos y propuestas']]) {
    const values = record?.[field]?.filter(x => x.trim());
    if (!values?.length) continue;
    const section = node('section'), list = node('ul'); section.append(node('h3',label));
    values.forEach(value => list.append(node('li',value))); section.append(list); parent.append(section);
  }
  if (!error && !record?.topics?.some(x => x.trim()) && !record?.requests?.some(x => x.trim())) parent.append(node('p','Sin temas o ruegos previstos para esta reunión.','meeting-empty'));
  if (record?.notes?.trim()) { const section = node('section'); section.append(node('h3','Notas guardadas'),node('p',record.notes,'meeting-notes')); parent.append(section); }
  parent.append(node('p','Consulta de la reunión. La edición de notas y las actas están pendientes.','scope-note meeting-footnote'));
}
