// A read-only weekly projection of the common timetable and current unit JSONs.
import { sessionPreparation } from './session-preparation.mjs?v=20261102-ppt-guided-icons';
import { preparationSummary } from './preparation.mjs?v=20261102-ppt-guided-icons';
import { excludedSession } from './replanning.mjs?v=20261102-ppt-guided-icons';
import { evaluationsFor } from './common-course.mjs?v=20261102-ppt-guided-icons';
import { visiblePlanTasks } from './task-plan.mjs?v=20261102-ppt-guided-icons';

const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0,10) === value;
const validTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const minute = value => Number(value.slice(0,2))*60 + Number(value.slice(3));
const clock = value => `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
const weekday = value => new Date(value + 'T12:00:00Z').getUTCDay() || 7;
const unique = values => [...new Set(values.filter(Boolean))];
const labels = {ready:'Sesión preparada',draft:'Sesión por preparar',pending:'UT pendiente de preparación',unknown:'Preparación sin determinar'};

export function addDays(value, count) {
  if (!validDate(value) || !Number.isInteger(count)) throw new TypeError('Fecha o desplazamiento no válido.');
  const date = new Date(value + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate()+count);
  return date.toISOString().slice(0,10);
}
export const weekStart = value => addDays(value,1-weekday(value));

function mergeIntervals(values) {
  const result=[];
  for (const interval of values.map(v=>({...v})).sort((a,b)=>a.start-b.start || a.end-b.end)) {
    const previous=result.at(-1);
    if (previous && interval.start<=previous.end) previous.end=Math.max(previous.end,interval.end);
    else result.push({start:interval.start,end:interval.end});
  }
  return result;
}
function subtract(interval, coverage) {
  let remaining=[{...interval}];
  for (const cover of mergeIntervals(coverage)) remaining=remaining.flatMap(part=>
    cover.end<=part.start || cover.start>=part.end ? [part]
      : [{start:part.start,end:Math.min(part.end,cover.start)},{start:Math.max(part.start,cover.end),end:part.end}].filter(p=>p.start<p.end));
  return remaining;
}
function intervalsFor(session, issues) {
  const values=[];
  for (const activity of session.activities ?? []) {
    if (!validTime(activity.start)||!validTime(activity.end)||activity.start>=activity.end) {
      issues.add(`La sesión ${session.id} contiene intervalos sin comprobar.`); continue;
    }
    values.push({start:minute(activity.start),end:minute(activity.end)});
  }
  const ordered=[...values].sort((a,b)=>a.start-b.start || a.end-b.end);
  if (ordered.some((v,i)=>i>0&&v.start<Math.max(...ordered.slice(0,i).map(p=>p.end)))) issues.add(`Las porciones de ${session.id} se solapan.`);
  return values;
}
function teachingLimit(common, moduleCode) {
  return evaluationsFor(common,moduleCode).filter(e=>e.limitsOrdinaryTeaching)
    .map(e=>e.programmingEndOn||e.on).filter(validDate).sort()[0] || common.course.endsOn;
}
function timetableFor(common,date,moduleCode) {
  if (date<common.course.startsOn || date>common.course.endsOn || date>teachingLimit(common,moduleCode)) return [];
  const day=weekday(date),ordinary=date>=common.timetable.effectiveFrom;
  let values=ordinary ? common.timetable.weekly.filter(s=>s.type==='teaching'&&s.moduleCode===moduleCode&&s.weekday===day).map(s=>({start:minute(s.start),end:minute(s.end)})) : [];
  for (const exception of common.timetable.exceptions ?? []) {
    if(exception.moduleCode!==moduleCode || date<exception.from || date>exception.through)continue;
    if(exception.omit.weekday===day)values=values.flatMap(slot=>subtract(slot,[{start:minute(exception.omit.start),end:minute(exception.omit.end)}]));
    if(exception.apply.weekday===day)values.push({start:minute(exception.apply.start),end:minute(exception.apply.end)});
  }
  return mergeIntervals(values);
}
function keyword(document) {
  const explicit=document.unit?.shortTitle;
  if(typeof explicit==='string'&&explicit.trim())return explicit.trim();
  const title=document.unit?.title?.trim()||document.unit?.code||'';
  return title.length<=20 ? title : document.unit?.code||title;
}
function taskMarkers(sources,records,issues) {
  const moduleCode=sources[0].document.module.code,sessionId=sources[0].session.id,found=new Map();
  const owners=records.filter(r=>r.document.module.code===moduleCode);
  const candidates=owners.flatMap(({document})=>visiblePlanTasks(document));
  const references=new Set(sources.flatMap(source=>source.session.activities.flatMap(activity=>activity.taskRefs??[])));
  for(const {document} of owners)for(const task of visiblePlanTasks(document)) {
    const presentation=task.presentation?.sessionId===sessionId;
    if(!presentation&&!references.has(task.id))continue;
    if(candidates.filter(candidate=>candidate.id===task.id).length!==1){issues.add(`La tarea ${task.code} aparece en varias unidades del módulo.`);continue;}
    found.set(task.id,{id:task.id,code:task.code,type:task.type||'task',title:task.title,presentation,continuation:!presentation});
  }
  const declared=new Set(sources.flatMap(source=>Object.hasOwn(source.session,'eventTypes')
    ? source.session.eventTypes : source.session.activities.map(activity=>activity.eventType)));
  for(const type of ['task','exam'])if(declared.has(type)&&![...found.values()].some(t=>t.type===type))found.set(`flag:${type}`,{code:'',type,title:type==='exam'?'Examen':'Tarea',presentation:true,continuation:false});
  return [...found.values()].sort((a,b)=>Number(a.continuation)-Number(b.continuation)||a.code.localeCompare(b.code,'es',{numeric:true}));
}
const taskText = marker => `${marker.continuation?'↳':''}${marker.code ? (marker.type==='exam'?'Examen ':'')+marker.code : marker.type==='exam'?'Examen':'Tarea'}`;

export function buildWeekSchedule({catalog,common,records=[],failures=[],anchorOn,today}) {
  const startOn=weekStart(anchorOn||today),endOn=addDays(startOn,4),issues=new Set();
  const days=Array.from({length:5},(_,i)=>({date:addDays(startOn,i),weekday:i+1,label:`${['L','M','X','J','V'][i]} ${addDays(startOn,i).slice(8)}/${addDays(startOn,i).slice(5,7)}`,nonTeaching:'',items:[]}));
  if(!common?.timetable || !common?.calendar || !common?.course)return {startOn,endOn,days,boundaries:[],issues:['No se han podido consultar los datos comunes.']};
  const entries=(catalog?.modules??[]).flatMap(module=>module.units.map(unit=>({...unit,moduleCode:module.code})));
  const available=[...new Map(records.filter(record=>record?.entry?.path&&record?.document?.module?.code).map(record=>[record.entry.path,record])).values()];
  const loadedPaths=new Set(available.map(record=>record.entry.path));
  const failedPaths=new Set(failures.map(f=>typeof f==='string'?f:f.path).filter(Boolean));
  entries.filter(entry=>!loadedPaths.has(entry.path)).forEach(entry=>failedPaths.add(entry.path));
  const failedModules=new Set([...failedPaths].map(path=>entries.find(entry=>entry.path===path)?.moduleCode||path.split('/')[0]));
  failures.filter(f=>typeof f==='object'&&f.moduleCode).forEach(f=>failedModules.add(f.moduleCode));
  if(failedPaths.size)issues.add('Hay unidades sin leer; su preparación y los huecos de esos módulos no se consideran comprobados.');
  const modules=unique([...(common.modules??[]).map(m=>m.code),...(catalog?.modules??[]).map(m=>m.code)]);
  const grouped=new Map(),summaries=new Map();
  for(const record of available)for(const session of record.document.sessions??[]) {
    if(!validDate(session.date))continue;
    const key=`${record.document.module.code}:${session.id}`;
    if(!grouped.has(key))grouped.set(key,[]);
    grouped.get(key).push({...record,session});
  }
  const boundaries=new Set((common.timetable.periods??[]).flatMap(period=>[minute(period.start),minute(period.end)]));
  for(const day of days) {
    const holiday=(common.calendar.nonTeaching??[]).filter(item=>day.date>=item.from&&day.date<=item.through).map(item=>item.title).join(' · ');
    day.nonTeaching=holiday||(day.date<common.course.startsOn||day.date>common.course.endsOn?'Fuera del curso':'');
    const slots=new Map(modules.map(code=>[code,day.nonTeaching?[]:timetableFor(common,day.date,code)]));
    const historical=[];
    for(const [groupKey,allSources] of grouped) {
      const sources=allSources.filter(source=>source.session.date===day.date);if(!sources.length)continue;
      const moduleCode=sources[0].document.module.code,localIssues=new Set();
      if(new Set(allSources.map(source=>source.session.date)).size>1)localIssues.add(`El identificador ${sources[0].session.id} tiene fechas incompatibles.`);
      if(new Set(sources.map(source=>excludedSession(source.session))).size>1||new Set(sources.map(source=>source.session.state).filter(Boolean)).size>1)localIssues.add(`La sesión compartida ${sources[0].session.id} tiene estados incompatibles.`);
      const intervals=sources.flatMap(source=>{
        const list=intervalsFor(source.session,localIssues);return list.map(interval=>({...interval,source}));
      });
      for(let a=0;a<intervals.length;a++)for(let b=a+1;b<intervals.length;b++)if(intervals[a].source!==intervals[b].source&&intervals[a].start<intervals[b].end&&intervals[b].start<intervals[a].end)localIssues.add(`Las UT de la sesión compartida ${sources[0].session.id} tienen porciones solapadas.`);
      if(!intervals.length){issues.add(`No hay intervalos comprobados para ${sources[0].session.id}.`);failedModules.add(moduleCode);continue;}
      const cancelled=sources.every(source=>excludedSession(source.session)),markers=cancelled?[]:taskMarkers(sources,available,localIssues);
      const prep=sources.map(source=>{
        if(!summaries.has(source.entry.path))summaries.set(source.entry.path,preparationSummary(source.document,available));
        return {unit:summaries.get(source.entry.path),session:sessionPreparation(source.document,source.session,available)};
      });
      for(const interval of mergeIntervals(intervals)) {
        const mismatched=!cancelled&&(day.nonTeaching||subtract(interval,slots.get(moduleCode)||[]).length>0);
        const reasons=[...localIssues];
        if(mismatched)reasons.push(day.nonTeaching?`Hay una sesión registrada en ${day.nonTeaching}.`:`El intervalo de ${moduleCode} no coincide con el horario común vigente.`);
        if(failedModules.has(moduleCode))reasons.push('Falta consultar parte del módulo.');
        let state=cancelled||reasons.length?'unknown':prep.some(value=>value.unit.state==='pending')?'pending'
          :prep.some(value=>!value.session.known)?'unknown':prep.every(value=>value.session.ready)?'ready':'draft';
        const relevant=sources.filter(source=>intervals.some(value=>value.source===source&&value.start<interval.end&&value.end>interval.start));
        const first=relevant[0]||sources[0],unitCode=unique(relevant.map(source=>source.document.unit.code)).join(' / '),short=unique(relevant.map(source=>keyword(source.document))).join(' / ');
        const stateLabel=cancelled?unique(sources.map(source=>source.session.state)).join(' / '):labels[state];
        const detail=unique([stateLabel,...relevant.map(source=>`${source.document.module.code} · ${source.document.unit.code} · ${source.document.unit.title}`),...reasons,...prep.map(value=>value.session.label)]).join(' · ');
        const item={key:`${groupKey}:${day.date}:${interval.start}`,moduleCode,unitCode,keyword:short,label:`${moduleCode} · ${short}${cancelled?' · '+stateLabel:''}`,taskLabel:markers.map(taskText).join(' · '),taskMarkers:markers,
          start:clock(interval.start),end:clock(interval.end),path:first.entry.path,sessionId:first.session.id,state,stateLabel,detail,placeholder:false,cancelled,
          sources:relevant.map(source=>({path:source.entry.path,sessionId:source.session.id,unitCode:source.document.unit.code,keyword:keyword(source.document)}))};
        if(cancelled)historical.push(item);else day.items.push(item);
        reasons.forEach(reason=>issues.add(reason));
      }
    }
    // Only show the un-replaced part of cancelled history, not a duplicate of a new session.
    for(const item of historical)for(const interval of subtract({start:minute(item.start),end:minute(item.end)},day.items.filter(active=>active.moduleCode===item.moduleCode).map(active=>({start:minute(active.start),end:minute(active.end)}))))
      day.items.push({...item,key:`${item.key}:${interval.start}`,start:clock(interval.start),end:clock(interval.end)});
    for(const [moduleCode,expected] of slots)for(const slot of expected) {
      const coverage=day.items.filter(item=>item.moduleCode===moduleCode).map(item=>({start:minute(item.start),end:minute(item.end)}));
      for(const gap of subtract(slot,coverage)) {
        const unavailable=failedModules.has(moduleCode),label=`${moduleCode} · ${unavailable?'No disponible':'Sin planificar'}`;
        day.items.push({key:`slot:${moduleCode}:${day.date}:${gap.start}`,moduleCode,unitCode:'',keyword:'',label,taskLabel:'',taskMarkers:[],start:clock(gap.start),end:clock(gap.end),path:'',sessionId:'',state:'unknown',stateLabel:unavailable?'Datos sin consultar':'Sin planificar',detail:unavailable?'Falta consultar parte del módulo; no se puede confirmar qué sesión corresponde.':'El horario común prevé clase, pero no hay una sesión planificada en los JSON leídos.',placeholder:true,sources:[]});
      }
    }
    day.items.sort((a,b)=>a.start.localeCompare(b.start)||a.moduleCode.localeCompare(b.moduleCode)||a.key.localeCompare(b.key));
    // Conflicting physical sessions are visible, but never shown as prepared.
    for(let a=0;a<day.items.length;a++)for(let b=a+1;b<day.items.length;b++) {
      const first=day.items[a],second=day.items[b];
      if(first.cancelled||second.cancelled||first.end<=second.start||first.start>=second.end)continue;
      if(first.sessionId&&first.sessionId===second.sessionId&&first.moduleCode===second.moduleCode)continue;
      const message=`Hay sesiones o tramos de horario solapados el ${day.date}.`;issues.add(message);
      for(const item of [first,second]){item.state='unknown';item.stateLabel=labels.unknown;item.detail+=` · ${message}`;}
    }
    for(const item of day.items){boundaries.add(minute(item.start));boundaries.add(minute(item.end));}
  }
  return {startOn,endOn,days,boundaries:[...boundaries].sort((a,b)=>a-b),issues:[...issues]};
}
