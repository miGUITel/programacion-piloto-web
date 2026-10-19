import { validateMeetingDocument } from './meeting-records.mjs?v=20261019-meetings';
// Navigation preferences contain references only. Academic data stays remote.
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const string = v => typeof v === 'string' && v.length > 0 && v.length <= 300;
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v + 'T12:00:00Z')) && new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v;
const minutes = v => typeof v === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v) ? Number(v.slice(0, 2)) * 60 + Number(v.slice(3)) : NaN;
const excluded = s => ['Cancelada', 'Reprogramada'].includes(s.state);
export function catalogEntries(catalog) {
  return catalog.modules.flatMap(m => m.units.map(u => ({ moduleCode:m.code, unitCode:u.code, unitId:u.id, path:u.path })));
}
export function unitContext(entry, sessionId) {
  return { type:'unit', moduleCode:entry.moduleCode, unitId:entry.unitId, path:entry.path, ...(string(sessionId) ? { sessionId } : {}) };
}
export function meetingContext(meeting) { return { type:'meeting', ...(string(meeting.meetingId)?{meetingId:meeting.meetingId}:{}), date:meeting.date, ...(string(meeting.recordId)?{recordId:meeting.recordId}:{}), ...(string(meeting.groupId)?{groupId:meeting.groupId}:{}), ...(['meetings','project'].includes(meeting.space)?{space:meeting.space}:{}) }; }
export function meetingGroupContext(space,groupId) { return {type:'meeting-group',space,groupId}; }
function cleanContext(value) {
  if (!object(value)) return null;
  if (value.type === 'unit' && [value.moduleCode, value.unitId, value.path].every(string)) {
    return { type:'unit', moduleCode:value.moduleCode, unitId:value.unitId, path:value.path, ...(string(value.sessionId) ? { sessionId:value.sessionId } : {}) };
  }
  if (value.type === 'meeting' && (string(value.meetingId)||string(value.recordId)) && date(value.date)) return meetingContext(value);
  if (value.type === 'meeting-group' && ['meetings','project'].includes(value.space) && (value.groupId===null||string(value.groupId))) return meetingGroupContext(value.space,value.groupId);
  return null;
}
export function createContextMemory(getStorage = () => globalThis.localStorage) {
  const key = catalog => `cuaderno.context.v1:miGUITel/programacion-piloto-datos:${catalog.common?.path ?? catalog.courseId ?? 'legacy'}`;
  return {
    read(catalog) {
      try {
        const raw = getStorage().getItem(key(catalog));
        if (!raw) return { context:null };
        const saved = JSON.parse(raw);
        return { context:saved?.version === 1 ? cleanContext(saved.context) : null };
      } catch (error) {
        return { context:null, warning:error instanceof SyntaxError ? '' : 'Este navegador no permite recuperar el último contexto. Puedes continuar eligiéndolo.' };
      }
    },
    write(catalog, context) {
      const safe = cleanContext(context);
      if (!safe) return { ok:false };
      try {
        const storage = getStorage(), serialized = JSON.stringify({ version:1, context:safe });
        if (storage.getItem(key(catalog)) !== serialized) storage.setItem(key(catalog), serialized);
        return { ok:true };
      } catch { return { ok:false, warning:'No se puede recordar el contexto en este navegador. Los documentos y sus borradores siguen disponibles.' }; }
    },
  };
}
export function madridClock(now = new Date()) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(now).map(x => [x.type, x.value]));
  return { date:`${values.year}-${values.month}-${values.day}`, minute:Number(values.hour) * 60 + Number(values.minute) };
}
export function daySchedule(common, on) {
  if (!common || !date(on)) return [];
  if (on < common.course.startsOn || on > common.course.endsOn || common.calendar.nonTeaching.some(x => x.from <= on && on <= x.through)) return [];
  const weekday = new Date(on + 'T12:00:00Z').getUTCDay() || 7;
  let slots = on >= common.timetable.effectiveFrom ? common.timetable.weekly.filter(x => x.weekday === weekday).map(x => ({ ...x })) : [];
  for (const exception of common.timetable.exceptions.filter(x => x.from <= on && on <= x.through)) {
    slots = slots.filter(x => !(x.type === 'teaching' && x.moduleCode === exception.moduleCode && x.weekday === exception.omit.weekday && x.start === exception.omit.start && x.end === exception.omit.end));
    if (exception.apply.weekday === weekday) slots.push({ ...exception.apply, id:exception.id, type:'teaching', moduleCode:exception.moduleCode });
  }
  return slots.map(x => ({ ...x, date:on, meetingId:x.id, from:minutes(x.start), through:minutes(x.end) }));
}
export function meetingsForDay(common, on) { return daySchedule(common, on).filter(x => x.type === 'meeting').sort((a,b) => a.from-b.from); }
export function resolveRemembered(context, catalog, common, meetingDocument = null) {
  const safe = cleanContext(context);
  if (safe?.type === 'unit') {
    const entry = catalogEntries(catalog).find(x => x.path === safe.path && x.unitId === safe.unitId && x.moduleCode === safe.moduleCode);
    return entry ? { ...unitContext(entry, safe.sessionId), entry } : null;
  }
  if(safe?.type==='meeting-group' && meetingDocument?.spaces?.some(s=>s.id===safe.space) && (safe.groupId===null||meetingDocument.groups?.some(g=>g.id===safe.groupId&&g.space===safe.space))) return safe;
  if(safe?.type==='meeting'&&safe.recordId){
    const record=meetingDocument?.meetings.find(r=>r.id===safe.recordId&&r.date===safe.date);
    return record?{...safe,record}:null;
  }
  if (safe?.type === 'meeting') {
    const meeting = meetingsForDay(common, safe.date).find(x => x.meetingId === safe.meetingId);
    return meeting ? { ...meetingContext(meeting), meeting } : null;
  }
  return null;
}
function teachingPieces(common, slots) {
  return slots.filter(x => x.type === 'teaching').flatMap(slot => common.timetable.periods.map(p => ({ ...slot, from:Math.max(slot.from, minutes(p.start)), through:Math.min(slot.through, minutes(p.end)) })).filter(x => x.from < x.through));
}
function fitsTeaching(activity, pieces) {
  let covered = activity.from;
  for (const p of pieces.filter(x => x.moduleCode === activity.entry.moduleCode).sort((a,b) => a.from-b.from)) {
    if (p.from > covered) break;
    if (p.through > covered) covered = p.through;
    if (covered >= activity.through) return true;
  }
  return false;
}
/** Read-only decision. Incomplete or inconsistent planning never causes guessed navigation. */
export function chooseStartup({ catalog, common, records = [], failures = [], remembered = null, meetingDocument = null, now = new Date() }) {
  const fallback = warning => ({ target:resolveRemembered(remembered, catalog, common, meetingDocument), automatic:false, warning });
  if (!common) return fallback('No se ha podido confirmar el horario común. Se recupera el contexto disponible sin deducir la actividad actual.');
  const clock = madridClock(now), slots = daySchedule(common, clock.date), pieces = teachingPieces(common, slots);
  const activities = records.flatMap(({ entry, document }) => document.sessions.filter(s => s.date === clock.date).flatMap(session => session.activities.map(a => ({ entry, session, from:minutes(a.start), through:minutes(a.end) }))));
  const live = activities.filter(a => !excluded(a.session));
  if (!slots.length) return fallback(live.length ? 'Hay sesiones en una fecha sin horario docente confirmado. Se conserva el contexto anterior; revisa la discrepancia.' : '');
  const first = Math.min(...slots.map(x => x.from)), last = Math.max(...slots.map(x => x.through));
  if (clock.minute < first || clock.minute >= last) return fallback('');
  const failed = moduleCode => failures.some(x => x.moduleCode === moduleCode);
  const cuts = piece => [...new Set([piece.from, piece.through, ...activities.filter(a => a.entry.moduleCode === piece.moduleCode).flatMap(a => [a.from, a.through]).filter(t => piece.from < t && t < piece.through)])].sort((a,b) => a-b);
  const events = [...slots.filter(x => x.type === 'meeting'), ...pieces.flatMap(piece => { const points = cuts(piece); return points.slice(0,-1).map((from,i) => ({ ...piece, from, through:points[i+1] })); })]
    .filter(event => event.type !== 'teaching' || failed(event.moduleCode) || live.some(a => a.entry.moduleCode === event.moduleCode && a.from <= event.from && a.through >= event.through) || !activities.some(a => excluded(a.session) && a.entry.moduleCode === event.moduleCode && a.from <= event.from && a.through >= event.through))
    .filter(x => x.through > clock.minute).sort((a,b) => a.from-b.from);
  const event = events[0];
  if (!event) return fallback('');
  const point = Math.max(clock.minute, event.from);
  if (events.some(x => x !== event && x.from <= point && point < x.through)) return fallback('El horario ofrece actividades incompatibles a la misma hora. Se conserva el contexto anterior para revisarlo.');
  const candidates = live.filter(a => a.from <= point && point < a.through);
  if (event.type === 'meeting') {
    if (candidates.length) return fallback('Una sesión coincide con una reunión del horario común. Se conserva el contexto anterior para revisar la discrepancia.');
    return { target:{ ...meetingContext(event), meeting:event }, automatic:true, warning:'' };
  }
  if (!common.modules.find(x => x.code === event.moduleCode)?.group || failed(event.moduleCode)) return fallback('Faltan datos o lecturas del módulo de la actividad prevista. Se conserva el contexto anterior.');
  if (candidates.length !== 1 || candidates[0].entry.moduleCode !== event.moduleCode || !fitsTeaching(candidates[0], pieces)) return fallback('La sesión prevista no tiene una correspondencia única con el horario común. Se conserva el contexto anterior para revisarlo.');
  const candidate = candidates[0];
  return { target:{ ...unitContext(candidate.entry, candidate.session.id), entry:candidate.entry }, automatic:true, warning:'' };
}

// Optional future meeting content is private and separate from the common timetable.
export function meetingNotesPath(catalog) {
  return catalog?.meetings?.schemaVersion === 1 && catalog.meetings.path === 'APP/reuniones.json' ? catalog.meetings.path : null;
}
export function validateMeetingNotes(doc) { return validateMeetingDocument(doc); }
