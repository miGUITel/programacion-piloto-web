import test from 'node:test';
import assert from 'node:assert/strict';
import { taskBand, taskBandLabel } from './task-band.mjs?v=20261102-replanning-signals';

const fixture = () => ({ schemaVersion: 3, unit: { preparation: 'ready' }, tasks: [
  { id: 't3', code: '0203', title: 'Tercera', type: 'task', approved: true, resourceRefs: ['guide', 'statement', 'statement', 'solution', 'missing'] },
  { id: 't1', code: '0201', title: 'Primera', type: 'task', approved: true, resourceRefs: ['web', 'private-other', 'solution'] },
  { id: 't2', code: '0202', title: 'Segunda sin enlace', type: 'task', approved: true },
  { id: 'exam', code: '02', title: 'Examen completo', type: 'exam', approved: true, resourceRefs: ['test', 'practical', 'unclassified', 'exam-missing', 'statement'] },
  { id: 'unapproved', code: '0204', title: 'Borrador no aprobado', type: 'task', approved: false, resourceRefs: ['hidden'] },
], resources: [
  { id: 'guide', type: 'guide', audience: 'teacher', title: 'Ficha', location: { kind: 'github', path: 'LM/ficha.md' } },
  { id: 'statement', type: 'assignment', title: 'Enunciado', location: { kind: 'https', url: 'https://example.org/statement' } },
  { id: 'solution', type: 'solution', title: 'Solución' },
  { id: 'web', type: 'web', title: 'Web' },
  { id: 'private-other', type: 'other', audience: 'teacher', title: 'Otro privado' },
  { id: 'test', type: 'exam', examPart: 'test', title: 'Parte A' },
  { id: 'practical', type: 'exam', examPart: 'practical', title: 'Parte B' },
  { id: 'unclassified', type: 'exam', title: 'Test en el título no determina su parte' },
  { id: 'hidden', type: 'assignment', title: 'Oculto' },
] });

test('official stable codes shorten without renumbering and original list order is preserved', () => {
  const document = fixture(), before = structuredClone(document), band = taskBand(document);
  assert.deepEqual(band.tasks.map(task => [task.id, task.label]), [['t3', '03'], ['t1', '01'], ['t2', '02']]);
  document.tasks.splice(1, 1);
  assert.deepEqual(taskBand(document).tasks.map(task => task.label), ['03', '02']);
  assert.deepEqual(taskBandLabel('T1'), 'T1'); assert.equal(taskBandLabel('1'), '01');
  assert.equal(taskBandLabel('123'), '123'); assert.equal(taskBandLabel(''), 'Sin código');
  document.tasks.splice(1, 0, before.tasks[1]); assert.deepEqual(document, before);
});

test('explicit references choose statements and teacher guides, preserving identity without duplicating solutions', () => {
  const document = fixture(), before = structuredClone(document), band = taskBand(document);
  assert.deepEqual(band.tasks[0].resources.map(resource => resource.id), ['statement', 'guide']);
  assert.deepEqual(band.tasks[0].unresolved, ['missing']);
  assert.deepEqual(band.tasks[1].resources.map(resource => resource.id), ['web']);
  assert.deepEqual(band.tasks[2].resources, []);
  band.tasks[0].resources[0].title = 'UI-only change'; assert.deepEqual(document, before);
});

test('test and practical share one official exam, using explicit resource metadata only', () => {
  const document = fixture(), before = structuredClone(document), band = taskBand(document);
  assert.deepEqual(band.exams.map(exam => [exam.id, exam.label, exam.resources.map(resource => resource.id)]), [
    ['test', 'Test', ['test']], ['practical', 'Práctico', ['practical']],
  ]);
  for (const exam of band.exams) {
    assert.deepEqual(exam.unclassified.map(resource => resource.id), ['unclassified']);
    assert.deepEqual(exam.unresolved, ['exam-missing']);
  }
  assert.equal(document.tasks.filter(task => task.type === 'exam').length, 1); assert.deepEqual(document, before);
});

test('exam resources deduplicate across official exams and unlinked resources never enter the band', () => {
  const document = fixture(); document.tasks.push({ ...document.tasks[3], id: 'another-exam' });
  document.resources.push({ id: 'unlinked', type: 'exam', examPart: 'test' });
  assert.deepEqual(taskBand(document).exams[0].resources.map(resource => resource.id), ['test']);
});

