import { TaskRegistryStore } from './general-notes.mjs?v=20261018-rf1';
import { taskDateFields, taskDetails } from './module-views.mjs?v=20261018-rf1';
import { TaskEditError, taskEditTarget, taskEditSnapshot, assertTaskRead, prepareTaskSave, saveTaskDocument } from './task-edit.mjs?v=20261018-rf1';
import { presentationDefaults } from './task-cycle.mjs?v=20261018-rf1';
import { taskHeading } from './task-plan.mjs?v=20261018-rf1';
import { saveErrorFeedback, isValidDate } from './core.mjs?v=20261018-rf1';

const $ = id => document.getElementById(id);

/** One independent editor for official, legacy and historic tasks. */
export function createTaskRegistryUI({ isBusy, setBusy, canOpen, onChange, onStateChange, unitStore, getActive, onSaved, onBlocked, capturePosition, restorePosition }) {
  let token = null, current = null, loaded = null, blocked = false, sourceStore = null, position = null;
  const stores = new Map(), records = new Map(); let failures = [];
  const readForm = () => ({ ...Object.fromEntries(taskDateFields.map(field => [field, $('registry-' + field).value])), presented: $('registry-presented').checked, corrected: $('registry-corrected').checked });
  const target = () => loaded && current ? taskEditTarget(loaded.document, current) : null;
  const pending = () => Boolean(loaded && (blocked || JSON.stringify(readForm()) !== JSON.stringify(taskDetails(target()))));
  function message(value = '', kind = '') { $('registry-message').textContent = value; $('registry-message').className = 'message ' + kind; $('registry-message').hidden = !value; }
  function availability() {
    $('registry-save').disabled = isBusy() || blocked || !pending();
    $('registry-reload').disabled = isBusy() || !loaded;
    $('registry-close').disabled = isBusy();
    $('registry-download').disabled = isBusy() || !loaded;
    const required = $('registry-presented').checked && !taskDetails(target()).presented;
    taskDateFields.forEach(field => { $('registry-' + field).required = required; $('registry-' + field).disabled = isBusy() || blocked; });
    for (const id of ['registry-presented', 'registry-corrected']) $(id).disabled = isBusy() || blocked;
  }
  function storeFor(code) {
    if (!stores.has(code)) stores.set(code, new TaskRegistryStore({ token, moduleCode: code }));
    return stores.get(code);
  }
  function fill() {
    const details = taskDetails(target());
    taskDateFields.forEach(field => { $('registry-' + field).value = details[field]; $('registry-' + field).setCustomValidity(''); });
    $('registry-presented').checked = details.presented; $('registry-corrected').checked = details.corrected;
  }
  function defaults() {
    if ($('registry-presented').checked && !taskDetails(target()).presented) {
      const values = presentationDefaults(target());
      for (const field of taskDateFields) if (!$('registry-' + field).value) $('registry-' + field).value = values[field];
    }
    availability(); onStateChange();
  }
  function close() {
    if (isBusy() || (pending() && !window.confirm('Hay cambios sin guardar en esta tarea. ¿Descartarlos y cerrar?'))) return;
    const previous = position; clear(); onStateChange(); restorePosition(previous);
  }
  function clear() {
    current = null; loaded = null; blocked = false; sourceStore = null; position = null;
    $('registry-dialog').close(); $('registry-title').textContent = '';
    taskDateFields.forEach(field => { $('registry-' + field).value = ''; });
    $('registry-presented').checked = false; $('registry-corrected').checked = false; message();
  }
  function remember(task, result) {
    if (task.registryTaskId) records.set(task.entry.moduleCode, { entry: { moduleCode: task.entry.moduleCode, path: task.entry.path }, document: result.document, registry: true });
  }
  async function open(task, action, value, reloading = false) {
    if (isBusy() || !token || (!reloading && ($('registry-dialog').open || !canOpen(task)))) return;
    if (!reloading) position = capturePosition();
    setBusy(true);
    try {
      const candidate = task.registryTaskId ? storeFor(task.entry.moduleCode) : unitStore(task.entry);
      const result = await candidate.load();
      assertTaskRead(result, task, getActive());
      sourceStore = candidate;
      loaded = result; current = task; blocked = false; fill();
      remember(task, result);
      const item = target(); $('registry-title').textContent = taskHeading(task.entry.moduleCode, item.code || task.code, item.title || task.title);
      if (action) $(action === 'presented' ? 'registry-presented' : 'registry-corrected').checked = value;
      defaults(); message();
      const active = getActive();
      if (active?.path === task.entry.path && JSON.stringify(taskDetails(taskEditTarget(active.draft, task))) !== JSON.stringify(taskDetails(item))) {
        message('Esta tarea también tiene cambios pendientes en Unidad. Aquí se muestra lo guardado en GitHub; no se sustituirán esos cambios silenciosamente.', 'warning');
      }
      if (!$('registry-dialog').open) $('registry-dialog').showModal();
    } catch (error) {
      if (error.code === 'TASK_UNIT_STALE') onBlocked(task, error);
      const text = error instanceof TaskEditError ? error.message : 'No se ha podido leer la tarea. No se ha cambiado ningún dato. Se conserva cualquier borrador anterior.';
      if (reloading) message(text, 'error'); else { onChange(text, 'error'); restorePosition(position); }
    }
    finally { setBusy(false); availability(); onStateChange(); }
  }
  $('registry-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!loaded || isBusy() || blocked || !pending()) return;
    for (const field of taskDateFields) {
      const input = $('registry-' + field); input.setCustomValidity(input.value && !isValidDate(input.value) ? 'Indica una fecha válida.' : '');
      if (!input.reportValidity()) return;
    }
    let confirmed = false;
    setBusy(true);
    try {
      const prepared = prepareTaskSave(loaded, current, readForm(), getActive());
      const result = await saveTaskDocument(sourceStore, prepared, current, loaded.sha);
      onSaved(current, result, prepared);
      loaded = result; remember(current, result);
      fill(); onChange('Tarea guardada y confirmada en GitHub.'); confirmed = true;
    } catch (error) {
      if (error instanceof TaskEditError) {
        message(error.message, 'warning');
        if (error.code === 'TASK_UNIT_STALE') { blocked = true; onBlocked(current, error); }
      } else {
        const feedback = saveErrorFeedback(error); blocked = feedback.requiresReload || error.code === 'HTTP_422';
        if (blocked) onBlocked(current, error);
        message(feedback.message + ' [' + feedback.code + ']', feedback.kind);
      }
    } finally { setBusy(false); availability(); onStateChange(); if (confirmed) close(); }
  });
  $('registry-reload').addEventListener('click', async () => {
    if (!current || isBusy() || (pending() && !window.confirm('Descarga el borrador si quieres conservarlo. ¿Descartarlo y leer la versión actual de GitHub?'))) return;
    await open(current, undefined, undefined, true);
  });
  $('registry-download').addEventListener('click', () => {
    if (!loaded || isBusy()) return;
    const doc = taskEditSnapshot(loaded, current, readForm()).document;
    const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2) + '\n'], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = current.entry.moduleCode + '-' + (current.registryTaskId ? 'tareas' : current.entry.unitCode) + '-borrador-tarea.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('registry-close').addEventListener('click', close);
  $('registry-dialog').addEventListener('cancel', event => { event.preventDefault(); close(); });
  $('registry-presented').addEventListener('change', defaults);
  for (const field of [...taskDateFields.map(field => 'registry-' + field), 'registry-corrected']) $(field).addEventListener('input', () => { $(field).setCustomValidity(''); availability(); onStateChange(); });
  return { connect(value) { token = value; }, disconnect() { clear(); token = null; stores.clear(); records.clear(); failures = []; },
    isOpen: () => $('registry-dialog').open, hasPending: pending, open,
    records: () => [...records.values()], failures: () => failures,
    async load(catalog) {
      records.clear(); failures = [];
      await Promise.all(catalog.modules.filter(module => module.taskRegistry).map(async module => {
        try { const result = await storeFor(module.code).load(); records.set(module.code, { entry: { moduleCode: module.code, path: module.taskRegistry }, document: result.document, registry: true }); }
        catch { failures.push(module.code); }
      }));
    }
  };
}
