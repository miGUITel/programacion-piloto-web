import { isValidDate } from './core.mjs?v=20261017-2';
import { eventTypes } from './teaching.mjs?v=20261016-4';
import { madridToday } from './unit-tools.mjs?v=20261017-1';

export const taskStates = Object.freeze({ planned: 'Planificada', presented: 'Presentada', 'to-correct': 'Por corregir', corrected: 'Corregida' });

/** Derived at display time: a deadline never confirms presentation or correction. */
export function taskState(details, today = madridToday()) {
  if (details.corrected) return 'corrected';
  if (!details.presented) return 'planned';
  return isValidDate(details.correctBy) && details.correctBy <= today ? 'to-correct' : 'presented';
}

export function presentationTargets(session, activityId) {
  if (!eventTypes(session).includes('task')) return [];
  const typed = session.activities.filter(activity => activity.eventType === 'task');
  const targets = typed.length ? typed : [session];
  return targets.filter(target => !target.taskPresented && (!activityId || target.id === activityId || (target === session && session.activities[0].id === activityId)));
}

/** Validate the whole batch first, so cancel/invalid dates cannot partly present a session. */
export function applyPresentation(session, values, today = madridToday()) {
  if (!isValidDate(today)) return false;
  if (!values.length || new Set(values.map(value => value.id)).size !== values.length) return false;
  const targets = presentationTargets(session);
  const matched = values.map(value => targets.find(target => target.id === value.id));
  if (matched.some(target => !target) || values.some(value => !isValidDate(value.dueOn) || !isValidDate(value.correctBy))) return false;
  values.forEach((value, index) => {
    const target = matched[index];
    target.task = { ...target.task, dueOn: value.dueOn, correctBy: value.correctBy, presentedOn: today };
    target.taskPresented = true;
  });
  return true;
}

export function setTaskCorrected(target, corrected) {
  const task = { ...target.task };
  if (corrected) task.corrected = true; else delete task.corrected;
  if (Object.keys(task).length) target.task = task; else delete target.task;
}
