import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDocument, validateTaskRegistry } from './core.mjs?v=20261102-ppt-guided-icons';
import { preparationValues, preparationSnapshot, preparePreparationSave } from './preparation.mjs?v=20261102-ppt-guided-icons';
import { createPreparationTask } from './preparation-tasks.mjs?v=20261102-ppt-guided-icons';
import { createPreparationUI } from './preparation-ui.mjs?v=20261102-ppt-guided-icons';

function fixture(schemaVersion=2) {
  return {schemaVersion,pilot:true,module:{code:'SR',name:'Prueba'},unit:{id:'SR-UT03',code:'UT03',title:'Prueba',resourcePreparation:{ppt:'Listo',web:'Listo',tasks:'Listo',exam:'Listo'}},
    provenance:{archivePath:'_archive/synthetic.json',sha256:'0'.repeat(64)},
    tasks:[{id:'t',code:'0301',title:'Actividad',type:'task',approved:true,preparation:'ready'},
      {id:'e',code:'03te',title:'Examen',type:'exam',approved:true,preparation:'ready',presentation:{sessionId:'s'},task:{corrected:false}},
      {id:'e2',code:'03ex',title:'Otro examen',type:'exam',approved:true,preparation:'draft'}],
    sessions:[{id:'s',number:1,date:'2099-01-05',state:'',activities:[{id:'a',kind:'Cabecera',start:'09:00',end:'09:55',title:'Prueba',planned:'Conservar',observations:'Nota original',improvements:'',realized:'',pending:'',taskRefs:['e']}]}]};
}
const entry={moduleCode:'SR',unitCode:'UT03',unitId:'SR-UT03',path:'SR/UT03.json'};
function active(document){return {path:entry.path,sha:'v1',savedDocument:structuredClone(document),draft:structuredClone(document)};}

test('official exam parts are optional and validated independently of code, preparation and resources',()=>{
  for(const version of [2,3]) for(const part of [undefined,'test','practical','both']) {
    const d=fixture(version); if(part)d.tasks[1].examPart=part;
    assert.deepEqual(validateDocument(d),[]);
  }
  for(const part of ['',null,'unknown']) {const d=fixture();d.tasks[1].examPart=part;assert.ok(validateDocument(d).some(e=>e.includes('examPart')));}
  const d=fixture();d.tasks[0].examPart='test';assert.ok(validateDocument(d).some(e=>e.includes('examPart')));
  const registry={schemaVersion:1,moduleCode:'SR',tasks:[{id:'r',unitCode:'UT03',type:'exam',code:'03',title:'Examen',examPart:'both'}]};
  assert.deepEqual(validateTaskRegistry(registry,'SR'),[]);registry.tasks[0].examPart='typo';assert.ok(validateTaskRegistry(registry,'SR').some(e=>e.includes('examPart')));
});

test('classifying, changing and clearing a part preserves exam preparation, identifiers and follow-up',()=>{
  const d=fixture(),before=structuredClone(d),v=preparationValues(d);
  assert.deepEqual(v.examParts,{e:'',e2:''});v.examParts.e='test';v.examParts.e2='practical';
  const r=preparationSnapshot(d,v);assert.equal(r.tasks[1].examPart,'test');assert.equal(r.tasks[2].examPart,'practical');
  assert.equal(r.tasks[1].preparation,'ready');assert.equal(r.tasks[2].preparation,'draft');assert.deepEqual(r.tasks[1].task,before.tasks[1].task);assert.deepEqual(d,before);
  const next=preparationValues(r);next.examParts.e='both';assert.equal(preparationSnapshot(r,next).tasks[1].examPart,'both');
  next.examParts.e='';assert.equal(Object.hasOwn(preparationSnapshot(r,next).tasks[1],'examPart'),false);
  next.examParts.e='invalid';assert.throws(()=>preparationSnapshot(r,next),/parte de cada examen/);
  next.examParts.e='';next.examParts.t='test';assert.throws(()=>preparationSnapshot(r,next),/lista de exámenes/);
});

test('new exams retain an explicit part without inferring it from their code',()=>{
  const d=fixture();
  assert.equal(createPreparationTask(d,{type:'exam',code:'03ia',title:'Otra prueba'},'new').examPart,undefined);
  const combined=createPreparationTask(d,{type:'exam',code:'03ia',title:'Otra prueba',examPart:'both'},'new');
  const values=preparationValues(d);values.additions.push(combined);assert.equal(preparationSnapshot(d,values).tasks.at(-1).examPart,'both');assert.equal(combined.preparation,'draft');
  assert.throws(()=>createPreparationTask(d,{type:'task',code:'0399',title:'Tarea',examPart:'test'},'new'),/parte del examen/);
  assert.throws(()=>createPreparationTask(d,{type:'exam',code:'03ia',title:'Otra prueba',examPart:'other'},'new'),/parte del examen/);
});

test('part changes merge with unrelated pending notes and other part edits without sending those drafts',()=>{
  const d=fixture(),v=preparationValues(d),a=active(d);v.examParts.e='test';a.draft.tasks[2].examPart='practical';a.draft.sessions[0].activities[0].observations='Pendiente';
  const r=preparePreparationSave({document:d,sha:'v1'},entry,v,a);
  assert.equal(r.document.tasks[1].examPart,'test');assert.equal(r.document.tasks[2].examPart,undefined);assert.equal(r.document.sessions[0].activities[0].observations,'Nota original');
  assert.equal(r.unitDraft.tasks[1].examPart,'test');assert.equal(r.unitDraft.tasks[2].examPart,'practical');assert.equal(r.unitDraft.sessions[0].activities[0].observations,'Pendiente');
});