test('approval compatibility is retained and a repeated task ID never produces a second tile', () => {
  const document = fixture(); document.tasks.push({ ...document.tasks[0] });
  document.tasks[4].taskPresented = true;
  assert.deepEqual(taskBand(document).tasks.map(task => task.id), ['t3', 't1', 't2', 'unapproved']);
  const legacy = { schemaVersion: 2, unit: { preparation: 'ready' }, tasks: [{ id: 'old', code: '0105', title: 'Anterior' }] };
  assert.deepEqual(taskBand(legacy).tasks.map(task => task.label), ['05']);
  legacy.unit.preparation = 'draft'; assert.deepEqual(taskBand(legacy).tasks, []);
});

test('no official list means no inferred tasks; exam destinations stay empty placeholders', () => {
  const document = { unit: {}, sessions: [{ activities: [{ eventType: 'task', title: 'Tarea 1' }] }] };
  assert.deepEqual(taskBand(document).tasks, []); assert.equal(taskBand(document).exams.length, 2);
  assert.ok(taskBand(document).exams.every(exam => !exam.resources.length && !exam.unclassified.length));
  assert.deepEqual(taskBand(null), { tasks: [], exams: [] });
});

test('task tiles use their explicit preparation and both parts of a single exam share its status', () => {
  const document=fixture();document.tasks[0].preparation='ready';document.tasks[1].preparation='draft';
  const before=structuredClone(document),band=taskBand(document);
  assert.deepEqual(band.tasks.map(task=>task.prepared),[true,false,false]);
  assert.ok(band.exams.every(exam=>!exam.prepared&&exam.known));
  document.tasks[3].preparation='ready';assert.ok(taskBand(document).exams.every(exam=>exam.prepared));
  delete document.tasks[3].preparation;assert.ok(taskBand(document).exams.every(exam=>!exam.prepared));
  document.tasks[3].preparation=before.tasks[3].preparation;delete document.tasks[3].preparation;assert.deepEqual(document,before);
});

test('exam parts require all their explicit owners ready; unclassified links never infer a part', () => {
  const document=fixture();document.tasks[3].preparation='ready';
  document.tasks.push({id:'exam2',code:'02-extra',title:'Otro test',type:'exam',approved:true,preparation:'draft',resourceRefs:['test']});
  let band=taskBand(document);assert.equal(band.exams[0].prepared,false);assert.equal(band.exams[1].prepared,true);
  document.tasks[5].preparation='ready';assert.ok(taskBand(document).exams.every(exam=>exam.prepared));
  document.resources.find(resource=>resource.id==='test').examPart=undefined;
  band=taskBand(document);
  assert.deepEqual(band.exams.map(exam=>[exam.id,exam.label,exam.prepared,exam.known]),[
    ['practical','Práctico',true,true],['exam2','02-extra',true,true],
  ]);
});

const official = (id, examPart, preparation = 'ready', resourceRefs = []) => ({
  id, code: id, title: `Examen ${id}`, type: 'exam', approved: true, preparation, resourceRefs,
  ...(examPart ? { examPart } : {}),
});
const examDocument = (tasks, resources = []) => ({ schemaVersion: 3, module: { code: 'SR' }, unit: { preparation: 'ready' }, tasks, resources });
const teacherGuide = id => ({ id, type: 'guide', audience: 'teacher', title: `Ficha ${id}`,
  location: { kind: 'github', repository: 'miGUITel/programacion-piloto-datos', path: `SR/${id}.md`, ref: 'main' } });

test('official parts reflect each exam preparation even without resources or quiz URLs', () => {
  const document = examDocument([official('03te','test'), official('03ex','practical','draft')]);
  const before = structuredClone(document), band = taskBand(document);
  assert.deepEqual(band.exams.map(exam => [exam.id, exam.prepared, exam.known, exam.ownerIds]), [
    ['test', true, true, ['03te']], ['practical', false, true, ['03ex']],
  ]);
  assert.ok(band.exams.every(exam => !exam.resources.length));
  assert.deepEqual(document, before);
});

test('one official both exam uses its single preparation for both parts', () => {
  const document = examDocument([official('complete','both')]);
  assert.deepEqual(taskBand(document).exams.map(exam => [exam.examPart, exam.prepared]), [['test',true],['practical',true]]);
  document.tasks[0].preparation = 'draft';
  assert.ok(taskBand(document).exams.every(exam => !exam.prepared && exam.known));
});

