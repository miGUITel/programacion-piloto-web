import test from 'node:test';
import assert from 'node:assert/strict';
import { taskNotesValues, taskNotesSnapshot, prepareTaskNotesSave, rebaseTaskNotesDraft, saveTaskNotesDocument, validateTaskNotes } from './task-notes.mjs';

const copy = value => structuredClone(value);
function fixture() {
  const entry = { moduleCode: 'LM', unitCode: 'UT02', unitId: 'LM-UT02', path: 'LM/UT02.json' };
  const task = { id: 'LM-UT02-T01', code: '0201', title: 'Ejemplo ficticio', type: 'task', approved: true,
    preparation: 'ready', taskPresented: true, task: { presentedOn: '2099-05-04', dueOn: '2099-05-07', corrected: false, extension: 3 },
    teachingNotes: { feedback: 'Feedback previo', improvements: [{ id: 'proposal-1', text: 'Mejora previa', status: 'proposed', extension: 'keep' }], extension: { keep: true } }, extension: ['keep'] };
  const document = { schemaVersion: 3, pilot: true, module: { code: 'LM', name: 'Ejemplo ficticio' }, unit: { id: entry.unitId, code: entry.unitCode, title: 'Ficticia' },
    provenance: { archivePath: '_archive/ficticio.json', sha256: 'a'.repeat(64) }, tasks: [task], sessions: [{ id: 'LM-20990504-S01', number: 1, date: '2099-05-04', state: '',
      activities: [{ id: 'LM-UT02-A001', kind: 'Cabecera', start: '08:30', end: '09:25', title: 'Ficticia', planned: '', observations: 'Guardado', improvements: '', realized: '', pending: '' }] }] };
  const row = { officialTaskId: task.id, entry, title: task.title, code: task.code }, loaded = { document, sha: 'v1' };
  return { entry, row, loaded, values: taskNotesValues(task), active: { path: entry.path, sha: loaded.sha, savedDocument: copy(document), draft: copy(document), blocked: false } };
}

test('optional notes validate without converting old documents or dropping extensions', () => {
  assert.deepEqual(validateTaskNotes(undefined), []);
  const h = fixture(), original = copy(h.loaded.document);
  assert.deepEqual(validateTaskNotes(h.loaded.document.tasks[0].teachingNotes), []);
  assert.ok(validateTaskNotes({ feedback: 2 }).length);
  assert.ok(validateTaskNotes({ improvements: [{ id: 'x', text: 'x', status: 'unknown' }] }).length);
  assert.ok(validateTaskNotes({ improvements: [{ id: 'x', text: 'x', status: 'proposed' }, { id: 'x', text: 'y', status: 'applied' }] }).length);
  assert.deepEqual(h.loaded.document, original);
});

test('feedback changes only its owned field and preserves tracking, sessions and unknown data', () => {
  const h = fixture(), original = copy(h.loaded.document); h.values.feedback = 'Para comentar con todo el grupo';
  const prepared = taskNotesSnapshot(h.loaded, h.row, h.values);
  assert.deepEqual(prepared.patch, { feedback: h.values.feedback });
  const expected = copy(original); expected.tasks[0].teachingNotes.feedback = h.values.feedback;
  assert.deepEqual(prepared.document, expected); assert.deepEqual(h.loaded.document, original);
});

test('proposal states are explicit and preserve stable IDs and extensions', () => {
  const h = fixture(); h.values.improvements = [{ id: 'proposal-1', text: 'Concretar el ejemplo', status: 'applied' }, { id: 'proposal-2', text: 'Otra propuesta', status: 'discarded' }];
  const next = taskNotesSnapshot(h.loaded, h.row, h.values).document.tasks[0].teachingNotes;
  assert.equal(next.improvements[0].extension, 'keep'); assert.equal(next.improvements[0].id, 'proposal-1');
  assert.equal(next.improvements[0].status, 'applied'); assert.equal(next.improvements[1].status, 'discarded');
  assert.equal(next.feedback, 'Feedback previo');
});

test('saved proposals remain in history and malformed drafts are not saveable', () => {
  const h = fixture(); h.values.improvements = [];
  assert.throws(() => taskNotesSnapshot(h.loaded, h.row, h.values), e => e.code === 'TASK_NOTES_HISTORY');
  h.values.improvements = [{ id: 'proposal-1', text: ' ', status: 'proposed' }];
  assert.throws(() => taskNotesSnapshot(h.loaded, h.row, h.values), e => e.code === 'TASK_NOTES_INVALID');
});

