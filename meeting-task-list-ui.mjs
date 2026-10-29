import { recordKey, recordGroup } from './meeting-records.mjs?v=20261029-rf24';
import { meetingTaskRows } from './meeting-work.mjs?v=20261029-rf24';

const LABELS = { pending:'Pendiente', 'in-progress':'En curso', completed:'Completada' };
const element = (tag, text, className = '') => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0,10) === value;
const displayDate = value => validDate(value) ? value.slice(8) + '/' + value.slice(5,7) + '/' + value.slice(0,4) : 'Sin fecha';
const madridDate = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone:'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date()).map(part => [part.type,part.value]));
  return parts.year + '-' + parts.month + '-' + parts.day;
};

/** This administrative list never shares the academic Presentada/Corregida lifecycle. */
export function meetingTaskListModel(document, { groupId = '', status = '', today = madridDate() } = {}) {
  const groups = document?.groups ?? [];
  const rows = meetingTaskRows(document ?? { meetings:[], meetingTasks:[] }).map(task => {
    const records = (document?.meetings ?? []).filter(record => recordKey(record) === task.recordId);
    const record = records.length === 1 ? records[0] : null;
    const group = record ? recordGroup(document,record) : null;
    const issues = [];
    if (!record) issues.push('La reunión de origen no se ha podido localizar.');
    if (!group) issues.push('Grupo de reunión sin confirmar.');
    if (group && task.groupId && group.id !== task.groupId) issues.push('El grupo de la tarea no coincide con su reunión.');
    if (!LABELS[task.status]) issues.push('Estado de tarea sin confirmar.');
    const resolved = Boolean(record && group && !issues.length);
    const anchor = resolved ? {
      ...(record.id ? { id:record.id } : {}), ...(record.meetingId ? { meetingId:record.meetingId } : {}),
      date:record.date, groupId:group.id,
      ...(record.title ? { title:record.title } : {}),
    } : null;
    return { task, record, group, anchor, issues, resolved,
      groupId:group?.id ?? task.groupId ?? '',
      groupTitle:group?.title ?? groups.find(item => item.id === task.groupId)?.title ?? 'Sin grupo confirmado',
      statusLabel:LABELS[task.status] ?? 'Estado sin confirmar',
      overdue:task.status !== 'completed' && validDate(task.dueOn) && validDate(today) && task.dueOn < today,
    };
  });
  const filtered = rows.filter(row => (!groupId || row.groupId === groupId) && (!status || row.task.status === status));
  filtered.sort((a,b) => (a.task.dueOn || '9999-99-99').localeCompare(b.task.dueOn || '9999-99-99') || (a.record?.date || '').localeCompare(b.record?.date || '') || a.task.id.localeCompare(b.task.id));
  return { groups, rows:filtered, total:rows.length };
}

