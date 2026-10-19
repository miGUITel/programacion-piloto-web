import { createContextMemory, catalogEntries, chooseStartup, resolveRemembered, unitContext, meetingContext, meetingsForDay, madridClock } from './startup-context.mjs?v=20261019-meeting-calendar';
import { elapsedTiming, timingDescription } from './row-time.mjs?v=20261019-rf22';
import { MeetingReader } from './meeting-reader.mjs?v=20261019-meeting-calendar';
import { createMeetingWorkspace } from './meeting-workspace-ui.mjs?v=20261019-meeting-calendar';
import { createResourcesUI } from './resources-ui.mjs?v=20261018-rf12b';
import { validateCatalog, validateDocument, summarize, isValidDate, GithubStore, saveErrorFeedback } from './core.mjs?v=20261018-rf12';
import { createSuggestionsUI } from './suggestions-ui.mjs?v=20261019-rf16';
import { createGeneralNotesUI } from './general-notes-ui.mjs?v=20261018-rf12';
import { orderedUnits, compactUnitLabel, madridToday, sessionBand, presentationPeriods, compactSessionHeaders, globalSessionExpansion } from './unit-tools.mjs?v=20261018-rf12';
import { eventTypes, setSessionEventType, activityEventType, activityEventTypes, taskProgress, sessionTaskTargets, moduleTimeline, unitExamReminders, setExamAnnouncement } from './teaching.mjs?v=20261019-parallel-lanes';
import { libraryIntegrity } from './model-v3.mjs?v=20261018-rf12';
import { taskDateFields, taskTarget, taskDetails, applyTaskDetails, moduleTasks } from './module-views.mjs?v=20261018-rf12';
import { createModuleViews } from './module-views-ui.mjs?v=20261018-rf12';
import { presentationTargets, presentationDefaults, applyPresentation } from './task-cycle.mjs?v=20261018-rf12';
import { hasTaskPlan, visibleSessionTasks, taskHeading } from './task-plan.mjs?v=20261018-rf12';
import { createTaskPresentationUI } from './task-presentation-ui.mjs?v=20261018-rf12';
import { createTaskRegistryUI } from './task-registry-ui.mjs?v=20261018-rf12';
import { createModuleProfileUI } from './module-profile-ui.mjs?v=20261018-rf12';
import { renderUnitInformation, sessionInformationLines } from './unit-information.mjs?v=20261018-rf12';
import { createPreparationUI } from './preparation-ui.mjs?v=20261018-rf12';
import { createSessionEditorUI, bindSessionEditRow } from './session-editor-ui.mjs?v=20261018-rf12';

const $ = (id) => document.getElementById(id);
const fields = ['observations', 'improvements', 'realized', 'pending'];
const stateNames = ['', 'Impartida', 'Reprogramada', 'Cancelada'];
const stateClasses = new Map([['Impartida', 'delivered'], ['Reprogramada', 'rescheduled'], ['Cancelada', 'cancelled']]);
const progressNames = new Map([[0, 'Pendiente'], [1, 'En proceso'], [2, 'Completada']]);
const openSessions = new Set();
const documentStores = new Map();
const moduleDocuments = new Map();
let moduleLoadFailures = [];
let moduleContextReady = false;
let teachingTimeline = { sessions: [], exams: [], errors: [] };
let examReminders = [];
let store = null;
let connection = null;
let catalog = null;
let activeEntry = null;
let openingEntry = null;
let savedDocument = null;
let draft = null;
let originalSha = null;
let busy = false;
let blockedSave = false;
let failedSave = false;
let editorTarget = null;
let lastConfirmedAt = null;
let currentView = 'unit';
const contextMemory = createContextMemory();
let startupCommon = null, currentMeeting = null, resumeContext = null, selectedSessionId = null, meetingReader = null;
let startingNavigation = false;
const navigationWarnings = new Set();

// Unit draft and independent task transactions share confirmed source snapshots.
function libraryRecords() { return draft ? [...moduleDocuments.values(), { entry: activeEntry, document: draft }] : []; }
function moduleRecords() { return libraryRecords().filter(record => record.entry.moduleCode === activeEntry?.moduleCode); }
function moduleFailures() { return moduleLoadFailures.filter(entry => entry.moduleCode === activeEntry?.moduleCode).map(entry => entry.unitCode); }
function readTaskEditor() {
  return { ...Object.fromEntries(taskDateFields.map(field => [field, $('task-' + field).value])),
    presented: $('task-presented').checked, corrected: $('task-corrected').checked };
}

function editorTaskTarget() {
  if (!editorTarget || !draft) return null;
  if (editorTarget.officialTaskId) return draft.tasks.find(task => task.id === editorTarget.officialTaskId);
  const session = draft.sessions[editorTarget.sessionIndex];
  return editorTarget.sessionTask && !$('activity-event-type').value ? session : session.activities[editorTarget.activityIndex];
}

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
  const target = editorTaskTarget();
  return fields.some((field) => $(field).value !== text(activity[field])) || $('activity-event-type').value !== (activity.eventType || '')
    || (!$('task-fields').hidden && JSON.stringify(readTaskEditor()) !== JSON.stringify(taskDetails(target)));
}

function hasPendingChanges() { return meetingsUI.hasPending() || dirty() || editorDirty() || presentationUI.isOpen() || registryUI.hasPending() || preparationUI.hasPending() || sessionEditorUI.hasPending() || resourcesUI.hasPending(); }

