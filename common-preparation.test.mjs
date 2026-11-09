import test from 'node:test';
import assert from 'node:assert/strict';
import { preparationSummary, preparationSnapshot, preparationValues, preparePreparationSave } from './preparation.mjs';
import { rowResources, validateCommonPreparationResources, prepareResourceSave, resourceValues } from './resources.mjs';

const fixture = () => ({
  module: { code: 'PRO' }, unit: { id: 'PRO-B01', resourcePreparation: { ppt: 'Listo', web: 'Listo' } },
  resources: [{ id: 'web', title: 'Apuntes comunes', type: 'notes' }], tasks: [],
  sessions: [1, 2].map(number => ({ number, id: `session-${number}`, state: '', activities: [{ id: `activity-${number}`, observations: '' }] })),
});

test('an explicit common resource and No aplica resolve the two independent blockers', () => {
  const doc = fixture(), values = preparationValues(doc);
  assert.match(preparationSummary(doc).detail, /S1, S2 sin recursos vinculados/);
  values.commonResourceRefs = ['web'];
  const linked = preparationSnapshot(doc, values);
  assert.equal(preparationSummary(linked).state, 'draft');
  values.materials.tasks = values.materials.exam = 'No aplica';
  const prepared = preparationSnapshot(doc, values);
  const summary = preparationSummary(prepared);
  assert.equal(summary.state, 'ready');
  assert.equal(summary.materials, 4);
  assert.equal(summary.sessions, 2);
  assert.deepEqual(prepared.tasks, []);
  assert.equal(doc.unit.commonResourceRefs, undefined);
  values.additions.push({ id: 'real-task', code: '0101', title: 'Actividad', type: 'task', preparation: 'draft' });
  assert.equal(preparationSummary(preparationSnapshot(doc, values)).groups.tasks.state, 'Sin mirar');
});

test('an exception is respected by both the preparation calculation and resource shortcuts', () => {
  const doc = fixture(), values = preparationValues(doc);
  values.commonResourceRefs = ['web'];
  values.commonResourceExceptions = ['session-2'];
  values.materials.tasks = values.materials.exam = 'No aplica';
  const prepared = preparationSnapshot(doc, values);
  const [first, second] = prepared.sessions;
  assert.match(preparationSummary(prepared).detail, /^S2 sin recursos vinculados$/);
  assert.deepEqual(rowResources(prepared, first, first.activities[0]).resources.map(r => r.id), ['web']);
  assert.deepEqual(rowResources(prepared, second, second.activities[0]).resources, []);
});

test('preparation save merges common selections and exceptions into a separate draft without publishing its notes', () => {
  const doc = fixture(), entry = { unitId: 'PRO-B01', path: 'PRO/B01.json' };
  const draft = structuredClone(doc);
  draft.sessions[0].activities[0].observations = 'Pending note';
  const values = preparationValues(doc);
  values.commonResourceRefs = ['web'];
  values.commonResourceExceptions = ['session-2'];
  const result = preparePreparationSave({ document: doc, sha: 'v1' }, entry, values, { path: entry.path, sha: 'v1', savedDocument: doc, draft });
  assert.equal(result.document.sessions[0].activities[0].observations, '');
  assert.equal(result.unitDraft.sessions[0].activities[0].observations, 'Pending note');
  assert.deepEqual(result.unitDraft.unit.commonResourceRefs, ['web']);
  assert.equal(result.unitDraft.sessions[1].useCommonResources, false);
});

test('an existing common selection cannot be deleted or replaced by a non-teaching resource', () => {
  const doc = fixture(), entry = { unitId: 'PRO-B01', moduleCode: 'PRO', path: 'PRO/B01.json' };
  doc.unit.commonResourceRefs = ['web'];
  const active = { path: entry.path, sha: 'v1', savedDocument: doc, draft: structuredClone(doc) };
  const values = resourceValues(doc);
  values.resources = [];
  assert.throws(() => prepareResourceSave({ document: doc, sha: 'v1' }, entry, values, active), { code: 'RESOURCE_IN_USE' });
  const errors = [];
  validateCommonPreparationResources({ ...doc, resources: [{ id: 'web', type: 'exam' }] }, errors);
  assert.equal(errors.length, 1);
});