/** Read-only registry view. Only the delegated independent task editor may save. */
export function createMeetingTaskListUI({ getCatalog, getReader, isBusy, setBusy, openTask, onLoaded, onStateChange = () => {} }) {
  let loaded = null, mounted = null, error = '', loading = false, generation = 0;
  const filters = { groupId:'', status:'' };
  const controls = new Set();
  const busy = () => loading || isBusy();
  const notify = () => { render(); onStateChange(); };

  function availability() { for (const control of controls) control.disabled = busy() || control.dataset.unresolved === 'true'; }
  function filterSelect(id,label,options,current,onChange) {
    const wrap = element('label',label,'meeting-task-filter');
    const select = element('select'); select.id = id; select.setAttribute('aria-label',label);
    for (const [value,title] of options) { const option = element('option',title); option.value=value; select.append(option); }
    if (current && !options.some(([value]) => value === current)) { const option = element('option','Selección anterior no disponible'); option.value=current; select.append(option); }
    select.value=current;
    select.addEventListener('change',() => { onChange(select.value); render(); mounted?.querySelector('#' + id)?.focus(); });
    controls.add(select); wrap.append(select); return wrap;
  }
  function render(container = mounted) {
    if (container) mounted=container;
    if (!mounted) return;
    controls.clear(); mounted.replaceChildren();
    const heading=element('div',undefined,'meeting-task-list-heading');
    heading.append(element('h2','Tareas de reuniones'));
    const refresh=element('button','Actualizar tareas de reuniones','button button-small'); refresh.type='button'; refresh.id='meeting-tasks-refresh'; refresh.addEventListener('click',load); controls.add(refresh); heading.append(refresh); mounted.append(heading);
    mounted.append(element('p','Pendiente, En curso o Completada · El plazo no cambia el estado de la tarea.','scope-note'));
    if (loading) { const p=element('p','Leyendo tareas de reuniones…','scope-note'); p.setAttribute('role','status'); mounted.append(p); availability(); return; }
    if (error) { const p=element('p',error,'message error'); p.id='meeting-tasks-message'; p.setAttribute('role','alert'); mounted.append(p); availability(); return; }
    if (!loaded?.document) { mounted.append(element('p','Actualiza para consultar las tareas de reuniones.','scope-note')); availability(); return; }
    const model=meetingTaskListModel(loaded.document,filters),toolbar=element('div',undefined,'meeting-task-filters');
    toolbar.append(filterSelect('meeting-tasks-group','Grupo',[['','Todos los grupos'],...model.groups.map(group => [group.id,group.title])],filters.groupId,value => { filters.groupId=value; }));
    toolbar.append(filterSelect('meeting-tasks-status','Estado',[['','Todos los estados'],...Object.entries(LABELS)],filters.status,value => { filters.status=value; }));
    const count=element('span',model.rows.length + '/' + model.total,'scope-note'); count.id='meeting-tasks-count'; count.setAttribute('aria-label',model.rows.length + ' tareas visibles de ' + model.total); toolbar.append(count); mounted.append(toolbar);
    const list=element('div',undefined,'meeting-task-global-list'); list.id='meeting-tasks-list';
    if (!model.rows.length) list.append(element('p',model.total ? 'No hay tareas con estos filtros.' : 'Todavía no hay tareas de reuniones guardadas.','scope-note'));
    for (const row of model.rows) {
      const card=element('article',undefined,'meeting-task-global-row'); card.dataset.taskId=row.task.id;
      const title=element('h3',row.task.title || 'Tarea sin título');
      const source=element('p',row.groupTitle + ' · Reunión de origen: ' + displayDate(row.record?.date),'meeting-task-source');
      if (row.record?.title) source.append(document.createTextNode(' · ' + row.record.title));
      const status=element('span',row.statusLabel,'meeting-task-status'); status.dataset.status=row.task.status;
      const due=element('span',row.task.dueOn ? 'Plazo: ' + displayDate(row.task.dueOn) : 'Sin plazo','meeting-task-due');
      if (row.overdue) { due.append(document.createTextNode(' · Vencida')); due.classList.add('meeting-task-overdue'); }
      const info=element('div',undefined,'meeting-task-global-main'); info.append(title,source);
      const details=element('div',undefined,'meeting-task-global-meta'); details.append(status,due); info.append(details);
      if (row.task.notes) info.append(element('p',row.task.notes,'meeting-task-global-notes'));
      for (const issue of row.issues) info.append(element('p',issue,'message warning'));
      const edit=element('button','Editar','button button-small'); edit.type='button'; edit.dataset.taskId=row.task.id; edit.dataset.unresolved=String(!row.resolved); edit.setAttribute('aria-label','Editar tarea de reunión: ' + row.task.title); controls.add(edit);
      edit.addEventListener('click',async() => { if (busy() || !row.resolved) return; try { await openTask(row.task.id,row.anchor); } catch { error='No se ha podido abrir la tarea. Se conservan las notas pendientes.'; notify(); } });
      card.append(info,edit); list.append(card);
    }
    mounted.append(list); availability();
  }
  async function load() {
    if (isBusy() || loading) return false;
    const ticket=++generation,reader=getReader(),catalog=getCatalog();
    if (!reader || !catalog) { loaded=null; error='Conecta con el cuaderno para consultar las tareas de reuniones.'; notify(); return false; }
    loaded=null; error=''; loading=true; setBusy(true); notify();
    try {
      const result=await reader.load(catalog);
      if (ticket!==generation) return false;
      if (!result?.document) throw Error('MissingMeetingRegistry');
      // The owner can reject a newly read base when it conflicts with an open note draft.
      const accepted=await onLoaded?.(result);
      if (ticket!==generation) return false;
      if (accepted===false) { loaded=null; error='La lectura requiere revisar los borradores de reuniones. Se conservan las notas pendientes; no se muestran datos antiguos.'; return false; }
      loaded=result; error=''; return true;
    } catch { if (ticket===generation) { loaded=null; error='No se han podido leer las tareas de reuniones. Puedes reintentar; los borradores permanecen intactos.'; } return false; }
    finally { if (ticket===generation) loading=false; setBusy(false); notify(); }
  }
  return {
    load,render,availability,hasError:() => Boolean(error),
    accept(result) { if (!loading) generation++; loaded=result?.document ? result : null; error=result?.document ? '' : 'No hay una lectura confirmada del registro de reuniones.'; notify(); },
    clear() { generation++; loaded=null; loading=false; error=''; filters.groupId=''; filters.status=''; if (mounted) mounted.replaceChildren(); controls.clear(); },
  };
}
