import test from 'node:test';
import assert from 'node:assert/strict';
import {addDays,weekStart,buildWeekSchedule} from './weekly-schedule.mjs';

const slot=(moduleCode,weekday=1,start='08:30',end='09:25')=>({id:`${moduleCode}-${weekday}-${start}`,type:'teaching',moduleCode,weekday,start,end});
function common(weekly=[slot('SR')]) {
  return {course:{startsOn:'2026-01-01',endsOn:'2026-12-31'},modules:['SR','LM','ED','PRO','SOS'].map(code=>({code,group:code==='SR'?'2.º SMR':'1.º DAM'})),
    timetable:{effectiveFrom:'2026-01-01',weekly,exceptions:[],periods:[{number:1,start:'08:30',end:'09:25'},{number:2,start:'09:25',end:'10:20'},{number:3,start:'10:20',end:'11:15'},{number:4,start:'11:45',end:'12:40'},{number:5,start:'12:40',end:'13:35'},{number:6,start:'13:35',end:'14:30'}]},calendar:{nonTeaching:[],evaluations:[]}};
}
const activity=(id,start='08:30',end='09:25',extra={})=>({id,start,end,...extra});
function record(moduleCode='SR',unitCode='UT01',sessions=[{id:'s1',number:1,date:'2026-11-02',activities:[activity('a1')],resourceRefs:['ppt']}]) {
  return {entry:{moduleCode,unitCode,unitId:`${moduleCode}-${unitCode}`,path:`${moduleCode}/${unitCode}.json`},document:{schemaVersion:3,module:{code:moduleCode},unit:{id:`${moduleCode}-${unitCode}`,code:unitCode,title:'DNS',resourcePreparation:{ppt:'Listo'}},resources:[{id:'ppt',type:'presentation',title:'PPT'},{id:'web',type:'web',title:'Web'}],tasks:[],sessions}};
}
function catalog(records) {return {modules:[...new Set(records.map(r=>r.entry.moduleCode))].map(code=>({code,units:records.filter(r=>r.entry.moduleCode===code).map(r=>({code:r.entry.unitCode,id:r.entry.unitId,path:r.entry.path}))}))};}
const build=(records,course=common(),extra={})=>buildWeekSchedule({catalog:catalog(records),common:course,records,anchorOn:'2026-11-02',today:'2026-11-01',...extra});
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

test('week navigation uses date-only arithmetic across months, years and DST',()=>{
  assert.equal(weekStart('2026-11-01'),'2026-10-26');assert.equal(weekStart('2026-11-02'),'2026-11-02');
  assert.equal(addDays('2026-12-31',1),'2027-01-01');assert.equal(addDays('2026-03-28',2),'2026-03-30');assert.equal(addDays('2026-10-24',2),'2026-10-26');
  assert.throws(()=>weekStart('2026-02-30'),TypeError);assert.throws(()=>addDays('2026-11-02',.5),TypeError);
});

test('the four preparation states are derived from resources, never legacy checks or delivery',()=>{
  const ready=record(),draft=record('LM'),pending=record('ED'),unknown=record('PRO');
  draft.document.sessions[0].resourceRefs=['web'];
  pending.document.unit.resourcePreparation={};pending.document.sessions[0].preparation='ready';pending.document.sessions[0].state='Impartida';
  unknown.document.sessions[0].resourceRefs=[];
  const records=[ready,draft,pending,unknown];
  for(let i=0;i<records.length;i++){records[i].document.sessions[0].activities[0].start=['08:30','09:25','10:20','11:45'][i];records[i].document.sessions[0].activities[0].end=['09:25','10:20','11:15','12:40'][i];}
  const course=common(records.map((r,i)=>slot(r.entry.moduleCode,1,r.document.sessions[0].activities[0].start,r.document.sessions[0].activities[0].end)));
  const model=build(records,course);assert.deepEqual(model.days[0].items.map(i=>i.state),['ready','draft','pending','unknown']);
  assert.equal(model.issues.length,0);assert.equal(pending.document.sessions[0].preparation,'ready');
});

