import { assertSessionRead, sessionTextValues, prepareSessionSave, SessionEditError } from './session-edit.mjs?v=20261018-rf12';
import { saveTaskDocument } from './task-edit.mjs?v=20261018-rf12';
import { saveErrorFeedback } from './core.mjs?v=20261018-rf12';
const $ = id => document.getElementById(id);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const node = (tag, className = '', text) => { const el = document.createElement(tag); el.className = className; if (text !== undefined) el.textContent = text; return el; };

// Nested controls keep their own actions. Selecting text must not open an editor.
export function bindSessionEditRow(row, open) {
  row.classList.add('session-editable-row');
  row.addEventListener('click', event => {
    if (event.defaultPrevented || (event.button ?? 0) !== 0 || window.getSelection?.()?.toString()) return;
    if (event.target.closest('button,a,input,textarea,select,label,summary,[role="button"],[role="checkbox"],[role="link"],[contenteditable]:not([contenteditable="false"])')) return;
    open();
  });
}

export function createSessionEditorUI({ isBusy, setBusy, canOpen, getActive, unitStore, onSaved, onBlocked, onStateChange, onMessage, onReturn }) {
  let loaded = null, entry = null, sessionId = null, sourceStore = null, blocked = false, position = null, inputs = [];
  const read = () => inputs.map(({ id, title, planned }) => ({ id, title: title.value, planned: planned.value }));
  const changed = () => Boolean(loaded && !equal(read(), sessionTextValues(loaded.document, sessionId)));
  const pending = () => Boolean(loaded && (blocked || changed()));
  function message(text = '', kind = '') { $('session-editor-message').textContent = text; $('session-editor-message').className = 'message ' + kind; $('session-editor-message').hidden = !text; }
  function availability() {
    $('session-editor-save').disabled = isBusy() || blocked || !changed();
    $('session-editor-close').disabled = isBusy(); $('session-editor-cancel').disabled = isBusy();
    $('session-editor-download').hidden = !pending(); $('session-editor-download').disabled = isBusy();
    for (const pair of inputs) for (const field of ['title', 'planned']) pair[field].disabled = isBusy() || blocked;
  }
  function fill() {
    const session = loaded.document.sessions.find(s => s.id === sessionId), root = $('session-editor-fields'); root.replaceChildren(); inputs = [];
    $('session-editor-title').textContent = `${entry.moduleCode} · ${entry.unitCode} · Sesión ${session.number}`;
    $('session-editor-context').textContent = `${session.date.split('-').reverse().join('/')} · ${session.activities.length} ${session.activities.length === 1 ? 'actividad' : 'actividades'}`;
    for (const [index, activity] of session.activities.entries()) {
      const group = node('fieldset', 'session-text-activity'); group.append(node('legend', '', `${index === 0 ? 'Primera actividad · cabecera' : `Actividad ${index + 1}`} · ${activity.start}–${activity.end}`));
      const titleLabel = node('label', '', 'Título'), title = node('input'); title.type = 'text'; title.required = true; title.value = activity.title;
      title.id = `session-text-title-${index}`; titleLabel.htmlFor = title.id;
      const plannedLabel = node('label', '', 'Descripción prevista'), planned = node('textarea'); planned.rows = 4; planned.value = activity.planned;
      planned.id = `session-text-planned-${index}`; plannedLabel.htmlFor = planned.id;
      for (const input of [title, planned]) input.addEventListener('input', () => { title.setCustomValidity(''); availability(); onStateChange(); });
      group.append(titleLabel, title, plannedLabel, planned); root.append(group); inputs.push({ id: activity.id, title, planned });
    }
  }
  async function open(target, id, activityId, focusId) {
    if (isBusy() || $('session-editor-dialog').open || !canOpen()) return;
    const nextPosition = { x: window.scrollX, y: window.scrollY, focusId };
    setBusy(true);
    try {
      const candidate = unitStore(target), result = await candidate.load();
      assertSessionRead(result, target, id, getActive());
      loaded = result; entry = { ...target }; sessionId = id; sourceStore = candidate; blocked = false; position = nextPosition;
      fill(); message(); $('session-editor-dialog').showModal();
    } catch (error) {
      if (error.code === 'SESSION_STALE') onBlocked(target);
      onMessage(error instanceof SessionEditError ? error.message : 'No se ha podido leer la sesión. Se conservan las notas pendientes de la unidad.', 'error');
    } finally { setBusy(false); availability(); onStateChange(); }
    if (loaded && $('session-editor-dialog').open) {
      const targetInput = inputs.find(a => a.id === activityId)?.title ?? inputs[0]?.title;
      targetInput?.focus({ preventScroll: true }); targetInput?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  }
  function clear() {
    $('session-editor-dialog').close(); loaded = null; entry = null; sessionId = null; sourceStore = null; blocked = false; inputs = [];
    $('session-editor-fields').replaceChildren(); $('session-editor-title').textContent = ''; $('session-editor-context').textContent = ''; message(); position = null;
  }
  function close() {
    if (isBusy() || (pending() && !window.confirm('Hay textos de la sesión sin guardar. ¿Descartarlos y cerrar? Las notas pendientes de Unidad se conservan.'))) return;
    const previousPosition = position; clear(); availability(); onStateChange(); onReturn(previousPosition);
  }
  $('session-editor-form').addEventListener('submit', async event => {
    event.preventDefault(); if (isBusy() || blocked || !changed()) return;
    for (const { title } of inputs) { title.setCustomValidity(title.value.trim() ? '' : 'Escribe un título para esta actividad.'); if (!title.reportValidity()) return; }
    let confirmed = false;
    setBusy(true);
    try {
      const prepared = prepareSessionSave(loaded, entry, sessionId, read(), getActive());
      const result = await saveTaskDocument(sourceStore, prepared, { entry }, loaded.sha);
      onSaved(entry, result, prepared); loaded = result;
      confirmed = true;
    } catch (error) {
      if (error instanceof SessionEditError) { message(error.message, 'warning'); if (error.code === 'SESSION_STALE') { blocked = true; onBlocked(entry); } }
      else { const feedback = saveErrorFeedback(error); blocked = feedback.requiresReload || error.code === 'HTTP_422'; if (blocked) onBlocked(entry); message(feedback.message + (blocked ? ' Descarga los textos antes de cerrar y revisa después la unidad. Se conservan ambos borradores.' : ''), feedback.kind); }
    } finally { setBusy(false); availability(); onStateChange(); if (confirmed) close(); }
  });
  for (const id of ['session-editor-close', 'session-editor-cancel']) $(id).addEventListener('click', close);
  $('session-editor-dialog').addEventListener('cancel', event => { event.preventDefault(); close(); });
  $('session-editor-download').addEventListener('click', () => {
    if (isBusy() || !loaded) return;
    const data = { path: entry.path, sessionId, baseSha: loaded.sha, activities: read() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json;charset=utf-8' }));
    const link = node('a'); link.href = url; link.download = `${entry.moduleCode}-${entry.unitCode}-borrador-sesion.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  return { open, clear, availability, hasPending: pending, isOpen: () => $('session-editor-dialog').open };
}
