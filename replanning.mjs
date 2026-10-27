// RF32: explicit, approved history. Reading never migrates or edits a document.
import { evaluationsFor, validateCommonCourse } from './common-course.mjs?v=20261027-rf32';

export const resolutionLabels = Object.freeze({ absorbed: 'Absorbida', added: 'Añadida', 'not-recovered': 'No Recuperada' });
export class PlanningError extends Error {}
export const excludedSession = s => ['Cancelada', 'Reprogramada'].includes(s?.state);
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.trim().length > 0;
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v + 'T12:00:00Z')) && new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v;
const time = v => typeof v === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
const minutes = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const unique = a => new Set(a).size === a.length;
const docOf = r => r.document ?? r;
const day = d => new Date(d + 'T12:00:00Z');
const iso = d => d.toISOString().slice(0, 10);
const weekday = d => day(d).getUTCDay() || 7;

export function planningSnapshot(document) {
  return document.sessions.map(s => ({ id: s.id, number: s.number, date: s.date, state: s.state,
    intervals: s.activities.map(a => ({ activityId: a.id, start: a.start, end: a.end })) }));
}

/** Optional additive contract: old units remain byte-for-byte unchanged. */
export function validatePlanningChanges(document, errors = []) {
  if (!Object.hasOwn(document, 'planningChanges')) return errors;
  if (!Array.isArray(document.planningChanges)) { errors.push('planningChanges: debe ser una lista.'); return errors; }
  const changeIds = new Set();
  for (const [i, change] of document.planningChanges.entries()) {
    const p = `planningChanges[${i}]`, bad = message => errors.push(`${p}: ${message}`);
    if (!object(change)) { bad('registro no válido.'); continue; }
    if (!text(change.id) || changeIds.has(change.id)) bad('id no vacío y único requerido.');
    changeIds.add(change.id);
    if (!date(change.approvedOn) || !text(change.reason)) bad('requiere approvedOn y motivo aprobado.');
    if (!Array.isArray(change.affectedUnitIds) || !change.affectedUnitIds.includes(document.unit?.id) || !unique(change.affectedUnitIds) || change.affectedUnitIds.some(id => typeof id !== 'string' || !new RegExp(`^${document.module?.code}-(?:UT|RA|B)\\d{1,3}[A-Z]?$`).test(id))) bad('affectedUnitIds: ámbito completo de unidades del módulo requerido.');
    if (Object.hasOwn(change, 'baseCommit') && !/^[a-f0-9]{40}$/i.test(change.baseCommit)) bad('baseCommit no válido.');
    for (const field of ['beforeSessions', 'afterSessions']) {
      const list = change[field];
      if (!Array.isArray(list) || !unique(list.map(s => s?.id)) || !unique(list.map(s => s?.number))) { bad(`${field}: instantánea de sesiones sin duplicados requerida.`); continue; }
      for (const s of list) {
        if (!object(s) || !text(s.id) || !Number.isInteger(s.number) || s.number <= 0 || !date(s.date) || !['', 'Impartida', 'Cancelada', 'Reprogramada'].includes(s.state)) { bad(`${field}: identidad, fecha o estado no válidos.`); continue; }
        if (!Array.isArray(s.intervals) || !s.intervals.length || !unique(s.intervals.map(a => a?.activityId))) { bad(`${field}: intervalos por identidad requeridos.`); continue; }
        let end = '';
        for (const a of s.intervals) {
          if (!object(a) || !text(a.activityId) || !time(a.start) || !time(a.end) || a.start >= a.end || a.start < end) bad(`${field}: intervalos no válidos o solapados.`);
          end = a.end;
        }
      }
    }
    const before = Array.isArray(change.beforeSessions) ? change.beforeSessions : [], after = Array.isArray(change.afterSessions) ? change.afterSessions : [];
    if (!Array.isArray(change.addedSessionIds) || change.addedSessionIds.some(id => !text(id)) || !unique(change.addedSessionIds)) bad('addedSessionIds: lista explícita sin duplicados requerida.');
    else {
      for (const id of change.addedSessionIds) if (before.some(s => s?.id === id) || !after.some(s => s?.id === id)) bad('una sesión añadida debe ser nueva en esa instantánea.');
      for (const s of after) if (!before.some(b => b?.id === s?.id) && !change.addedSessionIds.includes(s?.id)) bad('hay una nueva sesión sin identificar como añadida.');
    }
    for (const s of before) {
      const next = after.find(a => a?.id === s?.id);
      if (!next || next.number !== s.number) bad('conservar las sesiones originales y sus números.');
    }
    if (!Array.isArray(change.resolutions) || !unique(change.resolutions.map(r => r?.sessionId))) { bad('resolutions: lista explícita sin duplicados requerida.'); continue; }
    for (const r of change.resolutions) {
      if (!object(r)) { bad('resolución no válida.'); continue; }
      const source = before.find(s => s?.id === r.sessionId);
      if (!source || !date(r.sourceDate) || source.date !== r.sourceDate || !excludedSession(source) || !Object.hasOwn(resolutionLabels, r.outcome)) bad('resolución sin origen cancelado/reprogramado, fecha u opción válida.');
      const preserved = after.find(s => s?.id === r.sessionId);
      if (!preserved || preserved.date !== r.sourceDate || !excludedSession(preserved) || JSON.stringify(source?.intervals) !== JSON.stringify(preserved.intervals)) bad('conservar fecha, horario y antecedente de la cancelación.');
      if (Object.hasOwn(r, 'note') && typeof r.note !== 'string') bad('nota de resolución no válida.');
      if (!Array.isArray(r.targets) || !unique(r.targets.map(t => `${t?.unitId}/${t?.sessionId}`))) { bad('destinos sin duplicados requeridos.'); continue; }
      if (r.outcome === 'not-recovered' ? r.targets.length !== 0 || !text(r.note) : !r.targets.length) bad('la recuperación necesita destinos; No Recuperada necesita una nota y ningún destino.');
      for (const t of r.targets) {
        if (!object(t) || !text(t.sessionId) || typeof t.unitId !== 'string' || !new RegExp(`^${document.module?.code}-(?:UT|RA|B)\\d{1,3}[A-Z]?$`).test(t.unitId) || t.unitId === document.unit?.id && t.sessionId === r.sessionId) bad('destino de recuperación no válido.');
      }
    }
  }
  return errors;
}

