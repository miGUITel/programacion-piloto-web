/** Individual preparation belongs to each official task, independently of its follow-up. */
export const taskType = task => task.type || 'task';
export function taskRemovalIssue(document, id) {
  return (document.sessions ?? []).some(session => (session.activities ?? []).some(activity => Array.isArray(activity.taskRefs) && activity.taskRefs.includes(id)))
    ? 'Este elemento está vinculado al trabajo de alguna porción. Revisa esos vínculos antes de eliminarlo; sus sesiones y notas se conservan.' : '';
}
export function taskPreparationGroups(document) {
  return Object.fromEntries([['tasks', 'task'], ['exam', 'exam']].map(([key, type]) => {
    const items = (document.tasks ?? []).filter(task => taskType(task) === type);
    const ready = items.filter(task => task.preparation === 'ready').length;
    return [key, { items, ready, total: items.length, state: items.length && ready === items.length ? 'Listo' : ready ? 'En proceso' : 'Sin mirar' }];
  }));
}

export function taskAdditionIssue(document) {
  if (Array.isArray(document.tasks)) return '';
  const legacy = item => ['task', 'exam'].includes(item.eventType) || ['task', 'exam'].includes(item.kind)
    || item.eventTypes?.some(type => ['task', 'exam'].includes(type))
    || Object.hasOwn(item, 'taskPresented') || Object.hasOwn(item, 'task') || Object.hasOwn(item, 'examAnnouncedFor');
  return document.sessions.some(session => legacy(session) || session.activities.some(legacy))
    ? 'Esta UT conserva tareas o exámenes en sus sesiones. Hay que conciliar esa lista antes de añadir elementos oficiales, para conservar su seguimiento.' : '';
}

export function createPreparationTask(document, input, id) {
  const issue = taskAdditionIssue(document); if (issue) throw new Error(issue);
  const code = input.code?.trim(), title = input.title?.trim(), type = input.type;
  if (!['task', 'exam'].includes(type) || !code || /[\r\n]/.test(code) || !title) throw new Error('Indica tipo, código oficial y título.');
  if (document.schemaVersion !== 3 && !(type === 'exam' ? /^\d{2}(?:\d{2})?$/ : /^\d{4}$/).test(code)) throw new Error(type === 'exam' ? 'El código de examen debe tener dos o cuatro cifras en esta UT.' : 'El código de tarea debe tener cuatro cifras en esta UT.');
  if ((document.tasks ?? []).some(task => task.code === code && (document.schemaVersion !== 3 || taskType(task) === type))) throw new Error('Ya existe un elemento con ese código. Revisa la lista antes de añadirlo.');
  const ids = [document.unit.id, ...document.sessions.flatMap(session => [session.id, ...session.activities.map(activity => activity.id)]), ...(document.tasks ?? []).map(task => task.id)];
  if (typeof id !== 'string' || !id.trim() || ids.includes(id)) throw new Error('No se ha podido crear una identidad nueva. Vuelve a añadir el elemento.');
  const task = { id, code, title, type, approved: true, preparation: 'draft' };
  if (input.sessionId) {
    if (!document.sessions.some(session => session.id === input.sessionId)) throw new Error('Selecciona una sesión de esta UT o deja la presentación sin asignar.');
    task.presentation = { sessionId: input.sessionId };
  }
  return task;
}
