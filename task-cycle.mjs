import { isValidDate } from './core.mjs?v=20261018-rf12';
import { sessionTaskTargets } from './teaching.mjs?v=20261018-rf12';
import { madridToday } from './unit-tools.mjs?v=20261018-rf12';

export const taskStates = Object.freeze({ planned: 'Planificada', presented: 'Presentada', 'to-correct': 'Por corregir', corrected: 'Corregida' });

/** Derived at display time: a deadline never confirms presentation or correction. */
export function taskState(details, today = madridToday()) {
  if (details.corrected) return 'corrected';
  if (!details.presented) return 'planned';
  return isValidDate(details.correctBy) && details.correctBy <= today ? 'to-correct' : 'presented';
}

export function presentationTargets(session, activityId, document) {
  return sessionTaskTargets(session, document).filter(target => !target.taskPresented && (!activityId || target.id === activityId || target.presentation?.activityId === activityId || (target === session && session.activities[0].id === activityId)));
}

export function presentationDefaults(target, today = madridToday()) {
  const task = target?.task ?? {};
  const empty = !task.presentedOn && !task.dueOn && !task.correctBy;
  return { presentedOn: task.presentedOn || today, dueOn: task.dueOn || (empty ? today : ''), correctBy: task.correctBy || (empty ? today : '') };
}

/** Validate the whole batch first, so cancel/invalid dates cannot partly present a session. */
export function applyPresentation(session, values, today = madridToday(), document) {
  if (!isValidDate(today)) return false;
  if (!values.length || new Set(values.map(value => value.id)).size !== values.length) return false;
  const targets = presentationTargets(session, undefined, document);
  const matched = values.map(value => targets.find(target => target.id === value.id));
  if (matched.some(target => !target) || values.some(value => !isValidDate(value.dueOn) || !isValidDate(value.correctBy) || (Object.hasOwn(value, 'presentedOn') && !isValidDate(value.presentedOn)))) return false;
  values.forEach((value, index) => {
    const target = matched[index];
    target.task = { ...target.task, dueOn: value.dueOn, correctBy: value.correctBy, presentedOn: value.presentedOn || today };
    target.taskPresented = true;
  });
  return true;
}

export function setTaskCorrected(target, corrected) {
  const task = { ...target.task };
  if (corrected) task.corrected = true; else delete task.corrected;
  if (Object.keys(task).length) target.task = task; else delete target.task;
}
