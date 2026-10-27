import { eventTypes } from './teaching.mjs?v=20261027-rf32';
import { taskState } from './task-cycle.mjs?v=20261027-rf32';
import { hasTaskPlan, visiblePlanTasks } from './task-plan.mjs?v=20261027-rf32';
import { moduleWeekdays } from './common-course.mjs?v=20261027-rf32';

export const taskDateFields = ['presentedOn', 'dueOn', 'correctBy'];

export function resolveTaskTarget(document, task) {
  return task.officialTaskId || task.registryTaskId ? document.tasks?.find(item => item.id === (task.officialTaskId || task.registryTaskId)) : taskTarget(document.sessions[task.sessionIndex], task.activityIndex);
}

/** Manual session-only tasks have a single record, not a fabricated activity. */
export function taskTarget(session, activityIndex) {
  return session.activities[activityIndex].eventType === 'task' ? session.activities[activityIndex]
    : activityIndex === 0 && eventTypes(session).includes('task') && !session.activities.some(a => a.eventType === 'task') ? session : null;
}

export function taskDetails(target) {
  return Object.fromEntries([...taskDateFields.map(field => [field, target?.task?.[field] ?? '']),
    ['presented', target?.taskPresented === true], ['corrected', target?.task?.corrected === true]]);
}

/** Only edit known fields. Preserve extension fields and remove genuinely empty metadata. */
export function applyTaskDetails(target, values) {
  const task = { ...target.task };
  for (const field of taskDateFields) {
    if (values[field]) task[field] = values[field]; else delete task[field];
  }
  if (values.corrected) task.corrected = true; else delete task.corrected;
  if (Object.keys(task).length) target.task = task; else delete target.task;
  if (values.presented) target.taskPresented = true; else delete target.taskPresented;
}

/** Common date columns align every UT, including multiple sessions on one date. */
export function moduleOverview(module, records, month = '') {
  const byPath = new Map(records.filter(r => r.entry.moduleCode === module.code).map(r => [r.entry.path, r]));
  const allDates = [...new Set([...byPath.values()].flatMap(r => r.document.sessions.map(s => s.date)))].sort();
  const dates = allDates.filter(date => !month || date.startsWith(month + '-'));
  const rows = module.units.map(unit => {
    const record = byPath.get(unit.path);
    return { unit, record, cells: dates.map(date => record?.document.sessions
      .filter(s => s.date === date).sort((a, b) => a.activities[0].start.localeCompare(b.activities[0].start) || a.id.localeCompare(b.id)) ?? []) };
  });
  return { dates, months: [...new Set(allDates.map(date => date.slice(0, 7)))], rows };
}

/** Compact each UT independently; columns mean weekdays, never shared dates. */
export function weekdayOverview(module, records, common, month = '') {
  const base = moduleOverview(module, records, month);
  const confirmedDays = moduleWeekdays(common, module.code);
  const dayOf = date => new Date(date + 'T12:00:00Z').getUTCDay() || 7;
  const days = confirmedDays.length ? confirmedDays : [...new Set(base.dates.map(dayOf))].sort((a, b) => a - b);
  const rows = base.rows.map(row => {
    const slots = [], exceptions = [];
    let position = -1;
    row.cells.forEach((sessions, i) => {
      if (!sessions.length) return;
      const date = base.dates[i], weekday = dayOf(date), dayIndex = days.indexOf(weekday);
      const cell = { date, weekday, sessions };
      if (dayIndex < 0) { exceptions.push(cell); return; }
      position++;
      while (position % days.length !== dayIndex) { slots.push(null); position++; }
      slots.push(cell);
    });
    return { unit: row.unit, record: row.record, slots, exceptions };
  });
  return { days, rows, months: base.months, dates: base.dates, confirmedDays: confirmedDays.length > 0 };
}

