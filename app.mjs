import { validateCatalog, validateDocument, summarize, isValidDate, GithubStore, saveErrorFeedback } from './core.mjs?v=20261016-5';
import { createSuggestionsUI } from './suggestions-ui.mjs?v=20261016-1';
import { createGeneralNotesUI } from './general-notes-ui.mjs?v=20261016-2';
import { compactUnitLabel, madridToday, sessionBand } from './unit-tools.mjs?v=20261016-4';
import { eventTypes, setSessionEventType, activityEventType, taskProgress, setTaskPresented, moduleTimeline, unitExamReminders } from './teaching.mjs?v=20261016-4';
import { taskDateFields, taskTarget, taskDetails, applyTaskDetails, moduleTasks } from './module-views.mjs?v=20261016-5';
import { createModuleViews } from './module-views-ui.mjs?v=20261016-5';

const $ = (id) => document.getElementById(id);
const fields = ['observations', 'improvements', 'realized', 'pending'];
const stateNames = ['', 'Impartida', 'Reprogramada', 'Cancelada'];
const stateClasses = new Map([['Impartida', 'delivered'], ['Reprogramada', 'rescheduled'], ['Cancelada', 'cancelled']]);
const progressNames = new Map([[0, 'Pendiente'], [1, 'En proceso'], [2, 'Completada']]);
const layoutDescriptions = new Map([
  ['table', 'Tabla · columnas alineadas y texto en una línea, como en Excel.'],
  ['bands', 'Bandas · sesiones separadas y hasta dos líneas de descripción.'],
  ['agenda', 'Agenda · máxima densidad y más espacio para lo previsto; notas en sus botones.'],
]);
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
let savedDocument = null;
let draft = null;
let originalSha = null;
let busy = false;
let blockedSave = false;
let failedSave = false;
let editorTarget = null;
let lastConfirmedAt = null;
let currentView = 'unit';

function moduleRecords() { return draft ? [...moduleDocuments.values(), { entry: activeEntry, document: draft }] : []; }
function readTaskEditor() {
  return { ...Object.fromEntries(taskDateFields.map(field => [field, $('task-' + field).value])),
    presented: $('task-presented').checked, corrected: $('task-corrected').checked };
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
  const target = editorTarget.sessionTask ? draft.sessions[editorTarget.sessionIndex] : activity;
  return fields.some((field) => $(field).value !== text(activity[field])) || $('activity-event-type').value !== (activity.eventType || '')
    || (!$('task-fields').hidden && JSON.stringify(readTaskEditor()) !== JSON.stringify(taskDetails(target)));
}

function hasPendingChanges() { return dirty() || editorDirty(); }

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
  $('recovery-actions').hidden = !(dirty() || blockedSave || failedSave);
  updateNavigation();
  suggestionsUI.updateAvailability();
}

function selectedEntry() {
  const module = catalog?.modules.find(item => item.code === $('module-select').value);
  const unit = module?.units.find(item => item.code === $('unit-select').value);
  return unit ? { moduleCode: module.code, unitCode: unit.code, unitId: unit.id, path: unit.path } : null;
}

function updateNavigation() {
  const editing = hasPendingChanges() || $('editor').open || blockedSave || generalNotesUI.hasPending() || generalNotesUI.isOpen();
  const selectedModule = catalog?.modules.find(item => item.code === $('module-select').value);
  const selected = selectedEntry();
  $('module-select').disabled = busy || editing || !catalog?.modules.length;
  $('unit-select').disabled = busy || editing || !selectedModule?.units.length;
  $('open-unit').disabled = busy || editing || !selected || selected.path === activeEntry?.path;
  $('refresh-catalog').disabled = busy || editing || !connection;
  let help = '';
  if (blockedSave) help = 'Conserva el borrador y actualiza la unidad abierta para revisar el guardado antes de cambiar de unidad.';
  else if (generalNotesUI.hasPending() || generalNotesUI.isOpen()) help = 'Termina de revisar o guardar las mejoras generales antes de cambiar de unidad.';
  else if ($('editor').open) help = 'Termina de editar y guarda los cambios antes de abrir otra unidad.';
  else if (editing) help = 'Guarda tus cambios antes de abrir otra unidad. El borrador permanece en la unidad abierta.';
  else if (selectedModule && !selectedModule.units.length) help = `${selectedModule.code}: pendiente de incorporar su unidad. No hay planificación disponible en la app todavía.${activeEntry ? ` Sigue abierta ${activeEntry.moduleCode} · ${activeEntry.unitCode}.` : ''}`;
  else if (activeEntry && selected?.path !== activeEntry.path) help = `En pantalla: ${activeEntry.moduleCode} · ${activeEntry.unitCode}. Pulsa Abrir unidad para mostrar la selección nueva.`;
  else if (!activeEntry && selected) help = 'Pulsa Abrir unidad para cargarla.';
  $('selection-help').textContent = help;
  $('selection-help').hidden = !help;
  generalNotesUI.updateAvailability();
}

