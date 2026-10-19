import test from 'node:test';
import assert from 'node:assert/strict';
import { MeetingReader } from './meeting-reader.mjs';
import { createContextMemory, chooseStartup, resolveRemembered, madridClock, daySchedule, unitContext, validateMeetingNotes } from './startup-context.mjs';
const entry = { moduleCode:'LM',unitCode:'UT01',unitId:'LM-UT01',path:'LM/UT01.json' };
const other = { moduleCode:'LM',unitCode:'UT02',unitId:'LM-UT02',path:'LM/UT02.json' };
const catalog = { common:{path:'common/course-2026-2027.json'},modules:[{code:'LM',units:[{id:entry.unitId,code:entry.unitCode,path:entry.path},{id:other.unitId,code:other.unitCode,path:other.path}]}] };
function common() { return { course:{startsOn:'2026-09-01',endsOn:'2027-06-30'},modules:[{code:'LM',group:'confirmed'}],calendar:{nonTeaching:[]},timetable:{effectiveFrom:'2026-09-01',weekly:[{id:'lesson',type:'teaching',moduleCode:'LM',weekday:1,start:'09:00',end:'11:15'},{id:'meeting',title:'Reunión sintética',type:'meeting',weekday:1,start:'12:00',end:'13:00'}],periods:[{start:'09:00',end:'09:55'},{start:'10:20',end:'11:15'}],exceptions:[]} }; }
function record(e = entry, {id='s1', start='09:00',end='09:55',state='',date='2026-10-19'} = {}) { return {entry:e,document:{sessions:[{id,date,state,activities:[{id:'a1',start,end,title:'Conservar',observations:'Nota pendiente'}]}]}}; }
const now = time => new Date(`2026-10-19T${time}:00+02:00`);
const decision = (options = {}) => chooseStartup({catalog,common:common(),records:[record(),record(other,{id:'s2',start:'10:20',end:'11:15'})],remembered:unitContext(other),now:now('09:20'),...options});
test('Madrid clock handles winter and summer without host timezone',()=>{
 assert.deepEqual(madridClock(new Date('2026-10-19T07:20:00Z')),{date:'2026-10-19',minute:560});
 assert.deepEqual(madridClock(new Date('2026-12-21T08:20:00Z')),{date:'2026-12-21',minute:560});
});
test('Current portion wins and selection is read-only',()=>{
 const records=[record()],before=structuredClone(records);const r=decision({records});assert.equal(r.target.sessionId,'s1');assert.equal(r.automatic,true);assert.deepEqual(records,before);
});
test('Recess goes to next portion that day; boundaries are end-exclusive',()=>{
 assert.equal(decision({now:now('09:55')}).target.sessionId,'s2');
 assert.equal(decision({now:now('10:10')}).target.sessionId,'s2');
 assert.equal(decision({now:now('11:15')}).target.meetingId,'meeting');
});
test('Current meeting is a separate context and retains actual title',()=>{
 const r=decision({now:now('12:10')});assert.equal(r.target.type,'meeting');assert.equal(r.target.meeting.title,'Reunión sintética');assert.equal(r.target.date,'2026-10-19');
});
test('Outside the day returns remembered unit, never next day',()=>{
 for(const time of ['08:59','13:00','19:00']){const r=decision({now:now(time)});assert.equal(r.automatic,false);assert.equal(r.target.path,other.path);}
 assert.equal(decision({now:new Date('2026-10-18T10:00:00+02:00')}).automatic,false);
});
test('Holidays and unavailable common data preserve fallback',()=>{
 const c=common();c.calendar.nonTeaching=[{from:'2026-10-19',through:'2026-10-19'}];assert.equal(decision({common:c}).automatic,false);
 const r=decision({common:null});assert.equal(r.target.path,other.path);assert.ok(r.warning);
});
test('Missing, failed or unconfirmed module planning is not skipped',()=>{
 assert.equal(decision({records:[]}).automatic,false);
 assert.equal(decision({failures:[entry]}).automatic,false);
 const c=common();c.modules[0].group=null;assert.equal(decision({common:c}).automatic,false);
});
test('Cancelled and original rescheduled lessons are excluded',()=>{
 for(const state of ['Cancelada','Reprogramada']){const r=decision({records:[record(entry,{state}),record(other,{id:'s2',start:'10:20',end:'11:15'})]});assert.equal(r.target.sessionId,'s2');}
});
test('Shared session chooses the UT owning the current portion',()=>{
 const records=[record(entry,{end:'09:25'}),record(other,{start:'09:25',end:'09:55'})];
 assert.equal(decision({records,now:now('09:24')}).target.path,entry.path);
 assert.equal(decision({records,now:now('09:25')}).target.path,other.path);
});
test('Overlaps, timetable disagreement and crossing recess stop automatic opening',()=>{
 assert.equal(decision({records:[record(),record(other)]}).automatic,false);
 assert.equal(decision({records:[record(entry,{start:'09:00',end:'11:15'})]}).automatic,false);
 const c=common();c.timetable.weekly.push({id:'overlap',type:'meeting',title:'Otra',weekday:1,start:'09:00',end:'10:00'});assert.equal(decision({common:c}).automatic,false);
 assert.equal(decision({now:now('12:10'),records:[record(entry,{start:'12:00',end:'13:00'})]}).automatic,false);
});
test('Weekly timetable is not extrapolated before effective date; explicit exception applies',()=>{
 const c=common();c.timetable.effectiveFrom='2026-11-01';assert.deepEqual(daySchedule(c,'2026-10-19'),[]);
 c.timetable.exceptions.push({id:'early',moduleCode:'LM',from:'2026-10-19',through:'2026-10-19',omit:{weekday:2,start:'10:00',end:'11:00'},apply:{weekday:1,start:'09:00',end:'09:55'}});
 assert.equal(decision({common:c}).target.sessionId,'s1');
});
test('Timetable exceptions replace the original interval',()=>{
 const c=common();c.timetable.exceptions.push({id:'shift',moduleCode:'LM',from:'2026-10-19',through:'2026-10-19',omit:{weekday:1,start:'09:00',end:'11:15'},apply:{weekday:1,start:'10:20',end:'11:15'}});
 assert.equal(decision({common:c,now:now('10:30')}).target.sessionId,'s2');
});
test('Remembered unit is validated by catalog identity; missing session can fall back to unit',()=>{
 assert.equal(resolveRemembered({...unitContext(entry),path:'https://bad'},catalog,common()),null);
 assert.equal(resolveRemembered(unitContext(entry,'old-session'),catalog,common()).entry.path,entry.path);
 assert.equal(resolveRemembered({type:'meeting',meetingId:'meeting',date:'2026-10-19'},catalog,common()).meeting.title,'Reunión sintética');
 assert.equal(resolveRemembered({type:'meeting',meetingId:'meeting',date:'2026-10-20'},catalog,common()),null);
});
test('Local memory stores references only, remains separate by course and avoids repeated writes',()=>{
 const map=new Map();let writes=0;const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>{map.set(k,v);writes++;}};const memory=createContextMemory(()=>storage);
 memory.write(catalog,{...unitContext(entry,'s1'),token:'secret',observations:'private draft'});memory.write(catalog,unitContext(entry,'s1'));
 assert.equal(writes,1);assert.equal([...map.values()][0].includes('secret'),false);assert.equal([...map.values()][0].includes('private draft'),false);
 assert.deepEqual(memory.read(catalog).context,unitContext(entry,'s1'));assert.equal(memory.read({...catalog,common:{path:'common/course-2027-2028.json'}}).context,null);
});
test('Unavailable, invalid or quota-limited browser storage is nonfatal',()=>{
 const denied=createContextMemory(()=>{throw Error('denied');});assert.ok(denied.read(catalog).warning);assert.equal(denied.write(catalog,unitContext(entry)).ok,false);
 const corrupt=createContextMemory(()=>({getItem:()=>'{bad'}));assert.equal(corrupt.read(catalog).context,null);
});
test('Meeting records are per occurrence, without guessing or duplicates',()=>{
 assert.deepEqual(validateMeetingNotes({schemaVersion:1,kind:'meeting-notes',meetings:[{meetingId:'meeting',date:'2026-10-19',topics:['Tema'],requests:['Ruego'],notes:'Guardada'}]}),[]);
 assert.ok(validateMeetingNotes({schemaVersion:1,kind:'meeting-notes',meetings:[{meetingId:'m',date:'2026-10-19'},{meetingId:'m',date:'2026-10-19'}]}).length);
 assert.ok(validateMeetingNotes({schemaVersion:1,kind:'meeting-notes',meetings:[{meetingId:'m',date:'2026-10-19',topics:'wrong'}]}).length);
});
test('Optional meeting reader never requests an unconfigured or arbitrary destination',async()=>{
 let calls=0;const store=new MeetingReader({token:'synthetic',fetchImpl:async()=>{calls++;throw Error('Unexpected request');}});
 assert.deepEqual(await store.load(catalog),{document:null,sha:null});assert.equal(calls,0);
 await assert.rejects(store.load({...catalog,meetings:{schemaVersion:1,path:'https://elsewhere.invalid/data'}}));assert.equal(calls,0);
 await assert.rejects(store.load({...catalog,meetings:{schemaVersion:1,path:'LM/UT01.json'}}));assert.equal(calls,0);
});
test('Configured meeting content is read only and keeps per-occurrence notes',async()=>{
 const document={schemaVersion:1,kind:'meeting-notes',meetings:[{meetingId:'meeting',date:'2026-10-19',notes:'Nota real preservada'}],extra:{keep:true}};
 let calls=0;const store=new MeetingReader({token:'synthetic',fetchImpl:async(url,init)=>{
  calls++;assert.equal(init.method,'GET');assert.ok(url.endsWith('APP/reuniones.json?ref=main'));
  return new Response(JSON.stringify({encoding:'base64',content:Buffer.from(JSON.stringify(document)).toString('base64'),sha:'meeting-version',path:'APP/reuniones.json'}),{status:200});
 }});
 const result=await store.load({...catalog,meetings:{schemaVersion:1,path:'APP/reuniones.json'}});assert.deepEqual(result.document,document);assert.equal(result.sha,'meeting-version');assert.equal(calls,1);
});
