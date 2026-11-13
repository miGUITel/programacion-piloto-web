import test from 'node:test';
import assert from 'node:assert/strict';
import { examFollowup, followupBase, followupCurriculum, followupUrl, pendingCount, unitFollowupAlerts, validatePendingCounts } from './student-followup.mjs';
const base='https://script.google.com/macros/s/syntheticDeployment/exec';
const workspaceBase='https://script.google.com/a/macros/school.example.edu/s/syntheticDeployment/exec';
test('only canonical Apps Script deployment URLs are accepted',()=>{
  assert.equal(followupBase(base),base);
  for(const url of ['javascript:alert(1)',base+'?token=secret',base+'#x',base.replace('/exec','/dev'),base.replace('script.google.com','script.google.com.evil.invalid'),base.replace('https:','http:'),'https://script.google.com@evil.invalid/macros/s/x/exec'])assert.equal(followupBase(url),null);
});
test('Workspace deployments retain strict origin and deployment checks',()=>{
  assert.equal(followupBase(workspaceBase),workspaceBase);
  for(const url of [workspaceBase+'?token=secret',workspaceBase+'#x',workspaceBase.replace('/exec','/dev'),workspaceBase.replace('script.google.com','script.google.com.evil.invalid'),workspaceBase.replace('https:','http:'),workspaceBase.replace('script.google.com','user:password@script.google.com'),workspaceBase.replace('script.google.com','script.google.com:8080'),workspaceBase+'/extra',workspaceBase.replace('school.example.edu',''),workspaceBase.replace('school.example.edu','school%2Fexample.edu')]) assert.equal(followupBase(url),null);
});

test('Workspace links preserve organization routing and exam or RA context',()=>{
  for (const kind of ['exam','ra']) {
    const context={kind,module:'LM',ref:'ID/estable:á &+',course:'2099-2100',group:'1.º Grupo',token:'secret',notes:'Pending'};
    const url=new URL(followupUrl(followupBase(workspaceBase),context));
    assert.equal(url.origin,'https://script.google.com');assert.equal(url.pathname,new URL(workspaceBase).pathname);
    for (const key of ['kind','module','ref','course','group']) assert.equal(url.searchParams.get(key),context[key]);
    assert.equal(url.searchParams.has('token'),false);assert.equal(url.searchParams.has('notes'),false);
  }
});

test('links preserve stable official and historical IDs and exclude unrelated fields and notes',()=>{
  for(const field of ['officialTaskId','registryTaskId']){
    const task={type:'exam',[field]:'ID/estable:á &+',entry:{moduleCode:'LM',path:'private/path.json'},code:'E01',title:'Examen',teachingNotes:{feedback:'Pendiente'}};
    const before=JSON.stringify(task),context=examFollowup(task);const url=new URL(followupUrl(base,{...context,course:'2099-2100',token:'secret',studentName:'Private',notes:'Pending'}));
    assert.equal(url.searchParams.get('ref'),task[field]);assert.equal(url.searchParams.get('module'),'LM');assert.equal(url.searchParams.has('token'),false);assert.equal(url.searchParams.has('studentName'),false);assert.equal(url.searchParams.has('notes'),false);assert.equal(JSON.stringify(task),before);
  }
});
test('missing official identities do not become identities inferred from titles or dates',()=>{
  assert.equal(examFollowup({type:'exam',title:'Exam',sessionId:'s1',entry:{moduleCode:'LM'}}),null);
  assert.equal(examFollowup({type:'task',officialTaskId:'1',entry:{moduleCode:'LM'}}),null);
  assert.throws(()=>followupUrl(base,{kind:'ra',module:'LM'}));
});
test('RA context excludes unit identity so the same module RA has one destination',()=>{
  assert.equal(followupUrl(base,{kind:'ra',module:'LM',ref:'2',unit:'UT01'}),followupUrl(base,{kind:'ra',module:'LM',ref:'2',unit:'UT04'}));
  assert.notEqual(followupUrl(base,{kind:'ra',module:'LM',ref:'2'}),followupUrl(base,{kind:'ra',module:'SR',ref:'2'}));
});

test('curricular selector uses official codes and does not pass descriptions',()=>{
  const profile={module:{code:'LM'},curriculum:{outcomes:[{code:'RA2',text:'Texto del módulo'},{code:'7',text:'Otro RA'}]}};
  const context=followupCurriculum(new Map([['LM',profile]]));
  const url=new URL(followupUrl(base,{course:'2099-2100'},context));
  assert.deepEqual(JSON.parse(url.searchParams.get('curriculum')),[{code:'LM',ras:['RA2','7']}]);
  assert.ok(!decodeURIComponent(url.href).includes('Texto del módulo'));
});

test('counts require exact course, group, module and ref; individual fields and duplicates are rejected',()=>{
  const row={course:'2099-2100',group:'A',module:'LM',kind:'ra',ref:'2',count:3};
  const counts=validatePendingCounts([row]);
  assert.equal(pendingCount(counts,row),3);
  for(const change of [{course:'2098-2099'},{group:''},{group:'B'},{module:'ED'},{ref:'RA2'},{kind:'exam'}]) assert.equal(pendingCount(counts,{...row,...change}),0);
  assert.equal(validatePendingCounts([{...row,studentId:'PRIVATE'}]),null);
  assert.equal(validatePendingCounts([row,row]),null);
});

test('a UT uses confirmed RA associations and counts one exam ID for both parts',()=>{
  const unit={module:{code:'LM'},unit:{id:'unit',curriculumRefs:[{raCode:'RA2'},{raCode:'2'},{raCode:'3'}]}};
  const profile={module:{code:'LM'},curriculum:{outcomes:[{code:'2',text:'Uno'},{code:'8',text:'Otro'}]}};
  const task={officialTaskId:'id-exam',type:'exam',code:'01te',title:'Examen',entry:{moduleCode:'LM'}};
  const alerts=unitFollowupAlerts(unit,profile,[task,task,{...task,entry:{moduleCode:'ED'}}],({kind})=>kind==='ra'?3:2);
  assert.deepEqual(alerts.ra.map(({target,pending})=>[target.ref,pending]),[['2',3]]);
  assert.deepEqual(alerts.exam.map(({target,pending})=>[target.ref,pending]),[['id-exam',2]]);
});