function fillUnits(preferredCode = '') {
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
  $('connection-label').replaceChildren(node('span', 'status-dot'), document.createTextNode('Conectado'));
  $('connection-label').classList.add('is-connected');
}

async function loadSelectedDocument() {
  const entry = selectedEntry();
  if (!entry || !connection || hasPendingChanges() || blockedSave || $('editor').open || generalNotesUI.hasPending() || generalNotesUI.isOpen() || entry.path === activeEntry?.path) return;
  message('library-message', `Abriendo ${entry.moduleCode} · ${entry.unitCode}…`);
  try {
    const candidate = documentStores.get(entry.path) ?? connection.forDocument(entry);
    documentStores.set(entry.path, candidate);
    const result = await candidate.load();
    // Do not replace the current document, its SHA or its store until the new read is valid.
    checked(result.document, entry);
    if (typeof result.sha !== 'string' || !result.sha) throw new Error('MissingVersion');
    store = candidate;
    activeEntry = Object.freeze({ ...entry });
    moduleContextReady = false;
    moduleLoadFailures = [];
    moduleDocuments.clear();
    openSessions.clear();
    acceptLoaded(result);
    await loadModuleContext();
    message('library-message');
    $('unit-title').focus({ preventScroll: true });
  } catch {
    message('library-message', `No se ha podido abrir ${entry.moduleCode} · ${entry.unitCode}. Comprueba el acceso, la conexión y el documento.${activeEntry ? ' La unidad anterior y sus datos siguen intactos.' : ' Puedes actualizar la lista o probar otra unidad.'}`, 'error');
  }
}

async function openSelectedUnit() {
  if (busy || !connection || hasPendingChanges() || blockedSave || $('editor').open || generalNotesUI.hasPending() || generalNotesUI.isOpen()) return;
  setBusy(true);
  try { await loadSelectedDocument(); } finally { setBusy(false); }
  selectWorkspaceView('unit');
}

/** Never edit a cached snapshot: load the target UT and its SHA first. */
async function openModuleSource(path, sessionId, activityId, editTask = false) {
  if (busy || !draft) return;
  if (path !== activeEntry.path) {
    if (hasPendingChanges() || blockedSave || $('editor').open || generalNotesUI.hasPending() || generalNotesUI.isOpen()) {
      message('workspace-message', 'Guarda o revisa los cambios de la unidad abierta antes de abrir otra UT.', 'warning'); return;
    }
    const module = catalog.modules.find(item => item.code === activeEntry.moduleCode);
    const unit = module?.units.find(item => item.path === path);
    if (!unit) return;
    setBusy(true);
    try { $('module-select').value = module.code; fillUnits(unit.code); await loadSelectedDocument(); }
    finally { setBusy(false); }
    if (activeEntry.path !== path) return;
  }
  const index = sessionId ? draft.sessions.findIndex(session => session.id === sessionId) : -1;
  if (editTask) {
    const task = moduleTasks([{ entry: activeEntry, document: draft }], activeEntry.moduleCode)
      .find(item => item.sessionId === sessionId && item.activityId === activityId);
    if (!task) { message('workspace-message', 'La tarea ha cambiado desde la lectura del módulo. Revisa la planificación actual.', 'warning'); return; }
    openEditor(task.sessionIndex, task.activityIndex, 'task');
  } else {
    selectWorkspaceView('unit');
    if (index >= 0) {
      openSessions.add(sessionId); renderSessions();
      const section = $('sessions').querySelector(`[data-session-index="${index}"]`);
      section?.scrollIntoView({ block: 'start', behavior: 'instant' });
      section?.querySelector('.session-title')?.focus({ preventScroll: true });
    }
  }
}

