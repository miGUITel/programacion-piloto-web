// Structural contract only. Validation never fills, converts or saves data.
const own = (value, key) => Object.hasOwn(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
export const officialCode = value => text(value) && !/[\r\n]/.test(value);

function textList(value, path, errors, unique = false) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string') || (unique && (value.some(item => !text(item)) || new Set(value).size !== value.length))) errors.push(`${path}: lista de textos${unique ? ' no vacíos y sin duplicados' : ''} requerida.`);
}
function optionalList(value, field, path, errors, unique = true) {
  if (own(value, field)) textList(value[field], `${path}.${field}`, errors, unique);
}
function curriculum(value, path, errors) {
  if (!own(value, 'curriculumRefs')) return;
  if (!Array.isArray(value.curriculumRefs)) { errors.push(`${path}.curriculumRefs: debe ser una lista.`); return; }
  value.curriculumRefs.forEach((ref, index) => {
    if (!object(ref) || !text(ref.raCode)) { errors.push(`${path}.curriculumRefs[${index}]: RA no válido.`); return; }
    optionalList(ref, 'ceCodes', `${path}.curriculumRefs[${index}]`, errors);
  });
}
export function validateExtendedTask(task, path, errors, isValidDate) {
  if (!['task', 'exam'].includes(task.type)) errors.push(`${path}.type: task o exam obligatorio.`);
  if (!officialCode(task.code)) errors.push(`${path}.code: texto oficial no vacío, sin saltos de línea.`);
  if (own(task, 'approved') && typeof task.approved !== 'boolean') errors.push(`${path}.approved: debe ser booleano.`);
  if (own(task, 'announcement') && (task.type !== 'exam' || !object(task.announcement) || own(task.announcement, 'examDate') && !isValidDate(task.announcement.examDate))) errors.push(`${path}.announcement: solo un examen admite una fecha de aviso válida.`);
  if (own(task, 'presentation') && (!object(task.presentation) || !text(task.presentation.sessionId) || (own(task.presentation, 'activityId') && !text(task.presentation.activityId)))) errors.push(`${path}.presentation: referencia prevista no válida.`);
  optionalList(task, 'resourceRefs', path, errors); curriculum(task, path, errors);
}