/** Derived index only: source references always point back to the unit JSON. */
export function moduleTasks(records, moduleCode, today) {
  const tasks = [];
  for (const { entry, document, registry } of records) {
    if (registry) {
      if ((moduleCode && entry.moduleCode !== moduleCode) || document.moduleCode !== entry.moduleCode) continue;
      for (const target of document.tasks) {
        const details = taskDetails(target);
        if (document.schemaVersion === 2 && target.approved !== true && !target.taskPresented && !target.task?.corrected) continue;
        tasks.push({ key: JSON.stringify([entry.moduleCode, 'task', target.id]), registryTaskId: target.id, type: target.type, code: target.code,
          entry: { ...entry, unitCode: target.unitCode }, title: target.title, date: details.presentedOn || '', number: null,
          ...details, status: taskState(details, today), missingDates: details.presented && (!details.dueOn || !details.correctBy) });
      }
      continue;
    }
    if ((moduleCode && entry.moduleCode !== moduleCode) || document.module.code !== entry.moduleCode) continue;
    if (hasTaskPlan(document)) {
      for (const target of visiblePlanTasks(document)) {
        const sessionIndex = document.sessions.findIndex(session => session.id === target.presentation?.sessionId);
        const session = document.sessions[sessionIndex];
        const activityIndex = session ? target.presentation.activityId ? session.activities.findIndex(activity => activity.id === target.presentation.activityId) : 0 : -1;
        const details = taskDetails(target);
        tasks.push({ key: JSON.stringify([entry.moduleCode, 'task', target.id]), officialTaskId: target.id, code: target.code, type: target.type || 'task',
          entry, unitTitle: document.unit.title, sessionId: session?.id, sessionIndex, activityId: session?.activities[activityIndex]?.id, activityIndex,
          unassigned: !session, title: target.title, date: session?.date || '', number: session?.number ?? null, state: session?.state, ...details,
          status: taskState(details, today), missingDates: details.presented && (!details.dueOn || !details.correctBy) });
      }
      continue;
    }
    document.sessions.forEach((session, sessionIndex) => {
      if (!eventTypes(session).includes('task')) return;
      const typed = session.activities.map((activity, index) => ({ activity, index })).filter(x => x.activity.eventType === 'task');
      const targets = typed.length ? typed : [{ activity: session.activities[0], index: 0, sessionOnly: true }];
      targets.forEach(({ activity, index, sessionOnly }) => {
        const target = sessionOnly ? session : activity;
        const details = taskDetails(target);
        tasks.push({ key: JSON.stringify([entry.path, session.id, sessionOnly ? null : activity.id]),
          entry, unitTitle: document.unit.title, sessionId: session.id, sessionIndex,
          activityId: activity.id, activityIndex: index, sessionOnly: !!sessionOnly,
          type: 'task',
          title: target.task?.title || activity.title || 'Tarea sin título', code: target.task?.code || '', publishedOn: target.task?.publishedOn || '', date: session.date, number: session.number,
          state: session.state, ...details, status: taskState(details, today),
          missingDates: details.presented && (!details.dueOn || !details.correctBy) });
      });
    });
  }
  return tasks.sort((a, b) => (a.dueOn || a.date).localeCompare(b.dueOn || b.date)
    || a.entry.path.localeCompare(b.entry.path) || a.key.localeCompare(b.key));
}

export function filterTasks(tasks, { moduleCode = '', unitPath = '', status = 'all' } = {}) {
  return tasks.filter(task => (!moduleCode || task.entry.moduleCode === moduleCode) && (!unitPath || task.entry.path === unitPath || `${task.entry.moduleCode}:${task.entry.unitCode}` === unitPath)
    && (status !== 'unpresented' || !task.presented)
    && (status !== 'uncorrected' || !task.corrected)
    && (!['planned', 'presented', 'to-correct', 'corrected'].includes(status) || task.status === status))
    .sort((a, b) => (status === 'to-correct' ? a.correctBy.localeCompare(b.correctBy) : status === 'planned' ? a.date.localeCompare(b.date) : (a.dueOn || a.date).localeCompare(b.dueOn || b.date)) || a.key.localeCompare(b.key));
}
