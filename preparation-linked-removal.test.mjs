import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { preparationSummary, preparationValues, preparationSnapshot, preparePreparationSave } from './preparation.mjs?v=20261102-replanning-signals';
import { sessionPreparation } from './session-preparation.mjs?v=20261102-replanning-signals';
import { detachTaskLinks, taskLinks, removalImpact, removalWarning } from './preparation-links.mjs?v=20261102-replanning-signals';
import { savePreparationWithLinks } from './preparation-save.mjs?v=20261102-replanning-signals';
import { GithubStore, validateDocument, encodeUtf8Base64, decodeUtf8Base64 } from './core.mjs?v=20261102-replanning-signals';

function fixture(code='UT02') {
  const id='LM-'+code;
  const activity = (n) => ({id:id+'-a'+n,kind:'Cabecera',start:'09:00',end:'09:55',title:'Prueba sintética',planned:'Conservar',observations:'Nota original',improvements:'Mejora',realized:'Hecho',pending:'Pendiente',extra:{keep:true}});
  return {schemaVersion:2,pilot:true,module:{code:'LM',name:'Prueba'},unit:{id,code,title:'Prueba sintética',resourcePreparation:{ppt:'Listo',web:'Listo',tasks:'Listo',exam:'Listo'}},
    provenance:{archivePath:'_archive/synthetic.json',sha256:'0'.repeat(64)},resources:[{id:'p',type:'presentation',title:'PPT de prueba'},{id:'w',type:'web',title:'Web de prueba'}],
    tasks:[{id:id+'-t',type:'task',code:code.slice(2)+'01',title:'Tarea sintética',approved:true,preparation:'ready',presentation:{sessionId:id+'-s1',activityId:id+'-a1'},task:{corrected:true,extra:'Preservar'}},
      {id:id+'-e',type:'exam',code:code.slice(2),title:'Examen sintético',approved:true,preparation:'ready',presentation:{sessionId:id+'-s2'}}],
    sessions:[{id:id+'-s1',number:1,date:'2099-01-05',state:'',resourceRefs:['p'],activities:[{...activity(1),taskRefs:[id+'-t']}]},
      {id:id+'-s2',number:2,date:'2099-01-06',state:'',resourceRefs:['w'],activities:[{...activity(2),taskRefs:[id+'-t']}]}]};
}
const entry = document => ({moduleCode:document.module.code,unitCode:document.unit.code,unitId:document.unit.id,path:'LM/'+document.unit.code+'.json'});
const hash = s => createHash('sha1').update(s).digest('hex');

test('inactive history never blocks readiness and returning it to the plan restores its requirements',()=>{
  const d=fixture(),before=structuredClone(d);
  for(const [i,state] of ['Cancelada','Reprogramada'].entries()) d.sessions.push({...structuredClone(d.sessions[0]),id:'history-'+i,number:3+i,state,resourceRefs:['missing'],activities:[{...d.sessions[0].activities[0],id:'history-a'+i,taskRefs:['missing-task']}]});
  const history=structuredClone(d.sessions.slice(2));
  const s=preparationSummary(d);assert.equal(s.state,'ready');assert.equal(s.total,2);assert.equal(s.sessions,2);assert.equal(s.excluded,2);assert.equal(s.unlinked,0);
  assert.equal(sessionPreparation(d,d.sessions[2]).excluded,true);assert.match(sessionPreparation(d,d.sessions[2]).label,/Cancelada/);
  assert.deepEqual(d.sessions.slice(2),history);
  d.sessions[2].state='';assert.equal(preparationSummary(d).state,'draft');
  d.sessions=d.sessions.slice(2);d.sessions.forEach(s=>s.state='Cancelada');assert.notEqual(preparationSummary(d).state,'ready');
  assert.equal(before.sessions[0].state,'');
});