test('official part takes precedence over conflicting resource metadata without title or code inference', () => {
  const document = examDocument([{ ...official('03te','practical'), title: 'Examen tipo test', resourceRefs: ['misleading','legacy'] }], [
    { id: 'misleading', type: 'exam', examPart: 'test', title: 'Test', location: { kind: 'https', url: 'https://example.org/test' } },
    { id: 'legacy', type: 'exam', title: 'Prueba archivada' },
  ]);
  const band = taskBand(document);
  assert.deepEqual(band.exams.map(exam => [exam.id, exam.ownerIds, exam.prepared]), [['practical',['03te'],true]]);
  assert.deepEqual(band.exams[0].resources.map(resource => resource.id), ['legacy']);
  document.resources[0].examPart = 'practical'; document.resources[1].examPart = 'test';
  assert.deepEqual(taskBand(document).exams.map(exam => [exam.id, exam.prepared]), [['practical',true]]);
});

test('unclassified official exams keep their ID, literal code and preparation instead of invented parts', () => {
  const document = examDocument([
    { ...official('exam-t'), code: '03te', title: 'Examen test' },
    { ...official('exam-p',null,'draft'), code: '03ex', title: 'Práctico' },
  ]);
  const band = taskBand(document);
  assert.deepEqual(band.exams.map(exam => [exam.id,exam.label,exam.title,exam.prepared,exam.examPart]), [
    ['exam-t','03te','Examen test',true,undefined],['exam-p','03ex','Práctico',false,undefined],
  ]);
  assert.ok(band.exams.every(exam => exam.known));
});

test('classified and unclassified exams coexist without duplicate owners or empty fabricated parts', () => {
  const unknown = official('unknown'), testExam = official('known','test');
  const document = examDocument([unknown,testExam,{ ...unknown }]);
  assert.deepEqual(taskBand(document).exams.map(exam => [exam.id,exam.ownerIds]), [
    ['test',['known']],['unknown',['unknown']],
  ]);
});

test('accessible private teacher guide is reused by both parts and isolates navigation from old missing refs', () => {
  const guide = teacherGuide('exam-guide');
  const document = examDocument([official('complete','both','ready',['test-old','missing','exam-guide','exam-guide'])], [
    guide, { id: 'test-old', type: 'exam', title: 'Archivo sin clasificar' },
  ]);
  const before = structuredClone(document), band = taskBand(document);
  for (const exam of band.exams) {
    assert.equal(exam.prepared, true);
    assert.deepEqual(exam.resources.map(resource => resource.id), ['exam-guide']);
    assert.deepEqual(exam.accessWarnings, []);
    assert.deepEqual(exam.unresolved, ['missing']);
    assert.deepEqual(exam.unclassified.map(resource => resource.id), ['test-old']);
  }
  band.exams[0].resources[0].location.path = 'UI-only.md'; band.exams[0].ownerIds.push('not-real');
  assert.deepEqual(document, before);
});

test('guide-only unclassified exam stays prepared and opens its own guide without inventing a part', () => {
  const document = examDocument([{ ...official('record',null,'ready',['private-guide']), code: '03ia' }], [teacherGuide('private-guide')]);
  const [exam] = taskBand(document).exams;
  assert.equal(exam.id, 'record'); assert.equal(exam.label, '03ia'); assert.equal(exam.examPart, undefined);
  assert.equal(exam.prepared, true); assert.deepEqual(exam.resources.map(resource => resource.id), ['private-guide']);
});

test('teacher guides take global navigation priority, shared guides deduplicate and all owners must be ready', () => {
  const document = examDocument([
    official('first','test','ready',['shared']), official('second','test','draft',['shared','second-guide']),
    official('third','test','ready',['legacy-test','missing-archive']),
  ], [teacherGuide('shared'),teacherGuide('second-guide'),{ id:'legacy-test',type:'exam',examPart:'test' }]);
  const [exam] = taskBand(document).exams;
  assert.equal(exam.prepared, false);
  assert.deepEqual(exam.ownerIds, ['first','second','third']);
  assert.deepEqual(exam.resources.map(resource => resource.id), ['shared','second-guide']);
  assert.deepEqual(exam.accessWarnings, []); assert.deepEqual(exam.unresolved, ['missing-archive']);
  document.tasks[1].preparation = 'ready'; assert.equal(taskBand(document).exams[0].prepared, true);
});

test('student guides and inaccessible teacher guides do not displace available exam navigation', () => {
  const document = examDocument([official('test','test','ready',['student-guide','broken-guide','exam-file'])], [
    { ...teacherGuide('student-guide'),audience:'students' },
    { ...teacherGuide('broken-guide'),location:{kind:'workspace',path:'exam.md'} },
    { id:'exam-file',type:'exam',examPart:'test',location:{kind:'https',url:'https://example.org/exam'} },
  ]);
  assert.deepEqual(taskBand(document).exams[0].resources.map(resource => resource.id), ['exam-file']);
});
