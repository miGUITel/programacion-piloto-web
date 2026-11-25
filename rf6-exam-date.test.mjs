import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleTasks } from './module-views.mjs';

const entry = { moduleCode: 'LM', unitCode: 'UT02', path: 'LM/UT02.json' };

test('the exam date follows the current session without replacing the announcement or follow-up dates', () => {
  const original = { id: 'session-a', number: 1, date: '2026-12-03', state: '', activities: [{ id: 'activity-a' }] };
  const replacement = { id: 'session-b', number: 2, date: '2026-12-10', state: '', activities: [{ id: 'activity-b' }] };
  const target = {
    id: 'synthetic-exam', type: 'exam', title: 'Examen de prueba', approved: true,
    presentation: { sessionId: original.id }, announcement: { examDate: original.date },
    task: { presentedOn: '2026-11-30', dueOn: '2026-12-11', correctBy: '2026-12-17' }
  };
  const document = { schemaVersion: 3, module: { code: entry.moduleCode }, unit: { title: 'Unidad de prueba' },
    sessions: [original, replacement], tasks: [target] };
  const examRow = () => moduleTasks([{ entry, document }])[0];
  const before = examRow();
  assert.equal(before.plannedExamDate, '2026-12-03');

  original.state = 'Reprogramada';
  assert.equal(examRow().plannedExamDate, undefined);
  target.presentation.sessionId = replacement.id;
  const after = examRow();
  assert.equal(after.plannedExamDate, '2026-12-10');
  assert.equal(after.key, before.key);
  assert.equal(target.announcement.examDate, '2026-12-03');
  assert.deepEqual([after.presentedOn, after.dueOn, after.correctBy], Object.values(target.task));

  delete target.presentation;
  assert.equal(examRow().plannedExamDate, undefined);
});

test('a historic exam without a linked session never displays its presentation date as the planned date', () => {
  const record = { entry, registry: true, document: {
    schemaVersion: 2, moduleCode: entry.moduleCode, tasks: [{
      id: 'synthetic-historic-exam', unitCode: entry.unitCode, type: 'exam', title: 'Examen histórico de prueba', approved: true,
      taskPresented: true, task: { presentedOn: '2026-11-24' }
    }]
  } };
  const [row] = moduleTasks([record]);
  assert.equal(row.presentedOn, '2026-11-24');
  assert.equal(row.plannedExamDate, undefined);
});
