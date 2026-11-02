import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GithubStore, encodeUtf8Base64, decodeUtf8Base64 } from './core.mjs';
import { planningStatus, validatePlanningChanges, planningSnapshot, sessionPlanningLabel } from './replanning.mjs';
import { preparePlanningOperation, savePlanningOperation, PlanningSaveError } from './replanning-save.mjs';

const clone = v => structuredClone(v), stable = v => JSON.stringify(v);
const baseSha = 'a'.repeat(40), savedSha = 'b'.repeat(40);
// Entirely synthetic and self-contained: these tests also run from a clean public clone.
function documentFixture(code) {
  const unitId = `LM-${code}`;
  const document = {
    schemaVersion: 2, pilot: true,
    module: { code: 'LM', name: 'Módulo sintético' }, unit: { id: unitId, code, title: 'Unidad sintética' },
    provenance: { archivePath: '_archive/synthetic.json', sha256: '0'.repeat(64) },
    sessions: ['2099-05-04', '2099-05-07'].map((date, i) => ({
      id: `${unitId}-S${i + 1}`, number: i + 1, date, state: code === 'UT02' && i === 0 ? 'Cancelada' : '',
      ...(code === 'UT02' && i === 0 ? { replanningPending: true } : {}),
      activities: [['08:30', '08:55'], ['08:55', '09:25']].map(([start, end], j) => ({
        id: `${unitId}-S${i + 1}-A${j + 1}`, kind: j === 0 ? 'Cabecera' : 'Actividad', start, end,
        title: 'Actividad ficticia', planned: 'Plan sintético', observations: 'Anotación histórica ficticia',
        improvements: '', realized: '', pending: '', unknown: { preserve: [false, 0] },
      })),
    })),
  };
  if (code === 'UT06') document.planningChanges = [{
    id: 'qa-existing-history', affectedUnitIds: [unitId], approvedOn: '2099-04-25', reason: 'Desplazamiento sintético anterior',
    beforeSessions: planningSnapshot(document).map((s, i) => ({ ...s, date: ['2099-04-27', '2099-04-30'][i] })),
    afterSessions: planningSnapshot(document), addedSessionIds: [], resolutions: [],
  }];
  return document;
}
function record(code = 'UT02') {
  const document = documentFixture(code);
  return { entry: { moduleCode: 'LM', unitCode: code, unitId: document.unit.id, path: `LM/${code}.json` }, document, sha: baseSha };
}
function approve(base, outcome = 'absorbed') {
  const source = base.document.sessions[0], destination = base.document.sessions[1];
  return { approved: true, approvedOn: '2099-05-05', reason: 'Decisión ficticia del docente', id: 'qa-new-operation',
    resolutions: [{ unitId: base.entry.unitId, sessionId: source.id, outcome,
      targets: outcome === 'not-recovered' ? [] : [{ unitId: base.entry.unitId, sessionId: destination.id }],
      ...(outcome === 'not-recovered' ? { note: 'No recuperar, por decisión ficticia' } : {}) }] };
}
function operation() {
  const base = record(); base.document.sessions[0].replanningPending = true;
  const after = clone(base); after.document.sessions[1].activities[0].planned += '\nContenido redistribuido ficticio.';
  return preparePlanningOperation({ before: [base], after: [after], approval: approve(base) });
}