function checked(value, entry = activeEntry) {
  const errors = validateDocument(value, entry ?? undefined);
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

function updateConnectionState() {
  const connected = Boolean(connection && catalog), online = globalThis.navigator?.onLine !== false;
  const label = connected ? online ? 'Sesión conectada con GitHub' : 'Sin red; conserva los borradores' : 'Sin conectar';
  $('connection-label').classList.toggle('is-connected', connected && online);
  $('connection-label').setAttribute('aria-label', label);
  $('connection-status').setAttribute('aria-label', `${label}. Opciones del cuaderno`);
  $('connection-status').setAttribute('aria-disabled', String(busy));
  $('connection-status').title = `${label}. Información, mejoras y desconexión. La escritura se confirma al guardar.`;
  document.querySelector('.app-toolbar').classList.toggle('has-library', Boolean(catalog));
}

function updateSaveState() {
  const state = $('save-state'), disk = $('save');
  const independentPending = meetingsUI.hasPending() || registryUI.hasPending() || preparationUI.hasPending() || sessionEditorUI.hasPending() || resourcesUI.hasPending() || generalNotesUI.hasPending() || suggestionsUI.hasPending();
  const pending = hasPendingChanges() || independentPending;
  const independentError = independentPending && ['meetings-message', 'registry-message', 'preparation-message', 'session-editor-message', 'resources-message', 'general-notes-message', 'suggestion-message']
    .some(id => !$(id).hidden && ($(id).classList.contains('error') || $(id).classList.contains('warning')));
  const error = blockedSave || failedSave || independentError;
  const status = busy ? 'busy' : error ? 'error' : pending ? 'pending' : draft ? 'clean' : 'empty';
  const description = busy ? 'Operación con GitHub en curso. Espera su confirmación.'
    : error ? 'Hay un guardado fallido o pendiente de revisión. Los borradores se conservan; consulta el aviso.'
    : independentPending ? 'Hay cambios pendientes en una ventana de edición. Usa su botón Guardar o Aplicar al borrador; no se guardan desde este disco.'
    : dirty() ? 'Cambios de Unidad sin guardar. Pulsa el disco para guardarlos en GitHub.'
    : draft ? 'Sin cambios locales pendientes. Versión confirmada mediante lectura de GitHub.' : 'Sin unidad abierta.';
  state.textContent = description;
  disk.dataset.state = status;
  disk.title = description;
  disk.setAttribute('aria-label', dirty() ? `Guardar cambios de Unidad. ${description}` : description);
  disk.setAttribute('aria-busy', String(busy));
  $('workspace-nav').hidden = !draft;
  $('refresh').hidden = !draft || currentView === 'meeting';
  disk.hidden = !draft || currentView === 'meeting';
  $('open-meetings').disabled = busy || !catalog || Boolean(document.querySelector('dialog[open]'));
  $('resume-context').hidden = !catalog || !resumeContext;
  $('resume-context').disabled = busy || Boolean(document.querySelector('dialog[open]'));
  $('meeting-return').hidden = !draft;
  $('meeting-draft-note').hidden = !dirty();
  $('meeting-select').disabled = busy || !$('meeting-select').options.length;
  $('open-suggestions').hidden = !catalog;
  updateConnectionState();
  $('save').disabled = busy || !draft || !dirty() || blockedSave || $('editor').open || presentationUI.isOpen() || (registryUI.isOpen() || preparationUI.isOpen() || sessionEditorUI.isOpen() || resourcesUI.isOpen());
  $('refresh').disabled = busy || !draft || $('editor').open || presentationUI.isOpen() || (registryUI.isOpen() || preparationUI.isOpen() || sessionEditorUI.isOpen() || resourcesUI.isOpen());
  $('disconnect').disabled = busy;
  $('download-draft').disabled = busy || !draft;
  $('recovery-actions').hidden = !(dirty() || blockedSave || failedSave);
  updateGlobalExpansion();
  updateNavigation();
  suggestionsUI.updateAvailability();
  preparationUI.availability();
  sessionEditorUI.availability();
  resourcesUI.availability();
  meetingsUI.availability();
}

function selectedEntry() {
  const module = catalog?.modules.find(item => item.code === $('module-select').value);
  const unit = module?.units.find(item => item.code === $('unit-select').value);
  return unit ? { moduleCode: module.code, unitCode: unit.code, unitId: unit.id, path: unit.path } : null;
}

function navigationBlocked() {
  return busy || !connection || hasPendingChanges() || blockedSave || $('editor').open || registryUI.isOpen() || preparationUI.isOpen() || sessionEditorUI.isOpen() || resourcesUI.isOpen()
    || generalNotesUI.hasPending() || generalNotesUI.isOpen() || $('module-profile-dialog').open || $('suggestions-dialog').open;
}

function restoreUnitSelection() {
  const entry = openingEntry ?? activeEntry;
  if (currentView === 'meeting' && meetingsUI.spaces().length) { syncMeetingSelection(meetingsUI.location()); return; }
  if (!entry) return;
  $('module-select').value = entry.moduleCode;
  fillUnits(entry.unitCode);
}

function updateNavigation() {
  const editing = hasPendingChanges() || $('editor').open || (registryUI.isOpen() || preparationUI.isOpen() || sessionEditorUI.isOpen() || resourcesUI.isOpen()) || blockedSave || generalNotesUI.hasPending() || generalNotesUI.isOpen();
  const selectedModule = catalog?.modules.find(item => item.code === $('module-select').value);
  const virtual = $('module-select').value.startsWith('@');
  if (virtual) {
    const locked = busy || meetingsUI.hasPending() || Boolean(document.querySelector('dialog[open]')) || registryUI.hasPending() || preparationUI.hasPending() || sessionEditorUI.hasPending() || resourcesUI.hasPending() || generalNotesUI.hasPending();
    $('module-select').disabled = locked;
    $('unit-select').disabled = locked || !$('unit-select').options.length;
    $('selection-help').textContent = meetingsUI.hasPending() ? 'Guarda o descarta las notas de reunión antes de cambiar de grupo.' : '';
    $('selection-help').hidden = !$('selection-help').textContent;
    generalNotesUI.updateAvailability(); moduleProfileUI.updateAvailability();
    return;
  }
  const selected = selectedEntry();
  $('module-select').disabled = busy || editing || !catalog?.modules.length;
  $('unit-select').disabled = busy || editing || !selectedModule?.units.length;
  let help = '';
  if (blockedSave) help = 'Conserva el borrador y actualiza la unidad abierta para revisar el guardado antes de cambiar de unidad.';
  else if (generalNotesUI.hasPending() || generalNotesUI.isOpen()) help = 'Termina de revisar o guardar las mejoras generales antes de cambiar de unidad.';
  else if ($('editor').open) help = 'Termina de editar y guarda los cambios antes de abrir otra unidad.';
  else if (editing) help = 'Guarda tus cambios antes de abrir otra unidad. El borrador permanece en la unidad abierta.';
  else if (selectedModule && !selectedModule.units.length) help = `${selectedModule.code}: pendiente de incorporar su unidad. No hay planificación disponible en la app todavía.${activeEntry ? ` Sigue abierta ${activeEntry.moduleCode} · ${activeEntry.unitCode}.` : ''}`;
  else if (activeEntry && selected?.path !== activeEntry.path) help = `En pantalla: ${activeEntry.moduleCode} · ${activeEntry.unitCode}.${busy ? ' Abriendo la selección…' : ' Elige una unidad para abrirla.'}`;
  else if (!activeEntry && selected) help = busy ? 'Abriendo la unidad seleccionada…' : 'Elige una unidad para abrirla.';
  $('selection-help').textContent = help;
  $('selection-help').hidden = !help;
  $('selection-help').classList.toggle('visually-hidden', editing && !blockedSave);
  generalNotesUI.updateAvailability();
  moduleProfileUI.updateAvailability();
}

function fillUnits(preferredCode = '') {
  $('library-view').classList.toggle('has-meeting-space', $('module-select').value.startsWith('@'));
  if ($('module-select').value.startsWith('@')) {
    const space = $('module-select').value.slice(1), select = $('unit-select');
    select.replaceChildren();
    const all = node('option', '', 'Todas las reuniones'); all.value = '*'; select.append(all);
    for (const group of meetingsUI.groups().filter(g => g.space === space)) { const option = node('option', '', group.title); option.value = group.id; select.append(option); }
    select.value = [...select.options].some(o => o.value === preferredCode) ? preferredCode : select.options[1]?.value ?? '*';
    updateNavigation(); return;
  }
  const module = catalog?.modules.find(item => item.code === $('module-select').value);
  const select = $('unit-select');
  select.replaceChildren();
  if (!module?.units.length) {
    const option = node('option', '', 'Pendiente de incorporar');
    option.value = '';
    select.append(option);
  } else for (const unit of module.units) {
    const option = node('option', '', compactUnitLabel(unit));
    option.title = `${unit.code} · ${unit.title}`;
    option.value = unit.code;
    select.append(option);
  }
  if (module?.units.some(unit => unit.code === preferredCode)) select.value = preferredCode;
  updateNavigation();
}

function acceptCatalog(result) {
  const errors = validateCatalog(result.catalog);
  if (errors.length) throw new Error('InvalidCatalog');
  const previousModule = $('module-select').value;
  const previousUnit = $('unit-select').value;
  catalog = copy(result.catalog);
  for (const module of catalog.modules) module.units = orderedUnits(module.units);
  const select = $('module-select');
  select.replaceChildren();
  for (const module of catalog.modules) {
    const option = node('option', '', module.code);
    option.title = module.name;
    option.value = module.code;
    select.append(option);
  }
  const preferred = catalog.modules.find(module => module.code === previousModule)
    ?? catalog.modules.find(module => module.units.length) ?? catalog.modules[0];
  select.value = preferred?.code ?? '';
  fillUnits(previousUnit);
  $('library-view').hidden = false;
  $('login-view').hidden = true;
  $('disconnect').hidden = false;
  updateConnectionState();
}

async function loadSelectedDocument(preloaded = null) {
  const entry = selectedEntry();
  if (!entry || !connection || hasPendingChanges() || blockedSave || $('editor').open || generalNotesUI.hasPending() || generalNotesUI.isOpen()) return false;
  if (entry.path === activeEntry?.path) return true;
  openingEntry = entry;
  message('library-message', `Abriendo ${entry.moduleCode} · ${entry.unitCode}…`);
  try {
    const candidate = documentStores.get(entry.path) ?? connection.forDocument(entry);
    documentStores.set(entry.path, candidate);
    const result = preloaded?.get(entry.path) ?? await candidate.load();
    // Do not replace the current document, its SHA or its store until the new read is valid.
    checked(result.document, entry);
    if (typeof result.sha !== 'string' || !result.sha) throw new Error('MissingVersion');
    store = candidate;
    activeEntry = Object.freeze({ ...entry });
    moduleContextReady = false;
    moduleLoadFailures = [];
    moduleDocuments.clear();
    openSessions.clear(); selectedSessionId = null;
    acceptLoaded(result);
    await loadModuleContext(preloaded);
    rememberUnit();
    message('library-message');
    $('unit-title').focus({ preventScroll: true });
    return true;
  } catch {
    openingEntry = null;
    if (activeEntry) restoreUnitSelection();
    else {
      $('unit-select').querySelector('option[value=""]')?.remove();
      const placeholder = node('option', '', 'Elige una unidad para reintentar');
      placeholder.value = ''; placeholder.disabled = true;
      $('unit-select').prepend(placeholder); $('unit-select').value = '';
    }
    message('library-message', `No se ha podido abrir ${entry.moduleCode} · ${entry.unitCode}. Comprueba el acceso, la conexión y el documento. Vuelve a seleccionar la unidad para reintentar.${activeEntry ? ' La unidad anterior y sus datos siguen intactos.' : ''}`, 'error');
    return false;
  } finally {
    openingEntry = null;
  }
}

async function openSelectedUnit() {
  if (navigationBlocked()) { restoreUnitSelection(); return; }
  if (!selectedEntry()) { updateNavigation(); return; }
  setBusy(true);
  let opened = false;
  try { opened = await loadSelectedDocument(); } finally { setBusy(false); }
  if (opened) selectWorkspaceView('unit');
}

/** Never edit a cached snapshot: load the target UT and its SHA first. */
async function ensureSourceUnit(path) {
  if (busy || !draft || $('editor').open || presentationUI.isOpen() || generalNotesUI.isOpen()) return false;
  if (path !== activeEntry.path) {
    if (hasPendingChanges() || blockedSave || $('editor').open || generalNotesUI.hasPending() || generalNotesUI.isOpen()) {
      message('workspace-message', 'Guarda o revisa los cambios de la unidad abierta antes de abrir otra UT.', 'warning'); return false;
    }
    const module = catalog.modules.find(item => item.units.some(unit => unit.path === path));
    const unit = module?.units.find(item => item.path === path);
    if (!unit) return false;
    setBusy(true);
    try { $('module-select').value = module.code; fillUnits(unit.code); await loadSelectedDocument(); }
    finally { setBusy(false); }
    if (activeEntry.path !== path) return false;
  }
  return true;
}

async function openModuleSource(path, sessionId) {
  if (!await ensureSourceUnit(path)) return;
  const index = sessionId ? draft.sessions.findIndex(session => session.id === sessionId) : -1;
    selectWorkspaceView('unit');
    if (index >= 0) {
      openSessions.add(sessionId); renderSessions(); rememberUnit(sessionId);
      const section = $('sessions').querySelector(`[data-session-index="${index}"]`);
      section?.scrollIntoView({ block: 'start', behavior: 'instant' });
      section?.querySelector('.session-title')?.focus({ preventScroll: true });
    }
}

async function openPreparationUnit(path) {
  if (busy || preparationUI.isOpen()) return;
  if (path !== activeEntry?.path && dirty() && !blockedSave) {
    if (!window.confirm('Hay notas o cambios pendientes en la unidad abierta. ¿Guardarlos antes de abrir las sesiones de otra UT? Cancelar conserva el borrador y la vista actual.')) return;
    await save();
    if (dirty() || blockedSave || failedSave) return;
  }
  await openModuleSource(path);
  if (activeEntry?.path === path && currentView === 'unit') $('unit-view').scrollIntoView({ block: 'start', behavior: 'instant' });
}

async function correctTask(task, value) {
  await registryUI.open(task, 'corrected', value);
}

function selectWorkspaceView(view) {
  if (!['unit', 'module', 'tasks', 'preparation'].includes(view) || !draft || busy || document.querySelector('dialog[open]')) return;
  const leavingMeeting = currentView === 'meeting';
  setWorkspaceView(view);
  if (leavingMeeting) {
    if (activeEntry) { $('module-select').value = activeEntry.moduleCode; fillUnits(activeEntry.unitCode); }
    rememberUnit();
  }
}
function setWorkspaceView(view) {
  currentView = view;
  $('workspace').dataset.view = view;
  for (const name of ['unit', 'module', 'tasks', 'preparation', 'meeting']) {
    $(name + '-view').hidden = name !== view;
    $('view-' + name)?.setAttribute('aria-pressed', String(name === view));
  }
  updateGlobalExpansion();
  renderStats();
  if (draft) moduleViews.render();
  preparationUI.render();
  updateSaveState();
}


async function loadModuleContext(preloaded = null) {
  if (!connection || !activeEntry || !catalog) return;
  const entries = catalog.modules.flatMap(module => module.units.filter(unit => unit.path !== activeEntry.path).map(unit => ({ moduleCode: module.code, unitCode: unit.code, unitId: unit.id, path: unit.path })));
  moduleDocuments.clear(); moduleLoadFailures = []; moduleContextReady = false;
  const results = await Promise.allSettled(entries.map(async entry => {
    if (preloaded) { const cached = preloaded.get(entry.path); if (!cached) throw new Error('StartupReadFailed'); return cached; }
    const candidate = documentStores.get(entry.path) ?? connection.forDocument(entry);
    documentStores.set(entry.path, candidate);
    const result = await candidate.load();
    checked(result.document, entry);
    return { entry, document: result.document };
  }));
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') moduleDocuments.set(entries[index].path, result.value);
    else moduleLoadFailures.push(entries[index]);
  });
  moduleContextReady = true;
  await registryUI.load(catalog);
  await resourcesUI.loadModule(activeEntry.moduleCode);
  renderSessions();
}

