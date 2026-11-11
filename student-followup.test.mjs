import test from 'node:test';
import assert from 'node:assert/strict';
import { examFollowup, followupBase, followupUrl } from './student-followup.mjs';
const base='https://script.google.com/macros/s/syntheticDeployment/exec';
test('only canonical Apps Script deployment URLs are accepted',()=>{
  assert.equal(followupBase(base),base);
  for(const url of ['javascript:alert(1)',base+'?token=secret',base+'#x',base.replace('/exec','/dev'),base.replace('script.google.com','script.google.com.evil.invalid'),base.replace('https:','http:'),'https://script.google.com@evil.invalid/macros/s/x/exec'])assert.equal(followupBase(url),null);
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
