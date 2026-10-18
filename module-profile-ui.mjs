import { annualPlanRows, annualPlannedPeriods } from './module-profile.mjs?v=20261018-module-common';

export function createModuleProfileUI({ isBusy, setBusy, getConnection, getTarget, getRecords, otherEditorOpen }) {
  const $ = id => document.getElementById(id);
  const dialog = $('module-profile-dialog');
  let loaded = null, target = null, activeTab = 'plan';
  function node(tag, className, value) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (value !== undefined) el.textContent = String(value);
    return el;
  }
  function paragraph(parent, value, className = '') { if (value) parent.append(node('p', className, value)); }
  function list(parent, values) {
    const ul = node('ul'); values.forEach(value => ul.append(node('li', '', value))); parent.append(ul);
  }
  function selectTab(tab) {
    activeTab = tab;
    for (const name of ['plan', 'method', 'assessment']) {
      $('profile-' + name).hidden = name !== tab;
      $('profile-tab-' + name).setAttribute('aria-pressed', String(name === tab));
    }
  }
  function updateAvailability() {
    const module = getTarget();
    $('module-profile').disabled = isBusy() || !getConnection() || !module || otherEditorOpen();
    $('module-profile').title = module ? `Programación, metodología y calificación de ${module.code}` : 'Conecta y elige un módulo';
    $('profile-refresh').disabled = isBusy() || !target;
    $('profile-close').disabled = isBusy();
    for (const name of ['plan', 'method', 'assessment']) $('profile-tab-' + name).disabled = isBusy() || !loaded;
  }
  function renderPlan(profile) {
    const section = $('profile-plan'); section.replaceChildren();
    paragraph(section, `${profile.annualPlan.units.length} UT · ${annualPlannedPeriods(profile)} periodos lectivos previstos`, 'profile-summary');
    paragraph(section, 'Recorrido anual de referencia. Las sesiones, tareas, notas y confirmaciones actuales permanecen en los JSON de cada UT.', 'scope-note');
    paragraph(section, profile.annualPlan.referenceNote, 'scope-note');
    const scroll = node('div', 'profile-table-scroll');
    scroll.tabIndex = 0; scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', 'Recorrido anual del módulo');
    const table = node('table', 'profile-table');
    const head = node('thead'); const headings = node('tr');
    for (const title of ['Unidad', 'Periodos previstos', 'RA / CE', 'Detalle actual']) { const th = node('th', '', title); th.scope = 'col'; headings.append(th); }
    head.append(headings); table.append(head);
    const body = node('tbody');
    for (const { outline, entry, unit } of annualPlanRows(profile, target, getRecords())) {
      const tr = node('tr');
      const title = node('th'); title.scope = 'row';
      title.append(node('strong', '', outline.code), node('span', 'profile-unit-title', outline.title));
      tr.append(title, node('td', '', outline.plannedLoad.value));
      const curriculum = node('td');
      paragraph(curriculum, outline.curriculumRefs.map(ref => `RA${ref.raCode}`).join(', '));
      const ce = outline.curriculumRefs.flatMap(ref => ref.ceCodes ?? []);
      if (ce.length) paragraph(curriculum, ce.join(', '), 'scope-note');
      if (outline.curriculumNote) paragraph(curriculum, outline.curriculumNote, 'scope-note');
      if (outline.criteriaStatus === 'pending') paragraph(curriculum, 'CE pendientes de concretar', 'profile-pending');
      const detail = node('td');
      paragraph(detail, entry ? unit ? `${unit.sessions.length} sesiones en el JSON de la UT` : 'UT incorporada; detalle no leído en esta vista' : 'Pendiente de incorporar el detalle');
      if (unit?.unit.resourcePreparation) paragraph(detail, ['ppt', 'web', 'tasks', 'exam'].map((key, index) => `${['PPT', 'WEB', 'Tareas', 'Examen'][index]}: ${unit.unit.resourcePreparation[key] ?? 'Sin confirmar'}`).join(' · '), 'scope-note');
      tr.append(curriculum, detail); body.append(tr);
    }
    table.append(body); scroll.append(table); section.append(scroll);
    paragraph(section, 'Una UT sin detalle leído o incorporado no equivale a una UT no impartida. No se importan estados del respaldo.', 'scope-note');
    const details = node('details', 'profile-curriculum'); details.append(node('summary', '', 'Resultados de aprendizaje y criterios de evaluación'));
    for (const ra of profile.curriculum.outcomes) {
      const item = node('details'); item.append(node('summary', '', `RA${ra.code} · ${ra.text}`));
      list(item, ra.criteria.map(ce => `${ce.code}: ${ce.text}`)); details.append(item);
    }
    paragraph(details, profile.curriculum.sourceLabel, 'scope-note'); section.append(details);
  }
  function renderMethod(profile) {
    const section = $('profile-method'); section.replaceChildren();
    for (const part of profile.methodology) { section.append(node('h3', '', part.title)); paragraph(section, part.text); }
    if (profile.proposals?.length) {
      section.append(node('h3', '', 'Propuestas pendientes de aprobación'));
      list(section, profile.proposals.map(item => item.text));
      paragraph(section, 'No son cambios ya aplicados. Las mejoras anotadas en la app conservan su registro independiente.', 'scope-note');
    }
  }
  function renderAssessment(profile) {
    const section = $('profile-assessment'); section.replaceChildren();
    const grading = profile.assessment;
    for (const [key, title] of [['overall', 'Nota final del módulo'], ['unit', 'Dentro de cada UT'], ['finalProject', 'Proyecto final']]) {
      section.append(node('h3', '', title));
      list(section, grading[key].components.map(c => `${new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 1 }).format(c.weight)} ${c.label}`));
    }
    paragraph(section, grading.examGuidance.text);
    paragraph(section, grading.unit.scopeNote, 'scope-note');
    section.append(node('h3', '', 'Evaluaciones y superación'));
    paragraph(section, grading.evaluation.text); paragraph(section, grading.passing.text);
    paragraph(section, grading.learningOutcomeWeights.status === 'pending' ? 'Ponderaciones de RA pendientes del documento oficial. No se presuponen pesos iguales ni se calculan notas.' : 'Ponderaciones de RA confirmadas. Esta vista no almacena notas del alumnado.', 'profile-pending');
    paragraph(section, grading.passing.scopeNote, 'scope-note');
    section.append(node('h3', '', 'Exámenes y recuperaciones')); paragraph(section, grading.recovery.text);
    section.append(node('h3', '', 'Rúbrica de tareas')); list(section, grading.rubric.levels.map(level => `${level.grade}: ${level.text}`));
    paragraph(section, grading.rubric.exception);
    section.append(node('h3', '', 'Pendiente de completar'));
    list(section, profile.pending.map(item => `${item.title}: ${item.detail}`));
    paragraph(section, 'La configuración real del calificador de Aula Virtual no se ha comprobado en esta incorporación. No hay sincronización ni publicación automática.', 'scope-note');
  }
  async function load() {
    if (!target || !getConnection() || isBusy()) return;
    setBusy(true);
    const message = $('profile-message'); message.textContent = 'Leyendo la información general de GitHub…'; message.className = 'message'; message.hidden = false;
    // A failed refresh does not leave an older version displayed as current.
    loaded = null;
    for (const name of ['plan', 'method', 'assessment']) $('profile-' + name).replaceChildren();
    try {
      if (!target.profile) {
        message.textContent = 'La información general de este módulo está pendiente de incorporar. Sus UT y tareas no se han modificado.'; return;
      }
      loaded = await getConnection().loadModuleProfile(target);
      renderPlan(loaded.document); renderMethod(loaded.document); renderAssessment(loaded.document);
      $('profile-version').textContent = `Versión leída: ${loaded.sha.slice(0, 8)} · Consulta de solo lectura`;
      message.hidden = true; selectTab(activeTab);
    } catch {
      loaded = null;
      for (const name of ['plan', 'method', 'assessment']) $('profile-' + name).replaceChildren();
      message.textContent = 'No se ha podido leer la información general. Pulsa Actualizar para reintentar. El seguimiento y los borradores de la UT siguen intactos.';
      message.className = 'message error'; $('profile-version').textContent = '';
    } finally { setBusy(false); updateAvailability(); }
  }
  async function open() {
    if (isBusy() || !getConnection() || otherEditorOpen()) return;
    const module = getTarget(); if (!module) return;
    target = structuredClone(module); loaded = null; activeTab = 'plan';
    $('profile-title').textContent = `${module.code} · Información del módulo`;
    $('profile-context').textContent = module.name;
    $('profile-version').textContent = '';
    selectTab('plan'); dialog.showModal(); await load();
  }
  function close() { if (!isBusy()) dialog.close(); }
  $('module-profile').addEventListener('click', open);
  $('profile-close').addEventListener('click', close);
  $('profile-refresh').addEventListener('click', load);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  for (const name of ['plan', 'method', 'assessment']) $('profile-tab-' + name).addEventListener('click', () => selectTab(name));
  return { updateAvailability, isOpen: () => dialog.open, disconnect() {
    dialog.close(); loaded = null; target = null;
    for (const name of ['plan', 'method', 'assessment']) $('profile-' + name).replaceChildren();
    ['profile-title', 'profile-context', 'profile-message', 'profile-version'].forEach(id => { $(id).textContent = ''; });
  } };
}