test('independent save rebases Unit notes without sending other pending edits', () => {
  const h = fixture(); h.active.draft.sessions[0].activities[0].observations = 'Pendiente en Unidad';
  h.active.draft.tasks[0].task.corrected = true; h.values.feedback = 'Nuevo feedback';
  const prepared = prepareTaskNotesSave(h.loaded, h.row, h.values, h.active);
  assert.equal(prepared.document.sessions[0].activities[0].observations, 'Guardado');
  assert.equal(prepared.document.tasks[0].task.corrected, false);
  assert.equal(prepared.unitDraft.sessions[0].activities[0].observations, 'Pendiente en Unidad');
  assert.equal(prepared.unitDraft.tasks[0].task.corrected, true);
  assert.equal(prepared.unitDraft.tasks[0].teachingNotes.feedback, 'Nuevo feedback');
});

test('dual local note edits and stale bases cannot overwrite either draft', () => {
  const h = fixture(); h.active.draft.tasks[0].teachingNotes.feedback = 'Otra edición local'; h.values.feedback = 'Edición del formulario';
  assert.throws(() => prepareTaskNotesSave(h.loaded, h.row, h.values, h.active), e => e.code === 'TASK_NOTES_LOCAL_CONFLICT');
  assert.equal(h.active.draft.tasks[0].teachingNotes.feedback, 'Otra edición local');
  h.active.sha = 'v2'; assert.throws(() => prepareTaskNotesSave(h.loaded, h.row, h.values, h.active), e => e.code === 'TASK_UNIT_STALE');
});

test('another open Unit is not involved and a missing identity is never recreated', () => {
  const h = fixture(); h.active.path = 'SR/UT03.json'; h.values.feedback = 'Solo esta tarea';
  const previous = copy(h.active); const prepared = prepareTaskNotesSave(h.loaded, h.row, h.values, h.active);
  assert.equal(prepared.unitDraft, null); assert.deepEqual(h.active, previous);
  const missing = copy(h.row); missing.officialTaskId = 'removed';
  assert.throws(() => prepareTaskNotesSave(h.loaded, missing, h.values, h.active), e => e.code === 'TASK_MISSING');
});

test('preparation draft rebasing keeps additions, preparation choices and removals', () => {
  const h = fixture(), local = copy(h.loaded.document); local.tasks[0].preparation = 'draft';
  local.tasks.push({ id: 'new-local', title: 'Borrador', code: '0202', type: 'task' }); local.unit.preparation = 'draft';
  h.values.improvements[0].status = 'discarded'; const saved = taskNotesSnapshot(h.loaded, h.row, h.values).document;
  const rebased = rebaseTaskNotesDraft(h.loaded.document, local, saved, h.row);
  assert.equal(rebased.tasks[0].preparation, 'draft'); assert.equal(rebased.tasks[0].teachingNotes.improvements[0].status, 'discarded');
  assert.deepEqual(rebased.tasks[1], local.tasks[1]); assert.equal(rebased.unit.preparation, 'draft');
  local.tasks = local.tasks.filter(t => t.id !== h.row.officialTaskId);
  assert.throws(() => rebaseTaskNotesDraft(h.loaded.document, local, saved, h.row), e => e.code === 'TASK_NOTES_MISSING');
});

test('historic task notes remain owned by their ID without inventing sessions', () => {
  const h = fixture(), historic = { document: { schemaVersion: 2, moduleCode: 'LM', tasks: [{ ...copy(h.loaded.document.tasks[0]), unitCode: 'UT02' }] }, sha: 'v1' };
  const row = { entry: { moduleCode: 'LM', unitCode: 'UT02', path: 'LM/tasks.json' }, registryTaskId: h.row.officialTaskId };
  h.values.feedback = 'Feedback histórico'; const prepared = prepareTaskNotesSave(historic, row, h.values, null);
  assert.equal(prepared.document.tasks[0].teachingNotes.feedback, 'Feedback histórico'); assert.equal(Object.hasOwn(prepared.document, 'sessions'), false);
});

test('the writer saves against the read version and requires exact confirmation', async () => {
  const h = fixture(); h.values.feedback = 'Confirmado'; const prepared = prepareTaskNotesSave(h.loaded, h.row, h.values, null);
  let writes = 0, remote;
  const store = { async save(document, sha) { writes++; assert.equal(sha, 'v1'); remote = { document: copy(document), sha: 'v2' }; return { ...copy(remote), commitSha: 'one-commit' }; }, async load() { return copy(remote); } };
  const saved = await saveTaskNotesDocument(store, prepared, h.row, h.loaded.sha);
  assert.equal(writes, 1); assert.equal(saved.sha, 'v2'); assert.deepEqual(saved.document, prepared.document);
  store.load = async () => ({ document: h.loaded.document, sha: 'other' });
  await assert.rejects(() => saveTaskNotesDocument(store, prepared, h.row, 'v1'), e => e.code === 'SAVE_UNKNOWN');
});