function selectWorkspaceView(view) {
  if (!['unit', 'module', 'tasks'].includes(view) || busy || $('editor').open) return;
  currentView = view;
  for (const name of ['unit', 'module', 'tasks']) {
    $(name + '-view').hidden = name !== view;
    $('view-' + name).setAttribute('aria-pressed', String(name === view));
  }
  $('session-view-controls').hidden = view !== 'unit';
  renderStats();
  if (draft) moduleViews.render();
}

async function refreshCatalog() {
  if (busy || !connection || hasPendingChanges() || blockedSave || $('editor').open || generalNotesUI.hasPending() || generalNotesUI.isOpen()) return;
  setBusy(true);
  message('library-message', 'Actualizando la lista de unidades…');
  try {
    acceptCatalog(await connection.loadCatalog());
    if (draft) await loadModuleContext();
    message('library-message', 'Lista actualizada. La unidad abierta no ha cambiado.');
  } catch {
    message('library-message', 'No se ha podido actualizar la lista. Se conservan la lista anterior y la unidad abierta.', 'error');
  } finally { setBusy(false); }
}

async function loadModuleContext() {
  if (!connection || !activeEntry || !catalog) return;
  const module = catalog.modules.find(item => item.code === activeEntry.moduleCode);
  const entries = (module?.units ?? []).filter(unit => unit.path !== activeEntry.path).map(unit => ({ moduleCode: module.code, unitCode: unit.code, unitId: unit.id, path: unit.path }));
  moduleDocuments.clear(); moduleLoadFailures = []; moduleContextReady = false;
  const results = await Promise.allSettled(entries.map(async entry => {
    const candidate = documentStores.get(entry.path) ?? connection.forDocument(entry);
    documentStores.set(entry.path, candidate);
    const result = await candidate.load();
    checked(result.document, entry);
    return { entry, document: result.document };
  }));
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') moduleDocuments.set(entries[index].path, result.value);
    else moduleLoadFailures.push(entries[index].unitCode);
  });
  moduleContextReady = true;
  renderSessions();
}

