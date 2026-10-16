/** Teaching flags are independent of delivery, activity progress and preparation. */
const types = ['task', 'exam'];
const excluded = new Set(['Cancelada', 'Reprogramada']);

export function plannedEventTypes(session) {
  return types.filter(type => session.activities.some(activity => activity.eventType === type));
}

export function eventTypes(session) {
  return Object.hasOwn(session, 'eventTypes') ? [...session.eventTypes] : plannedEventTypes(session);
}

export function setSessionEventType(session, type, enabled) {
  if (!types.includes(type) || typeof enabled !== 'boolean') throw new TypeError('Marca no válida.');
  const selected = new Set(eventTypes(session));
  if (enabled) selected.add(type); else selected.delete(type);
  const next = types.filter(item => selected.has(item));
  if (JSON.stringify(next) === JSON.stringify(plannedEventTypes(session))) delete session.eventTypes;
  else session.eventTypes = next;
}

export function activityEventType(session, activity) {
  return eventTypes(session).includes(activity.eventType) ? activity.eventType : '';
}

export function taskProgress(session) {
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
      group.sources.push({ entry, session, sessionIndex, unitTitle: document.unit.title });
      groups.set(session.id, group);
    });
  }
  for (const group of groups.values()) {
    if (group.sources.some(source => source.session.date !== group.date)) errors.push('Un mismo identificador de sesión tiene fechas distintas.');
    const states = new Set(group.sources.map(source => excluded.has(source.session.state)));
    if (states.size > 1) errors.push('Una sesión compartida tiene estados incompatibles entre unidades.');
    group.excluded = states.has(true);
    group.start = group.sources.map(source => source.session.activities[0].start).sort()[0];
  }
  const sessions = [...groups.values()].filter(group => !group.excluded)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  if (errors.length) return { sessions, exams: [], errors };
  const exams = [];
  sessions.forEach((group, index) => {
    const candidates = group.sources.filter(source => eventTypes(source.session).includes('exam'))
      .sort((a, b) => a.entry.path.localeCompare(b.entry.path) || a.sessionIndex - b.sessionIndex);
    if (!candidates.length) return;
    const source = candidates[0];
    const dueIndex = Math.max(0, index - 3);
    exams.push({
      id: group.id, date: group.date, index, source, dueIndex,
      due: sessions[dueIndex], shortfall: index < 3,
      availableBefore: index,
      announced: source.session.examAnnouncedFor === group.date,
      changedDate: Boolean(source.session.examAnnouncedFor && source.session.examAnnouncedFor !== group.date),
    });
  });
  return { sessions, exams, errors };
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
