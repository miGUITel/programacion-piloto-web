import test from 'node:test';
import assert from 'node:assert/strict';
import { findTextIntegrityIssues } from './text-integrity.mjs?v=20261102-text-integrity';
import { GithubStore, validateDocument, encodeUtf8Base64, saveErrorFeedback } from './core.mjs?v=20261102-text-integrity';
import { GeneralNotesStore, TaskRegistryStore } from './general-notes.mjs?v=20261102-text-integrity';
import { MeetingReader } from './meeting-reader.mjs?v=20261102-text-integrity';

const entry = code => ({ moduleCode: 'LM', unitCode: code, unitId: `LM-${code}`, path: `LM/${code}.json` });
const fixture = (code = 'UT02') => ({ schemaVersion: 1, pilot: true,
  module: { code: 'LM', name: 'Módulo sintético' }, unit: { id: `LM-${code}`, code, title: 'Sintaxis y ñ' }, source: { kind: 'synthetic' },
  sessions: [{ id: `${code}-session`, number: 1, date: '2028-02-29', state: '', activities: [{ id: `${code}-activity`, sourceRow: 1, kind: 'Cabecera', start: '08:30', end: '09:25', title: 'Árbol y 🧑🏽‍💻', planned: 'Pingüino, quién y e\u0301', observations: '', improvements: '', realized: '', pending: '' }] }],
});
const response = value => ({ status: 200, json: async () => value });
const content = (document, sha = 'read-sha') => response({ encoding: 'base64', content: encodeUtf8Base64(JSON.stringify(document)), sha });
const saved = path => response({ content: { sha: 'new-sha', path }, commit: { sha: 'commit-sha' } });
const makeStore = fetchImpl => new GithubStore({ token: 'synthetic-token', fetchImpl });
const frozen = value => { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(frozen); } return value; };

test('valid Spanish text, combining accents and complete emoji sequences remain valid and unchanged', () => {
  const document = frozen(fixture()), before = JSON.stringify(document);
  assert.deepEqual(findTextIntegrityIssues(document), []);
  assert.deepEqual(validateDocument(document, entry('UT02')), []);
  assert.equal(JSON.stringify(document), before);
});

test('replacement characters in nested unknown values and keys are located without exposing contents', () => {
  const value = frozen({ sessions: [{ extension: ['private-secret qui\ufffdn', { 'secret\ufffdkey': 'hidden\ufffddata' }] }] });
  const issues = findTextIntegrityIssues(value);
  assert.deepEqual(issues, [
    { path: '$.sessions[0].extension[0]', code: 'REPLACEMENT_CHARACTER', count: 1, location: 'value' },
    { path: '$.sessions[0].extension[1][key#0]', code: 'REPLACEMENT_CHARACTER', count: 1, location: 'key' },
    { path: '$.sessions[0].extension[1][key#0]', code: 'REPLACEMENT_CHARACTER', count: 1, location: 'value' },
  ]);
  assert.doesNotMatch(JSON.stringify(issues), /private-secret|secret|hidden/);
});

test('unpaired surrogates are rejected but surrogate pairs are accepted', () => {
  assert.deepEqual(findTextIntegrityIssues({ pair: '🧪', high: '\ud800!', low: '!\udc00', repeated: '\ufffd\ufffd' }), [
    { path: '$.high', code: 'UNPAIRED_SURROGATE', count: 1, location: 'value' },
    { path: '$.low', code: 'UNPAIRED_SURROGATE', count: 1, location: 'value' },
    { path: '$.repeated', code: 'REPLACEMENT_CHARACTER', count: 2, location: 'value' },
  ]);
});

test('the scanner does not mutate aliases or loop forever on non-JSON cyclic input', () => {
  const shared = { note: '\ufffd' }, value = { first: shared, second: shared }; value.cycle = value;
  assert.deepEqual(findTextIntegrityIssues(value).map(issue => issue.path), ['$.first.note', '$.second.note']);
  assert.equal(value.first, value.second); assert.equal(value.cycle, value);
});

test('a damaged unit is still readable, and an individual save is blocked before network and preserves its draft', async () => {
  const document = fixture(); document.sessions[0].activities[0].planned = 'secret-text qui\ufffdn';
  const before = structuredClone(document), calls = [];
  const store = makeStore(async (url, init) => { calls.push(init.method); return content(document); });
  const read = await store.load(); assert.deepEqual(read.document, document); assert.deepEqual(calls, ['GET']);
  const error = await store.save(document, read.sha).catch(error => error);
  assert.equal(error.code, 'TEXT_INTEGRITY'); assert.deepEqual(calls, ['GET']); assert.deepEqual(document, before);
  const feedback = saveErrorFeedback(error);
  assert.equal(feedback.requiresReload, false); assert.match(feedback.message, /\$\.sessions\[0\]\.activities\[0\]\.planned/);
  assert.match(feedback.message, /borrador se conserva/); assert.doesNotMatch(feedback.message, /secret-text/);
});

test('a corrected draft can be explicitly saved after a text rejection; valid Unicode is preserved', async () => {
  const document = fixture(); document.extra = '\ufffd'; let calls = 0, payload;
  const store = makeStore(async (url, init) => { calls += 1; payload = JSON.parse(init.body); return saved('LM/UT02.json'); });
  await assert.rejects(store.save(document, 'read-sha'), error => error.code === 'TEXT_INTEGRITY');
  assert.equal(calls, 0); document.extra = 'acción, muñón y 🧪';
  const result = await store.save(document, 'read-sha');
  assert.equal(calls, 1); assert.deepEqual(result.document, document); assert.equal(payload.sha, 'read-sha');
});