test('linked task removal changes associations only, keeps unrelated links and notes, and can be undone',()=>{
  const d=fixture(),id=d.tasks[0].id;d.sessions[0].activities[0].taskRefs.push(d.tasks[1].id);
  const before=structuredClone(d),values=preparationValues(d);values.removals=[id];
  const r=preparationSnapshot(d,values);assert.equal(r.tasks.length,1);
  assert.deepEqual(r.sessions[0].activities[0].taskRefs,[d.tasks[1].id]);assert.deepEqual(r.sessions[1].activities[0].taskRefs,[]);
  for(let i=0;i<d.sessions.length;i++) {const a=structuredClone(r.sessions[i]);a.activities[0].taskRefs=before.sessions[i].activities[0].taskRefs;assert.deepEqual(a,before.sessions[i]);}
  assert.deepEqual(r.resources,before.resources);assert.deepEqual(d,before);
  values.removals=[];assert.deepEqual(preparationSnapshot(d,values).sessions,d.sessions);
});

test('a former task-only session stays explicitly inactive instead of becoming unlinked',()=>{
  const d=fixture(),id=d.tasks[0].id;delete d.sessions[0].resourceRefs;d.sessions[0].eventTypes=['task'];
  const v=preparationValues(d);v.removals=[id];const r=preparationSnapshot(d,v);
  assert.equal(sessionPreparation(r,r.sessions[0]).known,true);assert.equal(sessionPreparation(r,r.sessions[0]).ready,true);
  assert.deepEqual(r.sessions[0].eventTypes,['task']);
  delete r.sessions[0].activities[0].taskRefs;assert.equal(sessionPreparation(r,r.sessions[0]).known,false);
});

test('presentation-only removal retains a deliberate empty association without deleting the activity',()=>{
  const d=fixture(),id=d.tasks[0].id;delete d.sessions[0].activities[0].taskRefs;delete d.sessions[0].resourceRefs;
  const v=preparationValues(d);v.removals=[id];const r=preparationSnapshot(d,v);
  assert.deepEqual(r.sessions[0].activities[0].taskRefs,[]);assert.equal(r.sessions[0].activities[0].observations,'Nota original');
  assert.equal(sessionPreparation(r,r.sessions[0]).ready,true);
});

test('pending notes survive removal, while changes to the removed task or its links require reconciliation',()=>{
  const d=fixture(),id=d.tasks[0].id,v=preparationValues(d);v.removals=[id];
  const loaded={document:d,sha:'v1'},target=entry(d),active={path:target.path,sha:'v1',savedDocument:d,draft:structuredClone(d)};
  active.draft.sessions[0].activities[0].observations='Nota pendiente';
  const r=preparePreparationSave(loaded,target,v,active);assert.equal(r.unitDraft.sessions[0].activities[0].observations,'Nota pendiente');assert.deepEqual(r.unitDraft.sessions[0].activities[0].taskRefs,[]);
  assert.equal(r.document.sessions[0].activities[0].observations,'Nota original');
  active.draft.sessions[0].activities[0].taskRefs=[];assert.throws(()=>preparePreparationSave(loaded,target,v,active),/vínculos pendientes/);
});

test('warning lists each affected session once, including another unit and the preservation promise',()=>{
  const d=fixture(),other=fixture('UT03'),id=d.tasks[0].id;other.sessions[0].activities[0].taskRefs.push(id);
  const records=[{entry:entry(other),document:other}],impact=removalImpact(d,id,records),warning=removalWarning(d,d.tasks[0],records);
  assert.equal(impact.length,3);assert.match(warning,/UT02 · S1/);assert.match(warning,/UT02 · S2/);assert.match(warning,/UT03 · S1/);
  assert.match(warning,/actividades, textos, notas y recursos/);assert.match(warning,/deshacer/);
});

