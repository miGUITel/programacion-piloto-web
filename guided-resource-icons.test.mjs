import test from 'node:test';
import assert from 'node:assert/strict';
import { validateResources } from './resources.mjs?v=20261102-ppt-guided-icons';
import { resourceGroup, groupRowResources, createRowResourcesUI } from './row-resources-ui.mjs?v=20261102-ppt-guided-icons';

const resource = (id, type, extra = {}) => ({ id, type, title: id, location: { kind: 'https', url: `https://example.org/${id}.html` }, ...extra });

function withDom(run) {
  const previous = globalThis.document;
  const node = tag => ({ tag, children: [], dataset: {}, attributes: {}, listeners: {}, classList: { toggle() {} },
    append(...children) { this.children.push(...children); },
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(type, action) { this.listeners[type] = action; } });
  globalThis.document = { createElement: node, createElementNS: (ns, tag) => ({ ...node(tag), namespaceURI: ns }), body: node('body') };
  try { return run(node); } finally { globalThis.document = previous; }
}

test('guided examples have an explicit optional classification, preserving old documents', () => {
  for (const exampleKind of ['guided', 'original']) assert.deepEqual(validateResources([resource('e', 'example', { exampleKind })]), []);
  assert.deepEqual(validateResources([resource('old', 'example')]), []);
  for (const item of [resource('bad', 'example', { exampleKind: 'interactive' }), resource('bad', 'notes', { exampleKind: 'guided' }), resource('bad', 'web', { exampleKind: 'guided' })]) assert.ok(validateResources([item]).some(error => error.includes('exampleKind')));
});

test('only explicit guided metadata uses the flask; original examples and notes retain the book', () => {
  assert.equal(resourceGroup(resource('guided', 'example', { exampleKind: 'guided' })), 'guided-example');
  for (const item of [resource('old', 'example'), resource('original', 'example', { exampleKind: 'original' }), resource('notes', 'notes')]) assert.equal(resourceGroup(item), 'notes');
});

test('titles, URLs and IDs cannot silently classify an example as guided', () => {
  const item = resource('LM-UT03-R-cascada-guiado', 'example', { title: 'Ejemplo guiado · Cascada', location: { kind: 'https', url: 'https://miguitel.github.io/LM/03/ejemplos_guiados/cascada.html' } });
  assert.equal(resourceGroup(item), 'notes');
  assert.equal(resourceGroup({ ...item, exampleKind: 'guided' }), 'guided-example');
});

test('grouping keeps academic identities, metadata and resource references unchanged', () => {
  const examples = [resource('old', 'example', { custom: { retained: true } }), resource('guided', 'example', { exampleKind: 'guided', version: 'v1' })];
  const before = structuredClone(examples);
  const groups = groupRowResources(examples);
  assert.deepEqual(groups.map(group => group.id), ['notes', 'guided-example']);
  assert.equal(groups[1].resources[0], examples[1]);
  assert.deepEqual(examples, before);
});

test('assignment, PPT, notes and guided examples remain four directly accessible icons', () => withDom(node => {
  const items = [resource('task', 'assignment'), resource('ppt', 'presentation'), resource('notes', 'notes'), resource('guided', 'example', { exampleKind: 'guided' })];
  const before = structuredClone(items), cell = node('div');
  const ui = createRowResourcesUI({ isBusy: () => false, canOpen: () => true, openPrivate() {} });
  ui.render(cell, items, 'LM');
  assert.deepEqual(cell.children.map(item => item.dataset.resourceGroup), ['assignment', 'presentation', 'notes', 'guided-example']);
  assert.ok(cell.children.every(item => item.tag === 'a'));
  const flask = cell.children[3].children[0], book = cell.children[2].children[0];
  assert.equal(flask.tag, 'svg');
  assert.equal(flask.children[0].attributes.d, 'M9 3h6M10 3v7L4 20h16l-6-10V3');
  assert.notEqual(flask.children[0].attributes.d, book.children[0].attributes.d);
  assert.equal(cell.children[3].attributes['aria-label'], 'Ejemplo guiado: guided');
  assert.deepEqual(items, before);
}));

test('more than four types use three direct icons and one grouped access', () => withDom(node => {
  const cell = node('div'), ui = createRowResourcesUI({ isBusy: () => false, canOpen: () => true, openPrivate() {} });
  ui.render(cell, [resource('task', 'assignment'), resource('ppt', 'presentation'), resource('notes', 'notes'), resource('guided', 'example', { exampleKind: 'guided' }), resource('tool', 'tool')], 'LM');
  assert.equal(cell.children.length, 4);
  assert.deepEqual(cell.children.slice(0, 3).map(item => item.dataset.resourceGroup), ['assignment', 'presentation', 'notes']);
  assert.equal(cell.children[3].attributes['aria-label'], 'Más tipos de recurso');
  assert.equal(cell.children[3].tag, 'button');
}));
