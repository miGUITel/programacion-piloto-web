import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionRowResources } from './session-resource-defaults.mjs';
import { rowResources, effectiveResourceDestinations } from './resources.mjs?v=20261102-ppt-guided-icons';

const clone = value => structuredClone(value);
const freeze = value => { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } return value; };
function fixture(code = 'SR') {
  const first = { id: `${code}-UT01-A001`, kind: 'Cabecera', resourceRefs: [] };
  const second = { id: `${code}-UT01-A002`, kind: 'Actividad', resourceRefs: [] };
  const session = { id: `${code}-session`, number: 1, state: '', activities: [first, second] };
  const document = { module: { code }, unit: { id: `${code}-UT01` }, sessions: [session], resources: [], tasks: [] };
  const folder = { id: `${code}-ppt-folder`, title: `PPT ${code}`, type: 'presentation', role: 'presentation-folder', audience: 'both', location: { kind: 'https', url: `https://1drv.ms/f/c/fictitious-${code}`, public: true } };
  return { document, session, first, second, moduleResources: [folder] };
}

test('all five modules receive their own implicit public PPT link only on the initial activity', () => {
  for (const code of ['SR', 'PRO', 'SOS', 'ED', 'LM']) {
    const f = fixture(code), before = clone(f); freeze(f);
    const initial = sessionRowResources(f.document, f.session, f.first, [], f.moduleResources);
    assert.equal(initial.resources.length, 1);
    assert.equal(initial.resources[0].location.url, f.moduleResources[0].location.url);
    assert.equal(sessionRowResources(f.document, f.session, f.second, [], f.moduleResources).resources.length, 0);
    assert.deepEqual(f, before);
  }
});

test('existing local or HTTPS PPT references and the default share one visible public destination', () => {
  const f = fixture();
  f.document.resources = [
    { id: 'deck-one', title: 'Slides', type: 'presentation', location: { kind: 'workspace', path: 'PPT/example.pptx' } },
    { id: 'deck-two', title: 'More slides', type: 'presentation', audience: 'teacher', location: { kind: 'https', url: 'https://example.test/slides.pptx' } }
  ];
  f.first.resourceRefs = ['deck-one', 'deck-two'];
  const before = clone(f); freeze(f);
  const initial = sessionRowResources(f.document, f.session, f.first, [], f.moduleResources);
  assert.equal(initial.resources.length, 1);
  assert.equal(initial.resources[0].id, 'deck-one');
  assert.equal(effectiveResourceDestinations(initial.resources, f.moduleResources).length, 1);
  assert.deepEqual(f, before);
});

test('explicit secondary-activity resources and private readers remain intact', () => {
  const f = fixture();
  const privateSlides = { id: 'private', title: 'Private guidance', type: 'presentation', audience: 'teacher', location: { kind: 'github', repository: 'example/private', path: 'guide.md' } };
  const notes = { id: 'notes', title: 'Notes', type: 'notes', location: { kind: 'https', url: 'https://example.test/notes.html' } };
  f.document.resources = [privateSlides, notes];
  f.first.resourceRefs = ['private']; f.second.resourceRefs = ['notes'];
  const initial = sessionRowResources(f.document, f.session, f.first, [], f.moduleResources);
  assert.equal(initial.resources.length, 2);
  assert.equal(initial.resources.find(r => r.id === 'private'), privateSlides);
  assert.deepEqual(sessionRowResources(f.document, f.session, f.second, [], f.moduleResources), rowResources(f.document, f.session, f.second));
});

test('a missing, ambiguous or non-public folder creates no fabricated shortcut', () => {
  const f = fixture();
  for (const resources of [[], [...f.moduleResources, clone(f.moduleResources[0])], [{ ...f.moduleResources[0], location: { ...f.moduleResources[0].location, public: false } }]]) {
    assert.deepEqual(sessionRowResources(f.document, f.session, f.first, [], resources), rowResources(f.document, f.session, f.first));
  }
  assert.equal(sessionRowResources(f.document, { activities: [] }, undefined, [], f.moduleResources).resources.length, 0);
});

test('cancelled and reprogrammed histories still receive the first-activity shortcut without changing their state', () => {
  for (const state of ['Cancelada', 'Reprogramada', 'Impartida']) {
    const f = fixture(); f.session.state = state; const before = clone(f); freeze(f);
    assert.equal(sessionRowResources(f.document, f.session, f.first, [], f.moduleResources).resources.length, 1);
    assert.deepEqual(f, before);
  }
});

test('shared physical sessions keep each unit own first portion and preserve unresolved references', () => {
  const a = fixture(), b = fixture(); b.document.unit.id = 'SR-UT02';
  b.first.id = 'SR-UT02-A001'; b.second.id = 'SR-UT02-A002'; b.session.id = a.session.id;
  a.first.resourceRefs = ['missing'];
  const records = [{ document: b.document }], before = clone({ a, b }); freeze(a); freeze(b);
  const initial = sessionRowResources(a.document, a.session, a.first, records, a.moduleResources);
  assert.equal(initial.resources.length, 1); assert.deepEqual(initial.unresolved, ['SR-UT01:missing']);
  assert.equal(sessionRowResources(b.document, b.session, b.first, [{ document: a.document }], b.moduleResources).resources.length, 1);
  assert.equal(sessionRowResources(b.document, b.session, b.second, [{ document: a.document }], b.moduleResources).resources.length, 0);
  assert.deepEqual({ a, b }, before);
});
