import { validateDocument, summarize, GithubStore, ConflictError, UnknownSaveError } from './core.mjs';

const $ = (id) => document.getElementById(id);
const fields = ['observations', 'improvements', 'realized', 'pending'];
const stateNames = ['', 'Impartida', 'Reprogramada', 'Cancelada'];
const stateClasses = new Map([['Impartida', 'delivered'], ['Reprogramada', 'rescheduled'], ['Cancelada', 'cancelled']]);
const progressNames = new Map([[0, 'Pendiente'], [1, 'En proceso'], [2, 'Completada']]);
const openSessions = new Set();
let store = null;
let savedDocument = null;
let draft = null;
let originalSha = null;
let busy = false;
let blockedSave = false;
let failedSave = false;
let editorTarget = null;
let lastConfirmedAt = null;

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = String(text);
  return el;
}

function copy(value) { return structuredClone(value); }
function text(value) { return typeof value === 'string' ? value : ''; }
function dirty() { return Boolean(draft && JSON.stringify(draft) !== JSON.stringify(savedDocument)); }

function editorDirty() {
  if (!editorTarget || !$('editor').open || !draft) return false;
  const activity = draft.sessions[editorTarget.sessionIndex].activities[editorTarget.activityIndex];
  return fields.some((field) => $(field).value !== text(activity[field]));
}

function hasPendingChanges() { return dirty() || editorDirty(); }

function checked(value) {
  const errors = validateDocument(value);
  if (!Array.isArray(errors) || errors.length) throw new Error('InvalidDocument');
  return value;
}

function message(id, content = '', kind = '') {
  const element = $(id);
  element.textContent = content;
  element.className = `message${id === 'workspace-message' ? ' workspace-message' : ''}${kind ? ` ${kind}` : ''}`;
  element.hidden = !content;
}

function setBusy(value) {
  busy = value;
  document.querySelectorAll('button, input, textarea, select').forEach((element) => { element.disabled = value; });
  updateSaveState();
}

function updateSaveState() {
  const state = $('save-state');
  state.className = 'save-state';
  if (busy) {
    state.textContent = 'Conectando con GitHub…';
    state.classList.add('saving');
  } else if (blockedSave) {
    state.textContent = 'Borrador pendiente de revisar';
    state.classList.add('error');
  } else if (failedSave) {
    state.textContent = 'No se ha guardado';
    state.classList.add('error');
  } else if (dirty()) {
    state.textContent = 'Cambios sin guardar';
    state.classList.add('dirty');
  } else {
    state.textContent = lastConfirmedAt ? `Guardado · ${lastConfirmedAt}` : 'Sin cambios pendientes';
  }
  $('save').disabled = busy || !draft || !dirty() || blockedSave || $('editor').open;
  $('refresh').disabled = busy || !draft || $('editor').open;
  $('disconnect').disabled = busy;
  $('download-draft').disabled = busy || !draft;
  $('recovery-actions').hidden = !(blockedSave || failedSave);
}

function confirmationTime() {
  return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date());
}