test('cross-unit save rereads all candidates, preserves remote and pending notes, and publishes one transaction',async()=>{
  const d=fixture(),other=fixture('UT03'),unused=fixture('UT04'),id=d.tasks[0].id;
  other.sessions[0].activities[0].taskRefs.push(id);
  const records=[other,unused].map(document=>({entry:entry(document),document})),values=preparationValues(d);values.removals=[id];
  const active={path:entry(other).path,sha:'other-v1',savedDocument:other,draft:structuredClone(other)};active.draft.sessions[0].activities[0].observations='No enviar';
  const confirmations=new Map([[id,removalImpact(d,id,records)]]),reads=[],calls=[];
  const result=await savePreparationWithLinks({loaded:{document:d,sha:'owner-v1'},entry:entry(d),values,active,records,confirmations,
    unitStore(target){return {async load(){reads.push(target.path);return {document:structuredClone(target.unitCode==='UT03'?other:unused),sha:target.unitCode==='UT03'?'other-v1':'unused-v1'};}};},
    store:{async saveDocuments(changes,guards){calls.push({changes,guards});return {results:changes.map(c=>({...c,sha:'new-'+c.entry.unitCode,commitSha:'one-commit'}))};}}});
  assert.deepEqual(reads.sort(),['LM/UT03.json','LM/UT04.json']);assert.equal(calls.length,1);assert.equal(calls[0].changes.length,2);assert.deepEqual(calls[0].guards.map(g=>g.entry.path),['LM/UT04.json']);
  const patch=calls[0].changes[1];assert.deepEqual(patch.document.sessions[0].activities[0].taskRefs,[other.tasks[0].id]);assert.equal(patch.document.sessions[0].activities[0].observations,'Nota original');
  assert.equal(result.related[0].prepared.unitDraft.sessions[0].activities[0].observations,'No enviar');assert.deepEqual(result.related[0].prepared.unitDraft.sessions[0].activities[0].taskRefs,[other.tasks[0].id]);
});

test('a newly created reference outside the confirmed impact stops every write',async()=>{
  const d=fixture(),other=fixture('UT03'),id=d.tasks[0].id,values=preparationValues(d);values.removals=[id];
  const records=[{entry:entry(other),document:other}],remote=structuredClone(other);remote.sessions[1].activities[0].taskRefs.push(id);let writes=0;
  await assert.rejects(()=>savePreparationWithLinks({loaded:{document:d,sha:'v1'},entry:entry(d),values,records,
    confirmations:new Map([[id,removalImpact(d,id,records)]]),unitStore:()=>({load:async()=>({document:remote,sha:'v2'})}),store:{saveDocuments:async()=>{writes++;}}}),e=>e.code==='PREPARATION_STALE');
  assert.equal(writes,0);
});

function backend(documents,{stale=false,guardStale=false,patchError=false,unknown=false,verifyError=false}={}) {
  const data=new Map(documents.map(d=>[entry(d).path,{document:structuredClone(d),sha:hash(JSON.stringify(d))}]));
  const blobs=new Map(),calls=[];let nextFiles=[],writes=0,published=false;
  const respond=(value,status=200)=>({status,json:async()=>value});
  return {data,calls,get writes(){return writes;},fetch:async(url,options)=>{
    calls.push({url,method:options.method});const body=options.body?JSON.parse(options.body):null;
    if(url.includes('/git/ref/'))return respond({object:{sha:'a'.repeat(40)}});
    if(url.includes('/git/commits/')&&options.method==='GET')return respond({tree:{sha:'b'.repeat(40)}});
    if(url.includes('/git/trees/')&&options.method==='GET')return respond({tree:[...data].map(([path,v],i)=>({path,type:'blob',sha:(stale&&i===0||guardStale&&i===2)?'f'.repeat(40):v.sha})),truncated:false});
    if(url.endsWith('/git/blobs')){const text=decodeUtf8Base64(body.content),sha=hash(text);blobs.set(sha,JSON.parse(text));return respond({sha},201);}
    if(url.endsWith('/git/trees')){assert.equal(body.base_tree,'b'.repeat(40));nextFiles=body.tree;return respond({sha:'c'.repeat(40)},201);}
    if(url.endsWith('/git/commits')){assert.deepEqual(body.parents,['a'.repeat(40)]);return respond({sha:'d'.repeat(40)},201);}
    if(options.method==='PATCH'){
      assert.equal(body.force,false);if(patchError)return respond({},422);
      for(const f of nextFiles)data.set(f.path,{sha:f.sha,document:blobs.get(f.sha)});writes++;published=true;
      if(unknown)throw new Error('simulated lost response');return respond({object:{sha:body.sha}});
    }
    if(url.includes('/contents/')){const path=url.split('/contents/')[1].split('?')[0],v=data.get(path);return respond({path,sha:verifyError&&published?'e'.repeat(40):v.sha,encoding:'base64',content:encodeUtf8Base64(JSON.stringify(v.document))});}
    throw new Error('Unexpected synthetic endpoint');
  }};
}

