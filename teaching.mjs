/** Teaching flags are independent of delivery, activity progress and preparation. */
import { hasTaskPlan, plannedSessionTasks, visibleSessionTasks } from './task-plan.mjs?v=20261018-1';
const types = ['task', 'exam'];
const excluded = new Set(['Cancelada', 'Reprogramada']);

export function plannedEventTypes(session, document) {
  return types.filter(type => hasTaskPlan(document) ? plannedSessionTasks(session, document).some(task => (task.type || 'task') === type) || (type === 'exam' && session.activities.some(activity => activity.eventType === 'exam')) : session.activities.some(activity => activity.eventType === type));
}

export function eventTypes(session, document) {
  return Object.hasOwn(session, 'eventTypes') ? [...session.eventTypes] : plannedEventTypes(session, document);
}

export function setSessionEventType(session, type, enabled, document) {
  if (!types.includes(type) || typeof enabled !== 'boolean') throw new TypeError('Marca no válida.');
  const selected = new Set(eventTypes(session, document));
  if (enabled) selected.add(type); else selected.delete(type);
  const next = types.filter(item => selected.has(item));
  if (JSON.stringify(next) === JSON.stringify(plannedEventTypes(session, document))) delete session.eventTypes;
  else session.eventTypes = next;
}

export function activityEventType(session, activity, document) {
  const selected = eventTypes(session, document);
  if (hasTaskPlan(document)) {
    const planned = plannedSessionTasks(session, document).find(task => task.presentation.activityId === activity.id || (!task.presentation.activityId && session.activities[0].id === activity.id));
    if (planned && selected.includes(planned.type || 'task')) return planned.type || 'task';
  }
  return activity.eventType === 'task' && hasTaskPlan(document) ? '' : selected.includes(activity.eventType) ? activity.eventType : '';
}

export function sessionTaskTargets(session, document) {
  if (hasTaskPlan(document)) return visibleSessionTasks(session, document);
  if (!eventTypes(session).includes('task')) return [];
  const targets = session.activities.filter(activity => activity.eventType === 'task');
  return targets.length ? targets : [session];
}

export function taskProgress(session, document) {
  if (hasTaskPlan(document)) {
    const tasks = sessionTaskTargets(session, document);
    return { total: tasks.length, presented: tasks.filter(task => task.taskPresented === true).length };
  }
  const tasks = session.activities.filter(activity => activity.eventType === 'task');
  if (!tasks.length) return { total: 1, presented: session.taskPresented === true ? 1 : 0 };
  return { total: tasks.length, presented: tasks.filter(activity => activity.taskPresented === true).length };
}

export function setTaskPresented(session, presented, activityId) {
  if (typeof presented !== 'boolean') throw new TypeError('Confirmación no válida.');
  const tasks = session.activities.filter(activity => activity.eventType === 'task' && (!activityId || activity.id === activityId));
  const targets = tasks.length ? tasks : activityId ? [] : [session];
  for (const target of targets) {
    if (presented) target.taskPresented = true; else delete target.taskPresented;
  }
}

/** A shared SessionID counts once even when a session straddles two units. */
export function moduleTimeline(records, moduleCode) {
  const groups = new Map();
  const errors = [];
  for (const { entry, document } of records) {
    if (document.module.code !== moduleCode || entry.moduleCode !== moduleCode) continue;
    document.sessions.forEach((session, sessionIndex) => {
      const group = groups.get(session.id) ?? { id: session.id, date: session.date, sources: [] };
      group.sources.push({ entry, session, sessionIndex, unitTitle: document.unit.title, document });
      groups.set(session.id, group);
    });
  }
  for (const group of groups.values()) {
    if (group.sources.some(source => source.session.date !== group.date)) errors.push('Un mismo identificador de sesión tiene fechas distintas.');
    const states = new Set(group.sources.map(source => excluded.has(source.session.state)));
    if (states.size > 1) errors.push('Una sesión compartida tiene estados incompatibles entre unidades.');
    if (group.sources.some(source => source.document.schemaVersion === 3)) {
      if (new Set(group.sources.map(source => source.session.state).filter(Boolean)).size > 1) errors.push('Una sesión compartida tiene estados de impartición distintos.');
      const intervals = group.sources.flatMap(source => source.session.activities.map(activity => ({ start: activity.start, end: activity.end }))).sort((a, b) => a.start.localeCompare(b.start));
      if (intervals.some((interval, n) => n > 0 && interval.start < intervals[n - 1].end)) errors.push('Las porciones de una sesión compartida se solapan entre unidades.');
    }
    group.excluded = states.has(true);
    group.start = group.sources.map(source => source.session.activities[0].start).sort()[0];
  }
  const sessions = [...groups.values()].filter(group => !group.excluded)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  if (errors.length) return { sessions, exams: [], errors };
  const exams = [];
  sessions.forEach((group, index) => {
    const candidates = group.sources.filter(source => eventTypes(source.session, source.document).includes('exam'))
      .sort((a, b) => a.entry.path.localeCompare(b.entry.path) || a.sessionIndex - b.sessionIndex);
    if (!candidates.length) return;
    const dueIndex = Math.max(0, index - 3);
    const official = candidates.flatMap(source => source.document.schemaVersion === 3
      ? plannedSessionTasks(source.session, source.document).filter(task => task.type === 'exam').map(task => ({ source, task })) : []);
    const targets = official.length ? official : [{ source: candidates[0] }];
    for (const { source, task } of targets) {
      const previous = task ? task.announcement?.examDate : source.session.examAnnouncedFor;
      exams.push({
        id: task?.id || group.id, sessionId: group.id, officialTaskId: task?.id, title: task?.title, code: task?.code,
        date: group.date, index, source, dueIndex, due: sessions[dueIndex], shortfall: index < 3,
        availableBefore: index, announced: previous === group.date, changedDate: Boolean(previous && previous !== group.date),
      });
    }
  });
  return { sessions, exams, errors };
}

export function setExamAnnouncement(document, exam, enabled) {
  const session = document.sessions.find(session => session.id === (exam.sessionId || exam.id));
  if (!session || session.date !== exam.date || excluded.has(session.state) || !eventTypes(session, document).includes('exam')) return false;
  if (exam.officialTaskId) {
    const task = document.tasks?.find(task => task.id === exam.officialTaskId && task.type === 'exam' && task.presentation?.sessionId === session.id);
    if (!task) return false;
    if (enabled) task.announcement = { ...task.announcement, examDate: session.date };
    else {
      const metadata = { ...task.announcement }; delete metadata.examDate;
      if (Object.keys(metadata).length) task.announcement = metadata; else delete task.announcement;
    }
  } else {
    if (enabled) session.examAnnouncedFor = session.date; else delete session.examAnnouncedFor;
  }
  return true;
}

/** Each reminder appears once in a unit: at its threshold session, or above it. */
export function unitExamReminders(timeline, path) {
  const activeIndices = timeline.sessions.map((group, index) => group.sources.some(source => source.entry.path === path) ? index : -1).filter(index => index >= 0);
  return timeline.exams.filter(exam => !exam.announced).flatMap(exam => {
    const dueSource = exam.due.sources.find(source => source.entry.path === path);
    if (dueSource) return [{ ...exam, placement: dueSource.session.id }];
    if (activeIndices.some(index => index >= exam.dueIndex && index <= exam.index)) return [{ ...exam, placement: 'top' }];
    return [];
  });
}
