import { saveErrorFeedback } from './core.mjs?v=20261027-rf32';
import { recordKey, recordGroup } from './meeting-records.mjs?v=20261029-rf24';
import { withMeetingTask, withMeetingMinutes, meetingTaskRows, draftMeetingMinutes } from './meeting-work.mjs?v=20261029-rf24';

const STATES = [['pending', 'Pendiente'], ['in-progress', 'En curso'], ['completed', 'Completada']];
const stateLabel = value => STATES.find(([key]) => key === value)?.[1] ?? value;
const node = (tag, text, className = '') => { const e = document.createElement(tag); e.className = className; if (text !== undefined) e.textContent = text; return e; };
const uid = prefix => prefix + (globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : [...crypto.getRandomValues(new Uint32Array(4))].map(n => n.toString(16).padStart(8, '0')).join(''));
const dateLabel = value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value.slice(8) + '/' + value.slice(5, 7) + '/' + value.slice(0, 4) : 'Sin plazo';
const anchorKey = anchor => anchor ? recordKey(anchor) : null;
const cleanAnchor = anchor => anchor ? Object.fromEntries(['id', 'meetingId', 'date', 'groupId', 'title'].filter(key => anchor[key] !== undefined).map(key => [key, anchor[key]])) : null;

/** Separate, explicit task/acta saves. Meeting and Unit drafts never enter these snapshots. */
export function createMeetingWorkUI({ getState, isBusy, setBusy, onSaved, onStateChange, onWarning = () => {}, onSavedMessage = onWarning }) {
  let current = null, loaded = null, anchor = null, originalTaskId = null, baseline = null, blocked = false, error = false, origin = null, printRoot = null;
  const dialogs = {}, fields = {}, actions = {}, messages = {};
  const containers = new Map();

  function button(id, text, primary = false) {
    const e = node('button', text, 'button' + (primary ? ' button-primary' : '')); e.id = id; e.type = 'button'; return e;
  }
  function field(form, name, label, tag = 'input', type = 'text') {
    const wrap = node('label', label), input = node(tag); input.id = name;
    if (tag === 'input') input.type = type;
    if (tag === 'textarea') input.rows = name.includes('minutes') ? 18 : 5;
    wrap.htmlFor = name; wrap.append(input); form.append(wrap); fields[name] = input; return input;
  }
  function shell(kind, title) {
    const dialog = node('dialog', undefined, 'meeting-work-dialog suggestions-dialog'); dialog.id = `meeting-${kind}-dialog`;
    const form = node('form', undefined, 'suggestions-form'); form.id = `meeting-${kind}-form`;
    const header = node('header', undefined, 'suggestions-header');
    const heading = node('h2', title); heading.id = `meeting-${kind}-heading`; dialog.setAttribute('aria-labelledby', heading.id);
    const close = button(`meeting-${kind}-close`, '×'); close.className = 'icon-button'; close.setAttribute('aria-label', `Cerrar ${kind === 'task' ? 'tarea' : 'acta'}`);
    header.append(heading, close); const body = node('div', undefined, 'suggestions-content meeting-work-form');
    const context = node('p', '', 'scope-note'); context.id = `meeting-${kind}-context`; body.append(context);
    const message = node('p', '', 'message'); message.id = `meeting-${kind}-message`; message.hidden = true; message.setAttribute('role', 'status'); messages[kind] = message;
    const footer = node('footer', undefined, 'suggestions-footer meeting-work-actions');
    const download = button(`meeting-${kind}-download`, 'Descargar borrador'); const reload = button(`meeting-${kind}-reload`, 'Actualizar y revisar');
    const save = button(`meeting-${kind}-save`, kind === 'task' ? 'Guardar tarea' : 'Guardar acta', true); save.type = 'submit';
    footer.append(download, reload, save); actions[kind] = { close, download, reload, save, footer, context, heading };
    form.append(header, body, message, footer); dialog.append(form); document.body.append(dialog); dialogs[kind] = dialog;
    close.addEventListener('click', closeCurrent); dialog.addEventListener('cancel', event => { event.preventDefault(); closeCurrent(); });
    download.addEventListener('click', downloadDraft); reload.addEventListener('click', reloadCurrent);
    form.addEventListener('input', changed);
    form.addEventListener('submit', event => { event.preventDefault(); saveCurrent(); });
    form.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing || event.target.tagName !== 'TEXTAREA' || event.target.readOnly || actions[kind].save.disabled) return;
      event.preventDefault(); event.stopPropagation(); actions[kind].save.focus();
    });
    return body;
  }
  const taskBody = shell('task', 'Tarea de reunión');
  field(taskBody, 'meeting-task-title', 'Qué hay que hacer').required = true;
  const taskGrid = node('div', undefined, 'meeting-work-grid'); taskBody.append(taskGrid);
  const status = field(taskGrid, 'meeting-task-status', 'Estado', 'select');
  for (const [value, label] of STATES) { const option = node('option', label); option.value = value; status.append(option); }
  field(taskGrid, 'meeting-task-due', 'Plazo (opcional)', 'input', 'date');
  field(taskBody, 'meeting-task-notes', 'Observaciones (opcional)', 'textarea');
  taskBody.append(node('p', 'Guardar tarea conserva las notas pendientes de la reunión y de la unidad.', 'field-help'));
  actions.task.remove = button('meeting-task-delete', 'Eliminar tarea'); actions.task.footer.prepend(actions.task.remove);
  actions.task.remove.addEventListener('click', removeTask);
  const minutesBody = shell('minutes', 'Acta · memoria de trabajo');
  const minutesStatus = field(minutesBody, 'meeting-minutes-status', 'Estado del acta', 'select');
  for (const [value, label] of [['draft', 'Borrador'], ['reviewed', 'Revisada']]) { const option = node('option', label); option.value = value; minutesStatus.append(option); }
  field(minutesBody, 'meeting-minutes-text', 'Contenido del acta', 'textarea').required = true;
  minutesBody.append(node('p', 'Memoria de trabajo personal. El borrador usa las notas guardadas; guarda primero la reunión si quieres incluir sus últimas anotaciones. Los temas previstos no se convierten en acuerdos. Revisa el texto antes de marcarlo como Revisada; las notas originales se conservan.', 'field-help'));
  actions.minutes.prepare = button('meeting-minutes-prepare', 'Preparar otro borrador');
  actions.minutes.print = button('meeting-minutes-print', 'Imprimir / PDF');
  actions.minutes.footer.prepend(actions.minutes.prepare, actions.minutes.print);
  actions.minutes.prepare.addEventListener('click', () => {
    if (!loaded || isBusy() || blocked) return;
    if (readFields().text.trim() && !window.confirm('Se sustituirá el texto de este borrador de acta. Las notas originales no cambian. ¿Preparar otro borrador?')) return;
    fields['meeting-minutes-text'].value = draftMeetingMinutes(loaded.document, anchor); fields['meeting-minutes-status'].value = 'draft'; changed();
  });
  actions.minutes.print.addEventListener('click', printMinutes);

  function readFields() {
    return current === 'task'
      ? { title: fields['meeting-task-title'].value, status: fields['meeting-task-status'].value, dueOn: fields['meeting-task-due'].value, notes: fields['meeting-task-notes'].value }
      : { text: fields['meeting-minutes-text'].value, status: fields['meeting-minutes-status'].value };
  }
  const pending = () => Boolean(current && baseline && (blocked || JSON.stringify(readFields()) !== JSON.stringify(baseline)));
  function message(value = '', kind = '') { if (!current) return; messages[current].textContent = value; messages[current].className = 'message' + (kind ? ' ' + kind : ''); messages[current].hidden = !value; }
  function changed() { availability(); onStateChange(); }
  function availability() {
    for (const [kind, dialog] of Object.entries(dialogs)) {
      const busy = isBusy();
      dialog.querySelectorAll('input,textarea,select').forEach(input => { input.disabled = busy || blocked; });
      for (const [key, action] of Object.entries(actions[kind])) if (action.tagName === 'BUTTON') action.disabled = busy || (blocked && !['close', 'download', 'reload', 'print'].includes(key));
      actions[kind].save.disabled = busy || blocked || !pending();
      actions[kind].download.hidden = current !== kind || !pending();
      actions[kind].reload.disabled = busy || !loaded;
    }
    actions.task.remove.hidden = !originalTaskId;
    for (const container of containers.keys()) container.querySelectorAll('button').forEach(control => { control.disabled = isBusy(); });
  }
  function findRecord(doc, ref = anchor) {
    if (!ref) return null;
    return doc.meetings.find(row => row.id && row.id === ref.id) ?? doc.meetings.find(row => recordKey(row) === anchorKey(ref)) ?? doc.meetings.find(row => row.meetingId && row.meetingId === ref.meetingId && row.date === ref.date) ?? null;
  }
  function titleFor(doc, ref) {
    const record = findRecord(doc, ref) ?? ref; const group = recordGroup(doc, record);
    return (group?.title ?? record?.title ?? 'Reunión') + (record?.date ? ' · ' + dateLabel(record.date) : '');
  }
  function setFields(kind, item = null, preparing = false) {
    if (kind === 'task') {
      const v = { title: item?.title ?? '', status: item?.status ?? 'pending', dueOn: item?.dueOn ?? '', notes: item?.notes ?? '' };
      fields['meeting-task-title'].value = v.title; fields['meeting-task-status'].value = v.status; fields['meeting-task-due'].value = v.dueOn; fields['meeting-task-notes'].value = v.notes; baseline = v;
    } else {
      const v = { text: item?.text ?? '', status: item?.status ?? 'draft' }; baseline = v;
      fields['meeting-minutes-text'].value = preparing ? draftMeetingMinutes(loaded.document, anchor) : v.text; fields['meeting-minutes-status'].value = v.status;
    }
  }
  async function begin(kind, ref, taskId = null) {
    if (isBusy()) return false;
    if (current && !closeCurrent()) return false;
    const state = getState();
    if (!state?.reader || !state?.loaded?.document || !ref) { onWarning('Elige una fecha de reunión y espera a que termine de cargar.'); return false; }
    const previousOrigin = document.activeElement; let fresh;
    setBusy(true); onStateChange();
    try {
      fresh = await state.reader.load(state.catalog);
      if (!fresh?.document || fresh.sha !== state.loaded.sha) {
        error = true; onWarning('El registro de reuniones ha cambiado en GitHub. Conserva los borradores y actualiza para revisar las diferencias antes de editar esta tarea o acta.'); return false;
      }
    } catch (e) { error = true; onWarning('No se ha podido leer la versión actual de la reunión. Los borradores se conservan.'); return false; }
    finally { setBusy(false); onStateChange(); }
    loaded = { document: structuredClone(fresh.document), sha: fresh.sha }; anchor = cleanAnchor(ref); current = kind; originalTaskId = taskId; blocked = false; error = false;
    origin = previousOrigin; const saved = findRecord(loaded.document);
    if (kind === 'task') {
      const item = taskId ? (loaded.document.meetingTasks ?? []).find(row => row.id === taskId && !row.deleted) : null;
      if (taskId && !item) { reset(); onWarning('Esta tarea ya no está disponible. Actualiza la consulta.'); return false; }
      setFields(kind, item); actions.task.heading.textContent = item ? 'Editar tarea de reunión' : 'Añadir tarea a la reunión';
      dialogs.task.dataset.draftId = item?.id ?? uid('meeting-task-');
    } else {
      setFields(kind, saved?.minutes, !saved?.minutes); dialogs.minutes.dataset.draftId = saved?.minutes?.id ?? uid('meeting-minutes-');
    }
    actions[kind].context.textContent = titleFor(loaded.document, anchor); message(); availability();
    dialogs[kind].showModal(); (kind === 'task' ? fields['meeting-task-title'] : fields['meeting-minutes-text']).focus({preventScroll:true}); dialogs[kind].querySelector('.suggestions-content').scrollTop = 0; onStateChange(); return true;
  }
  function reset() {
    for (const dialog of Object.values(dialogs)) { if (dialog.open) dialog.close(); delete dialog.dataset.draftId; }
    current = null; loaded = null; anchor = null; originalTaskId = null; baseline = null; blocked = false; error = false;
    for (const field of Object.values(fields)) field.value = '';
    for (const m of Object.values(messages)) { m.textContent = ''; m.hidden = true; }
  }
  function closeCurrent() {
    if (!current) return true;
    if (isBusy() || (pending() && !window.confirm('Hay cambios sin guardar en esta ' + (current === 'task' ? 'tarea' : 'acta') + '. ¿Descartarlos y cerrar?'))) return false;
    const previous = origin; reset(); origin = null; onStateChange(); previous?.focus?.({ preventScroll: true }); return true;
  }
  async function saveDocument(next, success, commitMessage) {
    const state = getState(); if (!state?.reader || !loaded) return false;
    let confirmed = false;
    setBusy(true); changed();
    try {
      const result = await state.reader.save(state.catalog, next, loaded.sha, { message: commitMessage }); confirmed = true;
      await onSaved(result); loaded = result;
      baseline = readFields(); blocked = false; error = false;
      const previous = origin; reset(); origin = null; refreshContainers(); onSavedMessage(success); previous?.focus?.({ preventScroll: true }); return true;
    } catch (e) {
      const feedback = saveErrorFeedback(e); blocked = confirmed || feedback.requiresReload || e?.code === 'HTTP_422'; error = true;
      message(confirmed ? 'GitHub confirmó el guardado, pero no se pudo conciliar la vista local. Conserva este borrador y actualiza para revisar la versión guardada; no se reenviará automáticamente.' : feedback.message + (e?.message && feedback.code === 'SAVE_ERROR' ? ' ' + e.message : '') + ' [' + feedback.code + ']', confirmed ? 'warning' : feedback.kind); return false;
    } finally { setBusy(false); changed(); }
  }
  async function saveCurrent() {
    if (!current || !loaded || isBusy() || blocked || !pending()) return;
    const form = dialogs[current].querySelector('form'); if (!form.reportValidity()) return;
    try {
      const v = readFields(); let next;
      if (current === 'task') next = withMeetingTask(loaded.document, anchor, originalTaskId, { ...v, title: v.title.trim(), id: originalTaskId ?? dialogs.task.dataset.draftId });
      else next = withMeetingMinutes(loaded.document, anchor, { ...v, id: dialogs.minutes.dataset.draftId });
      await saveDocument(next, current === 'task' ? 'Tarea de reunión guardada y comprobada.' : 'Acta guardada y comprobada.', current === 'task' ? 'Guardar tarea de reunión' : 'Guardar acta de reunión');
    } catch (e) { error = true; message(e.message || 'Revisa los campos antes de guardar.', 'error'); changed(); }
  }
  async function removeTask() {
    if (current !== 'task' || !originalTaskId || isBusy() || blocked) return;
    if (!window.confirm('¿Eliminar esta tarea? Se conserva su referencia en las actas ya guardadas. Las ediciones pendientes de este formulario no se aplicarán.')) return;
    try { await saveDocument(withMeetingTask(loaded.document, anchor, originalTaskId, {}, { remove: true }), 'Tarea eliminada. Las actas conservan su contenido.', 'Eliminar tarea de reunión'); }
    catch (e) { error = true; message(e.message || 'No se ha podido eliminar la tarea.', 'error'); changed(); }
  }
  function downloadDraft() {
    if (!current || !loaded || isBusy()) return;
    const draft = { kind: current === 'task' ? 'meeting-task-draft' : 'meeting-minutes-draft', anchor, id: current === 'task' ? originalTaskId ?? dialogs.task.dataset.draftId : dialogs.minutes.dataset.draftId, values: readFields(), baseSha: loaded.sha };
    const blob = new Blob([JSON.stringify(draft, null, 2) + '\n'], { type: 'application/json;charset=utf-8' }); const url = URL.createObjectURL(blob);
    const link = node('a'); link.href = url; link.download = current === 'task' ? 'borrador-tarea-reunion.json' : 'borrador-acta-reunion.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function reloadCurrent() {
    if (!current || !loaded || isBusy()) return;
    if (pending() && !window.confirm('Descarga el borrador si quieres conservarlo. ¿Descartar los cambios de este formulario y leer la versión actual?')) return;
    const state = getState(); if (!state?.reader) return;
    setBusy(true); changed();
    try {
      const result = await state.reader.load(state.catalog); if (!result?.document) throw Error('No se ha podido leer el registro de reuniones.');
      loaded = result; await onSaved(result); blocked = false; error = false;
      const item = current === 'task' ? (result.document.meetingTasks ?? []).find(row => row.id === originalTaskId && !row.deleted) : findRecord(result.document)?.minutes;
      if (current === 'task' && originalTaskId && !item) { baseline = readFields(); reset(); refreshContainers(); onWarning('La tarea ya no está disponible. El borrador descargado se conserva.'); }
      else { setFields(current, item, current === 'minutes' && !item); message('Versión actual leída. Revisa el contenido antes de guardar.'); refreshContainers(); }
    } catch (e) { error = true; message(e.message || 'No se puede actualizar. El borrador permanece aquí.', 'error'); }
    finally { setBusy(false); changed(); }
  }
  function printMinutes() {
    if (current !== 'minutes' || isBusy()) return;
    printRoot?.remove(); printRoot = node('section', undefined, 'meeting-minutes-print');
    printRoot.append(node('h1', 'Acta · memoria de trabajo'), node('p', titleFor(loaded.document, anchor)), node('p', readFields().status === 'reviewed' ? 'Revisada' : 'Borrador'), node('pre', readFields().text));
    document.body.append(printRoot); document.body.classList.add('meeting-minutes-printing');
    const cleanup = () => { document.body.classList.remove('meeting-minutes-printing'); printRoot?.remove(); printRoot = null; window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup, { once: true });
    try { window.print(); } finally { cleanup(); }
  }
  function taskRow(doc, task) {
    const row = node('div', undefined, 'meeting-work-task-row'); row.dataset.taskId = task.id;
    const text = node('div', undefined, 'meeting-work-task-description'); text.append(node('strong', task.title), node('span', stateLabel(task.status) + ' · ' + dateLabel(task.dueOn), 'scope-note'));
    const source = doc.meetings.find(record => recordKey(record) === task.recordId);
    if (source) text.append(node('span', titleFor(doc, source), 'scope-note'));
    const edit = button('', 'Editar'); edit.classList.add('button-small'); edit.setAttribute('aria-label', 'Editar tarea: ' + task.title); edit.disabled = isBusy();
    edit.addEventListener('click', () => { const state = getState(); const ref = state?.loaded?.document?.meetings?.find(record => recordKey(record) === task.recordId); if (ref) begin('task', ref, task.id); else onWarning('No se ha encontrado la reunión de origen. Actualiza el registro.'); });
    row.append(text, edit); return row;
  }
  function render(container, options = {}) {
    if (!container) return;
    containers.set(container, options); container.replaceChildren();
    const state = getState(), doc = state?.loaded?.document;
    if (!doc) return;
    const ref = cleanAnchor(options.anchor ?? state.anchor);
    const groupId = options.groupId ?? ref?.groupId ?? null;
    const recordId = options.recordId ?? (ref ? anchorKey(findRecord(doc, ref) ?? ref) : null);
    const panel = node('section', undefined, 'meeting-work-panel');
    const rows = meetingTaskRows(doc, { ...(groupId ? { groupId } : {}), includeCompleted: false });
    const pendingBox = node('details', undefined, 'meeting-work-pending'); const summary = node('summary', (groupId ? 'Pendientes del grupo' : 'Pendientes de reuniones') + ' · ' + rows.length); pendingBox.append(summary);
    if (!rows.length) pendingBox.append(node('p', 'No hay tareas pendientes.', 'scope-note')); else for (const task of rows) pendingBox.append(taskRow(doc, task));
    panel.append(pendingBox);
    if (ref) {
      const heading = node('div', undefined, 'meeting-work-heading'); heading.append(node('h3', 'Tareas de esta reunión'));
      const add = button('meeting-task-add', 'Añadir tarea'); add.disabled = isBusy(); add.addEventListener('click', () => begin('task', ref)); heading.append(add); panel.append(heading);
      const selected = meetingTaskRows(doc, { recordId, includeCompleted: true });
      if (!selected.length) panel.append(node('p', 'Todavía no hay tareas vinculadas a esta reunión.', 'scope-note')); else for (const task of selected) panel.append(taskRow(doc, task));
      const acta = node('div', undefined, 'meeting-work-heading'); acta.append(node('h3', 'Acta · memoria de trabajo'));
      const minutes = findRecord(doc, ref)?.minutes;
      if (minutes) acta.append(node('span', minutes.status === 'reviewed' ? 'Revisada' : 'Borrador', 'scope-note'));
      const prepare = button('meeting-minutes-open', minutes ? 'Abrir acta' : 'Preparar acta'); prepare.disabled = isBusy(); prepare.addEventListener('click', () => begin('minutes', ref)); acta.append(prepare); panel.append(acta);
    } else panel.append(node('p', 'Abre una fecha para añadir tareas o preparar su acta.', 'scope-note'));
    container.append(panel);
  }
  function refreshContainers() { for (const [container, options] of containers) if (container.isConnected) render(container, options); }
  return {
    render,
    openTask: (taskId = null, ref = getState()?.anchor) => {
      if (taskId) { const doc = getState()?.loaded?.document; ref = doc?.meetings.find(row => recordKey(row) === doc.meetingTasks?.find(task => task.id === taskId)?.recordId) ?? ref; }
      return begin('task', ref, taskId);
    },
    openMinutes: (ref = getState()?.anchor) => begin('minutes', ref),
    hasPending: pending, hasError: () => error, availability,
    clear() { reset(); origin = null; error = false; printRoot?.remove(); printRoot = null; document.body.classList.remove('meeting-minutes-printing'); for (const container of containers.keys()) container.replaceChildren(); containers.clear(); onStateChange(); }
  };
}