test('atomic storage validates all read versions, publishes both files together and rereads exact contents',async()=>{
  const docs=[fixture(),fixture('UT03'),fixture('UT04')];docs.forEach(d=>assert.deepEqual(validateDocument(d,entry(d)),[]));
  const remote=backend(docs),store=new GithubStore({token:'synthetic',fetchImpl:remote.fetch}).forDocument(entry(docs[0]));
  const changes=docs.slice(0,2).map(document=>({entry:entry(document),sha:remote.data.get(entry(document).path).sha,document:{...structuredClone(document),extra:'Cambio sintético'}}));
  const r=await store.saveDocuments(changes,[{entry:entry(docs[2]),sha:remote.data.get(entry(docs[2]).path).sha}]);
  assert.equal(remote.writes,1);assert.equal(r.results.length,2);assert.ok(r.results.every(x=>x.commitSha===r.commitSha));assert.equal(remote.data.get('LM/UT04.json').document.extra,undefined);
  assert.equal(remote.calls.filter(c=>c.method==='PATCH').length,1);assert.equal(remote.calls.filter(c=>c.url.includes('/contents/')).length,2);
});

test('stale source or untouched guard versions prevent publishing any file',async()=>{
  for(const flags of [{stale:true},{guardStale:true}]){
    const docs=[fixture(),fixture('UT03'),fixture('UT04')],remote=backend(docs,flags),store=new GithubStore({token:'synthetic',fetchImpl:remote.fetch}).forDocument(entry(docs[0]));
    const changes=docs.slice(0,2).map(document=>({entry:entry(document),document,sha:remote.data.get(entry(document).path).sha}));
    await assert.rejects(()=>store.saveDocuments(changes,[{entry:entry(docs[2]),sha:remote.data.get('LM/UT04.json').sha}]),e=>e.code==='CONFLICT');assert.equal(remote.writes,0);
    const n=remote.calls.length;await assert.rejects(()=>store.saveDocuments(changes),e=>e.code==='SAVE_UNKNOWN');assert.equal(remote.calls.length,n);
  }
});

test('branch race, lost response and failed verification retain a blocked transaction instead of retrying',async()=>{
  for(const flags of [{patchError:true},{unknown:true},{verifyError:true}]){
    const docs=[fixture(),fixture('UT03')],remote=backend(docs,flags),store=new GithubStore({token:'synthetic',fetchImpl:remote.fetch}).forDocument(entry(docs[0]));
    const changes=docs.map(document=>({entry:entry(document),document,sha:remote.data.get(entry(document).path).sha}));
    await assert.rejects(()=>store.saveDocuments(changes),e=>['CONFLICT','SAVE_UNKNOWN'].includes(e.code));const n=remote.calls.length;
    await assert.rejects(()=>store.saveDocuments(changes),e=>e.code==='SAVE_UNKNOWN');assert.equal(remote.calls.length,n);assert.equal(remote.writes,flags.patchError?0:1);
  }
});