export function approvedChanges(document) {
  return validatePlanningChanges(document, []).length ? [] : (document.planningChanges ?? []);
}
export function operationComplete(change, records) {
  return change.affectedUnitIds.every(id => records.some(record => docOf(record).unit?.id === id && approvedChanges(docOf(record)).some(c => c.id === change.id && JSON.stringify([...c.affectedUnitIds].sort()) === JSON.stringify([...change.affectedUnitIds].sort()))));
}
export function addedSession(document, sessionId) {
  return approvedChanges(document).some(change => change.addedSessionIds.includes(sessionId));
}
/** A visible recovery label is not an identity. Never infer its origin from dates. */
export function sessionDisplayLabel(document, session, records = [document], { padded = false } = {}) {
  if (!addedSession(document, session.id)) return `S${padded ? String(session.number).padStart(2, '0') : session.number}`;
  const origins = new Map();
  for (const record of records) {
    const sourceDoc = docOf(record);
    for (const change of approvedChanges(sourceDoc)) for (const r of change.resolutions) {
      if (r.outcome !== 'added' || !r.targets.some(t => t.unitId === document.unit.id && t.sessionId === session.id)) continue;
      const source = change.beforeSessions.find(s => s.id === r.sessionId);
      if (source) origins.set(`${sourceDoc.unit.id}/${source.id}`, source.number);
    }
  }
  return origins.size === 1 ? `S${[...origins.values()][0]}+` : 'S+';
}
/** Preserve original array indices so every editor continues to address the same ID. */
export function chronologicalSessionRows(sessions) {
  return sessions.map((session, index) => ({ session, index })).sort((a, b) =>
    a.session.date.localeCompare(b.session.date)
    || (a.session.activities?.[0]?.start ?? a.session.intervals?.[0]?.start ?? '').localeCompare(b.session.activities?.[0]?.start ?? b.session.intervals?.[0]?.start ?? '')
    || a.session.id.localeCompare(b.session.id));
}
export function resolutionFor(document, session, records = [document]) {
  if (!excludedSession(session)) return null;
  for (const change of [...approvedChanges(document)].reverse()) {
    const r = change.resolutions.find(r => r.sessionId === session.id && r.sourceDate === session.date);
    if (!r) continue;
    const unchecked = r.targets.some(t => !records.some(record => docOf(record).unit?.id === t.unitId && docOf(record).sessions?.some(s => s.id === t.sessionId)));
    const invalidAdded = r.outcome === 'added' && r.targets.some(t => {
      const targetDoc = records.map(docOf).find(d => d.unit?.id === t.unitId);
      return targetDoc && !addedSession(targetDoc, t.sessionId);
    });
    return { ...r, change, confirmed: !unchecked && !invalidAdded && operationComplete(change, records) };
  }
  return null;
}
export function planningStatus(document, records = [document]) {
  const pending = [], unchecked = [], legacy = [];
  for (const s of document.sessions ?? []) {
    if (!excludedSession(s)) continue;
    const r = resolutionFor(document, s, records);
    if (r && !r.confirmed) unchecked.push(s);
    else if (!r && s.state === 'Reprogramada') legacy.push(s);
    else if (!r) pending.push(s);
  }
  return { modified: approvedChanges(document).length > 0, pending, unchecked, legacy };
}
export function sessionPlanningLabel(document, session, records = [document]) {
  const r = resolutionFor(document, session, records);
  if (r) return r.confirmed ? `${session.state} · ${resolutionLabels[r.outcome]}` : `${session.state} · Resolución pendiente de comprobar`;
  return session.state === 'Cancelada' ? 'Cancelada · Pendiente de reprogramar' : session.state === 'Reprogramada' ? 'Reprogramada · Sin traza' : session.state;
}