async function retryExamContext() {
  if (busy || !draft || $('editor').open || presentationUI.isOpen() || generalNotesUI.isOpen()) return;
  setBusy(true);
  try { await loadModuleContext(); } finally { setBusy(false); }
}

async function refreshPreparationContext() {
  if (busy || !draft || $('editor').open || presentationUI.isOpen() || registryUI.isOpen() || preparationUI.isOpen() || sessionEditorUI.isOpen() || resourcesUI.isOpen() || generalNotesUI.isOpen() || $('module-profile-dialog').open) return;
  setBusy(true);
  try {
    const result = await store.load();
    if (blockedSave || (dirty() && (result.sha !== originalSha || JSON.stringify(result.document) !== JSON.stringify(savedDocument)))) {
      blockedSave = true;
      message('workspace-message', 'La unidad abierta necesita revisión. Se conservan sus notas pendientes; su etiqueta sigue mostrando el borrador local. Las demás unidades se han consultado de nuevo.', 'warning');
    } else if (!dirty()) acceptLoaded(result);
    await loadModuleContext();
  } catch {
    message('workspace-message', 'No se ha podido actualizar la preparación. Se conservan la vista y las notas pendientes.', 'error');
  } finally { setBusy(false); }
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
  const today = madridToday();
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

function noteIcon(field) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  const paths = field === 'improvements' ? ['M9 18h6M10 21h4', 'M8.5 15.5C8.5 13.5 6 12.5 6 9a6 6 0 0 1 12 0c0 3.5-2.5 4.5-2.5 6.5z'] : ['M4 4h16v12H9l-5 4z', 'M8 8h8M8 12h5'];
  for (const value of paths) { const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', value); svg.append(path); }
  return svg;
}

function editButton(sessionIndex, activityIndex, field) {
  const session = draft.sessions[sessionIndex];
  const activity = session.activities[activityIndex];
  const label = field === 'improvements' ? 'Mejoras' : 'Observaciones';
  const button = node('button', `edit-button edit-${field}${text(activity[field]).trim() ? ' has-content' : ''}`);
  button.append(noteIcon(field));
  button.type = 'button';
  button.setAttribute('aria-label', `${label} de la sesión ${session.number}, ${activityIndex === 0 ? 'primera porción' : `actividad ${activityIndex + 1}`}: ${activity.title || 'Sin título'}`);
  button.title = field === 'improvements' ? 'Mejoras · Abrir directamente' : 'Observaciones · Anotar y concretar en mejoras, realizado o pendiente';
  button.addEventListener('click', () => openEditor(sessionIndex, activityIndex, field));
  return button;
}

function rowActions(sessionIndex, activityIndex) {
  const actions = node('div', 'row-actions');
  actions.append(editButton(sessionIndex, activityIndex, 'observations'), editButton(sessionIndex, activityIndex, 'improvements'));
  return actions;
}

function notePreviews(activity, className) {
  const notes = node('div', className);
  for (const [field, label, previewClass] of [['observations', 'Obs.', 'notes-strip'], ['improvements', 'Mejoras', 'improvements-strip']]) {
    if (!text(activity[field]).trim()) continue;
    const preview = node('p', previewClass, `${label}: ${activity[field]}`);
    preview.title = activity[field];
    notes.append(preview);
  }
  const secondary = ['realized', 'pending'].filter((field) => text(activity[field]).trim());
  if (secondary.length) {
    const hint = node('span', 'followup-hint', 'Seguimiento');
    hint.title = secondary.map((field) => `${field === 'realized' ? 'Realizado' : 'Pendiente'}: ${activity[field]}`).join('\n');
    notes.append(hint);
  }
  return notes;
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
    renderSessions();
    $('session-state-' + index)?.focus({ preventScroll: true });
  });
  section.append(label, select);
  return section;
}

function openSessionText(sessionIndex, activityIndex) {
  if (busy || !draft) return;
  const session = draft.sessions[sessionIndex];
  sessionEditorUI.open(activeEntry, session.id, session.activities[activityIndex].id, `session-text-open-${sessionIndex}-${activityIndex}`);
}

function sessionTextButton(sessionIndex, activityIndex, title) {
  const button = node('button', 'session-text-open', title); button.type = 'button';
  button.id = `session-text-open-${sessionIndex}-${activityIndex}`;
  button.title = 'Editar títulos y descripciones de la sesión';
  button.setAttribute('aria-label', `Editar sesión ${draft.sessions[sessionIndex].number}, actividad ${activityIndex + 1}: ${title}`);
  button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-controls', 'session-editor-dialog');
  button.addEventListener('click', () => openSessionText(sessionIndex, activityIndex)); return button;
}

function markTemporalRow(row, label, sessionIndex, activityIndex) {
  row.dataset.timeSession = String(sessionIndex);
  if (activityIndex !== undefined) row.dataset.timeActivity = String(activityIndex);
  label.dataset.timeLabel = label.getAttribute('aria-label') || label.textContent;
  label.append(node('span', 'temporal-status visually-hidden'));
}

function refreshTemporalIndicators() {
  if (!draft) return;
  const clock = madridClock();
  for (const row of $('sessions').querySelectorAll('[data-time-session]')) {
    const session = draft.sessions[Number(row.dataset.timeSession)];
    const activities = row.dataset.timeActivity === undefined ? session?.activities : [session?.activities[Number(row.dataset.timeActivity)]];
    const timing = elapsedTiming(session?.date, activities, clock);
    row.dataset.timeState = timing?.state || 'unknown';
    row.style.setProperty('--time-elapsed', `${((timing?.fraction || 0) * 100).toFixed(2)}%`);
    const label = row.querySelector('[data-time-label]');
    const description = timingDescription(timing);
    const isSession = row.classList.contains('session-top');
    const isToday = isSession && session?.date === clock.date;
    if (isSession) {
      row.classList.toggle('is-today', isToday);
      if (isToday) label.setAttribute('aria-current', 'date');
      else label.removeAttribute('aria-current');
    }
    label.querySelector('.temporal-status').textContent = ` · ${isToday ? 'Hoy · ' : ''}${description}`;
    label.title = `${isToday ? 'Hoy · ' : ''}${label.dataset.timeLabel} · ${description}`;
    if (label.hasAttribute('aria-label')) label.setAttribute('aria-label', label.title);
  }
}

function makeActivity(activity, sessionIndex, activityIndex) {
  const container = node('section', 'activity');
  const type = activityEventType(draft.sessions[sessionIndex], activity, draft);
  if (type) container.classList.add('activity-' + type);
  const markerTypes = activityEventTypes(draft.sessions[sessionIndex], activity, draft);
  const top = node('div', 'activity-top');
  top.dataset.markerTypes = markerTypes.join(' ');
  const time = node('div', 'activity-time', `${activity.start}–${activity.end}`);
  markTemporalRow(top, time, sessionIndex, activityIndex);
  const description = node('div', 'activity-description');
  const title = node('h4', 'activity-title');
  title.append(sessionTextButton(sessionIndex, activityIndex, activity.title || 'Actividad'));
  bindSessionEditRow(top, () => openSessionText(sessionIndex, activityIndex));
  title.title = activity.title || 'Actividad';
  description.append(title);
  if (type === 'task') {
    const tasks = hasTaskPlan(draft) ? visibleSessionTasks(draft.sessions[sessionIndex], draft).filter(task => task.presentation.activityId === activity.id) : [activity];
    tasks.forEach((task, index) => {
      const id = `task-presented-${sessionIndex}-portion-${activityIndex}-${index}`;
      description.append(teachingCheckbox(tasks.length > 1 ? `P ${task.code}` : 'Presentada', id, task.taskPresented === true, `Tarea presentada y abierta: ${task.title}`, checked => requestPresentation(sessionIndex, checked, activity.id, id, hasTaskPlan(draft) ? task.id : undefined), true));
    });
  }
  if (progressNames.has(activity.progress)) {
    const progress = node('span', `activity-progress progress-${activity.progress}`, progressNames.get(activity.progress));
    progress.title = `Progreso importado: ${progressNames.get(activity.progress)} · Solo lectura`;
    description.append(progress);
  }
  const planned = node('p', 'activity-preview', activity.planned || '');
  planned.title = activity.planned || '';
  top.append(time, description, planned, notePreviews(activity, 'activity-notes-preview'), rowActions(sessionIndex, activityIndex));
  container.append(top);
  return container;
}

function changeTeaching(update, focusId) {
  if (busy || !draft) return;
  update(); failedSave = false;
  renderSessions();
  if (focusId) $(focusId)?.focus({ preventScroll: true });
}

function teachingCheckbox(label, id, selected, help, change, controlled = false) {
  const wrapper = node('label', 'teaching-check');
  const input = node('input'); input.type = 'checkbox'; input.id = id;
  input.checked = selected; input.disabled = busy;
  input.setAttribute('aria-label', help); input.title = help;
  input.addEventListener('change', () => controlled ? change(input.checked) : changeTeaching(() => change(input.checked), id));
  wrapper.title = help; wrapper.append(input, node('span', '', label));
  return wrapper;
}

function requestPresentation(sessionIndex, value, activityId, focusId, officialTaskId) {
  if (busy || !draft || $('editor').open || presentationUI.isOpen()) return;
  const session = draft.sessions[sessionIndex];
  if (!value) {
    changeTeaching(() => {
      const targets = sessionTaskTargets(session, draft).filter(target => officialTaskId ? target.id === officialTaskId : !activityId || target.id === activityId || target.presentation?.activityId === activityId || target === session);
      targets.forEach(target => { delete target.taskPresented; });
    }, focusId);
    return;
  }
  // Repaint the native checkbox from the unchanged model before opening the modal.
  renderSessions();
  const targets = presentationTargets(session, activityId, draft).filter(task => !officialTaskId || task.id === officialTaskId);
  presentationUI.open({ path: activeEntry.path, sessionId: session.id, focusId }, targets, session);
  updateSaveState();
}