function minutesLabel(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours} h${remainder ? ` ${remainder} min` : ''}` : `${remainder} min`;
}

function dateInfo(value) {
  const date = new Date(`${value}T12:00:00Z`);
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const weekday = ['D', 'L', 'M', 'X', 'J', 'V', 'S'][date.getUTCDay()];
  return {
    day: `${weekday} ${date.getUTCDate()}`,
    month: new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' }).format(date).replace('.', ''),
    full: new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date),
    past: value < today,
  };
}

function sessionTime(session) {
  const first = session.activities[0];
  const last = session.activities.at(-1);
  return first && last ? `${first.start}–${last.end}` : '';
}

function addMeta(container, content, className = '') {
  if (container.childElementCount) container.append(node('span', 'meta-separator', '·'));
  container.append(node('span', className, content));
}

function editButton(sessionIndex, activityIndex, label = 'Editar notas') {
  const button = node('button', 'edit-button', label);
  button.type = 'button';
  button.addEventListener('click', () => openEditor(sessionIndex, activityIndex));
  return button;
}

function makeStateSelect(session, index) {
  const section = node('div', 'session-state');
  const label = node('label', '', 'Estado de la sesión');
  const select = node('select', `state-select ${stateClasses.get(session.state) || ''}`);
  select.id = `session-state-${index}`;
  label.htmlFor = select.id;
  select.setAttribute('aria-label', `Estado de la sesión ${session.number}`);
  for (const value of stateNames) {
    const option = node('option', '', value || 'Sin marcar');
    option.value = value;
    option.selected = session.state === value;
    select.append(option);
  }
  select.addEventListener('change', () => {
    if (busy) return;
    draft.sessions[index].state = select.value;
    select.className = `state-select ${stateClasses.get(select.value) || ''}`;
    failedSave = false;
    renderStats();
    updateSaveState();
  });
  section.append(label, select);
  return section;
}

function makeActivity(activity, sessionIndex, activityIndex) {
  const container = node('section', 'activity');
  const top = node('div', 'activity-top');
  const time = node('div', 'activity-time', `${activity.start}–${activity.end}`);
  time.append(node('span', '', 'PORCIÓN DE SESIÓN'));
  const description = node('div', 'activity-description');
  const title = node('h4', 'activity-title', activity.title || 'Actividad');
  description.append(title);
  if (progressNames.has(activity.progress)) description.append(node('span', `activity-progress progress-${activity.progress}`, `Progreso: ${progressNames.get(activity.progress)}`));
  if (activity.planned) description.append(node('p', 'activity-preview', activity.planned));
  if (fields.some((field) => text(activity[field]).trim())) description.append(node('span', 'activity-notes', 'Con notas'));
  const action = node('div', 'activity-edit');
  action.append(editButton(sessionIndex, activityIndex, 'Abrir / editar'));
  top.append(time, description, action);
  container.append(top);
  return container;
}

function makeSession(session, sessionIndex) {
  const first = session.activities[0];
  const isOpen = openSessions.has(session.id);
  const section = node('article', 'session');
  const top = node('div', 'session-top');
  const toggle = node('button', 'session-toggle', isOpen ? '−' : '+');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', `${isOpen ? 'Plegar' : 'Abrir'} sesión ${session.number}`);
  toggle.setAttribute('aria-expanded', String(isOpen));
  toggle.setAttribute('aria-controls', `session-content-${sessionIndex}`);
  const date = dateInfo(session.date);
  const dateTile = node('time', `date-tile${date.past ? ' past' : ''}`);
  dateTile.dateTime = session.date;
  dateTile.title = date.full + (date.past ? ' · Fecha anterior a hoy; no indica impartición.' : '');
  dateTile.setAttribute('aria-label', date.full);
  dateTile.append(node('span', 'date-day', date.day), node('span', 'date-month', date.month));
  const description = node('div', 'session-description');
  const meta = node('div', 'session-meta');
  addMeta(meta, `SESIÓN ${session.number}`, 'session-number');
  addMeta(meta, sessionTime(session));
  addMeta(meta, `${session.activities.length} porciones`);
  description.append(meta, node('h3', 'session-title', first?.title || 'Sesión'));
  if (first?.planned) description.append(node('p', 'planned-preview', first.planned));
  if (first?.observations) description.append(node('p', 'notes-strip', `Observaciones: ${first.observations}`));
  const portion = node('div', 'portion-meta');
  if (first) {
    portion.append(node('span', 'portion-tag', 'Primera porción'), node('span', '', `${first.start}–${first.end}`), editButton(sessionIndex, 0));
  }
  description.append(portion);
  top.append(toggle, dateTile, description, makeStateSelect(session, sessionIndex));
  const body = node('div', 'session-body');
  body.id = `session-content-${sessionIndex}`;
  body.hidden = !isOpen;
  body.append(node('p', 'activities-label', session.activities.length > 1 ? 'CONTINUACIÓN DE LA SESIÓN' : 'ESTA SESIÓN TIENE UNA ÚNICA PORCIÓN'));
  session.activities.slice(1).forEach((activity, index) => body.append(makeActivity(activity, sessionIndex, index + 1)));
  toggle.addEventListener('click', () => {
    if (busy) return;
    if (openSessions.has(session.id)) openSessions.delete(session.id); else openSessions.add(session.id);
    const next = openSessions.has(session.id);
    body.hidden = !next;
    toggle.textContent = next ? '−' : '+';
    toggle.setAttribute('aria-expanded', String(next));
    toggle.setAttribute('aria-label', `${next ? 'Plegar' : 'Abrir'} sesión ${session.number}`);
  });
  section.append(top, body);
  return section;
}

function renderStats() {
  if (!draft) return;
  const summary = summarize(draft);
  const stats = $('stats');
  stats.replaceChildren();
  for (const [value, label, highlight] of [[summary.totalSessions, 'sesiones previstas', false], [summary.deliveredSessions, 'sesiones impartidas', true], [minutesLabel(summary.totalMinutes), 'tiempo previsto', false]]) {
    const item = node('div', 'stat');
    item.append(node('span', `stat-value${highlight ? ' teal' : ''}`, value), node('span', 'stat-label', label));
    stats.append(item);
  }
}

function renderSessions() {
  const container = $('sessions');
  container.replaceChildren();
  if (!draft.sessions.length) container.append(node('p', 'empty-sessions', 'Este documento no contiene sesiones.'));
  draft.sessions.forEach((session, index) => container.append(makeSession(session, index)));
  updateSaveState();
}

function render() {
  $('module-code').textContent = draft.module.code;
  $('module-name').textContent = draft.module.name;
  $('unit-code').textContent = draft.unit.code;
  $('unit-navigation-title').textContent = draft.unit.title;
  $('breadcrumb-module').textContent = draft.module.code;
  $('breadcrumb-unit').textContent = draft.unit.code;
  $('unit-title').textContent = draft.unit.title;
  $('connection-label').replaceChildren(node('span', 'status-dot'), document.createTextNode('Conectado'));
  $('connection-label').classList.add('is-connected');
  $('disconnect').hidden = false;
  $('login-view').hidden = true;
  $('workspace').hidden = false;
  $('loaded-version').textContent = `Versión leída: ${originalSha.slice(0, 8)} · Comprobada a las ${lastConfirmedAt}`;
  renderStats();
  renderSessions();
}

function acceptLoaded(result) {
  checked(result.document);
  if (typeof result.sha !== 'string' || !result.sha) throw new Error('MissingVersion');
  savedDocument = copy(result.document);
  draft = copy(result.document);
  originalSha = result.sha;
  blockedSave = false;
  failedSave = false;
  lastConfirmedAt = confirmationTime();
  message('workspace-message');
  render();
}

async function connect(event) {
  event.preventDefault();
  if (busy) return;
  let token = $('token').value.trim();
  $('token').value = '';
  if (!token) return;
  try {
    store = new GithubStore({ token });
    token = '';
    setBusy(true);
    message('login-message', 'Comprobando acceso y leyendo el documento privado…');
    acceptLoaded(await store.load());
    message('login-message');
    $('unit-title').tabIndex = -1;
    $('unit-title').focus();
  } catch (error) {
    token = '';
    store = null;
    const status = error?.status;
    message('login-message', status === 401 || status === 403 || status === 404
      ? 'No se ha podido abrir el documento. Comprueba el token, su acceso al repositorio privado y los permisos de Contents.'
      : 'No se ha podido cargar un documento válido. Comprueba la conexión, el acceso al repositorio y el formato del archivo antes de volver a conectar.', 'error');
  } finally {
    token = '';
    setBusy(false);
  }
}

function disconnect() {
  if (busy) return;
  if (hasPendingChanges() && !window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos y desconectar?')) return;
  $('editor').close();
  editorTarget = null;
  store = null;
  savedDocument = null;
  draft = null;
  originalSha = null;
  blockedSave = false;
  failedSave = false;
  lastConfirmedAt = null;
  openSessions.clear();
  $('sessions').replaceChildren();
  $('stats').replaceChildren();
  ['module-code', 'module-name', 'unit-code', 'unit-navigation-title', 'breadcrumb-module', 'breadcrumb-unit', 'unit-title', 'loaded-version', 'editor-title', 'editor-planned', 'editor-time', 'editor-kicker', 'editor-progress'].forEach((id) => { $(id).textContent = ''; });
  $('editor-details').replaceChildren();
  fields.forEach((field) => { $(field).value = ''; });
  $('token').value = '';
  $('workspace').hidden = true;
  $('login-view').hidden = false;
  $('disconnect').hidden = true;
  $('connection-label').replaceChildren(node('span', 'status-dot'), document.createTextNode('Sin conectar'));
  $('connection-label').classList.remove('is-connected');
  message('login-message', 'Desconectado. La credencial y el contenido cargado se han retirado de esta página.');
  updateSaveState();
  $('token').focus();
}

async function refresh() {
  if (busy || !store || $('editor').open) return;
  if (dirty() && !window.confirm('Actualizar descartará el borrador y cargará la versión de GitHub. Descarga primero el borrador si quieres conservarlo. ¿Continuar?')) return;
  setBusy(true);
  message('workspace-message', 'Leyendo de nuevo la versión de GitHub…');
  try {
    acceptLoaded(await store.load());
    message('workspace-message', 'Versión actualizada desde GitHub.');
  } catch {
    message('workspace-message', 'No se ha podido actualizar. El contenido y el borrador que tenías permanecen intactos. Comprueba la conexión y vuelve a intentarlo.', 'error');
  } finally {
    setBusy(false);
  }
}

async function save() {
  if (busy || !store || !draft || !dirty() || blockedSave || $('editor').open) return;
  const errors = validateDocument(draft);
  if (!Array.isArray(errors) || errors.length) {
    failedSave = true;
    message('workspace-message', 'El borrador no supera la validación. No se ha enviado. Puedes descargarlo para revisarlo.', 'error');
    updateSaveState();
    return;
  }
  setBusy(true);
  message('workspace-message', 'Guardando el borrador contra la versión que abriste…');
  try {
    const result = await store.save(copy(draft), originalSha);
    acceptLoaded(result);
    const commit = typeof result.commitSha === 'string' && /^[0-9a-f]{7,64}$/i.test(result.commitSha) ? result.commitSha.slice(0, 8) : '';
    message('workspace-message', `Cambios guardados y confirmados en GitHub.${commit ? ` Revisión ${commit}.` : ''}`);
  } catch (error) {
    failedSave = true;
    if (error instanceof ConflictError) {
      blockedSave = true;
      message('workspace-message', 'GitHub contiene cambios posteriores a la versión que abriste. No se ha sobrescrito. Tu borrador sigue aquí: descárgalo antes de actualizar y revisar las diferencias.', 'warning');
    } else if (error instanceof UnknownSaveError) {
      blockedSave = true;
      message('workspace-message', 'No se puede confirmar si GitHub recibió el guardado. El borrador se conserva y el reenvío queda bloqueado. Descárgalo y actualiza para comprobar la versión remota antes de continuar.', 'warning');
    } else {
      message('workspace-message', 'No se ha podido guardar. El borrador se conserva. Comprueba el acceso y la conexión; no se ha realizado ningún reintento automático.', 'error');
    }
  } finally {
    setBusy(false);
  }
}

function openEditor(sessionIndex, activityIndex) {
  if (busy || !draft) return;
  const session = draft.sessions[sessionIndex];
  const activity = session.activities[activityIndex];
  editorTarget = { sessionIndex, activityIndex };
  $('editor-kicker').textContent = `SESIÓN ${session.number} · ${activityIndex === 0 ? 'PRIMERA PORCIÓN' : 'ACTIVIDAD'}`;
  $('editor-title').textContent = activity.title || 'Actividad';
  $('editor-time').textContent = `${activity.start}–${activity.end} · ${dateInfo(session.date).full}`;
  $('editor-progress').hidden = !progressNames.has(activity.progress);
  $('editor-progress').textContent = progressNames.has(activity.progress) ? `Progreso importado: ${progressNames.get(activity.progress)} · Solo lectura` : '';
  $('editor-planned').textContent = activity.planned || 'Sin descripción prevista.';
  fields.forEach((field) => { $(field).value = text(activity[field]); });
  const details = $('editor-details');
  details.replaceChildren();
  for (const [label, value] of [['Unidad', draft.unit.id], ['Sesión', session.id], ['Porción', activity.id], ['Tipo de origen', activity.kind], ['Fila de origen', activity.sourceRow]]) {
    if (value !== undefined && value !== null) details.append(node('dt', '', label), node('dd', '', value));
  }
  $('editor').querySelectorAll('details').forEach((element) => { element.open = false; });
  $('editor').showModal();
  $('editor').querySelector('.editor-content').scrollTop = 0;
  $('observations').focus();
  updateSaveState();
}

function closeEditor() {
  if (busy) return;
  if (editorDirty() && !window.confirm('Hay texto sin aplicar al borrador. ¿Quieres descartarlo y cerrar?')) return;
  $('editor').close();
  editorTarget = null;
  fields.forEach((field) => { $(field).value = ''; });
  updateSaveState();
}

function applyEditor(event) {
  event.preventDefault();
  if (busy || !editorTarget || !draft) return;
  const activity = draft.sessions[editorTarget.sessionIndex].activities[editorTarget.activityIndex];
  fields.forEach((field) => { activity[field] = $(field).value; });
  $('editor').close();
  editorTarget = null;
  fields.forEach((field) => { $(field).value = ''; });
  failedSave = false;
  renderSessions();
}

function downloadDraft() {
  if (busy || !draft) return;
  const blob = new Blob([JSON.stringify(draft, null, 2) + '\n'], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = node('a');
  anchor.href = url;
  anchor.download = 'LM-UT02-borrador.json';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function expand(mode) {
  if (busy || !draft) return;
  openSessions.clear();
  if (mode !== 'none') draft.sessions.forEach((session) => {
    openSessions.add(session.id);
  });
  renderSessions();
}

$('login-form').addEventListener('submit', connect);
$('disconnect').addEventListener('click', disconnect);
$('refresh').addEventListener('click', refresh);
$('save').addEventListener('click', save);
$('download-draft').addEventListener('click', downloadDraft);
$('collapse-all').addEventListener('click', () => expand('none'));
$('expand-sessions').addEventListener('click', () => expand('sessions'));
$('editor-form').addEventListener('submit', applyEditor);
$('close-editor').addEventListener('click', closeEditor);
$('cancel-editor').addEventListener('click', closeEditor);
$('editor').addEventListener('cancel', (event) => { event.preventDefault(); closeEditor(); });
$('editor').addEventListener('click', (event) => {
  if (event.target !== $('editor')) return;
  const rect = $('editor').getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeEditor();
});
window.addEventListener('beforeunload', (event) => {
  if (!hasPendingChanges() && !busy) return;
  event.preventDefault();
  event.returnValue = '';
});
updateSaveState();