test('real contiguous intervals merge, recesses remain split, and reads never mutate inputs',()=>{
  const r=record('LM','UT02',[{id:'physical',number:1,date:'2026-11-02',resourceRefs:['ppt'],activities:[activity('a1','10:20','10:45'),activity('a2','10:45','11:15'),activity('a3','11:45','12:10'),activity('a4','12:10','12:40')]}]);
  const course=common([slot('LM',1,'10:20','11:15'),slot('LM',1,'11:45','12:40')]);
  const input={catalog:catalog([r]),common:course,records:[r],anchorOn:'2026-11-02',today:'2026-11-01'},before=structuredClone(input);freeze(input);
  const model=buildWeekSchedule(input);assert.deepEqual(model.days[0].items.map(i=>[i.start,i.end]),[['10:20','11:15'],['11:45','12:40']]);
  assert(model.boundaries.includes(675)&&model.boundaries.includes(705));assert.deepEqual(input,before);
});

test('presentations, continued tasks and exams use official identities and explicit links',()=>{
  const r=record('SR','UT01',[
    {id:'first',date:'2026-11-02',activities:[activity('a1')]},
    {id:'next',date:'2026-11-03',activities:[activity('a2','08:30','09:25',{taskRefs:['t']})]},
    {id:'exam',date:'2026-11-04',activities:[activity('a3')]},
    {id:'manual',date:'2026-11-05',eventTypes:['exam'],activities:[activity('a4')]},
  ]);
  r.document.tasks=[{id:'t',type:'task',code:'0101',title:'Tarea',approved:true,preparation:'ready',presentation:{sessionId:'first'}},{id:'e',type:'exam',code:'01TEST',title:'Test',approved:true,preparation:'draft',presentation:{sessionId:'exam'}}];
  const model=build([r],common([1,2,3,4].map(day=>slot('SR',day))));
  assert.deepEqual(model.days.slice(0,4).map(day=>day.items[0].taskLabel),['0101','↳0101','Examen 01TEST','Examen']);
  assert.equal(model.days[1].items[0].taskMarkers[0].continuation,true);assert.equal(model.days[2].items[0].state,'draft');assert.equal(model.days[3].items[0].state,'unknown');
});

test('a shared physical SessionID joins adjacent UT pieces without duplicating the class',()=>{
  const first=record('SR','UT01'),second=record('SR','UT02');second.document.unit.title='HTML';
  second.document.sessions[0].activities=[activity('a2','09:25','10:20')];
  const model=build([first,second],common([slot('SR',1,'08:30','10:20')])),items=model.days[0].items;
  assert.equal(items.length,1);assert.equal(items[0].start,'08:30');assert.equal(items[0].end,'10:20');assert.equal(items[0].sources.length,2);assert.equal(items[0].keyword,'DNS / HTML');assert.equal(items[0].state,'ready');
  second.document.sessions[0].activities[0].start='09:00';const conflict=build([first,second],common([slot('SR',1,'08:30','10:20')]));
  assert.equal(conflict.days[0].items[0].state,'unknown');assert(conflict.issues.some(issue=>issue.includes('solapadas')));
});

test('shared identities with different dates or incompatible states remain visible as uncertain',()=>{
  const first=record(),second=record('SR','UT02');second.document.sessions[0].date='2026-11-03';
  let model=build([first,second],common([slot('SR'),slot('SR',2)]));assert(model.issues.some(i=>i.includes('fechas incompatibles')));assert.equal(model.days[0].items[0].state,'unknown');assert.equal(model.days[1].items[0].state,'unknown');
  second.document.sessions[0].date='2026-11-02';second.document.sessions[0].state='Cancelada';
  model=build([first,second]);assert(model.issues.some(i=>i.includes('estados incompatibles')));assert.equal(model.days[0].items[0].state,'unknown');
});

