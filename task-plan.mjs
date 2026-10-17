/** Academic task identities are authored in the module project, never inferred from rows. */
export const hasTaskPlan = document => Array.isArray(document?.tasks);
export const visiblePlanTasks = document => !hasTaskPlan(document) ? [] : document.tasks.filter(task =>
  document.unit.preparation === 'ready' || task.taskPresented === true || task.task?.corrected === true);
export const plannedSessionTasks = (session, document) => !hasTaskPlan(document) ? [] : document.tasks.filter(task => task.presentation.sessionId === session.id);
export const visibleSessionTasks = (session, document) => visiblePlanTasks(document).filter(task => task.presentation.sessionId === session.id);

export function taskHeading(moduleCode, code, title) {
  return `${moduleCode} · ${code || 'Sin código'} · ${title}`;
}