test('builder generates exact real snapshots, trace and resolution without mutating its bases', () => {
  const base = record(); base.document.sessions[0].replanningPending = true;
  base.document.extra = { preserve: [0, false, 'texto'] };
  const after = clone(base); after.document.sessions[1].activities[0].planned = 'Absorción ficticia aprobada';
  const original = stable([base, after]);
  const result = preparePlanningOperation({ before: [base], after: [after], approval: approve(base) });
  const doc = result.changes[0].document, trace = doc.planningChanges.at(-1);
  assert.equal(stable([base, after]), original);
  assert.deepEqual(trace.beforeSessions, planningSnapshot(base.document));
  assert.deepEqual(trace.afterSessions, planningSnapshot(doc));
  assert.equal(Object.hasOwn(doc.sessions[0], 'replanningPending'), false);
  assert.equal(planningStatus(doc).pending.length, 0);
  assert.equal(planningStatus(doc).modified, true);
  assert.deepEqual(doc.extra, base.document.extra);
  assert.equal(doc.sessions[0].activities[0].observations, base.document.sessions[0].activities[0].observations);
});
test('cancel and resolve in one operation preserves an active before state instead of faking historical cancellation', () => {
  const base = record(); base.document.sessions[0].state = ''; delete base.document.sessions[0].replanningPending;
  const after = clone(base); after.document.sessions[0].state = 'Cancelada';
  const result = preparePlanningOperation({ before: [base], after: [after], approval: approve(base) });
  const doc = result.changes[0].document, trace = doc.planningChanges[0];
  assert.equal(trace.beforeSessions[0].state, ''); assert.equal(trace.afterSessions[0].state, 'Cancelada');
  assert.deepEqual(validatePlanningChanges(doc), []);
  assert.equal(planningStatus(doc).pending.length, 0);
});
test('added and not-recovered decisions are explicit; new IDs are derived and unrelated incidents remain pending', () => {
  for (const outcome of ['added', 'not-recovered']) {
    const base = record(), after = clone(base), approval = approve(base, outcome);
    base.document.sessions[0].replanningPending = true;
    if (outcome === 'added') {
      const session = clone(after.document.sessions[1]); session.id += '-recovery'; session.number = 3;
      session.activities.forEach(a => a.id += '-recovery'); after.document.sessions.push(session);
      approval.resolutions[0].targets[0].sessionId = session.id;
    }
    const result = preparePlanningOperation({ before: [base], after: [after], approval });
    assert.equal(result.changes[0].document.planningChanges[0].addedSessionIds.length, outcome === 'added' ? 1 : 0);
    assert.equal(result.changes[0].document.planningChanges[0].resolutions[0].outcome, outcome);
  }
  const base = record(), after = clone(base);
  for (const doc of [base.document, after.document]) { doc.sessions[1].state = 'Cancelada'; doc.sessions[1].replanningPending = true; }
  const result = preparePlanningOperation({ before: [base], after: [after], approval: approve(base, 'not-recovered') });
  assert.equal(result.changes[0].document.sessions[1].replanningPending, true);
  assert.equal(planningStatus(result.changes[0].document).pending.length, 1);
});
test('cross-unit recovery has shared operation identity and complete scope in every changed document', () => {
  const source = record('UT02'), target = record('UT06');
  const after = [clone(source), clone(target)], recovery = clone(target.document.sessions[1]);
  recovery.id += '-added'; recovery.number = 3; recovery.activities.forEach(a => a.id += '-added');
  after[1].document.sessions.push(recovery);
  const approval = approve(source, 'added'); approval.resolutions[0].targets = [{ unitId: target.entry.unitId, sessionId: recovery.id }];
  const result = preparePlanningOperation({ before: [source, target], after, approval });
  for (const change of result.changes) {
    assert.equal(change.document.planningChanges.at(-1).id, approval.id);
    assert.deepEqual(change.document.planningChanges.at(-1).affectedUnitIds, [source.entry.unitId, target.entry.unitId].sort());
  }
  assert.deepEqual(result.changes[1].document.planningChanges.slice(0, -1), target.document.planningChanges);
  assert.equal(planningStatus(result.changes[0].document, result.changes).pending.length, 0);
});
test('reject malformed approvals, manual history, missing targets, false resolution kind and erased pending markers', () => {
  const base = record(); base.document.sessions[0].replanningPending = true;
  const after = clone(base), approval = approve(base);
  const cases = [
    input => input.approval.approved = false,
    input => input.after[0].document.planningChanges = [],
    input => input.approval.resolutions[0].targets[0].unitId = 'LM-UT99',
    input => input.approval.resolutions[0].targets[0].sessionId = input.before[0].document.sessions[0].id,
    input => input.approval.resolutions[0].outcome = 'added',
    input => { input.approval.resolutions = []; delete input.after[0].document.sessions[0].replanningPending; },
  ];
  for (const mutate of cases) {
    const input = clone({ before: [base], after: [after], approval }); mutate(input);
    assert.throws(() => preparePlanningOperation(input), error => error instanceof PlanningSaveError && error.code === 'INVALID_PLANNING_OPERATION');
  }
});
function transport(op, { conflict = false, lost = false } = {}) {
  const files = new Map(op.bases.map(r => [r.entry.path, clone(r)])), calls = [], reads = [];
  const unitStore = entry => ({ async load() { reads.push(entry.path); return clone(files.get(entry.path)); } });
  const store = { async saveDocuments(changes, guards, options) {
    calls.push({ changes: clone(changes), guards: clone(guards), options: clone(options) });
    if (conflict) throw new PlanningSaveError('CONFLICT', 'Conflicto ficticio', { requiresReview: true });
    for (const change of changes) files.set(change.entry.path, { ...clone(change), sha: savedSha });
    if (lost) return { results: [] };
    return { commitSha: 'f'.repeat(40), results: changes.map(r => ({ ...clone(r), sha: savedSha })) };
  } };
  return { files, calls, reads, unitStore, store };
}
test('writer rereads bases, uses one atomic commit with generated history and verifies the final documents', async () => {
  const op = operation(), original = stable(op), remote = transport(op);
  const result = await savePlanningOperation({ operation: op, ...remote });
  assert.equal(remote.calls.length, 1); assert.equal(remote.reads.length, 2);
  assert.equal(remote.calls[0].options.message, 'Reprogramar LM y registrar traza');
  assert.equal(remote.calls[0].changes[0].document.planningChanges[0].id, op.id);
  assert.equal(result.results[0].sha, savedSha); assert.equal(stable(op), original);
});
test('writer rejects a stale SHA or altered generated history before any write', async () => {
  const op = operation(), remote = transport(op);
  remote.files.get(op.changes[0].entry.path).sha = 'c'.repeat(40);
  await assert.rejects(savePlanningOperation({ operation: op, ...remote }), e => e.code === 'PLANNING_STALE');
  assert.equal(remote.calls.length, 0);
  const changedOp = clone(op), clean = transport(op); changedOp.changes[0].document.planningChanges[0].reason = 'Alteración posterior';
  await assert.rejects(savePlanningOperation({ operation: changedOp, ...clean }), e => e.code === 'INVALID_PLANNING_OPERATION');
  assert.equal(clean.calls.length, 0);
});
test('conflict and uncertain receipt preserve the proposal and never retry', async () => {
  for (const options of [{ conflict: true }, { lost: true }]) {
    const op = operation(), original = stable(op), remote = transport(op, options);
    await assert.rejects(savePlanningOperation({ operation: op, ...remote }), e => ['CONFLICT', 'PLANNING_SAVE_UNKNOWN'].includes(e.code));
    assert.equal(remote.calls.length, 1); assert.equal(stable(op), original);
  }
});

