import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskNotesUI } from './task-notes-ui.mjs';
import { ConflictError, UnknownSaveError } from './core.mjs?v=20261102-task-notes-resources';

const copy = value => structuredClone(value);
function setup() {
  const previous = { document: globalThis.document, window: globalThis.window };
  const all = [];
  function element(tag) {
    const value = { tagName: tag.toUpperCase(), id: '', className: '', children: [], dataset: {}, attributes: {}, listeners: new Map(), value: '', open: false, hidden: false, disabled: false,
      append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; },
      setAttribute(name, text) { this.attributes[name] = text; },
      addEventListener(name, listener) { this.listeners.set(name, listener); },
      querySelectorAll(selector) { const tags = selector.split(',').map(t => t.trim().toUpperCase()), result = []; const walk = el => { for (const child of el.children ?? []) { if (tags.includes(child.tagName)) result.push(child); walk(child); } }; walk(this); return result; },
      showModal() { this.open = true; }, close() { this.open = false; }, focus() { globalThis.document.activeElement = this; },
      setCustomValidity(message) { this.validationMessage = message; }, reportValidity() { return !this.validationMessage; }
    }; all.push(value); return value;
  }
  const body = element('body'); globalThis.document = { createElement: element, body, activeElement: element('button') }; globalThis.window = { confirm: () => true };
  const entry = { moduleCode: 'LM', unitCode: 'UT02', unitId: 'LM-UT02', path: 'LM/UT02.json' };
  let remote = { sha: 'v1', document: { tasks: [{ id: 'task-1', code: '0201', title: 'Ejemplo ficticio', task: { corrected: false }, teachingNotes: { feedback: 'Anterior', improvements: [] } }],
    sessions: [{ activities: [{ observations: 'Guardado' }] }] } };
  let busy = false, writes = 0, failure = null, readFailure = false, saved = 0, verifyIssue = '', blocked = 0;
  let active = { path: entry.path, sha: remote.sha, savedDocument: copy(remote.document), draft: copy(remote.document), blocked: false };
  const row = { entry, officialTaskId: 'task-1', code: '0201', title: 'Ejemplo ficticio' };
  const store = { async load() { if (readFailure) throw new Error('synthetic'); return copy(remote); }, async save(document, sha) { writes++; assert.equal(sha, remote.sha); if (failure) throw failure; remote = { document: copy(document), sha: `v${writes + 1}` }; return { ...copy(remote), commitSha: 'one-commit' }; } };
  const ui = createTaskNotesUI({ isBusy: () => busy, setBusy: value => busy = value, unitStore: () => store, getActive: () => active,
    verifyRead: () => verifyIssue, onBlocked: () => { blocked++; }, onSaved: (task, result, prepared) => { saved++; if (task.entry.path === active.path) active = { ...active, sha: result.sha, savedDocument: result.document, draft: prepared.unitDraft }; } });
  ui.connect('synthetic-only');
  const el = suffix => all.find(item => item.id === 'task-notes-' + suffix);
  const event = async (suffix, name) => { await el(suffix).listeners.get(name)?.({ preventDefault() {} }); };
  return { ui, row, el, event, get active() { return active; }, get remote() { return remote; }, get writes() { return writes; }, get saved() { return saved; }, get blocked() { return blocked; },
    error: value => failure = value, readError: value => readFailure = value, verify: value => verifyIssue = value,
    cleanup() { ui.disconnect(); globalThis.document = previous.document; globalThis.window = previous.window; } };
}

test('independent task notes save closes and preserves pending Unit observation and tracking', async () => {
  const h = setup(); try {
    h.active.draft.sessions[0].activities[0].observations = 'Mi nota pendiente'; h.active.draft.tasks[0].task.corrected = true;
    await h.ui.open(h.row, 'feedback'); h.el('feedback').value = 'Nuevo feedback'; await h.event('feedback', 'input');
    await h.event('form', 'submit');
    assert.equal(h.writes, 1); assert.equal(h.saved, 1); assert.equal(h.ui.isOpen(), false); assert.equal(h.ui.hasPending(), false);
    assert.equal(h.remote.document.tasks[0].teachingNotes.feedback, 'Nuevo feedback'); assert.equal(h.remote.document.tasks[0].task.corrected, false);
    assert.equal(h.remote.document.sessions[0].activities[0].observations, 'Guardado');
    assert.equal(h.active.draft.sessions[0].activities[0].observations, 'Mi nota pendiente'); assert.equal(h.active.draft.tasks[0].task.corrected, true);
  } finally { h.cleanup(); }
});