test('known empty planning differs from unavailable units and cannot turn pale or red by inference',()=>{
  const r=record();r.document.sessions=[];
  let model=build([r]);assert.equal(model.days[0].items[0].label,'SR · Sin planificar');assert.equal(model.days[0].items[0].state,'unknown');
  model=build([],common(),{catalog:catalog([r]),failures:['SR/UT01.json']});assert.equal(model.days[0].items[0].label,'SR · No disponible');
  const ready=record('SR','UT02');model=build([ready],common(),{catalog:catalog([r,ready]),failures:['SR/UT01.json']});assert.equal(model.days[0].items[0].state,'unknown');
});

test('holiday, course bounds and module limits do not create fictitious classes',()=>{
  const course=common();course.calendar.nonTeaching=[{from:'2026-11-02',through:'2026-11-02',title:'No lectivo'}];
  let model=build([],course);assert.equal(model.days[0].nonTeaching,'No lectivo');assert.equal(model.days[0].items.length,0);
  const r=record();model=build([r],course);assert.equal(model.days[0].items.length,1);assert.equal(model.days[0].items[0].state,'unknown');assert(model.issues.some(i=>i.includes('No lectivo')));
  const past=common();past.course.endsOn='2026-10-31';model=build([],past);assert.equal(model.days[0].nonTeaching,'Fuera del curso');assert.equal(model.days[0].items.length,0);
  const limited=common();limited.calendar.evaluations=[{limitsOrdinaryTeaching:true,scope:'selected-groups',groups:['2.º SMR'],on:'2026-11-20',programmingEndOn:'2026-11-01'}];
  assert.equal(build([],limited).days[0].items.length,0);
  limited.calendar.evaluations[0].limitsOrdinaryTeaching=false;assert.equal(build([],limited).days[0].items.length,1);
});

test('the ordinary timetable is not extrapolated before its validity; only explicit exceptions apply',()=>{
  const course=common([slot('SR'),slot('LM',1,'10:20','11:15')]);course.timetable.effectiveFrom='2026-09-21';
  course.timetable.exceptions=[{moduleCode:'SR',from:'2026-09-14',through:'2026-09-18',omit:{weekday:1,start:'08:30',end:'09:25'},apply:{weekday:3,start:'08:30',end:'09:25'}}];
  const model=build([],course,{anchorOn:'2026-09-14'});assert.equal(model.days[0].items.length,0);assert.equal(model.days[2].items[0].moduleCode,'SR');
});

test('cancelled history occupies only its unreplaced part, without a false unplanned class',()=>{
  const cancelled=record();cancelled.document.sessions[0].state='Cancelada';
  let model=build([cancelled]);assert.equal(model.days[0].items.length,1);assert.equal(model.days[0].items[0].cancelled,true);assert.equal(model.days[0].items[0].taskLabel,'');
  const replacement=record('SR','UT02');replacement.document.sessions[0].id='new';model=build([cancelled,replacement]);assert.equal(model.days[0].items.length,1);assert.equal(model.days[0].items[0].cancelled,false);assert.equal(cancelled.document.sessions[0].state,'Cancelada');
});

test('an actual interval outside the common timetable is preserved with an explicit uncertainty',()=>{
  const r=record();r.document.sessions[0].activities[0].start='08:45';r.document.sessions[0].activities[0].end='09:40';
  const model=build([r]),actual=model.days[0].items.find(i=>!i.placeholder);assert.equal(actual.start,'08:45');assert.equal(actual.end,'09:40');assert.equal(actual.state,'unknown');assert(model.issues.some(i=>i.includes('no coincide')));
  assert.equal(r.document.sessions[0].activities[0].start,'08:45');
});

test('unapproved tasks are not invented as official markers and duplicate identities require review',()=>{
  const first=record(),second=record('SR','UT02',[]);
  first.document.tasks=[{id:'t',code:'0101',title:'Borrador',type:'task',approved:false,preparation:'draft',presentation:{sessionId:'s1'}}];
  let model=build([first]);assert.equal(model.days[0].items[0].taskLabel,'');
  first.document.tasks[0].approved=true;second.document.tasks=structuredClone(first.document.tasks);
  model=build([first,second]);assert.equal(model.days[0].items[0].state,'unknown');assert.equal(model.days[0].items[0].taskLabel,'');assert(model.issues.some(i=>i.includes('aparece en varias unidades')));
});