async function presentTask(task, value) {
  await registryUI.open(task, 'presented', value);
}

function makeTeachingControls(session, sessionIndex) {
  const controls = node('div', 'teaching-controls');
  controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', `Tareas y examen de la sesión ${session.number}`);
  const selected = eventTypes(session, draft);
  for (const [type, label] of [['task', 'Tarea'], ['exam', 'Examen']]) {
    controls.append(teachingCheckbox(label, `teaching-${type}-${sessionIndex}`, selected.includes(type), `${label} en la sesión ${session.number}`, checked => setSessionEventType(session, type, checked, draft)));
  }
  if (Object.hasOwn(session, 'eventTypes')) {
    const reset = node('button', 'teaching-reset', '↶'); reset.type = 'button';
    reset.title = 'Volver a las marcas automáticas de la planificación'; reset.setAttribute('aria-label', `Restablecer marcas previstas de la sesión ${session.number}`);
    reset.addEventListener('click', () => changeTeaching(() => { delete session.eventTypes; }, `teaching-task-${sessionIndex}`));
    controls.append(reset);
  }
  const progress = taskProgress(session, draft);
  if (selected.includes('task') && progress.total) {
    const id = `task-presented-${sessionIndex}`;
    const control = teachingCheckbox(progress.total === 1 ? 'Presentada' : `Presentadas ${progress.presented}/${progress.total}`, id, progress.presented === progress.total, `Todas las tareas presentadas y abiertas para trabajar en la sesión ${session.number}`, checked => requestPresentation(sessionIndex, checked, undefined, id), true);
    control.querySelector('input').indeterminate = progress.presented > 0 && progress.presented < progress.total;
    controls.append(control);
  }
  if (selected.includes('exam')) {
    const sessionExams = teachingTimeline.exams.filter(item => item.sessionId === session.id || item.id === session.id);
    if (!sessionExams.length) sessionExams.push({ id: session.id, sessionId: session.id, date: session.date, source: { entry: activeEntry }, announced: session.examAnnouncedFor === session.date });
    for (const [examIndex, exam] of sessionExams.entries()) {
    if (exam && exam.source.entry.path !== activeEntry.path) {
      if (exam.announced) controls.append(node('span', 'teaching-confirmed', 'Avisado ✓'));
      else {
        const action = node('button', 'teaching-reset', `Avisar en ${exam.source.entry.unitCode}`);
        action.type = 'button'; action.disabled = busy;
        action.title = 'El aviso de esta sesión compartida se conserva en la unidad que inicia el examen.';
        action.addEventListener('click', () => markExamReminder(exam)); controls.append(action);
      }
    } else {
      controls.append(teachingCheckbox(exam.code ? `Avisado ${exam.code}` : 'Avisado', `exam-announced-${sessionIndex}${exam.officialTaskId ? '-' + examIndex : ''}`, exam.announced, `Aviso al alumnado del examen${exam.title ? ' ' + exam.title : ''} de la sesión ${session.number}, ${dateInfo(session.date).full}`, checked => setExamAnnouncement(draft, exam, checked)));
    }
    }
  }
  return controls;
}

function makeExamReminder(exam) {
  const reminder = node('div', 'exam-reminder');
  reminder.setAttribute('role', 'note');
  const label = `Avisar del examen · ${exam.code ? exam.code + ' ' + exam.title : exam.source.entry.unitCode} · ${dateInfo(exam.date).full}`;
  const details = node('div', 'exam-reminder-text');
  details.append(node('strong', '', label));
  const explanation = exam.shortfall
    ? `Solo hay ${exam.availableBefore} sesiones anteriores disponibles; el aviso se muestra desde la primera.`
    : 'Tres sesiones lectivas antes. Se cuentan las UT disponibles del módulo.';
  details.append(node('span', '', `${exam.changedDate ? 'La fecha ha cambiado: confirma el nuevo aviso. ' : ''}${explanation}`));
  reminder.append(details);
  const action = node('button', 'button button-small', exam.source.entry.path === activeEntry.path ? 'Marcar avisado' : `Marcar avisado en ${exam.source.entry.unitCode}`);
  action.type = 'button'; action.disabled = busy;
  action.setAttribute('aria-label', `Marcar avisado el examen ${exam.code ? exam.code + ' ' + exam.title + ' ' : ''}de ${exam.source.entry.unitCode} del ${exam.date}`);
  action.addEventListener('click', () => markExamReminder(exam));
  reminder.append(action);
  return reminder;
}

async function markExamReminder(exam) {
  if (busy || !draft) return;
  if (exam.source.entry.path !== activeEntry.path) {
    if (hasPendingChanges() || blockedSave || $('editor').open || generalNotesUI.hasPending() || generalNotesUI.isOpen()) {
      message('workspace-message', 'Guarda o revisa el borrador actual antes de abrir la unidad del examen y marcar su aviso.', 'warning'); return;
    }
    setBusy(true);
    try {
      $('module-select').value = exam.source.entry.moduleCode;
      fillUnits(exam.source.entry.unitCode);
      await loadSelectedDocument();
    } finally { setBusy(false); }
    if (activeEntry.path !== exam.source.entry.path) return;
  }
  if (!setExamAnnouncement(copy(draft), exam, true)) {
    message('workspace-message', 'La planificación del examen ha cambiado. Revisa la sesión antes de confirmar el aviso.', 'warning'); return;
  }
  changeTeaching(() => setExamAnnouncement(draft, exam, true));
  message('workspace-message', 'Aviso marcado en el borrador del examen. Pulsa Guardar cambios para conservarlo.');
}

function makeSession(session, sessionIndex, heading) {
  const first = session.activities[0];
  const isOpen = openSessions.has(session.id);
  const section = node('article', 'session');
  const types = eventTypes(session, draft);
  types.forEach(type => section.classList.add('session-' + type));
  section.dataset.sessionIndex = String(sessionIndex);
  const top = node('div', 'session-top');
  top.dataset.markerTypes = types.join(' ');
  top.dataset.eventType = activityEventType(session, first, draft);
  const toggle = node('button', 'session-toggle', isOpen ? '−' : '+');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', `${isOpen ? 'Plegar' : 'Abrir'} sesión ${session.number}`);
  toggle.setAttribute('aria-expanded', String(isOpen));
  toggle.setAttribute('aria-controls', `session-content-${sessionIndex}`);
  const date = dateInfo(session.date);
  const dateTile = node('time', 'date-tile');
  dateTile.dateTime = session.date;
  dateTile.title = date.full;
  dateTile.setAttribute('aria-label', `Sesión ${session.number}${heading.periods.length ? ' · Periodos ' + heading.periods.join(', ') : ''} · ${date.full}`);
  const dateLine = node('span', 'session-date-line');
  dateLine.append(node('span', 'date-day', heading.day));
  if (heading.monthLabel) dateLine.append(node('span', 'date-month', heading.monthLabel));
  dateTile.append(node('span', 'session-number-line', heading.sessionLabel), dateLine);
  markTemporalRow(top, dateTile, sessionIndex);
  const description = node('div', 'session-description');
  const title = node('h3', 'session-title');
  title.append(sessionTextButton(sessionIndex, 0, first?.title || 'Sesión'));
  bindSessionEditRow(top, () => openSessionText(sessionIndex, 0));
  title.title = first?.title || 'Sesión';
  title.tabIndex = -1;
  description.append(title, makeTeachingControls(session, sessionIndex));
  const planned = node('p', 'planned-preview', first?.planned || '');
  planned.title = first?.planned || '';
  top.append(toggle, dateTile, description, planned, notePreviews(first || {}, 'session-notes'), makeStateSelect(session, sessionIndex), rowActions(sessionIndex, 0));
  const body = node('div', 'session-body');
  body.id = `session-content-${sessionIndex}`;
  body.hidden = !isOpen;
  const timing = node('p', 'session-timing', `Sesión ${sessionTime(session)} · ${session.activities.length} ${session.activities.length === 1 ? 'porción' : 'porciones'} · Primera porción ${first.start}–${first.end}${!heading.periods.length ? ' · Periodos sin correspondencia confirmada' : ''}`);
  body.append(timing);
  for (const line of sessionInformationLines(session)) body.append(node('p', 'session-information', line));
  if (session.activities.length === 1) body.append(node('p', 'activities-label', 'Esta sesión tiene una única porción.'));
  session.activities.slice(1).forEach((activity, index) => body.append(makeActivity(activity, sessionIndex, index + 1)));
  toggle.addEventListener('click', () => {
    if (busy) return;
    if (openSessions.has(session.id)) openSessions.delete(session.id); else { openSessions.add(session.id); rememberUnit(session.id); }
    const next = openSessions.has(session.id);
    body.hidden = !next;
    toggle.textContent = next ? '−' : '+';
    toggle.setAttribute('aria-expanded', String(next));
    toggle.setAttribute('aria-label', `${next ? 'Plegar' : 'Abrir'} sesión ${session.number}`);
    updateGlobalExpansion();
  });
  section.append(top);
  examReminders.filter(exam => exam.placement === session.id).forEach(exam => section.append(makeExamReminder(exam)));
  section.append(body);
  return section;
}

function renderStats() {
  if (currentView === 'meeting') { $('stats').hidden = true; return; }
  if (!draft) return;
  const summary = summarize(draft);
  const stats = $('stats');
  stats.hidden = false;
  stats.setAttribute('aria-label', `Resumen de ${draft.module.code} · ${draft.unit.code}`);
  stats.replaceChildren();
  const records = currentView === 'tasks' ? libraryRecords() : moduleRecords();
  const values = currentView === 'unit'
    ? [[summary.totalSessions, 'sesiones', false], [summary.deliveredSessions, 'impartidas', true], [minutesLabel(summary.totalMinutes), 'previstos', false]]
    : [[records.length, 'UT leídas', false], [new Set(records.flatMap(record => record.document.sessions.map(session => record.entry.moduleCode + ':' + session.id))).size, 'sesiones', false], [moduleTasks(currentView === 'tasks' ? [...records, ...registryUI.records()] : records).length, 'tareas', true]];
  stats.setAttribute('aria-label', currentView === 'unit' ? `Resumen de ${draft.module.code} · ${draft.unit.code}` : currentView === 'tasks' ? 'Resumen de todos los módulos, solo UT leídas' : `Resumen del módulo ${draft.module.code}, solo UT leídas`);
  for (const [value, label, highlight] of values) {
    const item = node('div', 'stat');
    item.append(node('span', `stat-value${highlight ? ' teal' : ''}`, value), node('span', 'stat-label', label));
    stats.append(item);
  }
}

