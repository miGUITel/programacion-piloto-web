/** Official tasks are explicitly authored, never inferred from session or portion titles. */
export const hasTaskPlan = document => Array.isArray(document?.tasks);
export const visiblePlanTasks = document => !hasTaskPlan(document) ? [] : document.tasks.filter(task =>
  (typeof task.approved === 'boolean' ? task.approved : document.schemaVersion !== 3 && document.unit.preparation === 'ready') || task.taskPresented === true || task.task?.corrected === true);
export const plannedSessionTasks = (session, document) => !hasTaskPlan(document) ? [] : document.tasks.filter(task => task.presentation?.sessionId === session.id);
export const visibleSessionTasks = (session, document) => visiblePlanTasks(document).filter(task => task.presentation?.sessionId === session.id);

export function taskHeading(moduleCode, code, title) {
  return `${moduleCode} · ${code || 'Sin código'} · ${title}`;
}
