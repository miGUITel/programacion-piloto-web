// Resource references share the unit JSON. They never imply preparation or delivery.
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const own = (value, key) => Object.hasOwn(value, key);
export const resourceTypes = Object.freeze({ assignment: 'Enunciado', guide: 'Ficha docente', presentation: 'PPT', web: 'Web', tool: 'Herramienta o entorno', notes: 'Apuntes', example: 'Ejemplo', exam: 'Examen', solution: 'Solución', moodle: 'Aula Virtual', other: 'Otro recurso' });
export const isCommonTeachingResource = resource => ['presentation', 'web', 'notes'].includes(resource?.type);
export const commonSessionResourceRefs = (document, session) => session.useCommonResources === false ? [] : (document.unit?.commonResourceRefs ?? []);

export function validateCommonPreparationResources(document, errors) {
  if (object(document.unit) && own(document.unit, 'commonResourceRefs')) {
    const refs = document.unit.commonResourceRefs;
    const resources = Array.isArray(document.resources) ? document.resources : [];
    if (!Array.isArray(refs) || new Set(refs).size !== refs.length || refs.some(id => !text(id) || !resources.some(r => r?.id === id && isCommonTeachingResource(r)))) {
      errors.push('unit.commonResourceRefs: indica referencias únicas a PPT, Web o apuntes de la unidad.');
    }
  }
  if (Array.isArray(document.sessions)) document.sessions.forEach((session, index) => {
    if (object(session) && own(session, 'useCommonResources') && typeof session.useCommonResources !== 'boolean') errors.push(`sessions[${index}].useCommonResources: debe ser booleano.`);
  });
}
export const moduleResourcePath = code => ['LM','SR','ED','PRO','SOS'].includes(code) ? `${code}/resources.json` : null;
// These are explicit module destinations, never associations inferred from titles.
export function modulePresentationFolder(resources = []) {
  const matches = resources.filter(resource => resource?.type === 'presentation' && resource.role === 'presentation-folder'
    && resource.audience !== 'teacher' && resource.location?.kind === 'https' && resource.location.public === true
    && safeResourceUrl(resource.location.url, true));
  return matches.length === 1 ? matches[0] : null;
}
export function modulePublishedWebRoot(resources = []) {
  const matches = resources.filter(resource => resource?.type === 'web' && resource.role === 'published-web-root'
    && resource.location?.kind === 'https' && safeResourceUrl(resource.location.url, resource.location.public === true));
  if (matches.length !== 1) return null;
  try { const url = new URL(matches[0].location.url); return url.hostname === 'miguitel.github.io' && !url.search && !url.hash && url.pathname.endsWith('/') ? url.href : null; }
  catch { return null; }
}
export function modulePublishedRepository(resources = []) {
  const matches = resources.filter(resource => resource?.role === 'published-web-root' && resource.type === 'web');
  const repository = matches.length === 1 ? matches[0].repository : null;
  return typeof repository === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
    && !repository.split('/').some(part => part === '.' || part === '..') ? repository : null;
}
export function effectiveResourceDestination(resource, moduleResources = []) {
  if (resource?.type !== 'presentation' || resource.location?.kind === 'github') return resource;
  const folder = modulePresentationFolder(moduleResources);
  return folder ? { ...resource, title: folder.title, location: { ...folder.location }, moduleFolderId: folder.id } : resource;
}
export function effectiveResourceDestinations(resources = [], moduleResources = []) {
  const seen = new Set();
  return resources.map(resource => effectiveResourceDestination(resource, moduleResources)).filter(resource => {
    if (!resource.moduleFolderId) return true;
    if (seen.has(resource.moduleFolderId)) return false;
    seen.add(resource.moduleFolderId); return true;
  });
}
export function safeResourceUrl(value, publicSharing = false) {
  try {
    const url = new URL(value), sensitive = /^(?:access_token|refresh_token|token|auth|authorization|password|secret|session(?:id|key)?|sesskey|sid|api[-_]?key|code|signature|sig)$/i;
    if (url.protocol !== 'https:' || url.username || url.password || [...url.searchParams.keys()].some(key => sensitive.test(key)) || /(?:^|[&#?])(?:access_token|token|sessionid|sesskey|password|secret)=/i.test(url.hash.slice(1))) return false;
    return !/(^|\.)(?:1drv\.ms|onedrive\.live\.com|sharepoint\.com)$/i.test(url.hostname) || publicSharing === true;
  } catch { return false; }
}
export function validGithubLocation(location) {
  return object(location) && location.kind === 'github' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(location.repository || '')
    && !location.repository.split('/').some(part => part === '.' || part === '..')
    && (location.ref === undefined || location.ref === 'main') && text(location.path) && !/[\\\x00-\x1f?#]/.test(location.path)
    && !location.path.split('/').some(part => !part || part === '.' || part === '..') && /\.(?:md|markdown|txt)$/i.test(location.path);
}
export function parsePrivateLocation(value) {
  let path = value.trim(), repository = 'miGUITel/programacion-piloto-datos';
  if (/^https:/i.test(path)) {
    const url = new URL(path), parts = url.pathname.split('/').slice(1);
    if (url.hostname !== 'github.com' || url.username || url.password || url.search || url.hash || parts[2] !== 'blob' || parts[3] !== 'main') throw new Error('Usa una ruta de Markdown del repositorio de datos o su enlace de GitHub en la rama main.');
    repository = parts.slice(0,2).join('/'); path = parts.slice(4).map(decodeURIComponent).join('/');
  }
  const location = { kind: 'github', repository, path, ref: 'main' };
  if (!validGithubLocation(location)) throw new Error('La ficha necesita una ruta relativa a un archivo .md o un enlace privado de GitHub en main.');
  return location;
}
export function locationInput(location) {
  if (location?.kind === 'https') return location.url;
  if (location?.kind === 'github') return location.repository === 'miGUITel/programacion-piloto-datos' ? location.path : `https://github.com/${location.repository}/blob/main/${location.path.split('/').map(encodeURIComponent).join('/')}`;
  return location?.path || '';
}
export function validateResources(resources, errors = [], prefix = 'resources') {
  if (resources === undefined) return errors;
  if (!Array.isArray(resources)) { errors.push(`${prefix}: debe ser una lista.`); return errors; }
  const ids = new Set();
  resources.forEach((resource, index) => {
    const path = `${prefix}[${index}]`;
    if (!object(resource)) { errors.push(`${path}: recurso no válido.`); return; }
    if (!text(resource.id) || ids.has(resource.id)) errors.push(`${path}.id: identificador no válido o duplicado.`); ids.add(resource.id);
    if (!text(resource.title) || !own(resourceTypes, resource.type)) errors.push(`${path}: título y tipo requeridos.`);
    if (own(resource, 'exampleKind') && (resource.type !== 'example' || !['guided','original'].includes(resource.exampleKind))) errors.push(`${path}.exampleKind: guided u original solo corresponde a un ejemplo.`);
    if (own(resource, 'role') && (!['presentation-folder','published-web-root'].includes(resource.role)
      || resource.role === 'presentation-folder' && resource.type !== 'presentation'
      || resource.role === 'published-web-root' && resource.type !== 'web')) errors.push(`${path}.role: destino común de PPT o Web no válido.`);
    if (own(resource, 'examPart') && (resource.type !== 'exam' || !['test','practical'].includes(resource.examPart))) errors.push(`${path}.examPart: Test o Práctico solo corresponde a un recurso de examen.`);
    if (own(resource, 'audience') && !['students','teacher','both'].includes(resource.audience)) errors.push(`${path}.audience: destinatario no válido.`);
    for (const field of ['description','version']) if (own(resource, field) && typeof resource[field] !== 'string') errors.push(`${path}.${field}: texto requerido.`);
    if (own(resource, 'location')) {
      const location = resource.location;
      const local = object(location) && location.kind === 'workspace' && text(location.path) && !/^(?:[a-z]:|[/\\])/i.test(location.path) && !location.path.split(/[/\\]/).some(part => part === '..');
      const https = object(location) && location.kind === 'https' && safeResourceUrl(location.url, location.public === true);
      if (!(local || https || validGithubLocation(location))) errors.push(`${path}.location: ubicación no válida; OneDrive requiere enlace público confirmado.`);
      if (location?.kind === 'github' && resource.audience !== 'teacher') errors.push(`${path}: la lectura privada requiere destinatario docente.`);
    }
  });
  return errors;
}
export function validateModuleResources(document, code) {
  const errors = [];
  if (!object(document) || document.kind !== 'module-resources' || document.schemaVersion !== 1 || document.moduleCode !== code || !moduleResourcePath(code)) return ['Registro de recursos del módulo no válido.'];
  validateResources(document.resources, errors);
  if (!Array.isArray(document.resources) || document.resources.some(r => !['presentation','web'].includes(r?.type))) errors.push('Los enlaces comunes del módulo admiten PPT y Web.');
  for (const role of ['presentation-folder','published-web-root']) {
    const matches = (Array.isArray(document.resources) ? document.resources : []).filter(resource => resource?.role === role);
    if (matches.length > 1) errors.push('Cada destino común de PPT o Web debe tener una única referencia.');
    if (matches.length === 1 && (role === 'presentation-folder' ? !modulePresentationFolder(matches) : !modulePublishedWebRoot(matches) || !modulePublishedRepository(matches))) errors.push('El destino común requiere un enlace público válido y confirmado y, para Web, su repositorio explícito.');
  }
  return errors;
}
export class ResourceEditError extends Error { constructor(code, message) { super(message); this.code = code; } }
const fail = (code, message) => { throw new ResourceEditError(code, message); };
export function resourceValues(document) {
  return { resources: structuredClone(document.resources ?? []), taskRefs: Object.fromEntries((document.tasks ?? []).map(task => [task.id, structuredClone(task.resourceRefs ?? [])])) };
}
export function assertResourceRead(loaded, entry, active) {
  if (!loaded?.sha || loaded.document?.unit?.id !== entry.unitId || loaded.document?.module?.code !== entry.moduleCode) fail('RESOURCE_STALE', 'No se ha podido comprobar la unidad de origen.');
  if (!active || active.path !== entry.path || active.blocked || active.sha !== loaded.sha || !equal(active.savedDocument, loaded.document)) fail('RESOURCE_STALE', 'La unidad y GitHub tienen versiones distintas o un guardado pendiente de revisar. Conserva sus notas y revisa la unidad.');
}
export function prepareResourceSave(loaded, entry, values, active) {
  assertResourceRead(loaded, entry, active);
  if (validateResources(values.resources).length) fail('RESOURCE_INVALID', 'Revisa los títulos, tipos y enlaces de los recursos.');
  const before = resourceValues(loaded.document), document = structuredClone(loaded.document), unitDraft = structuredClone(active.draft);
  if (!equal(before.resources, values.resources)) {
    if (!equal(active.draft.resources, loaded.document.resources)) fail('RESOURCE_LOCAL_CONFLICT', 'Hay otros cambios de recursos en Unidad. Conserva ambos borradores y revísalos.');
    document.resources = structuredClone(values.resources); unitDraft.resources = structuredClone(values.resources);
  }
  const ids = new Set(values.resources.map(r => r.id));
  const commonIssues = [];
  for (const candidate of [document, unitDraft]) validateCommonPreparationResources(candidate, commonIssues);
  if (commonIssues.length) fail('RESOURCE_IN_USE', 'Un material común sigue vinculado. Revisa la selección en Preparación antes de eliminarlo o cambiar su tipo.');
  const references = [document.unit, ...document.sessions.flatMap(session => [session, ...session.activities])];
  if (references.some(item => item.resourceRefs?.some(id => !ids.has(id)))) fail('RESOURCE_IN_USE', 'Un recurso eliminado sigue vinculado a una sesión o actividad. Revisa esas referencias antes de retirarlo.');
  if (!equal(Object.keys(values.taskRefs).sort(), Object.keys(before.taskRefs).sort())) fail('RESOURCE_INVALID', 'La lista de tareas ha cambiado. Conserva el borrador y revisa la unidad.');
  for (const task of document.tasks ?? []) {
    const refs = values.taskRefs[task.id], local = unitDraft.tasks?.find(t => t.id === task.id);
    if (!Array.isArray(refs) || new Set(refs).size !== refs.length || refs.some(id => !ids.has(id))) fail('RESOURCE_INVALID', 'Hay una referencia de tarea no válida.');
    if (equal(refs, before.taskRefs[task.id])) continue;
    if (!local || !equal(local.resourceRefs, task.resourceRefs)) fail('RESOURCE_LOCAL_CONFLICT', 'Hay cambios distintos en los recursos de esta tarea. Conserva ambos borradores.');
    task.resourceRefs = structuredClone(refs); local.resourceRefs = structuredClone(refs);
  }
  return { document, unitDraft };
}
// Explicit interval references select its resources; task bundles remain a legacy fallback.
// Never infer associations from titles or copy the whole bundle over an explicit selection.
export function rowResources(document, session, activity, records = []) {
  const sources = new Map(), unresolved = new Set();
  const add = (owner, refs) => {
    for (const id of refs ?? []) {
      const resource = (owner.resources ?? []).find(item => item.id === id);
      const key = `${owner.unit?.id ?? ''}:${id}`;
      if (resource) sources.set(key, resource); else unresolved.add(key);
    }
  };
  add(document, activity?.resourceRefs);
  if (session.activities?.[0]?.id === activity?.id) {
    add(document, session.resourceRefs);
    add(document, commonSessionResourceRefs(document, session));
  }
  if (own(activity ?? {}, 'resourceRefs')) return { resources: [...sources.values()], unresolved: [...unresolved] };
  for (const { document: owner } of [{ document }, ...records.filter(record => record.document !== document && record.document.module?.code === document.module?.code)]) {
    for (const task of owner.tasks ?? []) {
      const presents = owner.unit?.id === document.unit?.id && task.presentation?.sessionId === session.id
        && (task.presentation.activityId ? task.presentation.activityId === activity?.id : session.activities?.[0]?.id === activity?.id);
      if (presents || activity?.taskRefs?.includes(task.id)) add(owner, task.resourceRefs);
    }
  }
  return { resources: [...sources.values()], unresolved: [...unresolved] };
}
