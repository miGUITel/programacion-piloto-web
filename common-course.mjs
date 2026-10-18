// Common data is read-only and has its own contract, separate from UT editors.
export const dayLetters = ['', 'L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const dayNames = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.trim().length > 0;
const codes = new Set(['LM', 'ED', 'SR', 'SOS', 'PRO']);
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v + 'T12:00:00Z')) && new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v;
const time = v => typeof v === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
const weekday = v => Number.isInteger(v) && v >= 1 && v <= 7;
const slot = v => object(v) && weekday(v.weekday) && time(v.start) && time(v.end) && v.start < v.end;
export function commonCoursePath(catalog) {
  const path = catalog?.common?.path;
  return catalog?.common?.schemaVersion === 1 && typeof path === 'string' && /^common\/course-\d{4}-\d{4}\.json$/.test(path) ? path : null;
}
export function validateCommonCourse(doc, path) {
  const errors = [];
  if (!object(doc) || doc.schemaVersion !== 1 || doc.kind !== 'common-course' || doc.timeZone !== 'Europe/Madrid') return ['Formato de datos comunes no válido.'];
  if (!object(doc.course) || path !== `common/course-${doc.course.id}.json` || !date(doc.course.startsOn) || !date(doc.course.endsOn) || doc.course.startsOn > doc.course.endsOn || !Number.isInteger(doc.course.periodMinutes) || doc.course.periodMinutes <= 0) errors.push('Curso común no válido.');
  if (!Array.isArray(doc.modules) || doc.modules.some(m => !object(m) || !codes.has(m.code) || !text(m.name) || !Number.isInteger(m.weeklyPeriods) || m.weeklyPeriods < 0 || !(m.group === null || text(m.group))) || new Set(doc.modules?.map(m => m.code)).size !== doc.modules?.length) errors.push('Módulos comunes no válidos.');
  const timetable = doc.timetable;
  if (!object(timetable) || !date(timetable.effectiveFrom) || !Array.isArray(timetable.weekly) || timetable.weekly.some(s => !slot(s) || !text(s.id) || !['teaching', 'meeting'].includes(s.type) || !text(s.title) || !Number.isInteger(s.periods) || s.periods <= 0 || s.type === 'teaching' && !codes.has(s.moduleCode))) errors.push('Horario común no válido.');
  if (!Array.isArray(timetable?.periods) || !timetable.periods.length || timetable.periods.some((p, i, list) => !object(p) || !Number.isInteger(p.number) || p.number <= 0 || !time(p.start) || !time(p.end) || p.start >= p.end || i > 0 && (list[i - 1].end > p.start || list[i - 1].number >= p.number))) errors.push('Periodos comunes no válidos.');
  if (!Array.isArray(timetable?.exceptions) || timetable.exceptions.some(e => !object(e) || !text(e.id) || !date(e.from) || !date(e.through) || e.from > e.through || !codes.has(e.moduleCode) || !slot(e.omit) || !slot(e.apply) || !text(e.reason))) errors.push('Excepciones comunes no válidas.');
  const calendar = doc.calendar;
  if (!object(calendar) || !Array.isArray(calendar.nonTeaching) || calendar.nonTeaching.some(e => !object(e) || !text(e.id) || !date(e.from) || !date(e.through) || e.from > e.through || !text(e.title) || !['holiday', 'vacation', 'non-teaching'].includes(e.type) || e.scope !== 'all-modules')) errors.push('Calendario escolar no válido.');
  if (!Array.isArray(calendar?.evaluations) || calendar.evaluations.some(e => !object(e) || !text(e.id) || !text(e.title) || !date(e.on) || !['indicative', 'teaching-limit', 'recovery'].includes(e.nature) || typeof e.limitsOrdinaryTeaching !== 'boolean' || e.limitsOrdinaryTeaching !== (e.nature === 'teaching-limit') || !['all-groups', 'selected-groups'].includes(e.scope) || !Array.isArray(e.groups) || e.groups.some(g => !text(g)) || !(e.programmingEndOn === null || date(e.programmingEndOn)) || !(e.minimumLeadDays === null || Number.isInteger(e.minimumLeadDays) && e.minimumLeadDays >= 0))) errors.push('Evaluaciones comunes no válidas.');
  return errors;
}
export function moduleWeekdays(common, code) {
  return [...new Set(common?.timetable.weekly.filter(s => s.type === 'teaching' && s.moduleCode === code).map(s => s.weekday) ?? [])].sort((a, b) => a - b);
}
export function evaluationsFor(common, code) {
  if (!code) return common.calendar.evaluations;
  const group = common.modules.find(m => m.code === code)?.group;
  return common.calendar.evaluations.filter(e => e.scope === 'all-groups' || group && e.groups.includes(group));
}