function renderSessions() {
  renderUnitInformation($('unit-information'), draft, $('unit-information-open'));
  const records = moduleRecords();
  const failures = moduleFailures();
  teachingTimeline = moduleTimeline(records, draft.module.code);
  examReminders = moduleContextReady && !failures.length ? unitExamReminders(teachingTimeline, activeEntry.path) : [];
  const reminders = $('exam-reminders'); reminders.replaceChildren();
  if (failures.length || teachingTimeline.errors.length) {
    const warning = node('div', 'exam-reminder');
    warning.append(node('span', '', failures.length ? `No se han podido consultar ${failures.join(', ')}. Los avisos de examen no están completos.` : 'Hay sesiones compartidas con fechas o estados incompatibles. Revisa la planificación antes de calcular los avisos.'));
    const retry = node('button', 'button button-small', 'Revisar avisos'); retry.type = 'button'; retry.disabled = busy;
    retry.addEventListener('click', retryExamContext); warning.append(retry); reminders.append(warning);
  }
  examReminders.filter(exam => exam.placement === 'top').forEach(exam => reminders.append(makeExamReminder(exam)));
  reminders.hidden = !reminders.childElementCount;
  const container = $('sessions');
  container.replaceChildren();
  if (!draft.sessions.length) container.append(node('p', 'empty-sessions', 'Este documento no contiene sesiones.'));
  const headings = compactSessionHeaders(draft.sessions, presentationPeriods(catalog));
  draft.sessions.forEach((session, index) => container.append(makeSession(session, index, headings[index])));
  refreshTemporalIndicators();
  renderSessionBand();
  moduleViews.render(); renderStats(); preparationUI.render(); resourcesUI.render();
  if (busy) $('workspace').querySelectorAll('button, input, textarea, select').forEach(element => { element.disabled = true; });
  updateSaveState();
}

function renderSessionBand() {
  const container = $('session-band');
  container.replaceChildren();
  if (!draft) return;
  container.dataset.today = madridToday();
  for (const item of sessionBand(draft.sessions, container.dataset.today, draft)) {
    if (item.monthLabel) {
      const month = node('li', 'band-month', item.monthLabel);
      month.title = item.monthName; month.setAttribute('aria-label', item.monthName);
      container.append(month);
    }
    const cell = node('li', `band-cell${item.past ? ' elapsed' : ''}${item.today ? ' today' : ''}`);
    const button = node('button', `band-day${item.task ? ' has-task' : ''}${item.exam ? ' has-exam' : ''}`, item.day);
    button.type = 'button';
    button.disabled = busy;
    const types = [item.task ? 'Tarea' : '', item.exam ? 'Examen' : ''].filter(Boolean).join(' y ');
    const label = `Sesión ${item.number} · ${dateInfo(item.date).full}${types ? ` · ${types}` : ''}${item.today ? ' · Hoy' : ''}${item.past ? ' · Fecha pasada' : ''}`;
    button.title = label; button.setAttribute('aria-label', label);
    button.addEventListener('click', () => {
      if (busy) return;
      rememberUnit(draft.sessions[item.index]?.id);
      const section = $('sessions').querySelector(`[data-session-index="${item.index}"]`);
      section?.scrollIntoView({ block: 'start', behavior: 'instant' });
      section?.querySelector('.session-title')?.focus({ preventScroll: true });
    });
    cell.append(button); container.append(cell);
  }
  $('session-band-section').hidden = !draft.sessions.length;
}

