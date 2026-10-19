import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMeetingDocument, recordKey, recordGroup, meetingHistory, withMeetingRecord } from './meeting-records.mjs';
import { MeetingReader } from './meeting-reader.mjs';
import { createContextMemory, resolveRemembered, meetingContext, meetingGroupContext } from './startup-context.mjs';
const catalog={modules:[],meetings:{schemaVersion:1,path:'APP/reuniones.json'},common:{path:'common/course-2026-2027.json'}};
const book=()=>({schemaVersion:2,kind:'meeting-notes',spaces:[{id:'meetings',title:'Reuniones'},{id:'project',title:'Proyecto'}],groups:[{id:'a',title:'Comisión sintética',space:'meetings',scheduleRefs:['slot-a']},{id:'p',title:'Proyecto sintético',space:'project',scheduleRefs:[]}],meetings:[],extra:{keep:true}});
const manual=(id='m1',groupId='a',date='2026-10-19')=>({id,groupId,date,title:'Reunión sintética',topics:[' Tema con espacios '],requests:[],notes:'Notas sin datos personales',extra:{keep:true}});
test('Administrative groups and manual records need no fictitious academic UT or schedule',()=>{
 const d=book();d.meetings=[manual()];assert.deepEqual(validateMeetingDocument(d),[]);assert.equal(recordGroup(d,d.meetings[0]).id,'a');assert.equal(d.modules,undefined);
});
test('History is ordered, filters each group and includes old Project notes within Reuniones',()=>{
 const d=book();d.meetings=[manual('one','a','2026-10-12'),manual('two','a','2026-10-19'),manual('three','p','2026-10-20'),{meetingId:'unmapped',date:'2026-10-21',notes:'Legado'}];const before=structuredClone(d);
 assert.deepEqual(meetingHistory(d,'meetings','a').map(recordKey),['two','one']);assert.deepEqual(meetingHistory(d,'project').map(recordKey),['three']);assert.equal(meetingHistory(d,'meetings').length,4);assert.deepEqual(d,before);
});
test('Explicit editing preserves record identity, other records, unknown fields and source snapshot',()=>{
 const d=book();d.meetings=[manual(),manual('other','p')];const before=structuredClone(d);const next=withMeetingRecord(d,'m1',{notes:'Nota ampliada'});
 assert.equal(next.meetings[0].id,'m1');assert.deepEqual(next.meetings[0].topics,[' Tema con espacios ']);assert.deepEqual(next.meetings[1],d.meetings[1]);assert.deepEqual(next.extra,d.extra);assert.deepEqual(d,before);assert.equal(next.meetings[0].extra.keep,true);
});
test('Duplicate IDs, duplicate scheduled occurrences and unknown groups are rejected',()=>{
 const d=book();d.meetings=[manual(),manual()];assert.ok(validateMeetingDocument(d).length);
 d.meetings=[{meetingId:'slot-a',date:'2026-10-19'},{meetingId:'slot-a',date:'2026-10-19'}];assert.ok(validateMeetingDocument(d).length);
 d.meetings=[manual('x','missing')];assert.ok(validateMeetingDocument(d).length);
 d.meetings=[];d.groups.push({...d.groups[0],id:'other'});assert.ok(validateMeetingDocument(d).length);
});
test('Legacy scheduled notes remain valid and unchanged',()=>{
 const d={schemaVersion:1,kind:'meeting-notes',meetings:[{meetingId:'old',date:'2026-10-19',notes:'Histórica',extra:true}]};assert.deepEqual(validateMeetingDocument(d),[]);
 const next=withMeetingRecord(d,'schedule:old:2026-10-19',{notes:'Revisada'});assert.equal(next.schemaVersion,1);assert.equal(next.meetings[0].extra,true);assert.equal(next.meetings[0].meetingId,'old');
});
test('Remembering groups or saved manual meetings stores only references and works outside the timetable',()=>{
 const d=book();d.meetings=[manual('id','p')];const raw=meetingContext({...d.meetings[0],recordId:'id',space:'project'});
 let saved;const memory=createContextMemory(()=>({getItem:()=>saved??null,setItem:(k,v)=>{saved=v;}}));memory.write(catalog,{...raw,notes:'Must not persist'});assert.equal(saved.includes('Must not persist'),false);
 const r=resolveRemembered(memory.read(catalog).context,catalog,null,d);assert.equal(r.record.id,'id');assert.deepEqual(resolveRemembered(meetingGroupContext('project','p'),catalog,null,d),meetingGroupContext('meetings','p'));
 assert.equal(resolveRemembered(meetingGroupContext('project','a'),catalog,null,d),null);
});
function transport(initial=book()){
 let value=structuredClone(initial),sha='v1',writes=0,reads=0,mode='ok';
 const fetchImpl=async(url,init)=>{
  assert.ok(url.startsWith('https://api.github.com/repos/miGUITel/programacion-piloto-datos/contents/APP/reuniones.json'));
  if(init.method==='GET'){reads++;if(mode==='read-fail')return new Response('{}',{status:403});return new Response(JSON.stringify({path:'APP/reuniones.json',encoding:'base64',sha,content:Buffer.from(JSON.stringify(value)).toString('base64')}));}
  assert.equal(init.method,'PUT');const body=JSON.parse(init.body);assert.equal(body.sha,sha);writes++;value=JSON.parse(Buffer.from(body.content,'base64').toString());sha='v'+(writes+1);
  if(mode==='lost')throw Error('Synthetic transport failure');if(mode==='server')return new Response('{}',{status:503});
  return new Response(JSON.stringify({content:{path:'APP/reuniones.json',sha},commit:{sha:'commit'}}));
 };
 return {fetchImpl,metrics:()=>({writes,reads}),remote:()=>({value:structuredClone(value),sha}),setMode:m=>{mode=m;},change:()=>{sha='concurrent';}};
}
test('Meeting save checks current version, writes once and confirms exact reread',async()=>{
 const t=transport(),store=new MeetingReader({token:'synthetic',fetchImpl:t.fetchImpl}),base=await store.load(catalog),next=withMeetingRecord(base.document,null,manual());
 const result=await store.save(catalog,next,base.sha);assert.deepEqual(result.document,next);assert.deepEqual(t.metrics(),{reads:3,writes:1});assert.deepEqual(base.document,book());
});
test('Concurrent change blocks overwriting and resubmitting until an explicit read',async()=>{
 const t=transport(),store=new MeetingReader({token:'synthetic',fetchImpl:t.fetchImpl}),base=await store.load(catalog);t.change();
 await assert.rejects(store.save(catalog,withMeetingRecord(base.document,null,manual()),base.sha),e=>e.code==='CONFLICT');const before=t.metrics();await assert.rejects(store.save(catalog,base.document,base.sha),e=>e.code==='SAVE_UNKNOWN');assert.deepEqual(t.metrics(),before);assert.equal(t.metrics().writes,0);
 const fresh=await store.load(catalog);assert.equal(fresh.sha,'concurrent');
});
test('Lost response preserves uncertainty, does not retry and remote content remains recoverable',async()=>{
 const t=transport(),store=new MeetingReader({token:'synthetic',fetchImpl:t.fetchImpl}),base=await store.load(catalog),next=withMeetingRecord(base.document,null,manual());t.setMode('lost');
 await assert.rejects(store.save(catalog,next,base.sha),e=>e.code==='SAVE_UNKNOWN');await assert.rejects(store.save(catalog,next,base.sha),e=>e.code==='SAVE_UNKNOWN');assert.equal(t.metrics().writes,1);
 t.setMode('ok');assert.deepEqual((await store.load(catalog)).document,next);
});
test('Server errors after a possible write are not reported as successful',async()=>{
 const t=transport(),store=new MeetingReader({token:'synthetic',fetchImpl:t.fetchImpl}),base=await store.load(catalog);t.setMode('server');await assert.rejects(store.save(catalog,withMeetingRecord(base.document,null,manual()),base.sha),e=>e.code==='SAVE_UNKNOWN');assert.equal(t.metrics().writes,1);
});
