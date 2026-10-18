import { dayLetters, dayNames, evaluationsFor } from './common-course.mjs?v=20261018-rf1';

const node = (tag, text, className = '') => {
  const e = document.createElement(tag); e.className = className;
  if (text !== undefined) e.textContent = String(text);
  return e;
};
const short = date => date ? date.split('-').reverse().join('/') : '—';
const range = (from, through) => from === through ? short(from) : `${short(from)}–${short(through)}`;
function table(parent, headings, rows) {
  const t = node('table', undefined, 'common-table'), head = node('thead'), hr = node('tr'), body = node('tbody');
  headings.forEach(text => { const h = node('th', text); h.scope = 'col'; hr.append(h); });
  head.append(hr); t.append(head);
  rows.forEach(cells => { const tr = node('tr'); cells.forEach(text => tr.append(node('td', text))); body.append(tr); });
  t.append(body); parent.append(t);
}

/** Text-only rendering. No editors, saves, links to archives, or writes. */
export function renderCommonCourse(parent, common, section, moduleCode, all = false) {
  parent.replaceChildren();
  if (!common) return;
  const module = common.modules.find(m => m.code === moduleCode), code = all ? '' : moduleCode;
  parent.append(node('p', all ? `Todos los módulos · ${common.course.id}` : `${moduleCode} · ${module?.group || 'Grupo pendiente de confirmar'}`, 'common-context'));
  if (section === 'timetable') {
    const entries = common.timetable.weekly.filter(s => !code || s.moduleCode === code);
    const days = [...new Set(entries.map(s => s.weekday))].sort((a, b) => a - b);
    const periods = common.timetable.periods.filter(p => entries.some(s => s.start < p.end && s.end > p.start));
    table(parent, ['Hora', ...days.map(d => dayLetters[d])], periods.map(p => [`${p.start}–${p.end}`, ...days.map(d => entries.filter(s => s.weekday === d && s.start < p.end && s.end > p.start).map(s => s.type === 'teaching' ? `${s.moduleCode}${s.groupOrRoom ? ' · ' + s.groupOrRoom : ''}` : s.title).join('\n'))]));
    parent.append(node('p', `Horario ordinario desde ${short(common.timetable.effectiveFrom)} · Periodos de ${common.course.periodMinutes} minutos`, 'scope-note'));
    const exceptions = common.timetable.exceptions.filter(e => !code || e.moduleCode === code);
    if (exceptions.length) {
      const details = node('details'); details.append(node('summary', `Excepciones temporales · ${exceptions.length}`));
      for (const e of exceptions) details.append(node('p', `${e.moduleCode} · ${range(e.from, e.through)}: ${dayNames[e.omit.weekday]} ${e.omit.start}–${e.omit.end} → ${dayNames[e.apply.weekday]} ${e.apply.start}–${e.apply.end}. ${e.reason}`));
      parent.append(details);
    }
    if (!entries.length) parent.append(node('p', 'No hay horario registrado para este módulo.', 'scope-note'));
  } else if (section === 'calendar') {
    parent.append(node('p', `Clases: ${range(common.course.startsOn, common.course.endsOn)}`, 'common-course-range'));
    table(parent, ['Fecha', 'Día no lectivo / vacaciones'], [...common.calendar.nonTeaching].sort((a, b) => a.from.localeCompare(b.from)).map(e => [range(e.from, e.through), e.title]));
  } else if (section === 'evaluations') {
    const values = evaluationsFor(common, code);
    const nature = { indicative: 'Orientativa', 'teaching-limit': 'Límite de docencia ordinaria', recovery: 'Recuperación' };
    table(parent, [...(all ? ['Grupo'] : []), 'Evaluación', 'Fecha', 'Fin de programación', 'Carácter'], values.map(e => [
      ...(all ? [e.scope === 'all-groups' ? 'Todos' : e.groups.join(', ')] : []), e.title, short(e.on), short(e.programmingEndOn), `${nature[e.nature]}${e.note ? ' · ' + e.note : ''}`,
    ]));
    if (!all && !module?.group) parent.append(node('p', 'El grupo está pendiente de confirmar; solo se muestran las fechas de ámbito general. Selecciona Todos para consultar el resto.', 'scope-note'));
  }
}