export function planningLimit(common, moduleCode) {
  if (!common || validateCommonCourse(common, `common/course-${common.course?.id}.json`).length) throw new PlanningError('Los datos comunes no están completos.');
  const module = common.modules.find(m => m.code === moduleCode);
  if (!module?.group) throw new PlanningError('Falta confirmar el grupo del módulo.');
  const limits = [...new Set(evaluationsFor(common, moduleCode).filter(e => e.limitsOrdinaryTeaching).map(e => e.programmingEndOn))];
  if (limits.length !== 1 || !date(limits[0])) throw new PlanningError('Falta un tope único de docencia ordinaria confirmado.');
  return limits[0];
}
export function teachingDates(common, moduleCode, from, through) {
  if (!date(from) || !date(through) || from > through || (day(through) - day(from)) / 86400000 > 730) throw new PlanningError('Intervalo de comparación no válido.');
  if (from < common.timetable.effectiveFrom) throw new PlanningError('El intervalo precede al horario confirmado.');
  const result = [];
  for (let d = day(from); iso(d) <= through; d.setUTCDate(d.getUTCDate() + 1)) {
    const on = iso(d), wd = weekday(on);
    let slots = common.timetable.weekly.filter(s => s.type === 'teaching' && s.moduleCode === moduleCode && s.weekday === wd).map(s => ({ start: s.start, end: s.end }));
    for (const e of common.timetable.exceptions.filter(e => e.moduleCode === moduleCode && on >= e.from && on <= e.through)) {
      if (e.omit.weekday === wd) slots = slots.filter(s => s.start !== e.omit.start || s.end !== e.omit.end);
      if (e.apply.weekday === wd) slots.push({ start: e.apply.start, end: e.apply.end });
    }
    slots.sort((a, b) => a.start.localeCompare(b.start));
    if (slots.some((s, i) => i && s.start < slots[i - 1].end)) throw new PlanningError('Hay intervalos docentes solapados en el común.');
    if (!slots.length || common.calendar.nonTeaching.some(e => on >= e.from && on <= e.through)) continue;
    result.push({ date: on, minutes: slots.reduce((sum, s) => sum + minutes(s.end) - minutes(s.start), 0) });
  }
  return result;
}
export function planningMargin(common, moduleCode, records, { complete = true } = {}) {
  if (!complete || !records.length) throw new PlanningError('Lectura incompleta del módulo: margen sin confirmar.');
  const limit = planningLimit(common, moduleCode);
  const sessions = records.map(docOf).filter(d => d.module?.code === moduleCode).flatMap(d => d.sessions ?? []).filter(s => !excludedSession(s));
  if (!sessions.length) throw new PlanningError('No hay sesiones operativas para calcular el margen.');
  const identities = new Map();
  for (const s of sessions) {
    const stamp = JSON.stringify({ date: s.date, state: s.state });
    if (identities.has(s.id) && identities.get(s.id) !== stamp) throw new PlanningError('Hay sesiones compartidas con fechas o estados incompatibles.');
    identities.set(s.id, stamp);
  }
  const end = sessions.map(s => s.date).sort().at(-1);
  const range = teachingDates(common, moduleCode, end < limit ? end : limit, end < limit ? limit : end);
  if (!range.some(s => s.date === end)) throw new PlanningError('La última sesión no encaja en el calendario común.');
  const days = range.filter(s => s.date > (end < limit ? end : limit));
  const totalMinutes = days.reduce((n, s) => n + s.minutes, 0), periodMinutes = common.course.periodMinutes;
  return { limit, end, remaining: end <= limit ? days.length : 0, overrun: end > limit ? days.length : 0,
    minutes: totalMinutes, periods: totalMinutes / periodMinutes, dates: days.map(s => s.date) };
}

