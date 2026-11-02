import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTaskBand } from './task-band-ui.mjs?v=20261102-task-notes-resources';

function node(tagName) {
  const classes = new Set();
  return { tagName: tagName.toUpperCase(), dataset: {}, children: [], attrs: {}, title: '',
    classList: { add: (...names) => names.forEach(name => classes.add(name)), contains: name => classes.has(name) },
    append(child) { this.children.push(child); }, replaceChildren() { this.children = []; },
    setAttribute(name, value) { this.attrs[name] = value; },
  };
}
function render(tasks = [], resources = [], { busy = false, document = true } = {}) {
  const oldDocument = globalThis.document;
  globalThis.document = { createElement: node };
  const section = node('section'), list = node('ol'), accesses = [];
  const data = document ? { schemaVersion:3,module:{code:'SR'},unit:{preparation:'ready'},tasks,resources } : null;
  try {
    renderTaskBand(section,list,data,{
      resourceUI: { access(options) { const element = node('button'); element.title = options.title; accesses.push({ ...options, element }); return element; } },
      isBusy: () => busy, onManage() {},
    });
  } finally { globalThis.document = oldDocument; }
  return { section,list,accesses,data };
}
const official = (id, examPart, preparation = 'ready', resourceRefs = []) => ({
  id,code:id,title:`Examen ${id}`,type:'exam',approved:true,preparation,resourceRefs,
  ...(examPart ? {examPart} : {}),
});
const guide = { id:'private-guide',type:'guide',audience:'teacher',title:'Ficha del examen',
  location:{kind:'github',repository:'miGUITel/programacion-piloto-datos',path:'SR/ficha.md',ref:'main'} };

test('ready exam tiles stay prepared without a quiz URL while retaining dashed unavailable access', () => {
  const tasks = [official('test','test'),official('practical','practical')], before = structuredClone(tasks);
  const { list,accesses } = render(tasks);
  assert.deepEqual(accesses.map(access => access.label), ['T','P']);
  assert.deepEqual(list.children.map(cell => cell.dataset), [{examPart:'test'},{examPart:'practical'}]);
  for(const access of accesses) {
    assert.equal(access.element.classList.contains('task-not-ready'), false);
    assert.equal(access.element.classList.contains('task-band-unlinked'), true);
    assert.match(access.element.title,/Preparado.*Sin enlace/);
    assert.match(access.emptyMessage,/no necesita un enlace/);
    assert.equal(access.element.attrs['aria-label'],access.element.title);
  }
  assert.deepEqual(tasks,before);
});

test('one available private guide supplies both part tiles without stale links blocking direct access', () => {
  const { accesses } = render([official('both','both','ready',['private-guide','missing','old'])],[guide,{id:'old',type:'exam',title:'Archivo'}]);
  assert.equal(accesses.length,2);
  for(const access of accesses) {
    assert.deepEqual(access.resources,[guide]); assert.deepEqual(access.unresolved,[]);
    assert.equal(access.element.classList.contains('task-band-unlinked'),false);
    assert.equal(access.element.classList.contains('task-not-ready'),false);
  }
});

test('one teacher guide opens directly even when another owner has only an old bank and unresolved refs', () => {
  const { accesses } = render([
    official('record','test','ready',['private-guide']), official('bank','test','ready',['legacy','missing']),
  ],[guide,{id:'legacy',type:'exam',examPart:'test',location:{kind:'https',url:'https://example.org/old.xml'}}]);
  assert.equal(accesses.length,1); assert.deepEqual(accesses[0].resources,[guide]);
  assert.deepEqual(accesses[0].unresolved,[]);
  assert.equal(accesses[0].element.classList.contains('task-band-unlinked'),false);
});

test('unclassified official exam shows its own literal code, title, ID and preparation', () => {
  const { accesses,list } = render([{...official('exam-id'),code:'03te',title:'Nombre real'}]);
  assert.equal(accesses.length,1); assert.equal(accesses[0].label,'03te');
  assert.match(accesses[0].title,/03te · Nombre real · Preparado/);
  assert.deepEqual(list.children[0].dataset,{examId:'exam-id'});
  assert.equal(accesses[0].element.classList.contains('task-not-ready'),false);
});

test('readiness and resource availability vary independently for each official exam', () => {
  const { accesses } = render([official('test','test','draft',['private-guide']),official('practical','practical','ready')],[guide]);
  assert.equal(accesses[0].element.classList.contains('task-not-ready'),true);
  assert.equal(accesses[0].element.classList.contains('task-band-unlinked'),false);
  assert.equal(accesses[1].element.classList.contains('task-not-ready'),false);
  assert.equal(accesses[1].element.classList.contains('task-band-unlinked'),true);
});

test('units without official exams retain clearly unassociated T/P placeholders', () => {
  const { accesses } = render();
  assert.deepEqual(accesses.map(access => access.label),['T','P']);
  assert.ok(accesses.every(access => /Sin examen asociado/.test(access.title)));
  assert.ok(accesses.every(access => /lista oficial/.test(access.emptyMessage)));
});

test('task appearance remains independent, controls disable while saving and missing unit clears the band', () => {
  const { accesses,list } = render([{id:'task',code:'0301',title:'Hosts',type:'task',approved:true,preparation:'ready'}],[],{busy:true});
  assert.equal(accesses[0].label,'01'); assert.deepEqual(list.children[0].dataset,{taskId:'task'});
  assert.equal(accesses[0].element.classList.contains('task-not-ready'),false);
  assert.ok(accesses.every(access => access.element.disabled));
  const empty = render([],[],{document:false});
  assert.equal(empty.section.hidden,true); assert.equal(empty.list.children.length,0); assert.equal(empty.accesses.length,0);
});
