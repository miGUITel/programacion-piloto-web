import { taskDetails, taskTarget } from './module-views.mjs?v=20261018-1';
import { UnknownSaveError } from './core.mjs?v=20261018-1';

/** A task transaction owns its source/version; it never saves the Unit draft. */
export class TaskEditError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = (code, message) => { throw new TaskEditError(code, message); };

export function taskEditTarget(document, row) {
  const id = row.officialTaskId || row.registryTaskId;
  if (id) return document.tasks?.find(task => task.id === id);
  if (Array.isArray(document.tasks)) return null; // An old row cannot bypass a newly reconciled official list.
  // Indices are display positions, not identity: a fresh read may reorder rows.
  const session = document.sessions?.find(session => session.id === row.sessionId);
  const index = session?.activities.findIndex(activity => activity.id === row.activityId) ?? -1;
  if (index < 0) return null;
  const target = taskTarget(session, row.sessionOnly ? 0 : index);
  return row.sessionOnly ? target === session ? target : null : target === session?.activities[index] ? target : null;
}

export function assertTaskRead(loaded, row, active) {
  if (!loaded?.sha || !taskEditTarget(loaded.document, row)) {
    fail('TASK_MISSING', 'La tarea ya no está en su documento de origen. Actualiza la lista antes de continuar.');
  }
  if (active?.path === row.entry.path && (active.blocked || active.sha !== loaded.sha || !equal(active.savedDocument, loaded.document))) {
    fail('TASK_UNIT_STALE', 'La unidad abierta y GitHub tienen versiones distintas o un guardado pendiente de comprobar. Conserva su borrador y revisa la unidad antes de editar esta tarea. No se ha enviado ningún cambio.');
  }
}

function patchDetails(target, patch) {
  for (const [field, value] of Object.entries(patch)) {
    if (field === 'presented') {
      if (value) target.taskPresented = true; else delete target.taskPresented;
    } else {
      target.task = { ...target.task };
      if (value) target.task[field] = value; else delete target.task[field];
      if (!Object.keys(target.task).length) delete target.task;
    }
  }
}

export function taskEditSnapshot(loaded, row, values) {
  const target = taskEditTarget(loaded.document, row);
  if (!target) fail('TASK_MISSING', 'La tarea ya no está en su documento de origen.');
  const before = taskDetails(target);
  const patch = Object.fromEntries(Object.keys(before).filter(field => values[field] !== before[field]).map(field => [field, values[field]]));
  const document = structuredClone(loaded.document);
  patchDetails(taskEditTarget(document, row), patch);
  return { document, patch, before };
}

export function prepareTaskSave(loaded, row, values, active) {
  assertTaskRead(loaded, row, active);
  const { document, patch, before } = taskEditSnapshot(loaded, row, values);
  let unitDraft = null;
  if (active?.path === row.entry.path) {
    unitDraft = structuredClone(active.draft);
    const local = taskEditTarget(unitDraft, row);
    if (!local) fail('TASK_LOCAL_CONFLICT', 'El borrador de Unidad ha cambiado esta tarea. Revisa allí sus cambios antes de guardar desde Tareas. Ambos borradores se conservan.');
    const localDetails = taskDetails(local);
    for (const [field, value] of Object.entries(patch)) {
      if (localDetails[field] !== before[field] && localDetails[field] !== value) {
        fail('TASK_LOCAL_CONFLICT', 'Hay dos cambios distintos en el mismo campo de esta tarea: uno en Unidad y otro en Tareas. No se ha enviado ninguno. Conserva o revisa ambos borradores antes de continuar.');
      }
    }
    patchDetails(local, patch);
  }
  return { document, unitDraft };
}

export async function saveTaskDocument(store, prepared, row, sha) {
  const written = await store.save(prepared.document, sha);
  // RegistryStore already rereads and verifies the committed version itself.
  if (row.registryTaskId) return written;
  let confirmed;
  try { confirmed = await store.load(); } catch { throw new UnknownSaveError('verification-failed'); }
  if (confirmed.sha !== written.sha || !equal(confirmed.document, prepared.document)) {
    throw new UnknownSaveError('verification-differs');
  }
  return { ...confirmed, commitSha: written.commitSha };
}
