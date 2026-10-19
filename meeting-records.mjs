const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'&&v.trim().length>0;
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
export const SPACE_VALUES=['meetings','project'];
export function validateMeetingDocument(doc) {
  if(!object(doc)||![1,2].includes(doc.schemaVersion)||doc.kind!=='meeting-notes'||!Array.isArray(doc.meetings))return ['Formato de reuniones no válido.'];
  const errors=[],groupIds=new Set(),refs=new Set(),recordIds=new Set(),occurrences=new Set();
  if(doc.schemaVersion===2){
    if(!Array.isArray(doc.spaces)||!Array.isArray(doc.groups))return ['Faltan los espacios y grupos de reuniones.'];
    const spaces=new Set();
    for(const s of doc.spaces){if(!object(s)||!SPACE_VALUES.includes(s.id)||!text(s.title)||spaces.has(s.id))errors.push('Espacio de reunión no válido.');else spaces.add(s.id);}
    for(const g of doc.groups){
      if(!object(g)||!text(g.id)||!text(g.title)||!spaces.has(g.space)||groupIds.has(g.id)||!Array.isArray(g.scheduleRefs)||g.scheduleRefs.some(r=>!text(r))) {errors.push('Grupo de reunión no válido.');continue;}
      groupIds.add(g.id);
      for(const ref of g.scheduleRefs){if(refs.has(ref))errors.push('Una reunión del horario pertenece a varios grupos.');refs.add(ref);}
    }
  }
  for(const r of doc.meetings){
    if(!object(r)||!date(r.date)||(!text(r.meetingId)&&!(doc.schemaVersion===2&&text(r.id)&&groupIds.has(r.groupId)&&text(r.title)))){errors.push('Referencia de reunión no válida.');continue;}
    if(r.id!==undefined){if(!text(r.id)||recordIds.has(r.id))errors.push('Identificador de reunión no válido o duplicado.');recordIds.add(r.id);}
    if(r.groupId!==undefined&&!groupIds.has(r.groupId))errors.push('Grupo de reunión desconocido.');
    if(r.title!==undefined&&typeof r.title!=='string')errors.push('Título de reunión no válido.');
    if(text(r.meetingId)){const key=`${r.meetingId}:${r.date}`;if(occurrences.has(key))errors.push('Hay dos registros de la misma convocatoria.');occurrences.add(key);}
    for(const f of ['topics','requests'])if(r[f]!==undefined&&(!Array.isArray(r[f])||r[f].some(v=>typeof v!=='string')))errors.push('Los temas y ruegos deben ser listas de textos.');
    if(r.notes!==undefined&&typeof r.notes!=='string')errors.push('Las notas deben ser texto.');
  }
  return errors;
}
export const recordKey=r=>r.id??`schedule:${r.meetingId}:${r.date}`;
export function recordGroup(doc,record){return doc?.groups?.find(g=>g.id===record.groupId)??doc?.groups?.find(g=>g.scheduleRefs.includes(record.meetingId))??null;}
export function groupForSchedule(doc,meetingId){return doc?.groups?.find(g=>g.scheduleRefs.includes(meetingId))??null;}
export function meetingHistory(doc,space,groupId=null){return (doc?.meetings??[]).filter(r=>{
  const g=recordGroup(doc,r);return groupId?g?.id===groupId:((g?.space??'meetings')===space||(space==='meetings'&&g?.space==='project'));
}).slice().sort((a,b)=>b.date.localeCompare(a.date)||recordKey(a).localeCompare(recordKey(b)));}
export function meetingTitle(doc,record,common){return record.title?.trim()||common?.timetable.weekly.find(s=>s.type==='meeting'&&s.id===record.meetingId)?.title||recordGroup(doc,record)?.title||'Reunión';}
export function withMeetingRecord(doc,originalKey,draft){
  if(validateMeetingDocument(doc).length)throw Error('Registro de reuniones no válido.');
  const next=structuredClone(doc),index=originalKey?next.meetings.findIndex(r=>recordKey(r)===originalKey):-1;
  if(originalKey&&index<0)throw Error('La reunión original ya no existe.');
  const original=index>=0?next.meetings[index]:{};
  const record={...original,...draft};
  if(index>=0)next.meetings[index]=record;else next.meetings.push(record);
  if(validateMeetingDocument(next).length)throw Error('Revisa la fecha, el grupo y los textos de la reunión.');
  return next;
}
