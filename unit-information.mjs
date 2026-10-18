// Read-only academic context. No inference, conversion or write of a loaded document.
const text = value => typeof value === 'string' && value.trim() ? value : '';
const array = value => Array.isArray(value) ? value : [];
const raLabel = code => /^RA/i.test(code) ? code : `RA${code}`;
export function curriculumLines(value = {}) {
  const lines = [];
  if (value.curriculumContext) lines.push([value.curriculumContext.raLabel, value.curriculumContext.ceLabel].filter(text).join(' · '));
  for (const ref of array(value.curriculumRefs).filter(ref => ref && typeof ref === 'object')) {
    lines.push([text(ref.raCode) && raLabel(ref.raCode), ref.description, array(ref.ceCodes).join(', ')].filter(text).join(' · '));
    for (const ce of array(ref.criteria).filter(ce => ce && typeof ce === 'object')) lines.push(`${ce.code}: ${ce.description ?? ce.text ?? ''}`);
  }
  if (value.curriculumNote) lines.push(value.curriculumNote);
  if (value.criteriaStatus === 'pending') lines.push('Criterios de evaluación pendientes de concretar.');
  return lines.filter(text);
}
export function unitInformationSections(document) {
  const unit = document.unit, sections = [];
  const add = (title, lines) => { const content = lines.filter(text); if (content.length) sections.push({ title, lines: content }); };
  add('Diseño de la unidad', [unit.notes, unit.methodologyNotes, ...array(unit.objectives), ...array(unit.contents)]);
  const load = unit.plannedLoad;
  const planning = [];
  if (load) planning.push(`Carga de referencia: ${load.value} ${{ teachingPeriod: 'periodos lectivos', minute: 'minutos', clockHour: 'horas de reloj' }[load.unit] ?? load.unit}.`);
  if (unit.planningStatus) planning.push(({ 'pending-planning': 'Planificación de sesiones pendiente.', 'pending-review': 'Planificación pendiente de revisión.' })[unit.planningStatus] ?? unit.planningStatus);
  if (unit.planningWindow) planning.push(`Intervalo de referencia${unit.planningWindow.status === 'provisional-reference' ? ' provisional' : ''}: ${unit.planningWindow.startOn} – ${unit.planningWindow.endOn}. Las fechas vigentes se consultan en las sesiones.`);
  add('Referencia de planificación', planning);
  add('Resultados de aprendizaje y criterios', curriculumLines(unit));
  if (unit.cycleContext) add('Contexto del ciclo', [unit.cycleContext.raTopic, unit.cycleContext.transversalTopic, unit.cycleContext.methodologyNotes]);
  for (const deferred of array(unit.deferredPlanning).filter(item => item && typeof item === 'object')) {
    add('Contenido pendiente de ubicar', [deferred.reason, ...array(deferred.activities).filter(a => a && typeof a === 'object').flatMap(a => [a.title, a.planned,
      ...['observations', 'improvements', 'realized', 'pending'].filter(k => text(a[k])).map(k => `${{ observations: 'Observaciones', improvements: 'Mejoras', realized: 'Realizado', pending: 'Pendiente' }[k]}: ${a[k]}`)])]);
  }
  add('Referencias de materiales', array(document.resources).filter(r => r && typeof r === 'object').map(resource => [resource.title, resource.location?.path ?? resource.location?.url, resource.notes].filter(text).join(' · ')));
  return sections;
}
export function sessionInformationLines(session) {
  return [session.curriculumLabel && `RA / CE: ${session.curriculumLabel}`, session.resourceNotes && `Materiales: ${session.resourceNotes}`,
    session.preparationNotes && `Preparación: ${session.preparationNotes}`, ...curriculumLines(session)].filter(text);
}
function node(tag, value) { const element = document.createElement(tag); if (value) element.textContent = value; return element; }
export function renderUnitInformation(container, document, opener) {
  if (container.open && container.dataset.unitId !== document.unit.id) container.close();
  container.dataset.unitId = document.unit.id;
  const content = container.querySelector('.unit-information-content'); content.replaceChildren();
  const sections = unitInformationSections(document);
  opener.hidden = !sections.length;
  container.hidden = !sections.length;
  if (!sections.length) { if (container.open) container.close(); return; }
  container.querySelector('#unit-information-context').textContent = `${document.module.code} · ${document.unit.code} · ${document.unit.title}`;
  opener.title = `Información de ${document.module.code} · ${document.unit.code}`;
  opener.setAttribute('aria-label', `${opener.title}: diseño, referencias y notas`);
  for (const section of sections) {
    content.append(node('h3', section.title));
    for (const line of section.lines) content.append(node('p', line));
  }
}
