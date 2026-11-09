import { TaskRegistryStore } from './general-notes.mjs?v=20261109-common-preparation';
import { taskEditTarget } from './task-edit.mjs?v=20261109-common-preparation';
import { saveErrorFeedback } from './core.mjs?v=20261109-common-preparation';
import { taskHeading } from './task-plan.mjs?v=20261109-common-preparation';
import { TaskNotesError, taskNotesValues, taskNotesKey, newTaskImprovement, improvementStates, prepareTaskNotesSave, saveTaskNotesDocument } from './task-notes.mjs?v=20261109-common-preparation';

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const node = (tag, className = '', text) => { const element = document.createElement(tag); element.className = className; if (text !== undefined) element.textContent = text; return element; };

/** Independent, task-owned notes; never submits preparation or Unit drafts. */
export function createTaskNotesUI({ isBusy, setBusy, canOpen = () => true, verifyRead = () => '', onChange = () => {}, onStateChange = () => {}, unitStore, getActive = () => null, onSaved = () => {}, onBlocked = () => {}, capturePosition = () => null, restorePosition = () => {}, registryStore }) {
  let token = null, current = null, loaded = null, values = null, blocked = false, mode = 'feedback', sourceStore = null, position = null, returnFocus = null;
  const stores = new Map(), elements = new Map();
  const make = (tag, id, className = '', text) => { const el = node(tag, className, text); el.id = id; elements.set(id, el); return el; };
  const el = id => elements.get('task-notes-' + id);
  const dialog = make('dialog', 'task-notes-dialog', 'suggestions-dialog task-notes-dialog');
  dialog.setAttribute('aria-labelledby', 'task-notes-title');
  const form = make('form', 'task-notes-form', 'suggestions-form');
  const header = node('header', 'suggestions-header');
  const title = make('h2', 'task-notes-title');
  const closeButton = make('button', 'task-notes-close', 'button button-secondary', 'Cerrar'); closeButton.type = 'button';
  header.append(title, closeButton);
  const scope = make('p', 'task-notes-scope', 'scope-note');
  const tabs = node('div', 'task-notes-tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Notas de la tarea');
  for (const [key, text] of [['feedback', 'Feedback al grupo'], ['improvements', 'Mejoras']]) {
    const button = make('button', 'task-notes-' + key + '-tab', 'button button-secondary', text); button.type = 'button';
    button.addEventListener('click', () => { if (!isBusy()) { mode = key; showMode(); } }); tabs.append(button);
  }
  const body = node('div', 'task-notes-body');
  const feedbackPanel = make('section', 'task-notes-feedback-panel');
  const feedbackLabel = node('label', '', 'Indicaciones generales para comentar con el grupo'); feedbackLabel.htmlFor = 'task-notes-feedback';
  const feedback = make('textarea', 'task-notes-feedback'); feedback.rows = 9; feedback.maxLength = 20000;
  feedback.addEventListener('input', () => { if (!values) return; values.feedback = feedback.value; feedback.setCustomValidity(''); availability(); onStateChange(); });
  feedbackPanel.append(feedbackLabel, feedback, node('p', 'scope-note', 'Sin datos personales ni calificaciones identificables. Guardar aquí no publica el feedback al alumnado.'));
  const improvementPanel = make('section', 'task-notes-improvements-panel');
  const improvements = make('div', 'task-notes-improvements-list', 'task-notes-improvements-list');
  const add = make('button', 'task-notes-add', 'button button-secondary', '+ Añadir mejora'); add.type = 'button';
  add.addEventListener('click', () => {
    if (!values || isBusy() || blocked || values.improvements.length >= 100) return;
    values.improvements.push(newTaskImprovement()); renderImprovements(); availability(); onStateChange();
    improvements.querySelectorAll('textarea')[values.improvements.length - 1]?.focus();
  });
  improvementPanel.append(improvements, add, node('p', 'scope-note', 'Anotar una propuesta no modifica el recurso. Aplicada y Descartada se confirman expresamente y conservan el texto.'));
  const messageBox = make('p', 'task-notes-message', 'message'); messageBox.setAttribute('role', 'status'); messageBox.hidden = true;
  body.append(scope, tabs, feedbackPanel, improvementPanel, messageBox);
  const footer = node('footer', 'suggestions-footer');
  const download = make('button', 'task-notes-download', 'button button-secondary', 'Descargar borrador'); download.type = 'button';
  const reload = make('button', 'task-notes-reload', 'button button-secondary', 'Revisar GitHub'); reload.type = 'button';
  const save = make('button', 'task-notes-save', 'button button-primary', 'Guardar notas'); save.type = 'submit';
  footer.append(download, reload, save); form.append(header, body, footer); dialog.append(form); document.body.append(dialog);

  const target = () => loaded && current ? taskEditTarget(loaded.document, current) : null;
  const pending = () => Boolean(loaded && values && (blocked || !equal(values, taskNotesValues(target()))));
  const message = (text = '', kind = '') => { messageBox.textContent = text; messageBox.className = 'message ' + kind; messageBox.hidden = !text; };
  function availability() {
    const locked = isBusy() || blocked || !loaded;
    save.disabled = locked || !pending(); reload.disabled = isBusy() || !loaded;
    download.disabled = isBusy() || !loaded; closeButton.disabled = isBusy();
    feedback.disabled = locked; add.disabled = locked || (values?.improvements.length ?? 0) >= 100;
    for (const control of improvements.querySelectorAll('textarea,select,button')) control.disabled = locked;
    for (const key of ['feedback', 'improvements']) el(key + '-tab').disabled = isBusy();
  }
  function showMode() {
    feedbackPanel.hidden = mode !== 'feedback'; improvementPanel.hidden = mode !== 'improvements';
    for (const key of ['feedback', 'improvements']) el(key + '-tab').setAttribute('aria-pressed', String(mode === key));
  }
  function renderImprovements() {
    improvements.replaceChildren();
    if (!values?.improvements.length) improvements.append(node('p', 'scope-note', 'Todavía no hay propuestas de mejora.'));
    for (const [index, item] of (values?.improvements ?? []).entries()) {
      const section = node('section', 'task-note-improvement'); section.dataset.improvementId = item.id;
      const top = node('div', 'task-note-improvement-heading'); top.append(node('strong', '', `Mejora ${index + 1}`));
      const label = node('label', 'visually-hidden', `Estado de mejora ${index + 1}`);
      const select = node('select'); select.id = `task-notes-status-${index}`; label.htmlFor = select.id;
      for (const [status, text] of Object.entries(improvementStates)) { const option = node('option', '', text); option.value = status; option.selected = item.status === status; select.append(option); }
      select.value = item.status;
      select.addEventListener('change', () => { item.status = select.value; availability(); onStateChange(); }); top.append(label, select);
      const input = node('textarea'); input.id = `task-notes-improvement-${index}`; input.value = item.text; input.rows = 3; input.maxLength = 5000;
      input.setAttribute('aria-label', `Texto de mejora ${index + 1}`);
      input.addEventListener('input', () => { item.text = input.value; input.setCustomValidity(''); availability(); onStateChange(); });
      const wasSaved = loaded && taskNotesValues(target()).improvements.some(saved => saved.id === item.id);
      if (!wasSaved) {
        const remove = node('button', 'button button-secondary', '×'); remove.type = 'button'; remove.setAttribute('aria-label', `Retirar borrador de mejora ${index + 1}`);
        remove.addEventListener('click', () => { if (isBusy() || blocked) return; values.improvements = values.improvements.filter(other => other.id !== item.id); renderImprovements(); availability(); onStateChange(); }); top.append(remove);
      }
      section.append(top, input); improvements.append(section);
    }
  }
  function fill() { values = taskNotesValues(target()); feedback.value = values.feedback; feedback.setCustomValidity(''); renderImprovements(); showMode(); }
  function close() {
    if (isBusy()) return;
    dialog.close(); onStateChange(); restorePosition(position); returnFocus?.focus?.({ preventScroll: true });
  }
  function clear() {
    current = null; loaded = null; values = null; blocked = false; sourceStore = null; position = null; returnFocus = null;
    dialog.close(); title.textContent = ''; scope.textContent = ''; feedback.value = ''; improvements.replaceChildren(); message();
  }
  function storeFor(row) {
    if (!row.registryTaskId) return unitStore(row.entry);
    const code = row.entry.moduleCode;
    if (!stores.has(code)) stores.set(code, registryStore ? registryStore(code) : new TaskRegistryStore({ token, moduleCode: code }));
    return stores.get(code);
  }
  async function open(row, requestedMode = 'feedback', reloading = false) {
    if (isBusy() || !token || !row?.entry) return false;
    const key = taskNotesKey(row), same = current && taskNotesKey(current) === key;
    if (!reloading && current && pending()) {
      if (!same) { onChange('Hay un borrador de notas de otra tarea. Guárdalo o descártalo desde Revisar GitHub antes de abrir otra.', 'warning'); return false; }
      mode = requestedMode === 'improvements' ? 'improvements' : 'feedback'; showMode();
      if (current.entry.path !== row.entry.path) { blocked = true; message('Esta tarea ha cambiado de documento. Conserva el borrador y revisa su ubicación antes de reenviarlo.', 'warning'); }
      if (!dialog.open) { returnFocus = document.activeElement; dialog.showModal(); }
      availability(); onStateChange(); return true;
    }
    if (!reloading && (!canOpen(row) || dialog.open && !same)) return false;
    const previousMode = mode; mode = requestedMode === 'improvements' ? 'improvements' : 'feedback';
    if (!reloading) { position = capturePosition(); returnFocus = document.activeElement; }
    setBusy(true);
    try {
      const candidate = storeFor(row), result = await candidate.load();
      const issue = verifyRead(result, row); if (issue) throw new TaskNotesError('TASK_NOTES_CONTEXT_STALE', issue);
      // Read-time identity and active-base checks happen before replacing any saved draft.
      prepareTaskNotesSave(result, row, taskNotesValues(taskEditTarget(result.document, row)), getActive());
      sourceStore = candidate; current = structuredClone(row); loaded = result; blocked = false; fill(); message();
      const item = target(); title.textContent = taskHeading(row.entry.moduleCode, item.code || row.code, item.title || row.title);
      scope.textContent = `${row.entry.moduleCode} · ${row.entry.unitCode || item.unitCode || ''} · Notas de esta tarea. Guardado independiente.`;
      if (!dialog.open) dialog.showModal(); return true;
    } catch (error) {
      mode = previousMode;
      if (error.code?.includes('STALE')) onBlocked(row, error);
      const text = error.code?.startsWith('TASK_') ? error.message : 'No se han podido leer las notas de la tarea. Se conserva cualquier borrador anterior.';
      if (reloading || dialog.open) message(text, 'error'); else { onChange(text, 'error'); restorePosition(position); }
      return false;
    } finally { setBusy(false); availability(); onStateChange(); }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (!loaded || isBusy() || blocked || !pending()) return;
    for (const [index, item] of values.improvements.entries()) {
      const input = improvements.querySelectorAll('textarea')[index]; input.setCustomValidity(item.text.trim() ? '' : 'Escribe la propuesta o retira su borrador.');
      if (!item.text.trim()) { mode = 'improvements'; showMode(); }
      if (!input.reportValidity()) return;
    }
    let confirmed = false; setBusy(true);
    try {
      const issue = verifyRead(loaded, current); if (issue) throw new TaskNotesError('TASK_NOTES_CONTEXT_STALE', issue);
      const prepared = prepareTaskNotesSave(loaded, current, values, getActive());
      const result = await saveTaskNotesDocument(sourceStore, prepared, current, loaded.sha);
      onSaved(current, result, prepared); loaded = result; blocked = false; fill();
      onChange('Notas de la tarea guardadas y confirmadas en GitHub.'); confirmed = true;
    } catch (error) {
      if (error.code?.startsWith('TASK_')) {
        blocked = /STALE|LOCAL_CONFLICT|MISSING/.test(error.code); message(error.message, 'warning'); if (blocked) onBlocked(current, error);
      } else {
        const status = saveErrorFeedback(error); blocked = status.requiresReload || error.code === 'HTTP_422';
        if (blocked) onBlocked(current, error); message(status.message + ' [' + status.code + ']', status.kind);
      }
    } finally { setBusy(false); availability(); onStateChange(); if (confirmed) close(); }
  });
  reload.addEventListener('click', async () => {
    if (!current || isBusy() || (pending() && !window.confirm('Descarga el borrador si quieres conservarlo. ¿Descartarlo y leer las notas actuales de GitHub?'))) return;
    await open(current, mode, true);
  });
  download.addEventListener('click', () => {
    if (!loaded || isBusy()) return;
    // A notes-only draft remains downloadable even when an unfinished proposal is invalid for saving.
    const draft = { taskId: current.officialTaskId || current.registryTaskId || current.activityId, source: current.entry.path, teachingNotes: structuredClone(values) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2) + '\n'], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `${current.entry.moduleCode}-${target().code || 'tarea'}-notas-borrador.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  closeButton.addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  showMode(); availability();
  return { connect(value) { token = value; }, disconnect() { clear(); token = null; stores.clear(); }, open, close, availability,
    isOpen: () => dialog.open, hasPending: pending, isBlocked: () => blocked, current: () => current ? structuredClone(current) : null };
}
