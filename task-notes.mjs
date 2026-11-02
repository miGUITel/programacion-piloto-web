import { taskEditTarget, assertTaskRead, saveTaskDocument } from './task-edit.mjs?v=20261102-text-integrity';
import { validateTeachingNotes as validateTaskNotes, improvementStates } from './task-teaching-notes.mjs?v=20261102-text-integrity';
export { validateTaskNotes, improvementStates };

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = value => structuredClone(value);
export class TaskNotesError extends Error {
  constructor(code, message) { super(message); this.name = 'TaskNotesError'; this.code = code; }
}
const fail = (code, message) => { throw new TaskNotesError(code, message); };

export function taskNotesValues(target) {
  if (!target) fail('TASK_NOTES_MISSING', 'La tarea ya no está en su documento de origen. Actualiza la lista.');
  if (validateTaskNotes(target.teachingNotes).length) fail('TASK_NOTES_INVALID', 'Las notas existentes no tienen el formato esperado. Se conservan sin sustituirlas; revisa su registro antes de editar.');
  return { feedback: target.teachingNotes?.feedback ?? '', improvements: clone(target.teachingNotes?.improvements ?? []) };
}

export function taskNotesKey(row) {
  const identity = row.officialTaskId || row.registryTaskId;
  return JSON.stringify(identity ? [row.entry.moduleCode, 'task', identity] : [row.entry.path, row.sessionId, row.sessionOnly ? null : row.activityId]);
}

export function newTaskImprovement(text = '', id = globalThis.crypto.randomUUID()) {
  return { id, text, status: 'proposed' };
}

function valuesPatch(before, values) {
  const errors = validateTaskNotes(values);
  if (errors.length) fail('TASK_NOTES_INVALID', errors.join(' '));
  if (typeof values.feedback !== 'string' || !Array.isArray(values.improvements)) fail('TASK_NOTES_INVALID', 'Completa el feedback y la lista de mejoras.');
  // Saved proposals keep their IDs and history. Discarding is an explicit status, not deletion.
  for (const proposal of before.improvements) if (!values.improvements.some(item => item.id === proposal.id)) fail('TASK_NOTES_HISTORY', 'Las propuestas guardadas se conservan; marca Descartada para retirar una de las pendientes.');
  const merged = { feedback: values.feedback, improvements: values.improvements.map(item => ({ ...(before.improvements.find(old => old.id === item.id) ?? {}), ...item })) };
  return Object.fromEntries(['feedback', 'improvements'].filter(key => !equal(before[key], merged[key])).map(key => [key, clone(merged[key])]));
}

function patchTarget(target, patch) {
  const notes = { ...target.teachingNotes };
  for (const [field, value] of Object.entries(patch)) {
    if (field === 'feedback' && !value || field === 'improvements' && !value.length) delete notes[field];
    else notes[field] = clone(value);
  }
  if (Object.keys(notes).length) target.teachingNotes = notes;
  else delete target.teachingNotes;
}

/** Apply only changed note fields; preserve local tracking, preparation and session notes. */
export function rebaseTaskNotesDraft(baseDocument, localDocument, savedDocument, row) {
  const before = taskNotesValues(taskEditTarget(baseDocument, row));
  const saved = taskNotesValues(taskEditTarget(savedDocument, row));
  const patch = valuesPatch(before, saved), draft = clone(localDocument), target = taskEditTarget(draft, row);
  const local = taskNotesValues(target);
  for (const [field, value] of Object.entries(patch)) if (!equal(local[field], before[field]) && !equal(local[field], value)) {
    fail('TASK_NOTES_LOCAL_CONFLICT', 'Hay dos cambios distintos en las notas de esta tarea. Se conservan ambos borradores; revísalos antes de guardar.');
  }
  patchTarget(target, patch);
  return draft;
}

export function taskNotesSnapshot(loaded, row, values) {
  const before = taskNotesValues(taskEditTarget(loaded.document, row));
  const patch = valuesPatch(before, values), document = clone(loaded.document);
  patchTarget(taskEditTarget(document, row), patch);
  return { document, before, patch };
}

export function prepareTaskNotesSave(loaded, row, values, active) {
  assertTaskRead(loaded, row, active);
  const prepared = taskNotesSnapshot(loaded, row, values);
  const unitDraft = active?.path === row.entry.path ? rebaseTaskNotesDraft(loaded.document, active.draft, prepared.document, row) : null;
  return { ...prepared, unitDraft, baseDocument: clone(loaded.document) };
}

export async function saveTaskNotesDocument(store, prepared, row, sha) {
  return saveTaskDocument(store, prepared, row, sha);
}
