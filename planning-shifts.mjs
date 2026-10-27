// Read-only positions from the last approved plan; never infer a causal link.
import { approvedChanges, operationComplete, excludedSession, planningSnapshot, teachingDates } from './replanning.mjs?v=20261027-rf32-labels';
import { validateCommonCourse } from './common-course.mjs?v=20261027-rf32';

export function movesInChange(change) {
  return (change?.beforeSessions ?? []).flatMap(before => {
    const after = change.afterSessions.find(s => s.id === before.id);
    return after && !excludedSession(before) && !excludedSession(after)
      && (before.date !== after.date || JSON.stringify(before.intervals) !== JSON.stringify(after.intervals))
      ? [{ before, after, changeId: change.id, reason: change.reason }] : [];
  });
}

export function approvedShiftTrace(document, records, { complete = true } = {}) {
  const change = approvedChanges(document).at(-1), moves = movesInChange(change);
  if (!moves.length) return { change, moves, issue: '' };
  if (!complete || !operationComplete(change, records)) return { change, moves: [], issue: 'Traza incompleta: desplazamiento pendiente de comprobar.' };
  const snapshot = planningSnapshot(document);
  if (snapshot.length !== change.afterSessions.length || change.afterSessions.some(s => {
    const current = snapshot.find(a => a.id === s.id);
    return !current || current.date !== s.date || current.number !== s.number || JSON.stringify(current.intervals) !== JSON.stringify(s.intervals);
  })) return { change, moves: [], issue: 'La traza no coincide con las fechas o intervalos vigentes. Consulta Plan modificado.' };
  return { change, moves, issue: '' };
}

export function shiftCalendarCells(document, records, common, options = {}) {
  const trace = approvedShiftTrace(document, records, options), datedMoves = trace.moves.filter(m => m.before.date !== m.after.date);
  const result = { ...trace, cells: [], dates: [] };
  if (trace.issue || !datedMoves.length) return result;
  if (!common || validateCommonCourse(common, `common/course-${common.course?.id}.json`).length || !common.modules.find(m => m.code === document.module.code)?.group) {
    return { ...result, issue: 'Calendario o grupo sin confirmar: consulta la traza para ver el desplazamiento.' };
  }
  const dates = [...document.sessions.map(s => s.date), ...trace.change.beforeSessions.map(s => s.date)].sort();
  try {
    const axis = teachingDates(common, document.module.code, dates[0], dates.at(-1));
    const confirmed = new Set(axis.map(d => d.date));
    if (datedMoves.some(m => !confirmed.has(m.before.date) || !confirmed.has(m.after.date))) {
      return { ...result, issue: 'Hay fechas de la traza fuera del calendario vigente: desplazamiento sin escala confirmada.' };
    }
    // Fill teaching positions, including bridges. Real cards always own their date.
    result.dates = axis.map(d => d.date);
    result.cells = axis.map(d => {
      const sessions = document.sessions.filter(s => s.date === d.date).sort((a, b) => a.activities[0].start.localeCompare(b.activities[0].start) || a.id.localeCompare(b.id));
      return { date: d.date, sessions, shifts: datedMoves.filter(m => m.before.date === d.date), change: trace.change,
        kind: sessions.length ? 'session' : 'trace-gap' };
    });
    return result;
  } catch {
    return { ...result, issue: 'No se puede representar el desplazamiento con el calendario vigente. Consulta Plan modificado.' };
  }
}

/** A full-width labelled group is explicitly collapsed, not a false day column. */
export function groupShiftGaps(cells, threshold = 8) {
  const result = [];
  for (let i = 0; i < cells.length;) {
    if (cells[i].kind !== 'trace-gap') { result.push(cells[i++]); continue; }
    let end = i + 1;
    while (end < cells.length && cells[end].kind === 'trace-gap') end++;
    const run = cells.slice(i, end);
    if (run.length > threshold) result.push({ kind: 'trace-group', date: run[0].date, through: run.at(-1).date,
      dates: run.map(c => c.date), shifts: run.flatMap(c => c.shifts), change: run[0].change, sessions: [] });
    else result.push(...run);
    i = end;
  }
  return result;
}
