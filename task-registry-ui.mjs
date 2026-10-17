import { TaskRegistryStore } from './general-notes.mjs?v=20261017-3';
import { taskDateFields, taskDetails, applyTaskDetails } from './module-views.mjs?v=20261017-3';
import { presentationDefaults } from './task-cycle.mjs?v=20261017-3';
import { taskHeading } from './task-plan.mjs?v=20261017-3';
import { saveErrorFeedback, isValidDate } from './core.mjs?v=20261017-3';

const $ = id => document.getElementById(id);

/** Historic tasks have their own versioned module file, not fabricated sessions. */
export function createTaskRegistryUI({ isBusy, setBusy, canOpen, onChange, onStateChange }) {
  let token = null, current = null, loaded = null, blocked = false;
  const stores = new Map(), records = new Map(); let failures = [];
  const readForm = () => ({ ...Object.fromEntries(taskDateFields.map(field => [field, $('registry-' + field).value])), presented: $('registry-presented').checked, corrected: $('registry-corrected').checked });
  const target = () => loaded?.document.tasks.find(task => task.id === current?.registryTaskId);
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
    if (isBusy() || (pending() && !window.confirm('Hay cambios sin guardar en esta tarea histórica. ¿Descartarlos y cerrar?'))) return;
    clear(); onStateChange();
  }
  function clear() {
    current = null; loaded = null; blocked = false;
    $('registry-dialog').close(); $('registry-title').textContent = '';
    taskDateFields.forEach(field => { $('registry-' + field).value = ''; });
    $('registry-presented').checked = false; $('registry-corrected').checked = false; message();
  }
  async function open(task, action, value) {
    if (isBusy() || !token || !canOpen()) return;
    setBusy(true);
    try {
      const result = await storeFor(task.entry.moduleCode).load();
      if (!result.document.tasks.some(item => item.id === task.registryTaskId)) throw new Error();
      loaded = result; current = task; blocked = false; fill();
      records.set(task.entry.moduleCode, { entry: { moduleCode: task.entry.moduleCode, path: task.entry.path }, document: result.document, registry: true });
      const item = target(); $('registry-title').textContent = taskHeading(task.entry.moduleCode, item.code, item.title);
      if (action) $(action === 'presented' ? 'registry-presented' : 'registry-corrected').checked = value;
      defaults(); message(); $('registry-dialog').showModal(); onChange();
    } catch { onChange('No se ha podido leer la tarea histórica. No se ha cambiado ningún dato.', 'error'); }
    finally { setBusy(false); availability(); onStateChange(); }
  }
  $('registry-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!loaded || isBusy() || blocked || !pending()) return;
    for (const field of taskDateFields) {
      const input = $('registry-' + field); input.setCustomValidity(input.value && !isValidDate(input.value) ? 'Indica una fecha válida.' : '');
      if (!input.reportValidity()) return;
    }
    const snapshot = structuredClone(loaded.document);
    applyTaskDetails(snapshot.tasks.find(task => task.id === current.registryTaskId), readForm());
    setBusy(true);
    try {
      loaded = await storeFor(current.entry.moduleCode).save(snapshot, loaded.sha);
      records.set(current.entry.moduleCode, { entry: { moduleCode: current.entry.moduleCode, path: current.entry.path }, document: loaded.document, registry: true });
      fill(); message('Tarea guardada y confirmada en GitHub.'); onChange();
    } catch (error) {
      const feedback = saveErrorFeedback(error); blocked = feedback.requiresReload || error.code === 'HTTP_422';
      message(feedback.message + ' [' + feedback.code + ']', feedback.kind);
    } finally { setBusy(false); availability(); onStateChange(); }
  });
  $('registry-reload').addEventListener('click', async () => {
    if (!current || isBusy() || (pending() && !window.confirm('Descarga el borrador si quieres conservarlo. ¿Descartarlo y leer la versión actual de GitHub?'))) return;
    const task = current; loaded = null; blocked = false; await open(task);
  });
  $('registry-download').addEventListener('click', () => {
    if (!loaded || isBusy()) return;
    const doc = structuredClone(loaded.document); applyTaskDetails(doc.tasks.find(task => task.id === current.registryTaskId), readForm());
    const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2) + '\n'], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = current.entry.moduleCode + '-tareas-borrador.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
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