function render() {
  $('unit-title').textContent = `${draft.module.code} · ${draft.unit.code} ${draft.unit.title}`;
  updateConnectionState();
  $('disconnect').hidden = false;
  $('login-view').hidden = true;
  $('workspace').hidden = false;
  $('loaded-version').textContent = `Versión leída: ${originalSha.slice(0, 8)}`;
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


function warnNavigation(content) {
  if (content) navigationWarnings.add(content);
  message('navigation-message', [...navigationWarnings].join(' '), 'warning');
}
function rememberContext(context) {
  if (!catalog || startingNavigation) return;
  const result = contextMemory.write(catalog, context);
  if (result.warning) warnNavigation(result.warning);
}
function rememberUnit(sessionId = selectedSessionId) {
  if (!activeEntry || !draft) return;
  selectedSessionId = draft.sessions.some(s => s.id === sessionId) ? sessionId : null;
  rememberContext(unitContext(activeEntry, selectedSessionId));
}
function focusContextSession(sessionId) {
  const index = draft?.sessions.findIndex(s => s.id === sessionId) ?? -1;
  if (index < 0) return;
  selectedSessionId = sessionId;
  openSessions.add(sessionId); renderSessions();
  const section = $('sessions').querySelector(`[data-session-index="${index}"]`);
  section?.scrollIntoView({ block:'start', behavior:'instant' });
  section?.querySelector('.session-title')?.focus({ preventScroll:true });
  rememberUnit(sessionId);
}
function fillMeetingPicker(on, preferredId = '') {
  $('meeting-date').value = on;
  const meetings = meetingsForDay(startupCommon, on), select = $('meeting-select');
  select.replaceChildren();
  for (const meeting of meetings) {
    const option = node('option', '', `${meeting.start} · ${meeting.title}`);
    option.value = meeting.meetingId; select.append(option);
  }
  if (meetings.some(m => m.meetingId === preferredId)) select.value = preferredId;
  select.disabled = busy || !meetings.length;
  return meetings.find(m => m.meetingId === select.value) ?? null;
}
function appendMeetingSpaces() {
  const select=$('module-select'),previous=select.value;
  select.querySelectorAll('option[data-meeting-space]').forEach(o=>o.remove());
  for(const space of meetingsUI.spaces()){const option=node('option','',space.title);option.value='@'+space.id;option.dataset.meetingSpace='true';select.append(option);}
  if([...select.options].some(o=>o.value===previous))select.value=previous;
}
function syncMeetingSelection(location) {
  appendMeetingSpaces();
  $('module-select').value='@'+location.space;
  fillUnits(location.groupId??'*');
}
async function showMeeting(meeting, initial = false) {
  currentMeeting=meeting;
  fillMeetingPicker(meeting.date,meeting.meetingId);
  return meetingsUI.openScheduled(meeting,initial);
}
async function openMeetings(preferred = null) {
  if(preferred?.recordId) return meetingsUI.openRecord(preferred.recordId);
  if(preferred?.meetingId) {
    if(busy||document.querySelector('dialog[open]'))return;
    setBusy(true);
    try {
      startupCommon=(await connection.loadCommon(catalog)).document;
      const meeting=fillMeetingPicker(preferred.date,preferred.meetingId);
      if(meeting&&meeting.meetingId===preferred.meetingId)await showMeeting(meeting,true);
      else warnNavigation('La convocatoria recordada no coincide con el horario vigente. Consulta su grupo de reuniones.');
    }catch{warnNavigation('No se puede confirmar el horario de esa convocatoria. Puedes consultar las notas desde su grupo.');}
    finally{setBusy(false);}
    return;
  }
  const location=preferred?.type==='meeting-group'?preferred:meetingsUI.location();
  return meetingsUI.openGroup(location.space??'meetings',location.groupId??null);
}
async function resumePreviousContext() {
  if (!catalog || busy || document.querySelector('dialog[open]')) return;
  if (['meeting','meeting-group'].includes(resumeContext?.type)) return openMeetings(resumeContext);
  const previous = resolveRemembered(resumeContext, catalog, startupCommon, meetingsUI.document());
  if (!previous) { warnNavigation('El contexto anterior ya no está disponible. Elige una unidad.'); return; }
  if (draft) {
    if (!await ensureSourceUnit(previous.path)) return;
  } else {
    if (navigationBlocked()) return;
    $('module-select').value = previous.entry.moduleCode; fillUnits(previous.entry.unitCode);
    await openSelectedUnit();
    if (activeEntry?.path !== previous.path) return;
  }
  selectWorkspaceView('unit'); focusContextSession(previous.sessionId); rememberUnit();
}
async function initializeContext() {
  startingNavigation = true;
  const memory = contextMemory.read(catalog);
  resumeContext = memory.context;
  if (memory.warning) warnNavigation(memory.warning);
  const entries = catalogEntries(catalog);
  const [commonResult, records, meetingResult] = await Promise.all([
    connection.loadCommon(catalog).then(r => r.document).catch(() => null),
    Promise.allSettled(entries.map(async entry => {
      const candidate = documentStores.get(entry.path) ?? connection.forDocument(entry);
      documentStores.set(entry.path, candidate);
      const result = await candidate.load(); checked(result.document, entry);
      if (!result.sha) throw new Error('MissingVersion');
      return { entry, document:result.document, sha:result.sha };
    })),
    meetingReader.load(catalog).catch(() => null),
  ]);
  startupCommon = commonResult;
  if (meetingResult) { meetingsUI.seed(meetingResult); appendMeetingSpaces(); }
  else warnNavigation('No se ha podido leer el registro de reuniones. Puedes reintentarlo desde Reuniones.');
  const loaded = new Map(), failures = [];
  records.forEach((r,i) => { if (r.status === 'fulfilled') loaded.set(entries[i].path,r.value); else failures.push(entries[i]); });
  const decision = chooseStartup({ catalog, common:startupCommon, records:[...loaded.values()], failures, remembered:resumeContext, meetingDocument:meetingsUI.document() });
  const target = decision.target;
  if (decision.warning) warnNavigation(decision.warning);
  const preferred = target?.type === 'unit' ? loaded.get(target.path) : null;
  const selected = resolveRemembered(resumeContext,catalog,startupCommon,meetingsUI.document());
  const fallback = selected?.type === 'unit' ? loaded.get(selected.path) : null;
  const seed = preferred ?? fallback ?? loaded.get(selectedEntry()?.path) ?? loaded.values().next().value;
  if (seed) {
    $('module-select').value = seed.entry.moduleCode; fillUnits(seed.entry.unitCode);
    await loadSelectedDocument(loaded);
  } else warnNavigation('No se ha podido abrir ninguna UT. Se conservan los selectores para reintentar.');
  startingNavigation = false;
  if(target?.type==='meeting-group'){
    setBusy(false); await meetingsUI.openGroup(target.space,target.groupId);
  } else if(target?.type==='meeting'&&target.recordId){
    setBusy(false); await meetingsUI.openRecord(target.recordId);
  } else if (target?.type === 'meeting') await showMeeting(target.meeting,true);
  else if (draft) {
    setWorkspaceView('unit');
    if (target?.path === activeEntry.path) focusContextSession(target.sessionId);
    rememberUnit();
  }
}

async function connect(event) {
  event.preventDefault();
  if (busy) return;
  let token = $('token').value.trim();
  $('token').value = '';
  if (!token) return;
  try {
    connection = new GithubStore({ token });
    meetingReader = new MeetingReader({ token });
    suggestionsUI.connect(token);
    generalNotesUI.connect(token);
    registryUI.connect(token);
    token = '';
    setBusy(true);
    message('login-message', 'Comprobando acceso y leyendo el catálogo privado…');
    acceptCatalog(await connection.loadCatalog());
    message('login-message');
    await initializeContext();
  } catch (error) {
    token = '';
    store = null;
    connection = null;
    meetingReader?.clear(); meetingReader = null;
    suggestionsUI.disconnect();
    generalNotesUI.disconnect();
    registryUI.disconnect();
    moduleProfileUI.disconnect();
    preparationUI.clear(); sessionEditorUI.clear(); resourcesUI.clear();
    documentStores.clear();
    catalog = null;
    activeEntry = null;
    $('library-view').hidden = true;
    $('login-view').hidden = false;
    $('disconnect').hidden = true;
    updateConnectionState();
    const explanations = new Map([
      ['HTTP_401', 'GitHub no acepta el token. Comprueba que lo has copiado completo y que no ha caducado.'],
      ['HTTP_403', 'GitHub ha denegado el acceso. Comprueba los permisos del token; también puede haberse alcanzado un límite temporal de peticiones.'],
      ['HTTP_404', 'GitHub no permite encontrar el catálogo privado. Comprueba que el token tenga acceso a programacion-piloto-datos y permiso Contents.'],
      ['READ_TIMEOUT', 'GitHub ha tardado demasiado en responder. El token se ha retirado del campo; vuelve a introducirlo para reintentar.'],
      ['READ_FAILED', 'El navegador no ha podido conectar con GitHub. Este error no confirma que el token sea incorrecto.'],
      ['INVALID_RESPONSE', 'GitHub ha devuelto una respuesta ilegible. No se ha modificado ningún dato.'],
      ['INVALID_DOCUMENT', 'Se ha leído el archivo, pero su formato no coincide con el esperado por el piloto. No cambies el token: hay que revisar el documento.'],
      ['INVALID_CATALOG', 'Se ha leído el catálogo, pero su formato no es válido. No cambies el token: hay que revisar la lista de unidades.'],
    ]);
    const explanation = explanations.get(error?.code);
    message('login-message', explanation
      ? `${explanation} [${error.code}]`
      : 'No se ha podido abrir el cuaderno por un error interno o una respuesta inesperada. No se ha modificado ningún dato. [CONNECTION_ERROR]', 'error');
  } finally {
    token = ''; startingNavigation = false;
    setBusy(false);
  }
}

function disconnect() {
  if (busy) return;
  if ((hasPendingChanges() || suggestionsUI.hasPending() || generalNotesUI.hasPending()) && !window.confirm('Hay cambios, mejoras o sugerencias sin guardar. Descárgalos si quieres conservarlos. ¿Quieres descartarlos y desconectar?')) return;
  suggestionsUI.disconnect();
  generalNotesUI.disconnect();
  registryUI.disconnect();
  moduleProfileUI.disconnect();
  preparationUI.clear(); sessionEditorUI.clear(); resourcesUI.clear();
  presentationUI.clear();
  $('editor').close();
  editorTarget = null;
  store = null;
  connection = null;
  meetingReader?.clear(); meetingReader = null;
  documentStores.clear();
  moduleDocuments.clear(); moduleLoadFailures = []; moduleContextReady = false;
  teachingTimeline = { sessions: [], exams: [], errors: [] }; examReminders = [];
  catalog = null;
  activeEntry = null;
  savedDocument = null;
  draft = null;
  originalSha = null;
  blockedSave = false;
  failedSave = false;
  lastConfirmedAt = null;
  openSessions.clear();
  $('sessions').replaceChildren();
  $('session-band').replaceChildren();
  $('unit-information').close(); $('unit-information').hidden = true;
  $('unit-information').querySelector('.unit-information-content').replaceChildren();
  $('unit-information-context').textContent = ''; $('unit-information-open').hidden = true;
  delete $('unit-information').dataset.unitId;
  moduleViews.clear();
  $('exam-reminders').replaceChildren(); $('exam-reminders').hidden = true;
  $('stats').replaceChildren();
  $('stats').hidden = true;
  ['unit-title', 'loaded-version', 'editor-title', 'editor-planned', 'editor-time', 'editor-kicker', 'editor-progress'].forEach((id) => { $(id).textContent = ''; });
  $('editor-details').replaceChildren();
  fields.forEach((field) => { $(field).value = ''; });
  taskDateFields.forEach(field => { $('task-' + field).value = ''; });
  $('task-presented').checked = false; $('task-corrected').checked = false;
  $('task-target-help').textContent = ''; $('task-fields').hidden = true;
  currentView = 'unit';
  startupCommon = null; currentMeeting = null; resumeContext = null; selectedSessionId = null;
  navigationWarnings.clear(); message('navigation-message');
  meetingsUI.clear(); $('meeting-select').replaceChildren(); $('meeting-date').value = '';
  $('meeting-view').hidden = true; delete $('workspace').dataset.view;
  for (const name of ['unit', 'module', 'tasks', 'preparation']) {
    $(name + '-view').hidden = name !== 'unit'; $('view-' + name).setAttribute('aria-pressed', String(name === 'unit'));
  }
  updateGlobalExpansion();
  $('token').value = '';
  $('workspace').hidden = true;
  $('library-view').hidden = true;
  $('module-select').replaceChildren();
  $('unit-select').replaceChildren();
  message('library-message');
  $('login-view').hidden = false;
  $('disconnect').hidden = true;
  $('connection-menu').open = false;
  updateConnectionState();
  message('login-message', 'Desconectado. La credencial y el contenido cargado se han retirado de esta página.');
  updateSaveState();
  $('token').focus();
}

async function refresh() {
  if (busy || !store || $('editor').open || presentationUI.isOpen() || (registryUI.isOpen() || preparationUI.isOpen() || sessionEditorUI.isOpen() || resourcesUI.isOpen())) return;
  if (dirty() && !window.confirm('Actualizar descartará el borrador y cargará la versión de GitHub. Descarga primero el borrador si quieres conservarlo. ¿Continuar?')) return;
  setBusy(true);
  message('workspace-message', 'Leyendo de nuevo la versión de GitHub…');
  try {
    acceptLoaded(await store.load());
    await loadModuleContext();
    message('workspace-message', 'Versión actualizada desde GitHub.');
  } catch {
    message('workspace-message', 'No se ha podido actualizar. El contenido y el borrador que tenías permanecen intactos. Comprueba la conexión y vuelve a intentarlo.', 'error');
  } finally {
    setBusy(false);
  }
}

async function save() {
  if (busy || !store || !draft || !dirty() || blockedSave || $('editor').open || presentationUI.isOpen() || (registryUI.isOpen() || preparationUI.isOpen() || sessionEditorUI.isOpen() || resourcesUI.isOpen())) return;
  const errors = validateDocument(draft, activeEntry);
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
    const feedback = saveErrorFeedback(error);
    if (feedback.requiresReload) blockedSave = true;
    message('workspace-message', `${feedback.message} [${feedback.code}]`, feedback.kind);
  } finally {
    setBusy(false);
  }
}

function openEditor(sessionIndex, activityIndex, targetField = 'observations', officialTaskId) {
  if (busy || !draft || presentationUI.isOpen()) return;
  const session = draft.sessions[sessionIndex];
  const activity = session.activities[activityIndex];
  const official = visibleSessionTasks(session, draft).filter(task => task.presentation.activityId === activity.id || (!task.presentation.activityId && activityIndex === 0));
  editorTarget = { sessionIndex, activityIndex, officialTaskId: officialTaskId || (official.length === 1 ? official[0].id : undefined),
    sessionTask: !hasTaskPlan(draft) && taskTarget(session, activityIndex) === session };
  $('editor-kicker').textContent = `SESIÓN ${session.number} · ${activityIndex === 0 ? 'PRIMERA PORCIÓN' : 'ACTIVIDAD'}`;
  $('editor-title').textContent = editorTarget.officialTaskId ? taskHeading(draft.module.code, editorTaskTarget().code, editorTaskTarget().title) : activity.title || 'Actividad';
  $('editor-time').textContent = `${activity.start}–${activity.end} · ${dateInfo(session.date).full}`;
  $('editor-progress').hidden = !progressNames.has(activity.progress);
  $('editor-progress').textContent = progressNames.has(activity.progress) ? `Progreso importado: ${progressNames.get(activity.progress)} · Solo lectura` : '';
  $('editor-planned').textContent = activity.planned || 'Sin descripción prevista.';
  fields.forEach((field) => { $(field).value = text(activity[field]); });
  $('activity-event-type').value = activity.eventType || '';
  const detailsTask = taskDetails(editorTaskTarget());
  taskDateFields.forEach(field => { $('task-' + field).value = detailsTask[field]; $('task-' + field).setCustomValidity(''); });
  $('task-presented').checked = detailsTask.presented; $('task-corrected').checked = detailsTask.corrected;
  syncTaskFields();
  const details = $('editor-details');
  details.replaceChildren();
  for (const [label, value] of [['Unidad', draft.unit.id], ['Sesión', session.id], ['Porción', activity.id], ['Tipo de porción', activity.kind], ['Evento de Calendar', activity.calendar?.uid ?? activity.metadata?.calendarUid], ['Fila de origen', activity.sourceRow]]) {
    if (value !== undefined && value !== null) details.append(node('dt', '', label), node('dd', '', value));
  }
  $('editor').querySelectorAll('details').forEach((element) => { element.open = false; });
  $('editor').showModal();
  $('editor').querySelector('.editor-content').scrollTop = 0;
  const target = $(targetField === 'task' ? 'task-dueOn' : targetField === 'improvements' ? 'improvements' : 'observations');
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  updateSaveState();
}

function syncTaskFields() {
  const manual = editorTarget?.sessionTask && !$('activity-event-type').value;
  $('activity-type-field').hidden = hasTaskPlan(draft);
  $('task-fields').hidden = hasTaskPlan(draft) ? !editorTarget?.officialTaskId : $('activity-event-type').value !== 'task' && !manual;
  $('task-target-help').textContent = editorTarget?.officialTaskId ? 'Seguimiento único de la tarea oficial. Su título y presentación prevista se preparan en el proyecto del módulo.' : manual ? 'Tarea marcada solo en la sesión: estos datos pertenecen a la sesión completa.' : 'Estos datos pertenecen únicamente a esta porción marcada como tarea.';
  taskDateFields.forEach(field => { $('task-' + field).disabled = $('task-fields').hidden; });
  syncPresentationRequired();
}

