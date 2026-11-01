import { addDays, buildWeekSchedule, weekStart } from './weekly-schedule.mjs?v=20261101-exam-fiches';

const dayLetters = ['', 'L', 'M', 'X', 'J', 'V', 'S', 'D'];
const dayNames = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const stateNames = { ready:'Preparada', draft:'Falta preparar', pending:'UT pendiente', unknown:'Sin determinar' };
const stateSymbols = { ready:'✓', draft:'◔', pending:'!', unknown:'?' };
const element = (tag, className='', text) => {
  const node = document.createElement(tag); if (className) node.className = className;
  if (text !== undefined) node.textContent = text; return node;
};
const weekday = date => new Date(date+'T12:00:00Z').getUTCDay() || 7;
const minutes = value => Number(value.slice(0,2))*60+Number(value.slice(3));
const clock = value => `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
const shortDate = date => `${date.slice(8)}/${date.slice(5,7)}`;
const month = date => new Intl.DateTimeFormat('es-ES',{month:'short',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')).replace('.','');
const validDate = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

function place(node, column, start, end=start+1) {
  node.style.setProperty('--weekly-col', String(column));
  node.style.setProperty('--weekly-start', String(start));
  node.style.setProperty('--weekly-end', String(end));
  return node;
}

/** Overlaps share one flexible cell instead of hiding one another. */
function clusters(items) {
  const groups = [];
  for (const item of [...items].sort((a,b)=>a.start.localeCompare(b.start)||a.end.localeCompare(b.end))) {
    const start=minutes(item.start), end=minutes(item.end), last=groups.at(-1);
    if (last && start<last.end) { last.items.push(item); last.end=Math.max(last.end,end); }
    else groups.push({start,end,items:[item]});
  }
  return groups;
}

export function createWeeklyScheduleUI({ getState, isBusy, onOpen, onRefresh }) {
  let anchorOn=null, selectedDate=null, localError='';
  const root = () => document.getElementById('schedule-content');
  const today = () => {
    const value=getState().today;
    return validDate(value)?value:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  };
  function tomorrow() {
    let date=addDays(today(),1);
    while(weekday(date)>5)date=addDays(date,1);
    return date;
  }
  function selectDate(date) { anchorOn=date; selectedDate=date; localError=''; render(); }
  function moveWeek(amount) {
    const index=selectedDate?Math.min(weekday(selectedDate),5)-1:0;
    anchorOn=addDays(weekStart(anchorOn||today()),amount*7);
    selectedDate=addDays(anchorOn,index);localError='';render();
  }
  function button(text,label,action,key) {
    const node=element('button','weekly-control',text);node.type='button';node.title=label;
    node.setAttribute('aria-label',label);node.dataset.scheduleFocus=key;node.disabled=isBusy()||getState().loading;
    node.addEventListener('click',()=>{if(!node.disabled)action();});return node;
  }
  async function refresh() {
    if(isBusy()||getState().loading)return;
    localError='';
    try { await onRefresh(); } catch { localError='No se ha podido actualizar el horario. Puedes volver a intentarlo.'; }
    render();
  }
  function open(path,sessionId) {
    if(isBusy())return;
    Promise.resolve(onOpen(path,sessionId)).catch(()=>{localError='No se ha podido abrir la sesión. La consulta y las notas se conservan.';render();});
  }
  function tile(item) {
    const sources=item.sources||[];
    const navigable=Boolean(item.path&&item.sessionId&&!item.placeholder&&sources.length<=1);
    const card=element('article',`weekly-session weekly-state-${item.state||'unknown'} weekly-module-${item.moduleCode||'none'}${item.cancelled?' is-cancelled':''}`);
    const detail=[`${item.start}–${item.end}`,item.label,item.taskLabel,item.stateLabel||stateNames[item.state],item.detail].filter(Boolean).join(' · ');
    card.title=detail;card.dataset.state=item.state||'unknown';card.dataset.sessionId=item.sessionId||'';
    const main=element(navigable?'button':'div','weekly-session-main');
    if(navigable){main.type='button';main.disabled=isBusy();main.addEventListener('click',()=>open(item.path,item.sessionId));}
    main.setAttribute('aria-label',detail);
    const label=element('span','weekly-session-label',item.label||`${item.moduleCode} · ${item.keyword||item.unitCode||''}`);
    const state=element('span','weekly-state-symbol',stateSymbols[item.state]||'?');state.setAttribute('aria-hidden','true');
    main.append(label,state);
    if(item.taskLabel)main.append(element('span','weekly-session-tasks',item.taskLabel));
    card.append(main);
    if(sources.length>1){
      const access=element('div','weekly-shared-sources');access.setAttribute('aria-label','Unidades de la sesión compartida');
      for(const source of sources){
        const link=element('button','',source.unitCode);link.type='button';link.disabled=isBusy();
        link.setAttribute('aria-label',`Abrir ${source.unitCode} de esta sesión compartida`);
        link.addEventListener('click',()=>open(source.path,source.sessionId));access.append(link);
      }
      card.append(access);
    }
    return card;
  }
  function toolbar(model) {
    const header=element('div','weekly-toolbar'),nav=element('div','weekly-week-nav');
    nav.setAttribute('role','group');nav.setAttribute('aria-label','Semana del horario');
    nav.append(button('‹','Semana anterior',()=>moveWeek(-1),'previous'));
    const range=element('h2','weekly-week-title',`${Number(model.startOn.slice(8))}–${Number(model.endOn.slice(8))} ${month(model.endOn)} ${model.endOn.slice(0,4)}`);
    if(model.startOn.slice(0,7)!==model.endOn.slice(0,7))range.textContent=`${Number(model.startOn.slice(8))} ${month(model.startOn)} – ${Number(model.endOn.slice(8))} ${month(model.endOn)} ${model.endOn.slice(0,4)}`;
    range.setAttribute('aria-live','polite');nav.append(range,button('›','Semana siguiente',()=>moveWeek(1),'next'));
    const quick=element('div','weekly-shortcuts');quick.setAttribute('role','group');quick.setAttribute('aria-label','Ir a una fecha');
    quick.append(button('Hoy','Ver esta semana y el día de hoy',()=>selectDate(today()),'today'),
      button('Mañana','Ver mañana o el próximo lunes si cae en fin de semana',()=>selectDate(tomorrow()),'tomorrow'),
      button('Próxima semana','Ver la próxima semana',()=>selectDate(addDays(weekStart(today()),7)),'next-week'),
      button('↻','Actualizar horario de todos los módulos',refresh,'refresh'));
    header.append(nav,quick);return header;
  }
  function legend() {
    const bar=element('div','weekly-legend');bar.setAttribute('aria-label','Estados de preparación');
    for(const state of ['ready','draft','pending','unknown']){
      const entry=element('span',`weekly-legend-entry weekly-state-${state}`);
      entry.append(element('span','weekly-legend-swatch',stateSymbols[state]),element('span','',stateNames[state]));bar.append(entry);
    }
    return bar;
  }
  function dayTabs(model) {
    const nav=element('nav','weekly-day-tabs');nav.setAttribute('aria-label','Día del horario');
    for(const day of model.days){
      const node=button('',`${dayNames[day.weekday]} ${shortDate(day.date)}${day.nonTeaching?' · No lectivo':''}`,()=>{selectedDate=day.date;render();},'day-'+day.date);
      node.classList.add('weekly-day-tab');node.setAttribute('aria-pressed',String(day.date===selectedDate));
      if(day.date===today())node.setAttribute('aria-current','date');
      node.append(element('strong','',dayLetters[day.weekday]),element('span','',shortDate(day.date)));
      nav.append(node);
    }
    return nav;
  }
  function desktop(model,state) {
    const view=element('div','weekly-desktop'),grid=element('div','weekly-grid');
    grid.setAttribute('role','region');grid.setAttribute('aria-label','Horario semanal de todos los módulos');
    const bounds=model.boundaries;
    if(bounds.length<2){view.append(element('p','empty-sessions','No hay tramos de horario disponibles para esta semana.'));return view;}
    const tracks=bounds.slice(0,-1).map((start,i)=>`minmax(${Math.max(14,Math.round((bounds[i+1]-start)*.9))}px,auto)`).join(' ');
    grid.style.setProperty('--weekly-row-template',tracks);
    grid.append(place(element('div','weekly-grid-corner','Hora'),1,1));
    const periods=state.common.timetable.periods||[];
    const firstPeriod=periods.length?minutes(periods[0].start):bounds[0],lastPeriod=periods.length?minutes(periods.at(-1).end):bounds.at(-1);
    for(let index=0;index<bounds.length;index++){
      const time=place(element('div','weekly-time',clock(bounds[index])),1,index+2);
      const inside=periods.some(period=>minutes(period.start)<=bounds[index]&&minutes(period.end)>bounds[index]);
      if(index<bounds.length-1&&!inside&&bounds[index]>=firstPeriod&&bounds[index]<lastPeriod){time.classList.add('is-break');time.append(element('small','','Pausa'));}
      grid.append(time);
    }
    for(const [dayIndex,day] of model.days.entries()){
      const header=place(element('div',`weekly-day-heading${day.date===today()?' is-today':''}${day.nonTeaching?' is-non-teaching':''}`),dayIndex+2,1);
      header.append(element('strong','',`${dayNames[day.weekday]} ${shortDate(day.date)}`));
      if(day.nonTeaching){const note=element('span','','No lectivo');note.title=day.nonTeaching;header.append(note);}
      grid.append(header);
      for(let index=0;index<bounds.length-1;index++){
        const inside=periods.some(period=>minutes(period.start)<=bounds[index]&&minutes(period.end)>=bounds[index+1]);
        grid.append(place(element('div',`weekly-grid-cell${inside?'':' is-break'}${day.nonTeaching?' is-non-teaching':''}`),dayIndex+2,index+2));
      }
      for(const cluster of clusters(day.items)){
        const start=bounds.indexOf(cluster.start),end=bounds.indexOf(cluster.end);
        if(start<0||end<=start)continue;
        const box=place(element('div','weekly-session-cluster'),dayIndex+2,start+2,end+2);
        box.style.setProperty('--weekly-overlap-count',String(cluster.items.length));
        for(const item of cluster.items)box.append(tile(item));grid.append(box);
      }
    }
    view.append(grid);return view;
  }
  function mobile(model) {
    const view=element('section','weekly-mobile');view.setAttribute('aria-label','Sesiones del día seleccionado');
    const day=model.days.find(item=>item.date===selectedDate);
    if(!day){view.append(element('p','weekly-day-message','El día seleccionado cae en fin de semana. Elige un día de la semana.'));return view;}
    const heading=element('h3','visually-hidden',`${dayNames[day.weekday]} ${shortDate(day.date)}`);view.append(heading);
    if(day.nonTeaching)view.append(element('p','weekly-day-message',`No lectivo · ${day.nonTeaching}`));
    for(const item of day.items){
      const row=element('div','weekly-mobile-row');row.append(element('span','weekly-mobile-time',`${item.start}–${item.end}`),tile(item));view.append(row);
    }
    if(!day.items.length&&!day.nonTeaching)view.append(element('p','weekly-day-message','No hay clases en el horario de este día.'));
    return view;
  }
  function render() {
    const container=root();if(!container)return;
    const focus=document.activeElement;
    const focusKey=container.contains(focus)?focus?.dataset.scheduleFocus:null;
    const state=getState();
    if(!anchorOn){anchorOn=tomorrow();selectedDate=anchorOn;}
    let model={startOn:weekStart(anchorOn),endOn:addDays(weekStart(anchorOn),4),days:[],boundaries:[],issues:[]};
    if(state.common&&!state.commonError)model=buildWeekSchedule({...state,anchorOn,today:today()});
    container.replaceChildren(toolbar(model));
    const message=localError||state.commonError||(state.loading?'Leyendo el horario y las sesiones…':'');
    if(message){const note=element('p',`message ${state.commonError||localError?'warning':''}`,message);note.setAttribute('role','status');container.append(note);}
    if(!state.common||state.commonError){if(!message)container.append(element('p','weekly-day-message','Actualiza la consulta para leer el horario común.'));return;}
    container.append(dayTabs(model),legend());
    if(model.issues.length){const warning=element('details','weekly-issues'),summary=element('summary','',`${model.issues.length} aviso${model.issues.length===1?'':'s'} de la consulta`);const list=element('ul');for(const issue of model.issues)list.append(element('li','',issue));warning.append(summary,list);container.append(warning);}
    container.append(desktop(model,state),mobile(model));
    if(focusKey)container.querySelector(`[data-schedule-focus="${focusKey}"]`)?.focus({preventScroll:true});
  }
  return {render,focusTomorrow(){if(!anchorOn){anchorOn=tomorrow();selectedDate=anchorOn;}render();},clear(){anchorOn=null;selectedDate=null;localError='';root()?.replaceChildren();}};
}