test('conflicting part edits and remotely changed bases stop the save without changing either draft',()=>{
  const d=fixture(),v=preparationValues(d),a=active(d);v.examParts.e='test';a.draft.tasks[1].examPart='practical';
  const before=structuredClone({d,v,a});assert.throws(()=>preparePreparationSave({document:d,sha:'v1'},entry,v,a),/dos cambios distintos/);assert.deepEqual({d,v,a},before);
  a.draft.tasks[1].examPart='test';assert.equal(preparePreparationSave({document:d,sha:'v1'},entry,v,a).unitDraft.tasks[1].examPart,'test');
  a.sha='remote';assert.throws(()=>preparePreparationSave({document:d,sha:'v1'},entry,v,a),/versiones distintas/);
});

function setupUI() {
  const previous={document:globalThis.document,window:globalThis.window},elements=new Map();
  function node(tag=''){return {tag,dataset:{},value:'',disabled:false,hidden:false,open:false,children:[],listeners:{},
    set id(value){elements.set(value,this);},focus(){},scrollIntoView(){},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},
    setAttribute(key,value){this[key]=value;},addEventListener(type,fn){this.listeners[type]=fn;},showModal(){this.open=true;},close(){this.open=false;},
    querySelectorAll(selector){return this.children.flatMap(child=>typeof child==='object'?[...(selector.split(',').includes(child.tag)?[child]:[]),...child.querySelectorAll(selector)]:[]);}};}
  const el=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id);};
  globalThis.document={getElementById:el,createElement:node,querySelectorAll:()=>[]};globalThis.window={scrollX:0,scrollY:0,confirm:()=>true,scrollTo(){}};
  let remote={document:fixture(),sha:'v1'},current=active(remote.document),busy=false,writes=0;
  const store={async load(){return structuredClone(remote);},async save(document,sha){assert.equal(sha,remote.sha);writes++;remote={document:structuredClone(document),sha:'v2'};return structuredClone(remote);}};
  const ui=createPreparationUI({getState:()=>({catalog:null}),getActive:()=>current,unitStore:()=>store,isBusy:()=>busy,setBusy:value=>busy=value,canOpen:()=>true,onStateChange(){},onMessage(){},onRetry(){},onBlocked(){},onSaved(target,result,prepared){current={...current,sha:result.sha,savedDocument:result.document,draft:prepared.unitDraft};}});
  return {el,ui,get remote(){return remote;},get current(){return current;},get writes(){return writes;},submit:()=>el('preparation-form').listeners.submit({preventDefault(){}}),cleanup(){Object.assign(globalThis,previous);}};
}

test('editing only a part enables Save and saves the classification while retaining readiness and pending notes',async()=>{
  const h=setupUI();try{
    h.current.draft.sessions[0].activities[0].observations='Nota pendiente';await h.ui.open(entry);
    const select=h.el('preparation-task-lists').querySelectorAll('select').find(s=>s['aria-label'].includes('03te'));
    assert.equal(h.el('preparation-save').disabled,true);select.value='test';select.listeners.change();
    assert.equal(h.ui.hasPending(),true);assert.equal(h.el('preparation-save').disabled,false);assert.equal(h.writes,0);
    await h.submit();assert.equal(h.writes,1);assert.equal(h.remote.document.tasks[1].examPart,'test');assert.equal(h.remote.document.tasks[1].preparation,'ready');
    assert.equal(h.current.draft.sessions[0].activities[0].observations,'Nota pendiente');assert.equal(h.remote.document.sessions[0].activities[0].observations,'Nota original');
  }finally{h.cleanup();}
});

test('a new exam exposes its part, while switching to task clears this exam-only choice',async()=>{
  const h=setupUI();try{
    await h.ui.open(entry);h.el('preparation-task-lists').querySelectorAll('button').find(b=>b.textContent==='Añadir examen').listeners.click();
    assert.equal(h.el('preparation-new-exam-part-label').hidden,false);h.el('preparation-new-exam-part').value='both';h.el('preparation-new-exam-part').listeners.input();
    assert.equal(h.ui.hasPending(),true);h.el('preparation-new-code').value='03ia';h.el('preparation-new-title').value='Nueva';h.el('preparation-new-add').listeners.click();
    const select=h.el('preparation-task-lists').querySelectorAll('select').find(s=>s['aria-label'].includes('03ia'));assert.equal(select.value,'both');
    await h.submit();assert.equal(h.remote.document.tasks.at(-1).examPart,'both');assert.equal(h.remote.document.tasks.at(-1).preparation,'draft');
    await h.ui.open(entry);h.el('preparation-task-lists').querySelectorAll('button').find(b=>b.textContent==='Añadir examen').listeners.click();
    h.el('preparation-new-exam-part').value='both';h.el('preparation-new-type').value='task';h.el('preparation-new-type').listeners.change();
    assert.equal(h.el('preparation-new-exam-part-label').hidden,true);assert.equal(h.el('preparation-new-exam-part').value,'');
  }finally{h.cleanup();}
});
