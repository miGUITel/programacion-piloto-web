import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarCurrentUnits } from './unit-tools.mjs';
import { rowResources } from './resources.mjs';

const record = (id, dates) => ({ entry:{unitCode:id}, document:{unit:{id},sessions:dates.map(([date,state=''])=>({date,state}))} });
test('calendar currency includes non-teaching days and boundaries, never the next unit',()=>{
  const a=record('A',[['2026-10-19'],['2026-10-22']]), b=record('B',[['2026-10-26'],['2026-10-29']]);
  for(const day of ['2026-10-19','2026-10-20','2026-10-22']) assert.deepEqual(calendarCurrentUnits([a,b],day),[a]);
  assert.deepEqual(calendarCurrentUnits([a,b],'2026-10-23'),[]);
  assert.deepEqual(calendarCurrentUnits([a,b],'2026-10-30'),[]);
});
test('calendar currency excludes cancelled/rescheduled dates and provisional windows',()=>{
  const a=record('A',[['2026-10-19','Cancelada'],['2026-10-22'],['2026-10-29','Reprogramada']]);
  assert.deepEqual(calendarCurrentUnits([a],'2026-10-20'),[]);
  const b=record('B',[]);b.document.unit.planningWindow={startOn:'2026-01-01',endOn:'2027-01-01'};
  assert.deepEqual(calendarCurrentUnits([b],'2026-10-20'),[]);
});
test('overlap is returned without guessing and records are unchanged',()=>{
  const list=[record('A',[['2026-10-19'],['2026-10-22']]),record('B',[['2026-10-20'],['2026-10-27']])], before=structuredClone(list);
  assert.equal(calendarCurrentUnits(list,'2026-10-20').length,2); assert.deepEqual(list,before);
});
test('row resources use only explicit activity/session/presentation/work references, preserve data',()=>{
  const session={id:'s',resourceRefs:['r1'],activities:[{id:'a',taskRefs:['other']},{id:'b',resourceRefs:['r2','missing']}]};
  const doc={module:{code:'LM'},unit:{id:'u'},resources:[{id:'r1',title:'Session'},{id:'r2',title:'Portion'},{id:'r3',title:'Task'},{id:'unused',title:'Unused'}],sessions:[session],tasks:[{id:'t',presentation:{sessionId:'s',activityId:'b'},resourceRefs:['r3']}]};
  const other={module:{code:'LM'},unit:{id:'v'},resources:[{id:'x',title:'Work'}],tasks:[{id:'other',resourceRefs:['x']}]};
  const before=structuredClone(doc);
  assert.deepEqual(rowResources(doc,session,session.activities[0],[{document:other}]).resources.map(r=>r.title),['Session','Work']);
  const result=rowResources(doc,session,session.activities[1]);
  assert.deepEqual(result.resources.map(r=>r.title),['Portion','Task']);assert.equal(result.unresolved.length,1);
  assert.deepEqual(doc,before);
});
test('title similarity never links a resource and a session-only presentation uses the header',()=>{
  const session={id:'s',activities:[{id:'a',title:'Same'},{id:'b',title:'Same'}]};
  const doc={unit:{id:'u'},resources:[{id:'r',title:'Same'}],tasks:[]};
  assert.equal(rowResources(doc,session,session.activities[0]).resources.length,0);
  doc.tasks=[{id:'t',presentation:{sessionId:'s'},resourceRefs:['r']}];
  assert.equal(rowResources(doc,session,session.activities[0]).resources.length,1);
  assert.equal(rowResources(doc,session,session.activities[1]).resources.length,0);
});
