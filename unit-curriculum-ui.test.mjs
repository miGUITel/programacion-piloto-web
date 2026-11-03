import test from 'node:test';
import assert from 'node:assert/strict';
import { createUnitCurriculumUI } from './unit-curriculum-ui.mjs';

function setup() {
  const previous = globalThis.document, elements = new Map();
  function node() {
    return { children: [], listeners: {}, ownText: '', hidden: false, disabled: false, open: false,
      get textContent() { return this.ownText + this.children.map(child => child.textContent).join(' '); },
      set textContent(value) { this.ownText = value; this.children = []; },
      append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.ownText = ''; this.children = children; },
      addEventListener(name, callback) { this.listeners[name] = callback; },
      showModal() { this.open = true; }, close() { if (this.open) { this.open = false; this.listeners.close?.(); } }, focus() {},
    };
  }
  const el = id => { if (!elements.has(id)) elements.set(id, node()); return elements.get(id); };
  globalThis.document = { getElementById: el, createElement: node, addEventListener() {} };
  let fail = false, pending = null, busy = false, editing = false, reads = 0;
  const target = { module: { code: 'LM', profile: 'LM/module.json' }, document: { module: { code: 'LM' }, unit: { id: 'LM-UT02', code: 'UT02', title: 'Unidad sintética', notes: 'Nota pendiente', curriculumRefs: [{ raCode: '2', ceCodes: ['2.a'] }] } } };
  const profile = { module: { code: 'LM' }, annualPlan: { units: [] }, curriculum: { sourceLabel: 'Fuente sintética', outcomes: [{ code: '2', text: '<script>literal</script>', criteria: [{ code: '2.a', text: 'Criterio completo' }] }] } };
  const connection = { async loadModuleProfile() { reads++; if (pending) await pending; if (fail) throw Error('Synthetic'); return { document: profile }; } };
  const ui = createUnitCurriculumUI({ isBusy: () => busy, getConnection: () => connection, getTarget: () => target, otherEditorOpen: () => editing });
  return { el, ui, target, profile, get reads() { return reads; }, open: () => el('unit-curriculum-open').listeners.click(),
    refresh: () => el('unit-curriculum-refresh').listeners.click(), fail: value => fail = value,
    pause(value) { pending = value; }, setBusy(value) { busy = value; }, setEditing(value) { editing = value; }, cleanup() { globalThis.document = previous; } };
}

test('opening, refreshing and closing preserve the draft exactly and render module texts literally', async () => {
  const h = setup(), before = structuredClone(h.target);
  try {
    await h.open(); assert.equal(h.ui.isOpen(), true);
    assert.match(h.el('unit-curriculum-content').textContent, /<script>literal<\/script>/);
    assert.match(h.el('unit-curriculum-content').textContent, /Criterio completo/);
    await h.refresh(); h.el('unit-curriculum-hide').listeners.click();
    assert.equal(h.reads, 2); assert.equal(h.ui.isOpen(), false); assert.deepEqual(h.target, before);
  } finally { h.cleanup(); }
});

test('failed refresh clears old definitions, keeps notes and allows a successful retry', async () => {
  const h = setup(), before = structuredClone(h.target);
  try {
    await h.open(); h.fail(true); await h.refresh();
    assert.equal(h.el('unit-curriculum-content').textContent, '');
    assert.match(h.el('unit-curriculum-message').textContent, /No se han podido consultar/);
    assert.equal(h.el('unit-curriculum-refresh').disabled, false);
    h.fail(false); await h.refresh();
    assert.equal(h.el('unit-curriculum-message').hidden, true); assert.deepEqual(h.target, before);
  } finally { h.cleanup(); }
});

test('late reads after closing or clearing cannot leak stale content into another consultation', async () => {
  const h = setup(); let resume;
  try {
    h.pause(new Promise(resolve => resume = resolve)); const reading = h.open();
    assert.equal(h.el('unit-curriculum-refresh').disabled, true);
    h.el('unit-curriculum-close').listeners.click(); resume(); await reading;
    assert.equal(h.el('unit-curriculum-content').textContent, ''); assert.equal(h.ui.isOpen(), false);
    h.pause(null); await h.open(); h.ui.clear();
    assert.equal(h.el('unit-curriculum-content').textContent, '');
  } finally { h.cleanup(); }
});

test('missing profile and active editors do not trigger incorrect reads or edits', async () => {
  const h = setup();
  try {
    h.setBusy(true); await h.open(); h.setBusy(false); h.setEditing(true); await h.open();
    assert.equal(h.reads, 0); h.setEditing(false); delete h.target.module.profile; await h.open();
    assert.equal(h.reads, 0); assert.match(h.el('unit-curriculum-message').textContent, /pendiente de incorporar/);
  } finally { h.cleanup(); }
});
