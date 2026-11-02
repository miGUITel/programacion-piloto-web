// Read-only dependencies. Stored session.preparation is retained as historical data.
import { excludedSession } from './replanning.mjs?v=20261102-replanning-signals';
const own = (value, key) => Object.hasOwn(value ?? {}, key);
const keyOf = document => document.unit?.id ?? document.module?.code ?? '';

export function sessionPreparation(document, session, records = []) {
  if (excludedSession(session)) return { excluded:true, ready:false, known:true, dependencies:[], missing:[], issues:[],
    task:false, exam:false, label:`${session.state} · Fuera del cómputo de preparación` };
  const dependencies = new Map(), issues = new Set(), linkedTypes = new Set(), inactiveTypes = new Set();
  const owners = [document, ...records.map(record => record.document ?? record)
    .filter(owner => owner !== document && keyOf(owner) !== keyOf(document) && owner.module?.code === document.module?.code)];
  const taskKey = (owner, task) => `${keyOf(owner)}:task:${task.id}`;
  function addTask(owner, task) {
    const kind = task.type === 'exam' ? 'exam' : 'task'; linkedTypes.add(kind);
    dependencies.set(taskKey(owner, task), { key:taskKey(owner, task), kind, ready:task.preparation === 'ready',
      label:`${kind === 'exam' ? 'Examen' : 'Tarea'} ${task.code} · ${task.title}`, id:task.id });
  }
  function addMaterial(owner, kind) {
    const key = `${keyOf(owner)}:${kind}`;
    dependencies.set(key, { key, kind, ready:owner.unit.resourcePreparation?.[kind] === 'Listo', label:kind === 'ppt' ? 'PPT' : 'Web / apuntes' });
  }
  function addResource(owner, id) {
    const resource = (owner.resources ?? []).find(item => item.id === id);
    if (!resource) { issues.add(`Referencia de recurso sin resolver: ${id}`); return; }
    if (resource.type === 'presentation') { addMaterial(owner, 'ppt'); return; }
    if (['web','notes'].includes(resource.type)) { addMaterial(owner, 'web'); return; }
    const tasks = (owner.tasks ?? []).filter(task => task.resourceRefs?.includes(id));
    if (tasks.length) { tasks.forEach(task => addTask(owner, task)); return; }
    if (['assignment','guide','exam'].includes(resource.type)) {
      if (Array.isArray(owner.tasks)) {
        // The official list is authoritative. Keeping a former statement/guide
        // must not create a new task after its explicit deletion.
        if(resource.type!=='exam')inactiveTypes.add('task');
        if(resource.type!=='assignment')inactiveTypes.add('exam');
      } else issues.add(`Preparación sin vincular: ${resource.title}`);
    }
    // Tools and auxiliary links have no preparation checkbox and do not add one.
  }
  const activities = session.activities ?? [];
  for (const id of session.resourceRefs ?? []) addResource(document, id);
  for (const activity of activities) {
    if (Array.isArray(document.tasks) && Array.isArray(activity.taskRefs) && !activity.taskRefs.length) {
      inactiveTypes.add('task'); inactiveTypes.add('exam');
    }
    for (const id of activity.resourceRefs ?? []) addResource(document, id);
    for (const id of activity.taskRefs ?? []) {
      const matches = owners.flatMap(owner => (owner.tasks ?? []).filter(task => task.id === id).map(task => ({owner,task})));
      if (matches.length !== 1) issues.add(`Tarea sin vincular de forma única: ${id}`);
      else addTask(matches[0].owner, matches[0].task);
    }
  }
  for (const task of document.tasks ?? []) if (task.presentation?.sessionId === session.id) addTask(document, task);
  // A missing official identity cannot be reconstructed from a type flag or title.
  const declared = own(session, 'eventTypes') ? session.eventTypes : activities.map(activity => activity.eventType);
  for (const kind of ['task','exam']) if (declared.includes(kind) && !linkedTypes.has(kind) && !inactiveTypes.has(kind))
    issues.add(`${kind === 'task' ? 'Tarea' : 'Examen'} sin vincular`);
  const values = [...dependencies.values()];
  const known = (values.length > 0 || inactiveTypes.size > 0) && issues.size === 0;
  const missing = values.filter(item => !item.ready);
  const ready = known && missing.length === 0;
  const detail = [...(!known ? ['Recursos sin vincular', ...issues] : []), ...missing.map(item => `Falta ${item.label}`)];
  return { ready, known, dependencies:values, missing, issues:[...issues],
    task:linkedTypes.has('task'), exam:linkedTypes.has('exam'),
    label:ready ? values.length ? 'Recursos preparados' : 'Sin tareas o exámenes activos que preparar' : detail.join(' · ') };
}
