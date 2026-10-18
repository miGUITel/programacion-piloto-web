/** RF 3: preparation is derived from confirmed materials and session marks. */
import { taskPreparationGroups, createPreparationTask, taskRemovalIssue } from './preparation-tasks.mjs?v=20261018-module-common';
export const preparationMaterials = ['ppt', 'web', 'tasks', 'exam'];
export const preparationLabels = { pending: 'Pendiente', draft: 'En preparación', ready: 'Preparada' };
export const materialLabels = { ppt: 'PPT', web: 'Web', tasks: 'Tareas', exam: 'Examen' };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export class PreparationError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new PreparationError(code, message); };

export function preparationValues(document) {
  return { materials: Object.fromEntries(preparationMaterials.map(key => [key, document.unit.resourcePreparation?.[key] ?? ''])),
    sessions: Object.fromEntries(document.sessions.map(session => [session.id, session.preparation ?? ''])),
    tasks: Object.fromEntries((document.tasks ?? []).map(task => [task.id, task.preparation ?? ''])), additions: [], removals: [] };
}

export function preparationSummary(document) {
  const groups = taskPreparationGroups(document);
  const materials = preparationMaterials.filter(key => (groups[key]?.state ?? document.unit.resourcePreparation?.[key]) === 'Listo').length;
  const sessions = document.sessions.filter(session => session.preparation === 'ready').length;
  const total = document.sessions.length;
  const state = materials === 4 && total > 0 && sessions === total ? 'ready' : materials > 0 || sessions > 0 || groups.tasks.ready > 0 || groups.exam.ready > 0 ? 'draft' : 'pending';
  return { state, label: preparationLabels[state], materials, sessions, total, groups };
}

export function assertPreparationRead(loaded, entry, active) {
  if (!loaded?.sha || loaded.document?.unit?.id !== entry.unitId) fail('PREPARATION_MISSING', 'La unidad ya no coincide con su documento. Actualiza la lista.');
  if (active?.path === entry.path && (active.blocked || active.sha !== loaded.sha || !equal(active.savedDocument, loaded.document))) {
    fail('PREPARATION_STALE', 'La unidad abierta y GitHub tienen versiones distintas o un guardado pendiente de comprobar. Conserva sus notas y revisa la unidad antes de guardar preparación.');
  }
}

export function preparationSnapshot(document, values) {
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
  if (!equal(Object.keys(values.sessions).sort(), document.sessions.map(session => session.id).sort())) fail('PREPARATION_INVALID', 'La lista de sesiones ha cambiado. Revisa la unidad.');
  for (const session of result.sessions) {
    const value = values.sessions[session.id];
    if (!['', 'draft', 'ready'].includes(value)) fail('PREPARATION_INVALID', 'Revisa la preparación de las sesiones.');
    if (value === original.sessions[session.id]) continue;
    if (value) session.preparation = value; else delete session.preparation;
  }
  // Preserve legacy visibility before replacing its former manual preparation gate.
  // V3 approvals are explicit and are never created by a preparation calculation.
  if (document.schemaVersion !== 3) for (const task of result.tasks ?? []) {
    if (typeof task.approved !== 'boolean') task.approved = document.unit.preparation === 'ready';
  }
  if (!equal(Object.keys(values.tasks).sort(), (document.tasks ?? []).map(task => task.id).sort())) fail('PREPARATION_INVALID', 'La lista de tareas ha cambiado. Revisa la unidad.');
  for (const task of result.tasks ?? []) {
    const value = values.tasks[task.id];
    if (!['', 'draft', 'ready'].includes(value)) fail('PREPARATION_INVALID', 'Revisa la preparación de las tareas.');
    if (value === original.tasks[task.id]) continue;
    if (value) task.preparation = value; else delete task.preparation;
  }
  const removals = values.removals ?? [];
  if (!Array.isArray(removals) || new Set(removals).size !== removals.length || removals.some(id => !document.tasks?.some(task => task.id === id))) fail('PREPARATION_INVALID', 'Revisa los elementos seleccionados para eliminar.');
  for (const id of removals) {
    const issue = taskRemovalIssue(document, id); if (issue) fail('PREPARATION_INVALID', issue);
  }
  // Keep an empty official list: removing it would reactivate historical session markers.
  if (removals.length) result.tasks = result.tasks.filter(task => !removals.includes(task.id));
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
  const state = preparationSummary(result).state;
  if (state === 'pending') delete result.unit.preparation; else result.unit.preparation = state;
  return result;
}

export function preparePreparationSave(loaded, entry, values, active) {
  assertPreparationRead(loaded, entry, active);
  const document = preparationSnapshot(loaded.document, values);
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
    const localValues = preparationValues(unitDraft), beforeValues = preparationValues(before);
    if (!equal(localValues, beforeValues) && !equal(localValues, preparationValues(document))) fail('PREPARATION_LOCAL_CONFLICT', 'La preparación también tiene cambios locales en Unidad. Revisa ambos borradores antes de guardar.');
    for (const id of values.removals ?? []) {
      const original = before.tasks.find(task => task.id === id), local = unitDraft.tasks?.find(task => task.id === id);
      if ((local && !equal(local, original)) || taskRemovalIssue(unitDraft, id)) fail('PREPARATION_LOCAL_CONFLICT', 'El elemento que quieres eliminar tiene cambios o vínculos pendientes en Unidad. Revisa su borrador antes de eliminarlo; no se ha enviado ningún cambio.');
    }
    if (values.removals?.length) unitDraft.tasks = (unitDraft.tasks ?? []).filter(task => !values.removals.includes(task.id));
    merge(unitDraft.unit, before.unit, document.unit, 'resourcePreparation');
    merge(unitDraft.unit, before.unit, document.unit, 'preparation');
    for (const session of document.sessions) {
      const target = unitDraft.sessions.find(item => item.id === session.id);
      if (!target) fail('PREPARATION_LOCAL_CONFLICT', 'Una sesión ha cambiado en el borrador de Unidad. Conserva y revisa ambos borradores.');
      merge(target, before.sessions.find(item => item.id === session.id), session, 'preparation');
    }
    for (const task of document.tasks ?? []) {
      const original = before.tasks?.find(item => item.id === task.id);
      const target = unitDraft.tasks?.find(item => item.id === task.id);
      if (!original) {
        if (target && !equal(target, task)) fail('PREPARATION_LOCAL_CONFLICT', 'El borrador de Unidad contiene otro elemento con esa identidad. Conserva ambos borradores.');
        if (!target) (unitDraft.tasks ??= []).push(structuredClone(task));
        continue;
      }
      if (!target && !equal(original?.approved, task.approved)) fail('PREPARATION_LOCAL_CONFLICT', 'La lista de tareas ha cambiado en el borrador de Unidad. Revisa antes de guardar.');
      if (target) { merge(target, original, task, 'approved'); merge(target, original, task, 'preparation'); }
    }
  }
  return { document, unitDraft };
}