/** Dates determine columns. Empty cells are spaces, never collapsed HTML. */
export function formatPlanningComparison(before, after, { dates = [], limit = null, afterLabels = {} } = {}) {
  for (const list of [before, after]) if (!unique(list.map(s => s.date))) throw new PlanningError('Varias sesiones el mismo día: revisar intervalos antes de comparar.');
  const columns = [...new Set([...dates, ...before.map(s => s.date), ...after.map(s => s.date), ...(limit ? [limit] : [])])].sort();
  if (columns.some(d => !date(d))) throw new PlanningError('Fecha de comparación no válida.');
  const labelFor = (s, newer) => newer && s.state === 'Cancelada' ? 'S**' : (newer ? afterLabels[s.id] : undefined) ?? s.label ?? `S${String(s.number).padStart(2, '0')}`;
  const width = Math.max(7, ...before.map(s => labelFor(s, false).length + 4), ...after.map(s => labelFor(s, true).length + 4));
  const cell = (s, newer) => s ? `${labelFor(s, newer)}·${['D', 'L', 'M', 'X', 'J', 'V', 'S'][day(s.date).getUTCDay()]}${s.date.slice(8)}`.padEnd(width) : ' '.repeat(width);
  const row = (label, sessions, newer = false) => `${label} |${columns.map(d => cell(sessions.find(s => s.date === d), newer)).join('|')}|`;
  return [row('ANTES', before), row('NUEVA', after, true), ...(limit ? [`TOPE  |${columns.map(d => d === limit ? `FIN·${['D', 'L', 'M', 'X', 'J', 'V', 'S'][day(d).getUTCDay()]}${d.slice(8)}`.padEnd(width) : ' '.repeat(width)).join('|')}|`] : [])].join('\n');
}
