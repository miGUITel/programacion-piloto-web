/** RF 28: preparation is derived from resources, never manual session checks. */
import { sessionPreparation } from './session-preparation.mjs?v=20261102-task-notes-resources';
import { taskPreparationGroups, createPreparationTask, taskRemovalIssue } from './preparation-tasks.mjs?v=20261102-task-notes-resources';
import { detachTaskLinks, sameTaskLinks } from './preparation-links.mjs?v=20261102-task-notes-resources';
export const preparationMaterials = ['ppt', 'web', 'tasks', 'exam'];
export const preparationLabels = { pending: 'Pendiente', draft: 'En preparación', 'exam-pending': 'Examen pendiente', ready: 'Preparada' };
export const materialLabels = { ppt: 'PPT', web: 'Web', tasks: 'Tareas', exam: 'Examen' };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export class PreparationError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new PreparationError(code, message); };

export function preparationValues(document) {
  return { materials: Object.fromEntries(preparationMaterials.map(key => [key, document.unit.resourcePreparation?.[key] ?? ''])),
    examParts: Object.fromEntries((document.tasks ?? []).filter(task => task.type === 'exam').map(task => [task.id, task.examPart ?? ''])),
    tasks: Object.fromEntries((document.tasks ?? []).map(task => [task.id, task.preparation ?? ''])), additions: [], removals: [] };
}

export function preparationSummary(document, records = []) {
  const groups = taskPreparationGroups(document);
  const materials = preparationMaterials.filter(key => (groups[key]?.state ?? document.unit.resourcePreparation?.[key]) === 'Listo').length;
  const sessionDetails = document.sessions.map(session => sessionPreparation(document, session, records));
  const activeSessions = sessionDetails.filter(session => !session.excluded);
  const sessions = activeSessions.filter(session => session.ready).length;
  const total = activeSessions.length;
  const excluded = sessionDetails.length - total;
  const unlinked = activeSessions.filter(session => !session.known).length;
  const teachingReady = ['ppt','web'].every(key => document.unit.resourcePreparation?.[key] === 'Listo')
    && groups.tasks.state === 'Listo' && total > 0 && !unlinked
    && activeSessions.every(session => session.dependencies.every(item => item.kind === 'exam' || item.ready));
  const examMissing = groups.exam.items.filter(task => task.preparation !== 'ready');
  const state = materials === 4 && total > 0 && sessions === total ? 'ready'
    : teachingReady && groups.exam.total > 0 && (examMissing.length || sessionDetails.some(session => session.missing.some(item => item.kind === 'exam'))) ? 'exam-pending'
    : materials > 0 || groups.tasks.ready > 0 || groups.exam.ready > 0 || sessionDetails.some(session => session.dependencies.some(item => item.ready)) ? 'draft' : 'pending';
  const detail = state === 'exam-pending' ? 'Falta preparar: ' + [...new Set([
    ...examMissing.map(task => `Examen ${task.code} · ${task.title}`),
    ...sessionDetails.flatMap(session => session.missing.filter(item => item.kind === 'exam').map(item => item.label)),
  ])].join('; ') : unlinked ? `${unlinked} sesión/es con recursos sin vincular` : !groups.exam.total ? 'Examen por concretar' : '';
  return { state, label: preparationLabels[state], materials, sessions, total, excluded, groups, sessionDetails, unlinked, detail };
}

export function assertPreparationRead(loaded, entry, active) {
  if (!loaded?.sha || loaded.document?.unit?.id !== entry.unitId) fail('PREPARATION_MISSING', 'La unidad ya no coincide con su documento. Actualiza la lista.');
  if (active?.path === entry.path && (active.blocked || active.sha !== loaded.sha || !equal(active.savedDocument, loaded.document))) {
    fail('PREPARATION_STALE', 'La unidad abierta y GitHub tienen versiones distintas o un guardado pendiente de comprobar. Conserva sus notas y revisa la unidad antes de guardar preparación.');
  }
}

