import { saveErrorFeedback } from './core.mjs?v=20261018-rf12';
import { recordKey, recordGroup, groupForSchedule, meetingHistory, meetingTitle, withMeetingRecord } from './meeting-records.mjs?v=20261019-meetings';
import { madridClock, meetingContext, meetingGroupContext } from './startup-context.mjs?v=20261019-meetings';
const $=id=>document.getElementById(id);
const node=(tag,text,className='')=>{const e=document.createElement(tag);e.className=className;if(text!==undefined)e.textContent=text;return e;};
const listText=value=>(value??[]).join('\n');
const lines=value=>value.split('\n').map(v=>v.trim()).filter(Boolean);
const newId=()=>`meeting-${[...crypto.getRandomValues(new Uint32Array(4))].map(n=>n.toString(16).padStart(8,'0')).join('')}`;
export function createMeetingWorkspace({getCatalog,getReader,getCommon,isBusy,setBusy,onStateChange,onLocation,onRemember,onShow,onWarning}){
  let loaded=null,space='meetings',groupId=null,record=null,baseline=null,draftId=null,blocked=false,error=false;
  const controls=['meeting-record-date','meeting-record-title','meeting-topics','meeting-requests','meeting-notes'];
  const message=(content='',kind='')=>{const e=$('meetings-message');e.textContent=content;e.className=`message${kind?' '+kind:''}`;e.hidden=!content;};
  function values(){return {date:$('meeting-record-date').value,title:$('meeting-record-title').value,topics:$('meeting-topics').value,requests:$('meeting-requests').value,notes:$('meeting-notes').value};}
  const pending=()=>Boolean(baseline&&(blocked||JSON.stringify(values())!==JSON.stringify(baseline)));
  function availability(){
    const busy=isBusy(),dirty=pending();
    controls.forEach(id=>{$(id).disabled=busy||!baseline||blocked;});
    $('meeting-record-date').readOnly=Boolean(record?.meetingId);
    $('meeting-record-title').readOnly=Boolean(record?.meetingId);
    $('meeting-save').disabled=busy||!dirty||blocked;
    $('meeting-new').disabled=busy||dirty||!loaded?.document?.groups?.some(g=>g.id===groupId);
    $('meeting-update').disabled=busy||!getReader();
    $('meeting-download').hidden=!dirty;$('meeting-download').disabled=busy;
    $('meeting-discard').hidden=!dirty;$('meeting-discard').disabled=busy;
    $('meeting-history').querySelectorAll('button').forEach(b=>{b.disabled=busy||dirty;});
    $('meeting-editor').hidden=!baseline;
  }
  function change(){availability();onStateChange();}
  function group(){return loaded?.document?.groups?.find(g=>g.id===groupId)??null;}
  function notifyLocation(){onLocation({space,groupId});}
  function accept(result){loaded=result;blocked=false;error=false;}
  function resetEditor(){record=null;baseline=null;draftId=null;blocked=false;controls.forEach(id=>{$(id).value='';});}
  function populate(selected){
    record=selected;draftId=selected?.id??newId();
    const g=selected?recordGroup(loaded.document,selected):group();
    if(g){space=g.space;groupId=g.id;}
    const v={date:selected?.date??madridClock().date,title:selected?meetingTitle(loaded.document,selected,getCommon()):(g?.title??''),topics:selected?.topics??[],requests:selected?.requests??[],notes:selected?.notes??''};
    $('meeting-record-date').value=v.date;$('meeting-record-title').value=v.title;$('meeting-topics').value=listText(v.topics);$('meeting-requests').value=listText(v.requests);$('meeting-notes').value=v.notes;
    baseline=values();blocked=false;
    renderHistory();notifyLocation();change();
  }
  function renderHistory(){
    const doc=loaded?.document,g=group(),title=g?.title??doc?.spaces?.find(s=>s.id===space)?.title??'Reuniones';
    $('meeting-space-title').textContent=title;
    const history=$('meeting-history');history.replaceChildren();
    if(!doc){history.append(node('p','No se ha podido leer el registro de reuniones.','scope-note'));return;}
    const records=meetingHistory(doc,space,groupId);
    if(!records.length)history.append(node('p','Todavía no hay reuniones guardadas en este grupo.','scope-note'));
    for(const r of records){const button=node('button',`${r.date.split('-').reverse().join('/')} · ${meetingTitle(doc,r,getCommon())}`,'button meeting-history-item');button.type='button';button.setAttribute('aria-pressed',String(Boolean(record&&recordKey(record)===recordKey(r))));button.addEventListener('click',()=>openRecord(recordKey(r)));history.append(button);}
    $('meeting-new').hidden=!g;
  }
  async function read(){const result=await getReader().load(getCatalog());if(!result.document)throw Error('MissingMeetingRegistry');accept(result);}
  async function openGroup(nextSpace,nextGroup=null){
    if(isBusy()||document.querySelector('dialog[open]'))return false;
    if(pending()){
      if(space===nextSpace&&(nextGroup===groupId||nextGroup===null)){onShow();notifyLocation();change();return true;}
      onWarning('Guarda o descarta las notas de reunión antes de abrir otro grupo.');notifyLocation();return false;
    }
    setBusy(true);
    try{await read();space=nextSpace;groupId=nextGroup;
      if(groupId&&!loaded.document.groups?.some(g=>g.id===groupId&&g.space===space))throw Error('UnknownMeetingGroup');
      resetEditor();message();renderHistory();notifyLocation();onShow();onRemember(meetingGroupContext(space,groupId));return true;
    }catch{error=true;message('No se puede abrir el registro de reuniones. Se conservan los borradores y puedes reintentar.','error');onShow();return false;}
    finally{setBusy(false);change();}
  }
  async function openRecord(key){
    if(isBusy())return false;
    if(pending()){onWarning('Guarda o descarta las notas de esta reunión antes de abrir otra.');return false;}
    setBusy(true);
    try{await read();const selected=loaded.document.meetings.find(r=>recordKey(r)===key);if(!selected)throw Error('MissingMeeting');populate(selected);message();onShow();onRemember(meetingContext({...selected,recordId:selected.id,groupId:recordGroup(loaded.document,selected)?.id,space:recordGroup(loaded.document,selected)?.space}));return true;}
    catch{error=true;message('No se ha podido recuperar la reunión. Las notas pendientes se conservan.','error');return false;}
    finally{setBusy(false);change();}
  }
  async function openScheduled(meeting,initial=false){
    if((isBusy()&&!initial)||document.querySelector('dialog[open]'))return false;
    if(pending()){onWarning('Guarda o descarta las notas de reunión antes de abrir otra.');notifyLocation();return false;}
    if(!initial)setBusy(true);
    try{await read();const g=groupForSchedule(loaded.document,meeting.meetingId);space=g?.space??'meetings';groupId=g?.id??null;
      const saved=loaded.document.meetings.find(r=>r.meetingId===meeting.meetingId&&r.date===meeting.date);
      populate(saved??{meetingId:meeting.meetingId,date:meeting.date,...(g?{groupId:g.id}:{})});
      message();onShow();onRemember(meetingContext({...meeting,groupId:g?.id,space:g?.space}));return true;
    }catch{error=true;message('No se ha podido leer la convocatoria y sus notas. No se considera un registro vacío.','error');onShow();return false;}
    finally{if(!initial)setBusy(false);change();}
  }
  async function save(event){
    event.preventDefault();if(isBusy()||blocked||!pending())return;
    const v=values();
    const topics=record&&v.topics===baseline.topics?(record.topics??[]):lines(v.topics);
    const requests=record&&v.requests===baseline.requests?(record.requests??[]):lines(v.requests);
    if(!topics.some(x=>x.trim())&&!requests.some(x=>x.trim())&&!v.notes.trim()){message('Añade al menos un tema, ruego o nota antes de guardar.','error');return;}
    setBusy(true);
    try{
      const fields={id:record?.id??draftId,date:v.date,topics,requests,notes:v.notes};
      if(record?.meetingId)fields.meetingId=record.meetingId;else fields.title=v.title.trim();
      if(groupId)fields.groupId=groupId;
      // A scheduled record opened for the first time has no persisted identity yet.
      const exists=record&&loaded.document.meetings.some(r=>recordKey(r)===recordKey(record));
      const next=withMeetingRecord(loaded.document,exists?recordKey(record):null,fields);
      const confirmed=await getReader().save(getCatalog(),next,loaded.sha);accept(confirmed);
      populate(confirmed.document.meetings.find(r=>r.id===fields.id));message('Reunión guardada y comprobada.');
      onRemember(meetingContext({...record,recordId:record.id,space:group()?.space,groupId:group()?.id}));
    }catch(e){const feedback=saveErrorFeedback(e);blocked=feedback.requiresReload;error=true;message(feedback.message,feedback.kind);}
    finally{setBusy(false);change();}
  }
  async function update(){
    if(isBusy())return;
    if(pending()&&!window.confirm('La lectura sustituirá las notas pendientes de esta reunión. Descarga el borrador si quieres conservarlo. ¿Descartar y leer GitHub?'))return;
    const key=record?recordKey(record):null;setBusy(true);
    try{await read();const selected=key?loaded.document.meetings.find(r=>recordKey(r)===key):null;resetEditor();if(selected)populate(selected);else renderHistory();message('Registro actualizado.');}
    catch{error=true;message('No se ha podido actualizar. El borrador permanece intacto.','error');}
    finally{setBusy(false);change();}
  }
  $('meeting-form').addEventListener('submit',save);
  $('meeting-form').addEventListener('input',change);
  $('meeting-new').addEventListener('click',()=>{if(!isBusy()&&!pending()){populate(null);message();$('meeting-record-title').focus();}});
  $('meeting-update').addEventListener('click',update);
  $('meeting-all').addEventListener('click',()=>openGroup(space,null));
  $('meeting-discard').addEventListener('click',()=>{if(isBusy()||!window.confirm('¿Descartar las notas pendientes de esta reunión?'))return;resetEditor();renderHistory();message();change();});
  $('meeting-download').addEventListener('click',()=>{if(!baseline)return;const data={recordId:record?.id??draftId,groupId,values:values()};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=node('a');a.href=url;a.download='borrador-reunion.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  return {seed(result){if(!pending()){accept(result);renderHistory();change();}},document:()=>loaded?.document??null,groups:()=>loaded?.document?.groups??[],spaces:()=>loaded?.document?.spaces??(loaded?.document?[{id:'meetings',title:'Reuniones'}]:[]),location:()=>({space,groupId}),hasPending:pending,hasError:()=>error,availability,openGroup,openRecord,openScheduled,clear(){loaded=null;resetEditor();space='meetings';groupId=null;message();$('meeting-history').replaceChildren();change();}};
}