test('only explicit unresolved incidents warn; old Cancelada and Reprogramada records are neutral history', () => {
  const doc = record().document;
  delete doc.sessions[0].replanningPending;
  for (const state of ['Cancelada', 'Reprogramada']) {
    doc.sessions[0].state = state;
    assert.equal(planningStatus(doc).pending.length, 0);
    assert.equal(planningStatus(doc).legacy.length, 1);
    assert.equal(sessionPlanningLabel(doc, doc.sessions[0]), `${state} · Antecedente sin enlace`);
    doc.sessions[0].replanningPending = true;
    assert.equal(planningStatus(doc).pending.length, 1);
    assert.equal(sessionPlanningLabel(doc, doc.sessions[0]), `${state} · Pendiente de reprogramar`);
    delete doc.sessions[0].replanningPending;
  }
});

test('real GithubStore transport publishes plan and trace for two UT in exactly one non-forced commit', async () => {
  const source = record(), destination = record('UT06'); source.document.sessions[0].replanningPending = true;
  const hash = value => createHash('sha1').update(value).digest('hex');
  for (const base of [source, destination]) base.sha = hash(stable(base.document));
  const approval = approve(source); approval.resolutions[0].targets = [{ unitId: destination.entry.unitId, sessionId: destination.document.sessions[0].id }];
  const op = preparePlanningOperation({ before: [source, destination], after: [clone(source), clone(destination)], approval });
  const files = new Map(op.bases.map(r => [r.entry.path, { document: clone(r.document), sha: r.sha }]));
  const blobs = new Map(), calls = []; let nextFiles = [], writes = 0;
  const response = (value, status = 200) => ({ status, json: async () => value });
  const fetchImpl = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null; calls.push({ url, method: options.method, body });
    if (url.includes('/git/ref/')) return response({ object: { sha: '1'.repeat(40) } });
    if (url.includes('/git/commits/') && options.method === 'GET') return response({ tree: { sha: '2'.repeat(40) } });
    if (url.includes('/git/trees/') && options.method === 'GET') return response({ tree: [...files].map(([path, r]) => ({ path, type: 'blob', sha: r.sha })), truncated: false });
    if (url.endsWith('/git/blobs')) { const content = decodeUtf8Base64(body.content), id = hash(content); blobs.set(id, JSON.parse(content)); return response({ sha: id }, 201); }
    if (url.endsWith('/git/trees')) { nextFiles = body.tree; return response({ sha: '3'.repeat(40) }, 201); }
    if (url.endsWith('/git/commits')) { assert.equal(body.message, 'Reprogramar LM y registrar traza'); return response({ sha: '4'.repeat(40) }, 201); }
    if (options.method === 'PATCH') {
      assert.equal(body.force, false); assert.equal(nextFiles.length, 2);
      for (const file of nextFiles) files.set(file.path, { document: blobs.get(file.sha), sha: file.sha });
      writes++; return response({ object: { sha: body.sha } });
    }
    if (url.includes('/contents/')) {
      const path = url.split('/contents/')[1].split('?')[0], file = files.get(path);
      return response({ path, sha: file.sha, encoding: 'base64', content: encodeUtf8Base64(stable(file.document)) });
    }
    throw new Error('Unexpected synthetic endpoint');
  };
  const client = new GithubStore({ token: 'synthetic-no-network', fetchImpl });
  const store = client.forDocument(source.entry), unitStore = entry => client.forDocument(entry);
  const result = await savePlanningOperation({ operation: op, store, unitStore });
  assert.equal(writes, 1); assert.equal(result.results.length, 2);
  assert.equal(calls.filter(c => c.method === 'PATCH').length, 1);
  assert.equal(calls.filter(c => c.method === 'PUT').length, 0);
  assert.equal(calls.filter(c => c.url.includes('/contents/')).length, 6);
  for (const record of op.changes) assert.deepEqual(files.get(record.entry.path).document, record.document);
  assert.equal(planningStatus(files.get(source.entry.path).document, [...files.values()]).pending.length, 0);
});
