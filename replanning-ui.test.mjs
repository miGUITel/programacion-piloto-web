import test from 'node:test';
import assert from 'node:assert/strict';
import { createReplanningUI } from './replanning-ui.mjs?v=20261102-task-notes-resources';

function setup(documentValue) {
  const previous = globalThis.document, elements = new Map();
  const node = tag => ({ tag, children: [], listeners: {}, attributes: {}, textContent: '', open: false,
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(type, callback) { this.listeners[type] = callback; },
    showModal() { this.open = true; }, close() { this.open = false; }, focus() {}, scrollIntoView() {} });
  const el = id => { if (!elements.has(id)) elements.set(id, node('div')); return elements.get(id); };
  globalThis.document = { getElementById: el, createElement: node, querySelector: () => null, activeElement: node('button') };
  const entry = { moduleCode: documentValue.module.code };
  const state = { document: documentValue, records: [{ entry, document: documentValue }], complete: true,
    connection: { async loadCommon() { throw new Error('Consulta ficticia sin conexión externa'); } } };
  const ui = createReplanningUI({ getState: () => state, isBusy: () => false });
  return { ui, el, restore() { globalThis.document = previous; } };
}
function legacyDocument() {
  return { module: { code: 'LM' }, unit: { id: 'LM-UT02', code: 'UT02' }, sessions: [
    { id: 'LM-S1', number: 1, date: '2099-05-04', state: 'Reprogramada', activities: [] },
    { id: 'LM-S2', number: 2, date: '2099-05-07', state: 'Cancelada', activities: [] },
  ] };
}
function shiftedDocument() {
  const interval = { activityId: 'LM-UT06-A001', start: '08:30', end: '09:20' };
  const after = { id: 'LM-UT06-S1', number: 1, date: '2099-05-07', state: '', intervals: [interval] };
  return { module: { code: 'LM' }, unit: { id: 'LM-UT06', code: 'UT06' }, sessions: [
    { ...after, activities: [{ id: interval.activityId, start: interval.start, end: interval.end }] },
  ], planningChanges: [{
    id: 'synthetic-approved-shift', approvedOn: '2099-05-01', reason: 'Ajuste ficticio aprobado', affectedUnitIds: ['LM-UT06'],
    beforeSessions: [{ ...after, date: '2099-05-04' }], afterSessions: [after], addedSessionIds: [], resolutions: [],
  }] };
}

test('one compact history button counts sessions once and does not turn legacy uncertainty into pending work', () => {
  const doc = legacyDocument(), before = JSON.stringify(doc), h = setup(doc);
  try {
    const signals = h.ui.statusNodes(doc);
    assert.equal(signals.children.length, 1);
    const button = signals.children[0];
    assert.equal(button.textContent, '↪ 2');
    assert.doesNotMatch(button.className, /plan-pending/);
    assert.match(button.attributes['aria-label'], /historial/i);
    assert.equal(button.attributes['aria-haspopup'], 'dialog');
    assert.equal(JSON.stringify(doc), before);
  } finally { h.restore(); }
});

test('only an explicit unresolved replanning request highlights the compact button', () => {
  const doc = legacyDocument(); doc.sessions[1].replanningPending = true;
  const h = setup(doc);
  try {
    const button = h.ui.statusNodes(doc).children[0];
    assert.equal(button.textContent, '↪ 2');
    assert.match(button.className, /plan-pending/);
    assert.match(button.attributes['aria-label'], /1 pendiente/i);
  } finally { h.restore(); }
});

test('date-shift trace remains accessible without inventing a cancelled-session count', () => {
  const doc = shiftedDocument(), h = setup(doc);
  try {
    const button = h.ui.statusNodes(doc).children[0];
    assert.equal(button.textContent, '↪');
    assert.match(button.attributes['aria-label'], /plan modificado/i);
    assert.doesNotMatch(button.className, /plan-pending/);
  } finally { h.restore(); }
});

test('session shortcut and summary open the same read-only trace without changing the draft', async () => {
  const doc = legacyDocument(), before = JSON.stringify(doc), h = setup(doc);
  try {
    const shortcut = h.ui.sessionSignal(doc, doc.sessions[0]);
    assert.equal(shortcut.textContent, '↪');
    assert.match(shortcut.attributes['aria-label'], /S1/);
    await shortcut.listeners.click();
    assert.equal(h.el('replanning-dialog').open, true);
    assert.ok(h.el('replanning-content').children.some(child => /históric/i.test(child.textContent)));
    h.el('replanning-close').listeners.click();
    assert.equal(h.el('replanning-dialog').open, false);
    await h.ui.statusNodes(doc).children[0].listeners.click();
    assert.equal(h.el('replanning-dialog').open, true);
    assert.equal(JSON.stringify(doc), before);
  } finally { h.restore(); }
});

test('a unit without replanning history does not show an empty action', () => {
  const doc = legacyDocument(); doc.sessions = [];
  const h = setup(doc);
  try { assert.equal(h.ui.statusNodes(doc).children.length, 0); }
  finally { h.restore(); }
});
