// Removal owns task associations only: activities, resources and notes survive.
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function taskLinks(document, id) {
  const presentation = document.tasks?.find(task => task.id === id)?.presentation;
  return (document.sessions ?? []).flatMap(session => {
    const activities = (session.activities ?? []).filter(activity => activity.taskRefs?.includes(id));
    const presents = presentation?.sessionId === session.id;
    return activities.length || presents ? [{ sessionId: session.id, number: session.number, date: session.date,
      presentation: presents, activityIds: activities.map(activity => activity.id).sort() }] : [];
  }).sort((a, b) => a.sessionId.localeCompare(b.sessionId));
}

export function sameTaskLinks(before, after, id) { return equal(taskLinks(before, id), taskLinks(after, id)); }

export function detachTaskLinks(document, ids) {
  const removed = new Set(ids);
  for (const session of document.sessions ?? []) {
    for (const activity of session.activities ?? []) {
      if (activity.taskRefs?.some(id => removed.has(id))) activity.taskRefs = activity.taskRefs.filter(id => !removed.has(id));
    }
    const declared = session.eventTypes ?? (session.activities ?? []).map(activity=>activity.eventType);
    const associated = session.resourceRefs?.length || session.activities?.some(activity=>activity.resourceRefs?.length || activity.taskRefs?.length)
      || document.tasks?.some(task=>!removed.has(task.id) && task.presentation?.sessionId===session.id);
    if (associated && !declared.some(kind=>['task','exam'].includes(kind))) continue;
    // An explicit empty association retains the distinction from never-linked work.
    for (const task of document.tasks ?? []) if (removed.has(task.id) && task.presentation?.sessionId === session.id) {
      const activity = session.activities?.find(item => item.id === task.presentation.activityId) ?? session.activities?.[0];
      if (activity && !Array.isArray(activity.taskRefs)) activity.taskRefs = [];
    }
  }
  return document;
}

export function removalImpact(document, id, records = []) {
  const owners = [{ document }, ...records.filter(record => (record.document ?? record).unit?.id !== document.unit.id
    && (record.document ?? record).module?.code === document.module.code)];
  return owners.flatMap(record => {
    const owner = record.document ?? record;
    return taskLinks(owner, id).map(link => ({ unitId: owner.unit.id, unitCode: owner.unit.code, ...link }));
  }).sort((a, b) => a.unitId.localeCompare(b.unitId) || a.sessionId.localeCompare(b.sessionId));
}

export function removalWarning(document, task, records = []) {
  const impact = removalImpact(document, task.id, records);
  const sessions = impact.map(link => `${link.unitCode} · S${link.number} · ${link.date.split('-').reverse().join('/')}`
    + (link.activityIds.length ? ` · ${link.activityIds.length} actividad/es vinculadas` : ' · presentación prevista'));
  return `¿Eliminar ${task.code} · ${task.title}?\n\nSe retirarán la tarea o examen, su preparación, fechas y seguimiento al pulsar Guardar preparación.`
    + (sessions.length ? `\n\nSe retirarán sus asociaciones en estas sesiones:\n${sessions.join('\n')}` : '\n\nNo hay sesiones vinculadas.')
    + '\n\nSe conservarán las sesiones, actividades, textos, notas y recursos. Puedes deshacer la eliminación antes de guardar.';
}