export function validateV3Document(doc, errors) {
  if (!object(doc.unit)) return;
  const unit = doc.unit;
  for (const field of ['label', 'methodologyNotes', 'notes']) if (own(unit, field) && typeof unit[field] !== 'string') errors.push(`unit.${field}: debe ser texto.`);
  if (own(unit, 'kind') && !['unit', 'block', 'cycle'].includes(unit.kind)) errors.push('unit.kind: unit, block o cycle requerido.');
  for (const field of ['objectives', 'contents']) optionalList(unit, field, 'unit', errors, false);
  if (own(unit, 'plannedLoad') && (!object(unit.plannedLoad) || !Number.isFinite(unit.plannedLoad.value) || unit.plannedLoad.value < 0 || !['teachingPeriod', 'minute', 'clockHour'].includes(unit.plannedLoad.unit))) errors.push('unit.plannedLoad: número no negativo y unidad de medida explícita requeridos.');
  if (own(unit, 'resourcePreparation')) {
    if (!object(unit.resourcePreparation)) errors.push('unit.resourcePreparation: debe ser un objeto.');
    else for (const field of ['ppt', 'web', 'tasks', 'exam']) if (own(unit.resourcePreparation, field) && !['Sin mirar', 'En proceso', 'Listo'].includes(unit.resourcePreparation[field])) errors.push(`unit.resourcePreparation.${field}: estado de preparación no válido.`);
  }
  if (unit.preparation === 'ready' && !Array.isArray(doc.tasks)) errors.push('tasks: una UT preparada requiere su lista oficial revisada, aunque esté vacía.');
  const resources = new Set();
  if (own(doc, 'resources')) {
    if (!Array.isArray(doc.resources)) errors.push('resources: debe ser una lista.');
    else doc.resources.forEach((resource, index) => {
      const path = `resources[${index}]`;
      if (!object(resource)) { errors.push(`${path}: debe ser un objeto.`); return; }
      if (!text(resource.id) || resources.has(resource.id)) errors.push(`${path}.id: identificador no válido o duplicado.`);
      resources.add(resource.id);
      if (!text(resource.title) || !['presentation', 'notes', 'example', 'assignment', 'exam', 'solution', 'guide', 'moodle', 'other'].includes(resource.type)) errors.push(`${path}: título y tipo de recurso requeridos.`);
      if (own(resource, 'audience') && !['students', 'teacher', 'both'].includes(resource.audience)) errors.push(`${path}.audience: destinatario no válido.`);
      if (own(resource, 'location')) {
        const location = resource.location;
        let valid = false;
        if (object(location) && location.kind === 'workspace') valid = text(location.path) && !/^(?:[a-z]:|[/\\])/i.test(location.path) && !location.path.split(/[/\\]/).some(part => part === '..');
        if (object(location) && location.kind === 'https') {
          try {
            const url = new URL(location.url);
            const sensitive = /^(?:access_token|refresh_token|token|auth|authorization|password|secret|session(?:id|key)?|sesskey|sid|api[-_]?key|code|signature|sig)$/i;
            valid = url.protocol === 'https:' && !url.username && !url.password && ![...url.searchParams.keys()].some(key => sensitive.test(key))
              && !/(?:^|[&#?])(?:access_token|token|sessionid|sesskey|password|secret)=/i.test(url.hash.slice(1))
              && !/(^|\.)(?:1drv\.ms|onedrive\.live\.com|sharepoint\.com)$/i.test(url.hostname);
          } catch { /* Invalid URL. */ }
        }
        if (!valid) errors.push(`${path}.location: ruta relativa o enlace HTTPS confirmado sin credenciales ni parámetros de sesión requerido.`);
      }
    });
  }
  function refs(value, path) {
    if (!object(value)) return;
    curriculum(value, path, errors); optionalList(value, 'resourceRefs', path, errors);
    if (Array.isArray(value.resourceRefs)) for (const id of value.resourceRefs) if (!resources.has(id)) errors.push(`${path}.resourceRefs: recurso no definido: ${id}.`);
  }
  refs(unit, 'unit');
  (Array.isArray(doc.sessions) ? doc.sessions : []).forEach((session, index) => {
    if (!object(session)) return;
    const path = `sessions[${index}]`; refs(session, path);
    if (own(session, 'preparation') && !['draft', 'ready'].includes(session.preparation)) errors.push(`${path}.preparation: draft o ready requerido.`);
    (Array.isArray(session.activities) ? session.activities : []).forEach((activity, n) => {
      if (!object(activity)) return;
      refs(activity, `${path}.activities[${n}]`); optionalList(activity, 'taskRefs', `${path}.activities[${n}]`, errors);
    });
  });
  (Array.isArray(doc.tasks) ? doc.tasks : []).forEach((task, index) => refs(task, `tasks[${index}]`));
}

/** Across-file checks require the actual loaded scope; an ID is never a title match. */
export function libraryIntegrity(records) {
  const issues = [], identities = new Map(), units = new Set();
  for (const record of records) {
    const { entry, document, registry } = record;
    if (!registry) units.add(`${entry.moduleCode}:${document.unit.code}`);
    for (const task of document.tasks ?? []) {
      const key = JSON.stringify([entry.moduleCode, task.id]);
      if (identities.has(key)) issues.push({ code: 'DUPLICATE_TASK', moduleCode: entry.moduleCode, taskId: task.id, paths: [identities.get(key).entry.path, entry.path] });
      else identities.set(key, record);
    }
  }
  for (const { entry, document, registry } of records) {
    if (registry) {
      for (const task of document.tasks ?? []) if (units.has(`${entry.moduleCode}:${task.unitCode}`)) issues.push({ code: 'HISTORIC_UNIT_IMPORTED', path: entry.path, taskId: task.id, unitCode: task.unitCode });
      continue;
    }
    if (document.schemaVersion === 3) for (const session of document.sessions ?? []) for (const activity of session.activities ?? []) for (const id of Array.isArray(activity.taskRefs) ? activity.taskRefs : []) if (!identities.has(JSON.stringify([entry.moduleCode, id]))) issues.push({ code: 'UNRESOLVED_TASK', path: entry.path, activityId: activity.id, taskId: id });
  }
  return issues;
}