function syncPresentationRequired() {
  const target = editorTaskTarget();
  const required = !$('task-fields').hidden && $('task-presented').checked && !taskDetails(target).presented;
  for (const field of taskDateFields) $('task-' + field).required = required;
  if (required && !editorTarget.autoDates) {
    const defaults = presentationDefaults(target); editorTarget.autoDates = {};
    for (const field of taskDateFields) {
      const input = $('task-' + field);
      if (!input.value && defaults[field]) { editorTarget.autoDates[field] = { previous: input.value, value: defaults[field] }; input.value = defaults[field]; }
    }
  } else if (!required && editorTarget?.autoDates) {
    for (const [field, value] of Object.entries(editorTarget.autoDates)) if ($('task-' + field).value === value.value) $('task-' + field).value = value.previous;
    delete editorTarget.autoDates;
  }
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
  const session = draft.sessions[editorTarget.sessionIndex];
  const activity = session.activities[editorTarget.activityIndex];
  if (!$('task-fields').hidden) {
    for (const field of taskDateFields) {
      const input = $('task-' + field);
      input.setCustomValidity(input.value && !isValidDate(input.value) ? 'Indica una fecha válida de cuatro cifras de año.' : '');
      if (!input.reportValidity()) return;
    }
  }
  fields.forEach((field) => { activity[field] = $(field).value; });
  if (!hasTaskPlan(draft)) {
    if ($('activity-event-type').value) activity.eventType = $('activity-event-type').value;
    else delete activity.eventType;
  }
  const target = hasTaskPlan(draft) ? editorTarget.officialTaskId && editorTaskTarget() : taskTarget(session, editorTarget.activityIndex);
  if (target && !$('task-fields').hidden) {
    const values = readTaskEditor();
    if (values.presented && !taskDetails(target).presented && !values.presentedOn) values.presentedOn = madridToday();
    applyTaskDetails(target, values);
  }
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
  anchor.download = `${activeEntry.moduleCode}-${activeEntry.unitCode}-borrador.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function updateGlobalExpansion() {
  const button = $('toggle-sessions');
  const state = globalSessionExpansion(draft?.sessions ?? [], openSessions);
  button.textContent = state.symbol; button.title = state.label;
  button.setAttribute('aria-label', state.label); button.setAttribute('aria-expanded', String(state.allOpen));
  button.hidden = currentView !== 'unit'; button.disabled = busy || state.disabled;
}

function toggleAllSessions() {
  if (busy || !draft) return;
  const state = globalSessionExpansion(draft.sessions, openSessions);
  openSessions.clear();
  if (!state.allOpen) draft.sessions.forEach((session) => {
    openSessions.add(session.id);
  });
  renderSessions();
  $('toggle-sessions').focus({ preventScroll: true });
}

$('open-meetings').addEventListener('click', () => openMeetings());
$('resume-context').addEventListener('click', resumePreviousContext);
$('meeting-return').addEventListener('click', () => selectWorkspaceView('unit'));
$('meeting-date').addEventListener('change', async () => {
  if (busy) return;
  const meeting = fillMeetingPicker($('meeting-date').value);
  if (meeting) await showMeeting(meeting);
  else { currentMeeting = null; warnNavigation('No hay una reunión del horario en esta fecha. Las notas guardadas siguen disponibles en su grupo.'); updateSaveState(); }
});
$('meeting-select').addEventListener('change', async () => {
  const meeting = meetingsForDay(startupCommon,$('meeting-date').value).find(m => m.meetingId === $('meeting-select').value);
  if (meeting) await showMeeting(meeting);
});
$('login-form').addEventListener('submit', connect);
$('disconnect').addEventListener('click', disconnect);
$('unit-information-open').addEventListener('click', () => {
  if (!busy && draft && !$('unit-information-open').hidden && !$('unit-information').open) $('unit-information').showModal();
});
for (const id of ['unit-information-close', 'unit-information-hide']) $(id).addEventListener('click', () => $('unit-information').close());
$('unit-information').addEventListener('close', () => {
  if (connection && !$('unit-information-open').hidden) $('unit-information-open').focus({ preventScroll: true });
});
$('connection-status').addEventListener('click', event => { if (busy) event.preventDefault(); });
$('connection-menu').addEventListener('click', event => {
  if (event.target.closest('.toolbar-menu-action') && !event.target.closest('button')?.disabled) $('connection-menu').open = false;
});
document.addEventListener('click', event => { if (!$('connection-menu').contains(event.target)) $('connection-menu').open = false; });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !document.querySelector('dialog[open]') && $('connection-menu').open) {
    $('connection-menu').open = false; $('connection-status').focus();
  }
});
window.addEventListener('online', updateConnectionState);
window.addEventListener('offline', updateConnectionState);
for (const id of ['general-notes-dialog', 'module-profile-dialog']) $(id).addEventListener('close', () => {
  if (catalog && !$('connection-menu').open) $('connection-status').focus({ preventScroll: true });
});
$('module-select').addEventListener('change', async () => {
  if (!$('module-select').value.startsWith('@') && navigationBlocked()) { restoreUnitSelection(); return; }
  if($('module-select').value.startsWith('@')){
    if(busy||meetingsUI.hasPending()||document.querySelector('dialog[open]')){restoreUnitSelection();return;}
    fillUnits();
    await meetingsUI.openGroup($('module-select').value.slice(1),$('unit-select').value==='*'?null:$('unit-select').value);
    return;
  }
  fillUnits(); message('library-message'); await openSelectedUnit();
});
$('unit-select').addEventListener('change', async () => {
  if($('module-select').value.startsWith('@')){
    if(busy||meetingsUI.hasPending()||document.querySelector('dialog[open]')){restoreUnitSelection();return;}
    await meetingsUI.openGroup($('module-select').value.slice(1),$('unit-select').value==='*'?null:$('unit-select').value);return;
  }
  if (navigationBlocked()) { restoreUnitSelection(); return; }
  message('library-message'); await openSelectedUnit();
});
$('refresh').addEventListener('click', refresh);
$('save').addEventListener('click', save);
$('download-draft').addEventListener('click', downloadDraft);
$('toggle-sessions').addEventListener('click', toggleAllSessions);
for (const name of ['unit', 'module', 'tasks', 'preparation']) $('view-' + name).addEventListener('click', () => selectWorkspaceView(name));
$('activity-event-type').addEventListener('change', syncTaskFields);
$('task-presented').addEventListener('change', syncPresentationRequired);
taskDateFields.forEach(field => $('task-' + field).addEventListener('input', () => $('task-' + field).setCustomValidity('')));
$('editor-form').addEventListener('submit', applyEditor);
$('editor-form').addEventListener('input', updateSaveState);
$('editor-form').addEventListener('change', updateSaveState);
$('close-editor').addEventListener('click', closeEditor);
$('cancel-editor').addEventListener('click', closeEditor);
$('editor').addEventListener('cancel', (event) => { event.preventDefault(); closeEditor(); });
$('editor').addEventListener('click', (event) => {
  if (event.target !== $('editor')) return;
  const rect = $('editor').getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeEditor();
});
window.addEventListener('beforeunload', (event) => {
  if (!hasPendingChanges() && !suggestionsUI.hasPending() && !generalNotesUI.hasPending() && !busy) return;
  event.preventDefault();
  event.returnValue = '';
});
const presentationUI = createTaskPresentationUI({
  onConfirm(context, values) {
    if (busy || !draft || context.path !== activeEntry.path) return false;
    const session = draft.sessions.find(item => item.id === context.sessionId);
    if (!session || !applyPresentation(session, values, madridToday(), draft)) return false;
    failedSave = false;
    message('workspace-message', 'Presentación y fechas aplicadas al borrador. Pulsa Guardar cambios para conservarlas.');
    return true;
  },
  onClose(focusId) { if (draft) renderSessions(); if (focusId) $(focusId)?.focus({ preventScroll: true }); }
});
const registryUI = createTaskRegistryUI({ isBusy: () => busy, setBusy, onStateChange: updateSaveState,
  canOpen(task) {
    if (libraryIntegrity([...libraryRecords(), ...registryUI.records()]).some(issue => issue.code === 'DUPLICATE_TASK' && issue.moduleCode === task.entry.moduleCode && issue.taskId === (task.officialTaskId || task.registryTaskId))) {
      message('workspace-message', 'Esta tarea aparece en más de un documento. Revisa su conciliación antes de editarla.', 'warning'); return false;
    }
    if ($('editor').open || sessionEditorUI.isOpen() || resourcesUI.isOpen() || preparationUI.isOpen() || presentationUI.isOpen() || generalNotesUI.isOpen() || generalNotesUI.hasPending() || $('suggestions-dialog').open) {
      message('workspace-message', 'Cierra el editor abierto antes de editar otra tarea.', 'warning'); return false;
    }
    return true;
  },
  getActive: () => activeEntry && ({ path: activeEntry.path, sha: originalSha, savedDocument, draft, blocked: blockedSave }),
  unitStore(entry) {
    const candidate = documentStores.get(entry.path) ?? connection.forDocument(entry);
    documentStores.set(entry.path, candidate); return candidate;
  },
  onSaved(task, result, prepared) {
    if (task.registryTaskId) return;
    if (task.entry.path === activeEntry?.path) {
      savedDocument = copy(result.document); originalSha = result.sha;
      draft = prepared.unitDraft; failedSave = false; lastConfirmedAt = confirmationTime();
      $('loaded-version').textContent = `Versión leída: ${originalSha.slice(0, 8)}`;
    } else {
      moduleDocuments.set(task.entry.path, { entry: task.entry, document: result.document });
      moduleLoadFailures = moduleLoadFailures.filter(entry => entry.path !== task.entry.path);
    }
  },
  onBlocked(task) {
    if (task.entry.path === activeEntry?.path) {
      blockedSave = true;
      message('workspace-message', 'Revisa la versión de esta unidad antes de guardar. Sus notas pendientes se conservan; puedes descargar el borrador.', 'warning');
    }
  },
  capturePosition: () => moduleViews.capturePosition(), restorePosition: position => moduleViews.restorePosition(position),
  onChange(content, kind) {
    const position = moduleViews.capturePosition();
    if (draft) renderSessions();
    moduleViews.restorePosition(position, false);
    if (content) message('workspace-message', content, kind);
  }
});
const suggestionsUI = createSuggestionsUI({
  isBusy: () => busy, setBusy, onStateChange: updateSaveState,
  isAcademicEditorOpen: () => $('editor').open || presentationUI.isOpen() || (registryUI.isOpen() || preparationUI.isOpen() || sessionEditorUI.isOpen() || resourcesUI.isOpen()) || generalNotesUI.isOpen(),
  onSaved({ message: content, url }) {
    message('workspace-message', content);
    const link = node('a', '', 'Ver registro privado en GitHub');
    link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    $('workspace-message').append(document.createTextNode(' '), link);
  },
});
const generalNotesUI = createGeneralNotesUI({
  isBusy: () => busy, setBusy, onStateChange: updateSaveState, improvementIcon: () => noteIcon('improvements'),
  onMessage: (content, kind) => message('workspace-message', content, kind),
  otherEditorOpen: () => $('editor').open || presentationUI.isOpen() || (registryUI.isOpen() || preparationUI.isOpen() || sessionEditorUI.isOpen() || resourcesUI.isOpen()) || $('suggestions-dialog').open,
  getTarget(scope) {
    if (!connection) return null;
    if (scope === 'unit') return activeEntry && draft && selectedEntry()?.path === activeEntry.path ? { ...activeEntry, title: draft.unit.title } : null;
    const module = catalog?.modules.find(item => item.code === $('module-select').value);
    return module ? { moduleCode: module.code, title: module.name } : null;
  },
});
const moduleProfileUI = createModuleProfileUI({
  isBusy: () => busy, setBusy, getConnection: () => connection,
  getTarget: () => catalog?.modules.find(item => item.code === $('module-select').value),
  getRecords: () => libraryRecords(),
  otherEditorOpen: () => $('editor').open || presentationUI.isOpen() || (registryUI.isOpen() || preparationUI.isOpen() || sessionEditorUI.isOpen() || resourcesUI.isOpen()) || generalNotesUI.isOpen() || $('suggestions-dialog').open,
});
const preparationUI = createPreparationUI({
  getState: () => ({ catalog, records: libraryRecords(), activeEntry, draft, ready: moduleContextReady }),
  getActive: () => activeEntry && ({ path: activeEntry.path, sha: originalSha, savedDocument, draft, blocked: blockedSave }),
  unitStore(entry) { const candidate = documentStores.get(entry.path) ?? connection.forDocument(entry); documentStores.set(entry.path, candidate); return candidate; },
  isBusy: () => busy, setBusy, onStateChange: updateSaveState,
  canOpen: () => Boolean(connection) && !sessionEditorUI.isOpen() && !resourcesUI.isOpen() && !$('editor').open && !presentationUI.isOpen() && !registryUI.isOpen() && !generalNotesUI.isOpen() && !generalNotesUI.hasPending() && !$('suggestions-dialog').open && !$('module-profile-dialog').open,
  onMessage: (content, kind) => message('workspace-message', content, kind),
  onRetry: refreshPreparationContext,
  onOpenUnit: openPreparationUnit,
  additionIssue(entry) {
    if (registryUI.failures().includes(entry.moduleCode)) return 'Falta consultar el registro de tareas del módulo. Actualiza la preparación antes de añadir elementos.';
    const history = registryUI.records().find(record => record.entry.moduleCode === entry.moduleCode);
    return history?.document.tasks.some(task => task.unitCode === entry.unitCode) ? 'Esta UT tiene tareas en el registro histórico. Hay que conciliar su lista antes de añadir elementos oficiales.' : '';
  },
  removalIssue(entry, id) {
    if (!moduleContextReady || moduleLoadFailures.some(item => item.moduleCode === entry.moduleCode) || registryUI.failures().includes(entry.moduleCode)) return 'Falta consultar parte del módulo. Actualiza Preparación antes de eliminar elementos para comprobar sus vínculos.';
    const records = [...libraryRecords(), ...registryUI.records()].filter(record => record.entry.moduleCode === entry.moduleCode);
    if (records.some(record => record.entry.path !== entry.path && record.document.tasks?.some(task => task.id === id))) return 'Este elemento aparece en otro documento. Revisa su conciliación antes de eliminarlo.';
    if (records.some(record => record.document.sessions?.some(session => session.activities.some(activity => Array.isArray(activity.taskRefs) && activity.taskRefs.includes(id))))) return 'Este elemento está vinculado al trabajo de alguna porción. Revisa esos vínculos antes de eliminarlo; sus sesiones y notas se conservan.';
    return '';
  },
  onSaved(entry, result, prepared) {
    if (entry.path === activeEntry?.path) {
      savedDocument = copy(result.document); originalSha = result.sha; draft = prepared.unitDraft;
      failedSave = false; lastConfirmedAt = confirmationTime();
      $('loaded-version').textContent = `Versión leída: ${originalSha.slice(0, 8)}`;
    } else {
      moduleDocuments.set(entry.path, { entry, document: result.document });
      moduleLoadFailures = moduleLoadFailures.filter(item => item.path !== entry.path);
    }
    if (draft) renderSessions();
  },
  onBlocked(entry) {
    if (entry.path === activeEntry?.path) { blockedSave = true; message('workspace-message', 'Revisa la versión de esta unidad antes de guardar. Las notas y el borrador de preparación se conservan.', 'warning'); }
  },
});
const sessionEditorUI = createSessionEditorUI({
  isBusy: () => busy, setBusy, onStateChange: updateSaveState,
  canOpen: () => Boolean(connection && draft) && !$('editor').open && !presentationUI.isOpen() && !registryUI.isOpen() && !preparationUI.isOpen() && !generalNotesUI.isOpen() && !generalNotesUI.hasPending() && !$('suggestions-dialog').open && !$('module-profile-dialog').open,
  getActive: () => activeEntry && ({ path: activeEntry.path, sha: originalSha, savedDocument, draft, blocked: blockedSave }),
  unitStore(entry) { const candidate = documentStores.get(entry.path) ?? connection.forDocument(entry); documentStores.set(entry.path, candidate); return candidate; },
  onMessage: (content, kind) => message('workspace-message', content, kind),
  onSaved(entry, result, prepared) {
    savedDocument = copy(result.document); originalSha = result.sha; draft = prepared.unitDraft;
    failedSave = false; lastConfirmedAt = confirmationTime();
    $('loaded-version').textContent = `Versión leída: ${originalSha.slice(0, 8)}`;
    renderSessions();
    message('workspace-message', dirty() ? 'Textos de la sesión guardados. Las demás notas y cambios de Unidad siguen pendientes de guardar.' : 'Textos de la sesión guardados y confirmados en GitHub.');
  },
  onBlocked() { blockedSave = true; message('workspace-message', 'Conserva los textos de la sesión y las notas de Unidad. Revisa su versión antes de volver a guardar.', 'warning'); },
  onReturn(position) {
    if (position?.focusId) $(position.focusId)?.focus({ preventScroll: true });
    if (position) window.scrollTo({ left: position.x, top: position.y, behavior: 'instant' });
  },
});
const resourcesUI = createResourcesUI({
  isBusy: () => busy, setBusy, onStateChange: updateSaveState, getConnection: () => connection,
  getState: () => ({ entry: activeEntry, document: draft }),
  getActive: () => activeEntry && ({ path: activeEntry.path, sha: originalSha, savedDocument, draft, blocked: blockedSave }),
  unitStore(entry) { const candidate = documentStores.get(entry.path) ?? connection.forDocument(entry); documentStores.set(entry.path,candidate); return candidate; },
  canOpen: () => Boolean(connection && draft) && !$('editor').open && !presentationUI.isOpen() && !registryUI.isOpen() && !preparationUI.isOpen() && !sessionEditorUI.isOpen() && !generalNotesUI.isOpen() && !generalNotesUI.hasPending() && !$('suggestions-dialog').open && !$('module-profile-dialog').open,
  onMessage: (content,kind) => message('workspace-message',content,kind),
  onSaved(entry,result,prepared) {
    savedDocument = copy(result.document); originalSha = result.sha; draft = prepared.unitDraft;
    failedSave = false; lastConfirmedAt = confirmationTime();
    $('loaded-version').textContent = `Versión leída: ${originalSha.slice(0,8)} · Comprobada a las ${lastConfirmedAt}`;
    renderSessions();
  },
  onBlocked(entry) { if (entry.path === activeEntry?.path) { blockedSave = true; message('workspace-message','Conserva los recursos y las notas pendientes. Revisa la versión antes de guardar otra vez.','warning'); } },
});
const moduleViews = createModuleViews({
  getState: () => ({ module: catalog?.modules.find(item => item.code === activeEntry?.moduleCode), records: moduleRecords(), allRecords: libraryRecords(), taskRecords: [...libraryRecords(), ...registryUI.records()], integrityIssues: libraryIntegrity([...libraryRecords(), ...registryUI.records()]), registryFailures: registryUI.failures(), catalog, failures: moduleFailures(), allFailures: moduleLoadFailures, errors: teachingTimeline.errors, ready: moduleContextReady, today: madridToday(), activePath: activeEntry?.path, busy, connection, view: currentView }),
  onOpen: (path, sessionId) => openModuleSource(path, sessionId),
  onEdit: task => registryUI.open(task),
  onCorrected: correctTask, onPresented: presentTask, onRetry: retryExamContext,
  onPreparation: entry => preparationUI.open(entry),
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && draft) { refreshTemporalIndicators(); renderSessionBand(); moduleViews.render(); } });
const meetingsUI = createMeetingWorkspace({
  getCatalog:()=>catalog,getReader:()=>meetingReader,getCommon:()=>startupCommon,
  loadCommon:async()=>{startupCommon=(await connection.loadCommon(catalog)).document;return startupCommon;},
  isBusy:()=>busy,setBusy,onStateChange:updateSaveState,
  onLocation:syncMeetingSelection,onRemember:rememberContext,
  onShow:()=>{setWorkspaceView('meeting');$('workspace').hidden=false;},
  onWarning:warnNavigation,
});
setInterval(() => {
  if (!draft) return;
  refreshTemporalIndicators();
  if ($('session-band').dataset.today !== madridToday()) { renderSessionBand(); moduleViews.render(); }
}, 60000);
updateSaveState();

// Keep scroll targets below the real toolbar height, including its mobile rows.
const appHeader = document.querySelector('.app-header');
const updateHeaderHeight = () => document.documentElement.style.setProperty('--app-header-height', `${Math.ceil(appHeader.getBoundingClientRect().height)}px`);
if (globalThis.ResizeObserver) new ResizeObserver(updateHeaderHeight).observe(appHeader);
window.addEventListener('resize', updateHeaderHeight);
updateHeaderHeight();