test('close and reopen keep the exact notes draft and direct improvement entry selects its panel', async () => {
  const h = setup(); try {
    await h.ui.open(h.row, 'feedback'); h.el('feedback').value = 'Borrador con\nsalto'; await h.event('feedback', 'input');
    h.ui.close(); assert.equal(h.ui.hasPending(), true); assert.equal(h.ui.isOpen(), false);
    await h.ui.open(h.row, 'improvements'); assert.equal(h.el('feedback').value, 'Borrador con\nsalto');
    assert.equal(h.el('improvements-panel').hidden, false); assert.equal(h.el('feedback-panel').hidden, true); assert.equal(h.writes, 0);
    const other = copy(h.row); other.officialTaskId = 'task-2'; assert.equal(await h.ui.open(other), false);
    assert.equal(h.el('feedback').value, 'Borrador con\nsalto');
  } finally { h.cleanup(); }
});

test('conflicts and uncertain writes retain text and block every blind resend', async () => {
  for (const error of [new ConflictError(), new UnknownSaveError('synthetic')]) {
    const h = setup(); try {
      await h.ui.open(h.row); h.el('feedback').value = 'Conservar entero'; await h.event('feedback', 'input'); h.error(error);
      await h.event('form', 'submit'); assert.equal(h.writes, 1); assert.equal(h.ui.isOpen(), true); assert.equal(h.ui.isBlocked(), true);
      assert.equal(h.el('feedback').value, 'Conservar entero'); assert.equal(h.el('save').disabled, true);
      await h.event('form', 'submit'); assert.equal(h.writes, 1); h.readError(true); await h.event('reload', 'click');
      assert.equal(h.el('feedback').value, 'Conservar entero'); assert.equal(h.ui.isBlocked(), true); assert.equal(h.saved, 0);
    } finally { h.cleanup(); }
  }
});

test('a changed preparation context prevents saving before any request', async () => {
  const h = setup(); try {
    await h.ui.open(h.row); h.el('feedback').value = 'Pendiente'; await h.event('feedback', 'input'); h.verify('Preparación tiene otra base.');
    await h.event('form', 'submit'); assert.equal(h.writes, 0); assert.equal(h.ui.isBlocked(), true); assert.equal(h.ui.isOpen(), true);
    assert.match(h.el('message').textContent, /Preparación/); assert.equal(h.el('feedback').value, 'Pendiente');
  } finally { h.cleanup(); }
});

test('improvement proposals require text and are only persisted by explicit save', async () => {
  const h = setup(); try {
    await h.ui.open(h.row, 'improvements'); await h.event('add', 'click');
    const list = h.el('improvements-list'), input = list.querySelectorAll('textarea')[0], status = list.querySelectorAll('select')[0];
    await h.event('form', 'submit'); assert.equal(h.writes, 0);
    input.value = 'Aclarar este ejemplo'; await input.listeners.get('input')(); status.value = 'discarded'; await status.listeners.get('change')();
    await h.event('form', 'submit'); assert.equal(h.writes, 1); assert.equal(h.ui.isOpen(), false);
    const proposal = h.remote.document.tasks[0].teachingNotes.improvements[0]; assert.equal(proposal.text, 'Aclarar este ejemplo'); assert.equal(proposal.status, 'discarded'); assert.ok(proposal.id);
  } finally { h.cleanup(); }
});

test('an unfinished proposal is revealed before validation when Feedback is selected', async () => {
  const h = setup(); try {
    await h.ui.open(h.row, 'improvements'); await h.event('add', 'click');
    await h.event('feedback-tab', 'click'); assert.equal(h.el('improvements-panel').hidden, true);
    h.el('feedback').value = 'Feedback para guardar'; await h.event('feedback', 'input'); await h.event('form', 'submit');
    assert.equal(h.writes, 0); assert.equal(h.el('improvements-panel').hidden, false); assert.equal(h.el('feedback-panel').hidden, true);
    assert.equal(h.el('feedback').value, 'Feedback para guardar');
  } finally { h.cleanup(); }
});