async function retryExamContext() {
  if (busy || !draft || $('editor').open || generalNotesUI.isOpen()) return;
  setBusy(true);
  try { await loadModuleContext(); } finally { setBusy(false); }
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

function addMeta(container, content, className = '') {
  if (container.childElementCount) container.append(node('span', 'meta-separator', '·'));
  container.append(node('span', className, content));
}

function editButton(sessionIndex, activityIndex, field) {
  const session = draft.sessions[sessionIndex];
  const activity = session.activities[activityIndex];
  const label = field === 'improvements' ? 'Mejoras' : 'Observaciones';
  const button = node('button', `edit-button edit-${field}${text(activity[field]).trim() ? ' has-content' : ''}`, label);
  button.type = 'button';
  button.setAttribute('aria-label', `${label} de la sesión ${session.number}, ${activityIndex === 0 ? 'primera porción' : `actividad ${activityIndex + 1}`}: ${activity.title || 'Sin título'}`);
  button.title = field === 'improvements' ? 'Abrir directamente las mejoras' : 'Anotar observaciones y concretarlas en mejoras, realizado o pendiente';
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

function makeActivity(activity, sessionIndex, activityIndex) {
  const container = node('section', 'activity');
  const type = activityEventType(draft.sessions[sessionIndex], activity);
  if (type) container.classList.add('activity-' + type);
  const top = node('div', 'activity-top');
  const time = node('div', 'activity-time', `${activity.start}–${activity.end}`);
  const description = node('div', 'activity-description');
  const title = node('h4', 'activity-title', activity.title || 'Actividad');
  title.title = activity.title || 'Actividad';
  description.append(title);
  if (type === 'task') {
    description.append(teachingCheckbox('Presentada', `task-presented-${sessionIndex}-portion-${activityIndex}`, activity.taskPresented === true, `Tarea presentada y abierta: ${activity.title}`, checked => setTaskPresented(draft.sessions[sessionIndex], checked, activity.id)));
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

function teachingCheckbox(label, id, selected, help, change) {
  const wrapper = node('label', 'teaching-check');
  const input = node('input'); input.type = 'checkbox'; input.id = id;
  input.checked = selected; input.disabled = busy;
  input.setAttribute('aria-label', help); input.title = help;
  input.addEventListener('change', () => changeTeaching(() => change(input.checked), id));
  wrapper.title = help; wrapper.append(input, node('span', '', label));
  return wrapper;
}

function makeTeachingControls(session, sessionIndex) {
  const controls = node('div', 'teaching-controls');
  controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', `Tareas y examen de la sesión ${session.number}`);
  const selected = eventTypes(session);
  for (const [type, label] of [['task', 'Tarea'], ['exam', 'Examen']]) {
    controls.append(teachingCheckbox(label, `teaching-${type}-${sessionIndex}`, selected.includes(type), `${label} en la sesión ${session.number}`, checked => setSessionEventType(session, type, checked)));
  }
  if (Object.hasOwn(session, 'eventTypes')) {
    const reset = node('button', 'teaching-reset', '↶'); reset.type = 'button';
    reset.title = 'Volver a las marcas automáticas de la planificación'; reset.setAttribute('aria-label', `Restablecer marcas previstas de la sesión ${session.number}`);
    reset.addEventListener('click', () => changeTeaching(() => { delete session.eventTypes; }, `teaching-task-${sessionIndex}`));
    controls.append(reset);
  }
  if (selected.includes('task')) {
    const progress = taskProgress(session);
    const control = teachingCheckbox(progress.total === 1 ? 'Presentada' : `Presentadas ${progress.presented}/${progress.total}`, `task-presented-${sessionIndex}`, progress.presented === progress.total, `Todas las tareas presentadas y abiertas para trabajar en la sesión ${session.number}`, checked => setTaskPresented(session, checked));
    control.querySelector('input').indeterminate = progress.presented > 0 && progress.presented < progress.total;
    controls.append(control);
  }
  if (selected.includes('exam')) {
    const exam = teachingTimeline.exams.find(item => item.id === session.id);
    if (exam && exam.source.entry.path !== activeEntry.path) {
      if (exam.announced) controls.append(node('span', 'teaching-confirmed', 'Avisado ✓'));
      else {
        const action = node('button', 'teaching-reset', `Avisar en ${exam.source.entry.unitCode}`);
        action.type = 'button'; action.disabled = busy;
        action.title = 'El aviso de esta sesión compartida se conserva en la unidad que inicia el examen.';
        action.addEventListener('click', () => markExamReminder(exam)); controls.append(action);
      }
    } else {
      controls.append(teachingCheckbox('Avisado', `exam-announced-${sessionIndex}`, session.examAnnouncedFor === session.date, `Aviso al alumnado del examen de la sesión ${session.number}, ${dateInfo(session.date).full}`, checked => {
        if (checked) session.examAnnouncedFor = session.date; else delete session.examAnnouncedFor;
      }));
    }
  }
  return controls;
}

function makeExamReminder(exam) {
  const reminder = node('div', 'exam-reminder');
  reminder.setAttribute('role', 'note');
  const label = `Avisar del examen · ${exam.source.entry.unitCode} · ${dateInfo(exam.date).full}`;
  const details = node('div', 'exam-reminder-text');
  details.append(node('strong', '', label));
  const explanation = exam.shortfall
    ? `Solo hay ${exam.availableBefore} sesiones anteriores disponibles; el aviso se muestra desde la primera.`
    : 'Tres sesiones lectivas antes. Se cuentan las UT disponibles del módulo.';
  details.append(node('span', '', `${exam.changedDate ? 'La fecha ha cambiado: confirma el nuevo aviso. ' : ''}${explanation}`));
  reminder.append(details);
  const action = node('button', 'button button-small', exam.source.entry.path === activeEntry.path ? 'Marcar avisado' : `Marcar avisado en ${exam.source.entry.unitCode}`);
  action.type = 'button'; action.disabled = busy;
  action.setAttribute('aria-label', `Marcar avisado el examen de ${exam.source.entry.unitCode} del ${exam.date}`);
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
  const session = draft.sessions.find(item => item.id === exam.id);
  if (!session || session.date !== exam.date || !eventTypes(session).includes('exam') || ['Cancelada', 'Reprogramada'].includes(session.state)) {
    message('workspace-message', 'La planificación del examen ha cambiado. Revisa la sesión antes de confirmar el aviso.', 'warning'); return;
  }
  changeTeaching(() => { session.examAnnouncedFor = session.date; });
  message('workspace-message', 'Aviso marcado en el borrador del examen. Pulsa Guardar cambios para conservarlo.');
}

function makeSession(session, sessionIndex) {
  const first = session.activities[0];
  const isOpen = openSessions.has(session.id);
  const section = node('article', 'session');
  const types = eventTypes(session);
  types.forEach(type => section.classList.add('session-' + type));
  section.dataset.sessionIndex = String(sessionIndex);
  const top = node('div', 'session-top');
  top.dataset.eventType = activityEventType(session, first);
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
  addMeta(meta, `Sesión ${session.number}`, 'session-number');
  addMeta(meta, sessionTime(session));
  addMeta(meta, `${session.activities.length} porciones`);
  if (first && session.activities.length > 1) addMeta(meta, `1.ª ${first.start}–${first.end}`, 'first-portion-time');
  const title = node('h3', 'session-title', first?.title || 'Sesión');
  title.title = first?.title || 'Sesión';
  title.tabIndex = -1;
  description.append(meta, title, makeTeachingControls(session, sessionIndex));
  const planned = node('p', 'planned-preview', first?.planned || '');
  planned.title = first?.planned || '';
  top.append(toggle, dateTile, description, planned, notePreviews(first || {}, 'session-notes'), makeStateSelect(session, sessionIndex), rowActions(sessionIndex, 0));
  const body = node('div', 'session-body');
  body.id = `session-content-${sessionIndex}`;
  body.hidden = !isOpen;
  if (session.activities.length === 1) body.append(node('p', 'activities-label', 'Esta sesión tiene una única porción.'));
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
  section.append(top);
  examReminders.filter(exam => exam.placement === session.id).forEach(exam => section.append(makeExamReminder(exam)));
  section.append(body);
  return section;
}

function renderStats() {
  if (!draft) return;
  const summary = summarize(draft);
  const stats = $('stats');
  stats.hidden = false;
  stats.setAttribute('aria-label', `Resumen de ${draft.module.code} · ${draft.unit.code}`);
  stats.replaceChildren();
  const records = moduleRecords();
  const values = currentView === 'unit'
    ? [[summary.totalSessions, 'sesiones', false], [summary.deliveredSessions, 'impartidas', true], [minutesLabel(summary.totalMinutes), 'previstos', false]]
    : [[records.length, 'UT leídas', false], [new Set(records.flatMap(record => record.document.sessions.map(session => session.id))).size, 'sesiones', false], [moduleTasks(records, activeEntry.moduleCode).length, 'tareas', true]];
  stats.setAttribute('aria-label', currentView === 'unit' ? `Resumen de ${draft.module.code} · ${draft.unit.code}` : `Resumen del módulo ${draft.module.code}, solo UT leídas`);
  for (const [value, label, highlight] of values) {
    const item = node('div', 'stat');
    item.append(node('span', `stat-value${highlight ? ' teal' : ''}`, value), node('span', 'stat-label', label));
    stats.append(item);
  }
}

function renderSessions() {
  const records = [...moduleDocuments.values(), { entry: activeEntry, document: draft }];
  teachingTimeline = moduleTimeline(records, draft.module.code);
  examReminders = moduleContextReady && !moduleLoadFailures.length ? unitExamReminders(teachingTimeline, activeEntry.path) : [];
  const reminders = $('exam-reminders'); reminders.replaceChildren();
  if (moduleLoadFailures.length || teachingTimeline.errors.length) {
    const warning = node('div', 'exam-reminder');
    warning.append(node('span', '', moduleLoadFailures.length ? `No se han podido consultar ${moduleLoadFailures.join(', ')}. Los avisos de examen no están completos.` : 'Hay sesiones compartidas con fechas o estados incompatibles. Revisa la planificación antes de calcular los avisos.'));
    const retry = node('button', 'button button-small', 'Revisar avisos'); retry.type = 'button'; retry.disabled = busy;
    retry.addEventListener('click', retryExamContext); warning.append(retry); reminders.append(warning);
  }
  examReminders.filter(exam => exam.placement === 'top').forEach(exam => reminders.append(makeExamReminder(exam)));
  reminders.hidden = !reminders.childElementCount;
  const container = $('sessions');
  container.replaceChildren();
  if (!draft.sessions.length) container.append(node('p', 'empty-sessions', 'Este documento no contiene sesiones.'));
  draft.sessions.forEach((session, index) => container.append(makeSession(session, index)));
  renderSessionBand();
  moduleViews.render(); renderStats();
  if (busy) $('workspace').querySelectorAll('button, input, textarea, select').forEach(element => { element.disabled = true; });
  updateSaveState();
}

function renderSessionBand() {
  const container = $('session-band');
  container.replaceChildren();
  if (!draft) return;
  container.dataset.today = madridToday();
  for (const item of sessionBand(draft.sessions, container.dataset.today)) {
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
    connection = new GithubStore({ token });
    suggestionsUI.connect(token);
    generalNotesUI.connect(token);
    token = '';
    setBusy(true);
    message('login-message', 'Comprobando acceso y leyendo el catálogo privado…');
    acceptCatalog(await connection.loadCatalog());
    message('login-message');
    await loadSelectedDocument();
  } catch (error) {
    token = '';
    store = null;
    connection = null;
    suggestionsUI.disconnect();
    generalNotesUI.disconnect();
    documentStores.clear();
    catalog = null;
    activeEntry = null;
    $('library-view').hidden = true;
    $('login-view').hidden = false;
    $('disconnect').hidden = true;
    $('connection-label').replaceChildren(node('span', 'status-dot'), document.createTextNode('Sin conectar'));
    $('connection-label').classList.remove('is-connected');
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
    token = '';
    setBusy(false);
  }
}

function disconnect() {
  if (busy) return;
  if ((hasPendingChanges() || suggestionsUI.hasPending() || generalNotesUI.hasPending()) && !window.confirm('Hay cambios, mejoras o sugerencias sin guardar. Descárgalos si quieres conservarlos. ¿Quieres descartarlos y desconectar?')) return;
  suggestionsUI.disconnect();
  generalNotesUI.disconnect();
  $('editor').close();
  editorTarget = null;
  store = null;
  connection = null;
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
  for (const name of ['unit', 'module', 'tasks']) {
    $(name + '-view').hidden = name !== 'unit'; $('view-' + name).setAttribute('aria-pressed', String(name === 'unit'));
  }
  $('session-view-controls').hidden = false;
  $('token').value = '';
  $('workspace').hidden = true;
  $('library-view').hidden = true;
  $('module-select').replaceChildren();
  $('unit-select').replaceChildren();
  message('library-message');
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
    await loadModuleContext();
    message('workspace-message', 'Versión actualizada desde GitHub.');
  } catch {
    message('workspace-message', 'No se ha podido actualizar. El contenido y el borrador que tenías permanecen intactos. Comprueba la conexión y vuelve a intentarlo.', 'error');
  } finally {
    setBusy(false);
  }
}

async function save() {
  if (busy || !store || !draft || !dirty() || blockedSave || $('editor').open) return;
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

function openEditor(sessionIndex, activityIndex, targetField = 'observations') {
  if (busy || !draft) return;
  const session = draft.sessions[sessionIndex];
  const activity = session.activities[activityIndex];
  editorTarget = { sessionIndex, activityIndex, sessionTask: taskTarget(session, activityIndex) === session };
  $('editor-kicker').textContent = `SESIÓN ${session.number} · ${activityIndex === 0 ? 'PRIMERA PORCIÓN' : 'ACTIVIDAD'}`;
  $('editor-title').textContent = activity.title || 'Actividad';
  $('editor-time').textContent = `${activity.start}–${activity.end} · ${dateInfo(session.date).full}`;
  $('editor-progress').hidden = !progressNames.has(activity.progress);
  $('editor-progress').textContent = progressNames.has(activity.progress) ? `Progreso importado: ${progressNames.get(activity.progress)} · Solo lectura` : '';
  $('editor-planned').textContent = activity.planned || 'Sin descripción prevista.';
  fields.forEach((field) => { $(field).value = text(activity[field]); });
  $('activity-event-type').value = activity.eventType || '';
  const detailsTask = taskDetails(editorTarget.sessionTask ? session : activity);
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
  const target = $(targetField === 'task' ? 'task-publishedOn' : targetField === 'improvements' ? 'improvements' : 'observations');
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  updateSaveState();
}

function syncTaskFields() {
  const manual = editorTarget?.sessionTask && !$('activity-event-type').value;
  $('task-fields').hidden = $('activity-event-type').value !== 'task' && !manual;
  $('task-target-help').textContent = manual ? 'Tarea marcada solo en la sesión: estos datos pertenecen a la sesión completa.' : 'Estos datos pertenecen únicamente a esta porción marcada como tarea.';
  taskDateFields.forEach(field => { $('task-' + field).disabled = $('task-fields').hidden; });
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
  if ($('activity-event-type').value) activity.eventType = $('activity-event-type').value;
  else delete activity.eventType;
  const target = taskTarget(session, editorTarget.activityIndex);
  if (target && !$('task-fields').hidden) applyTaskDetails(target, readTaskEditor());
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

function expand(mode) {
  if (busy || !draft) return;
  openSessions.clear();
  if (mode !== 'none') draft.sessions.forEach((session) => {
    openSessions.add(session.id);
  });
  renderSessions();
}

function selectLayout(layout) {
  if (!layoutDescriptions.has(layout)) return;
  $('workspace').dataset.layout = layout;
  $('layout-description').textContent = layoutDescriptions.get(layout);
  for (const name of layoutDescriptions.keys()) $('layout-' + name).setAttribute('aria-pressed', String(name === layout));
}

$('login-form').addEventListener('submit', connect);
$('disconnect').addEventListener('click', disconnect);
$('module-select').addEventListener('change', () => { fillUnits(); message('library-message'); });
$('unit-select').addEventListener('change', () => { updateNavigation(); message('library-message'); });
$('open-unit').addEventListener('click', openSelectedUnit);
$('refresh-catalog').addEventListener('click', refreshCatalog);
$('refresh').addEventListener('click', refresh);
$('save').addEventListener('click', save);
$('download-draft').addEventListener('click', downloadDraft);
$('collapse-all').addEventListener('click', () => expand('none'));
$('expand-sessions').addEventListener('click', () => expand('sessions'));
for (const name of ['unit', 'module', 'tasks']) $('view-' + name).addEventListener('click', () => selectWorkspaceView(name));
$('activity-event-type').addEventListener('change', syncTaskFields);
taskDateFields.forEach(field => $('task-' + field).addEventListener('input', () => $('task-' + field).setCustomValidity('')));
for (const name of layoutDescriptions.keys()) $('layout-' + name).addEventListener('click', () => selectLayout(name));
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
  if (!hasPendingChanges() && !suggestionsUI.hasPending() && !generalNotesUI.hasPending() && !busy) return;
  event.preventDefault();
  event.returnValue = '';
});
const suggestionsUI = createSuggestionsUI({ isBusy: () => busy, setBusy, onStateChange: updateSaveState, isAcademicEditorOpen: () => $('editor').open || generalNotesUI.isOpen() });
const generalNotesUI = createGeneralNotesUI({
  isBusy: () => busy, setBusy, onStateChange: updateSaveState,
  otherEditorOpen: () => $('editor').open || $('suggestions-dialog').open,
  getTarget(scope) {
    if (!connection) return null;
    if (scope === 'unit') return activeEntry && draft && selectedEntry()?.path === activeEntry.path ? { ...activeEntry, title: draft.unit.title } : null;
    const module = catalog?.modules.find(item => item.code === $('module-select').value);
    return module ? { moduleCode: module.code, title: module.name } : null;
  },
});
const moduleViews = createModuleViews({
  getState: () => ({ module: catalog?.modules.find(item => item.code === activeEntry?.moduleCode), records: moduleRecords(), failures: moduleLoadFailures, errors: teachingTimeline.errors, ready: moduleContextReady, today: madridToday(), activePath: activeEntry?.path, busy }),
  onOpen: (path, sessionId) => openModuleSource(path, sessionId),
  onEdit: task => openModuleSource(task.entry.path, task.sessionId, task.activityId, true),
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && draft) { renderSessionBand(); moduleViews.render(); } });
setInterval(() => { if (draft && $('session-band').dataset.today !== madridToday()) { renderSessionBand(); moduleViews.render(); } }, 60000);
selectLayout('table');
updateSaveState();