export function preparationSnapshot(document, values, records = []) {
  const result = structuredClone(document);
  const original = preparationValues(document);
  for (const key of ['ppt', 'web']) {
    const value = values.materials[key];
    if (!['', 'Sin mirar', 'En proceso', 'Listo'].includes(value)) fail('PREPARATION_INVALID', 'Revisa el estado de los materiales.');
    if (value === original.materials[key]) continue;
    result.unit.resourcePreparation ??= {};
    if (value) result.unit.resourcePreparation[key] = value; else delete result.unit.resourcePreparation[key];
  }
  if (result.unit.resourcePreparation && !Object.keys(result.unit.resourcePreparation).length) delete result.unit.resourcePreparation;
  // Preserve legacy visibility before replacing its former manual preparation gate.
  // V3 approvals are explicit and are never created by a preparation calculation.
  if (document.schemaVersion !== 3) for (const task of result.tasks ?? []) {
    if (typeof task.approved !== 'boolean') task.approved = document.unit.preparation === 'ready';
  }
  if (!equal(Object.keys(values.tasks).sort(), (document.tasks ?? []).map(task => task.id).sort())) fail('PREPARATION_INVALID', 'La lista de tareas ha cambiado. Revisa la unidad.');
  const examParts = values.examParts ?? original.examParts;
  if (!equal(Object.keys(examParts).sort(), Object.keys(original.examParts).sort())) fail('PREPARATION_INVALID', 'La lista de exámenes ha cambiado. Revisa la unidad.');
  for (const task of result.tasks ?? []) {
    const value = values.tasks[task.id];
    if (!['', 'draft', 'ready'].includes(value)) fail('PREPARATION_INVALID', 'Revisa la preparación de las tareas.');
    if (value === original.tasks[task.id]) continue;
    if (value) task.preparation = value; else delete task.preparation;
  }
  for (const task of result.tasks ?? []) if (task.type === 'exam') {
    const value = examParts[task.id];
    if (!['', 'test', 'practical', 'both'].includes(value)) fail('PREPARATION_INVALID', 'Revisa la parte de cada examen.');
    if (value === original.examParts[task.id]) continue;
    if (value) task.examPart = value; else delete task.examPart;
  }
  const removals = values.removals ?? [];
  if (!Array.isArray(removals) || new Set(removals).size !== removals.length || removals.some(id => !document.tasks?.some(task => task.id === id))) fail('PREPARATION_INVALID', 'Revisa los elementos seleccionados para eliminar.');
  for (const id of removals) {
    const issue = taskRemovalIssue(document, id); if (issue) fail('PREPARATION_INVALID', issue);
  }
  // Keep an empty official list: removing it would reactivate historical session markers.
  if (removals.length) {
    detachTaskLinks(result, removals);
    result.tasks = result.tasks.filter(task => !removals.includes(task.id));
  }
  for (const addition of values.additions) {
    if (document.tasks?.some(task => task.id === addition.id)) fail('PREPARATION_INVALID', 'Una nueva tarea no puede reutilizar una identidad anterior.');
    let task;
    try { task = createPreparationTask(result, { ...addition, sessionId: addition.presentation?.sessionId }, addition.id); }
    catch (error) { fail('PREPARATION_INVALID', error.message); }
    if (!['draft', 'ready'].includes(addition.preparation)) fail('PREPARATION_INVALID', 'Revisa la preparación del nuevo elemento.');
    task.preparation = addition.preparation;
    (result.tasks ??= []).push(task);
  }
  const groups = taskPreparationGroups(result);
  for (const key of ['tasks', 'exam']) {
    // No automatic completion for an empty list and no inference from former aggregate marks.
    if (groups[key].total || Object.hasOwn(result.unit.resourcePreparation ?? {}, key)) {
      (result.unit.resourcePreparation ??= {})[key] = groups[key].state;
    }
  }
  const state = preparationSummary(result, records).state;
  if (state === 'pending') delete result.unit.preparation; else result.unit.preparation = state === 'ready' ? 'ready' : 'draft';
  return result;
}

export function preparePreparationSave(loaded, entry, values, active, records = []) {
  assertPreparationRead(loaded, entry, active);
  const document = preparationSnapshot(loaded.document, values, records);
  let unitDraft = null;
  if (active?.path === entry.path) {
    unitDraft = structuredClone(active.draft);
    function merge(target, before, after, key) {
      if (equal(before?.[key], after?.[key])) return;
      if (!equal(target[key], before?.[key]) && !equal(target[key], after?.[key])) fail('PREPARATION_LOCAL_CONFLICT', 'Hay dos cambios distintos en el mismo dato de preparación. Revisa ambos borradores; no se ha enviado ninguno.');
      if (Object.hasOwn(after, key)) target[key] = structuredClone(after[key]); else delete target[key];
    }
    const before = loaded.document;
    // Sources are a single logical transaction; local notes and task tracking stay pending.
    const withoutExamParts = value => { const { examParts, ...rest } = preparationValues(value); return rest; };
    const localValues = withoutExamParts(unitDraft), beforeValues = withoutExamParts(before);
    if (!equal(localValues, beforeValues) && !equal(localValues, withoutExamParts(document))) fail('PREPARATION_LOCAL_CONFLICT', 'La preparación también tiene cambios locales en Unidad. Revisa ambos borradores antes de guardar.');
    for (const id of values.removals ?? []) {
      const original = before.tasks.find(task => task.id === id), local = unitDraft.tasks?.find(task => task.id === id);
      if ((local && !equal(local, original)) || !sameTaskLinks(before, unitDraft, id)) fail('PREPARATION_LOCAL_CONFLICT', 'El elemento que quieres eliminar tiene cambios o vínculos pendientes en Unidad. Revisa su borrador antes de eliminarlo; no se ha enviado ningún cambio.');
    }
    if (values.removals?.length) {
      detachTaskLinks(unitDraft, values.removals);
      unitDraft.tasks = (unitDraft.tasks ?? []).filter(task => !values.removals.includes(task.id));
    }
    merge(unitDraft.unit, before.unit, document.unit, 'resourcePreparation');
    merge(unitDraft.unit, before.unit, document.unit, 'preparation');
    for (const task of document.tasks ?? []) {
      const original = before.tasks?.find(item => item.id === task.id);
      const target = unitDraft.tasks?.find(item => item.id === task.id);
      if (!original) {
        if (target && !equal(target, task)) fail('PREPARATION_LOCAL_CONFLICT', 'El borrador de Unidad contiene otro elemento con esa identidad. Conserva ambos borradores.');
        if (!target) (unitDraft.tasks ??= []).push(structuredClone(task));
        continue;
      }
      if (!target && ['approved','preparation','examPart'].some(key => !equal(original?.[key], task[key]))) fail('PREPARATION_LOCAL_CONFLICT', 'La lista de tareas ha cambiado en el borrador de Unidad. Revisa antes de guardar.');
      if (target) { merge(target, original, task, 'approved'); merge(target, original, task, 'preparation'); merge(target, original, task, 'examPart'); }
    }
  }
  return { document, unitDraft };
}