test('joint publication validates all documents before any Git request or partial write', async () => {
  let calls = 0; const store = makeStore(async () => { calls += 1; throw Error('No network expected'); });
  const first = fixture(), second = fixture('UT03'); second.extra = '\ud800'; const before = structuredClone([first, second]);
  await assert.rejects(store.saveDocuments([{ entry: entry('UT02'), document: first, sha: 'sha1' }, { entry: entry('UT03'), document: second, sha: 'sha2' }]), error => error.code === 'TEXT_INTEGRITY' && error.errors.some(path => path.includes('LM/UT03.json: $.extra')));
  assert.equal(calls, 0); assert.deepEqual([first, second], before);
});

test('module resource reads stay compatible and resource publication rejects damage with no write', async () => {
  const document = { schemaVersion: 1, kind: 'module-resources', moduleCode: 'LM', resources: [{ id: 'web', type: 'web', title: 'Apuntes\ufffd', location: { kind: 'https', url: 'https://example.org/' } }] };
  const before = structuredClone(document), calls = [];
  const store = makeStore(async (url, init) => { calls.push(init.method); return content(document); }).forModuleResources('LM');
  const read = await store.load(); assert.deepEqual(read.document, document);
  await assert.rejects(store.save(document, read.sha), error => error.code === 'TEXT_INTEGRITY' && error.errors[0] === 'LM/resources.json: $.resources[0].title');
  assert.deepEqual(calls, ['GET']); assert.deepEqual(document, before);
});

test('save feedback caps field routes, never echoes arbitrary transport errors or document values', async () => {
  const document = fixture(); document.extra = ['\ufffd', '\ufffd', '\ufffd', '\ufffd'];
  const error = await makeStore(async () => { throw Error('No network expected'); }).save(document, 'read-sha').catch(error => error);
  const feedback = saveErrorFeedback(error); assert.match(feedback.message, /y 1 campos más/); assert.doesNotMatch(feedback.message, /extra\[3\]/);
  assert.doesNotMatch(saveErrorFeedback({ code: 'TEXT_INTEGRITY', paths: ['secret'], message: 'secret' }).message, /secret/);
});

test('general notes and historical tasks remain readable while damaged saves preserve drafts without writes', async () => {
  for (const [Store, path, document, property] of [
    [GeneralNotesStore, 'APP/mejoras/LM.json', { schemaVersion: 1, moduleCode: 'LM', improvements: 'qui\ufffdn', units: {} }, 'improvements'],
    [TaskRegistryStore, 'LM/tasks.json', { schemaVersion: 1, moduleCode: 'LM', tasks: [{ id: 'official-history', unitCode: 'UT01', type: 'task', code: '0101', title: 'qui\ufffdn' }] }, 'tasks[0].title'],
  ]) {
    const calls = [], before = structuredClone(document);
    const store = new Store({ token: 'synthetic', moduleCode: 'LM', fetchImpl: async (url, init) => {
      calls.push(init.method); return response({ type: 'file', path, encoding: 'base64', content: encodeUtf8Base64(JSON.stringify(document)), sha: 'read-sha' });
    } });
    const read = await store.load(); assert.deepEqual(read.document, document);
    const error = await store.save(document, read.sha).catch(error => error);
    assert.equal(error.code, 'TEXT_INTEGRITY'); assert.ok(error.errors.includes(`${path}: $.${property}`));
    assert.deepEqual(calls, ['GET']); assert.deepEqual(document, before);
    assert.match(saveErrorFeedback(error).message, /borrador se conserva/);
  }
});

test('meeting notes with existing damage load but cannot publish; a corrected explicit save is confirmed', async () => {
  const catalog = { meetings: { schemaVersion: 1, path: 'APP/reuniones.json' } };
  let value = { schemaVersion: 1, kind: 'meeting-notes', meetings: [{ meetingId: 'old', date: '2026-11-02', notes: 'qui\ufffdn' }] }, sha = 'read-sha';
  const calls = [];
  const store = new MeetingReader({ token: 'synthetic', fetchImpl: async (url, init) => {
    calls.push(init.method);
    if (init.method === 'GET') return response({ path: 'APP/reuniones.json', encoding: 'base64', content: encodeUtf8Base64(JSON.stringify(value)), sha });
    const body = JSON.parse(init.body); value = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')); sha = 'new-sha';
    return saved('APP/reuniones.json');
  } });
  const read = await store.load(catalog), document = structuredClone(read.document), before = structuredClone(document);
  const error = await store.save(catalog, document, read.sha).catch(error => error);
  assert.equal(error.code, 'TEXT_INTEGRITY'); assert.deepEqual(error.errors, ['APP/reuniones.json: $.meetings[0].notes']);
  assert.deepEqual(calls, ['GET']); assert.deepEqual(document, before);
  document.meetings[0].notes = 'quién · reunión';
  assert.deepEqual((await store.save(catalog, document, read.sha)).document, document);
  assert.deepEqual(calls, ['GET', 'GET', 'PUT', 'GET']);
});
