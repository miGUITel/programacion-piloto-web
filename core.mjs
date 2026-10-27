import { validateResources, validateModuleResources, moduleResourcePath, validGithubLocation } from './resources.mjs?v=20261027-rf32';
import { officialCode, validateExtendedTask, validateV3Document } from './model-v3.mjs?v=20261027-rf32';
import { moduleProfilePath, validateModuleProfile } from './module-profile.mjs?v=20261027-rf32';
import { commonCoursePath, validateCommonCourse } from './common-course.mjs?v=20261027-rf32';

import { validatePlanningChanges } from './replanning.mjs?v=20261027-rf32';

const OWNER = 'miGUITel';
const REPOSITORY = 'programacion-piloto-datos';
const BRANCH = 'main';
const CONTENTS_ENDPOINT = `https://api.github.com/repos/${OWNER}/${REPOSITORY}/contents/`;
const DEFAULT_ENTRY = Object.freeze({ moduleCode: 'LM', unitCode: 'UT02', unitId: 'LM-UT02', path: 'LM/UT02.json' });
const MODULE_CODES = new Set(['LM', 'SR', 'SOS', 'ED', 'PRO']);
const ENTRY_KEYS = new Set(['moduleCode', 'unitCode', 'unitId', 'path']);
const STATES = new Set(['', 'Impartida', 'Reprogramada', 'Cancelada']);
const TEXT_FIELDS = ['title', 'planned', 'observations', 'improvements', 'realized', 'pending'];

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string';
const nonemptyText = value => isText(value) && value.trim().length > 0;
const positiveInteger = value => Number.isInteger(value) && value > 0;
const isUnitCode = value => isText(value) && value === value.trim() && /^(?:UT|RA|B)\d{1,3}[A-Z]?$/.test(value);
const isArchivePath = value => isText(value)
  && /^(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*\.json$/.test(value)
  && !value.split('/').some(part => part === '.' || part === '..');

export class ApiError extends Error {
  constructor(message, { status = null, code = 'API_ERROR', errors = [] } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

export class ConflictError extends ApiError {
  constructor() {
    super('El archivo ha cambiado en GitHub. Conserva tu borrador y vuelve a leerlo antes de decidir qué guardar.', { status: 409, code: 'CONFLICT' });
    this.name = 'ConflictError';
    this.requiresReload = true;
  }
}

export class UnknownSaveError extends ApiError {
  constructor(reason = 'unknown', status = null) {
    super('No se puede confirmar si GitHub guardó el cambio. Conserva tu borrador y vuelve a leer el archivo antes de guardar otra vez.', { status, code: 'SAVE_UNKNOWN' });
    this.name = 'UnknownSaveError';
    this.reason = reason;
    this.requiresReload = true;
  }
}

/** UI-safe save feedback: never echo exception messages or response bodies. */
export function saveErrorFeedback(error) {
  if (error instanceof ConflictError) return {
    code: 'CONFLICT', kind: 'warning', requiresReload: true,
    message: 'GitHub contiene cambios posteriores a la versión que abriste. No se ha sobrescrito. Tu borrador sigue aquí: descárgalo antes de actualizar y revisar las diferencias.',
  };
  if (error instanceof UnknownSaveError) return {
    code: 'SAVE_UNKNOWN', kind: 'warning', requiresReload: true,
    message: 'No se puede confirmar si GitHub recibió el guardado. El borrador se conserva y el reenvío queda bloqueado. Descárgalo y actualiza para comprobar la versión remota antes de continuar.',
  };
  const explanations = new Map([
    ['HTTP_401', 'GitHub no acepta el token para guardar. Comprueba que siga vigente. Antes de desconectar, descarga el borrador para conservar tus cambios.'],
    ['HTTP_403', 'GitHub ha denegado el guardado. Leer el archivo no acredita permiso para escribir: comprueba Contents: lectura y escritura en el repositorio de datos. También puede deberse a límites de uso o restricciones del repositorio.'],
    ['HTTP_404', 'GitHub no permite encontrar el archivo al guardar. Comprueba que el token tenga acceso a programacion-piloto-datos y permiso Contents: lectura y escritura.'],
    ['HTTP_422', 'GitHub ha rechazado la actualización. Hay que revisar los datos enviados y las reglas del repositorio; cambiar el token no garantiza resolverlo.'],
    ['HTTP_429', 'GitHub ha limitado temporalmente las peticiones. Conserva el borrador y espera antes de volver a intentarlo.'],
    ['INVALID_DOCUMENT', 'El borrador no supera la validación y no se ha enviado. Descárgalo para revisar el formato.'],
    ['MISSING_SHA', 'Falta la versión original del archivo. Descarga el borrador antes de actualizar y revisar las diferencias.'],
  ]);
  const code = explanations.has(error?.code) ? error.code : 'SAVE_ERROR';
  return {
    code, kind: 'error', requiresReload: false,
    message: `${explanations.get(code) ?? 'No se ha podido guardar por un error inesperado.'} El borrador se conserva. No se ha realizado ningún reintento automático.`,
  };
}

export function isValidDate(value) {
  if (!isText(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function validateTaskMetadata(target, path, errors) {
  if (!Object.hasOwn(target, 'task')) return;
  const task = target.task;
  if (!task || typeof task !== 'object' || Array.isArray(task)) { errors.push(`${path}.task: debe ser un objeto.`); return; }
  for (const field of ['publishedOn', 'presentedOn', 'dueOn', 'correctBy']) {
    if (Object.hasOwn(task, field) && !isValidDate(task[field])) errors.push(`${path}.task.${field}: fecha no válida.`);
  }
  if (Object.hasOwn(task, 'corrected') && typeof task.corrected !== 'boolean') errors.push(`${path}.task.corrected: debe ser booleano.`);
}

export function timeToMinutes(value) {
  if (!isText(value) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

function validateJson(value, path, errors, ancestors = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || value === undefined) {
    errors.push(`${path}: debe contener únicamente valores JSON.`);
    return;
  }
  if (ancestors.has(value)) {
    errors.push(`${path}: contiene una referencia circular.`);
    return;
  }
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    errors.push(`${path}: debe ser un objeto JSON simple.`);
    return;
  }
  ancestors.add(value);
  for (const [key, child] of Object.entries(value)) validateJson(child, `${path}.${key}`, errors, ancestors);
  ancestors.delete(value);
}

/** A document target is a copied identity, never a caller-supplied URL/repository. */
function validateEntry(entry) {
  const errors = [];
  if (!isObject(entry)) return ['El destino debe ser un objeto.'];
  validateJson(entry, 'destination', errors);
  if (Object.keys(entry).some(key => !ENTRY_KEYS.has(key))) errors.push('destination: solo admite moduleCode, unitCode, unitId y path.');
  if (!MODULE_CODES.has(entry.moduleCode)) errors.push('destination.moduleCode: módulo no admitido.');
  if (!isUnitCode(entry.unitCode)) errors.push('destination.unitCode: código de unidad no válido.');
  if (entry.unitId !== `${entry.moduleCode}-${entry.unitCode}`) errors.push('destination.unitId: debe coincidir con el módulo y la unidad.');
  if (entry.path !== `${entry.moduleCode}/${entry.unitCode}.json`) errors.push('destination.path: debe ser MÓDULO/UNIDAD.json y coincidir con la identidad.');
  return errors;
}

/** Private discovery data; empty unit lists represent modules not yet imported. */
export function validateCatalog(catalog) {
  const errors = [];
  if (!isObject(catalog)) return ['El catálogo debe ser un objeto JSON.'];
  validateJson(catalog, 'catalog', errors);
  if (catalog.schemaVersion !== 1) errors.push('catalog.schemaVersion: debe ser 1.');
  if (Object.hasOwn(catalog, 'courseId') && !nonemptyText(catalog.courseId)) errors.push('catalog.courseId: texto de curso no vacío requerido.');
  if (Object.hasOwn(catalog, 'timeZone') && catalog.timeZone !== 'Europe/Madrid') errors.push('catalog.timeZone: debe ser Europe/Madrid.');
  if (!Array.isArray(catalog.modules)) return [...errors, 'catalog.modules: debe ser una lista.'];
  const modules = new Set();
  const identities = new Set();
  const paths = new Set();
  catalog.modules.forEach((module, index) => {
    const prefix = `catalog.modules[${index}]`;
    if (!isObject(module)) { errors.push(`${prefix}: debe ser un objeto.`); return; }
    if (!MODULE_CODES.has(module.code)) errors.push(`${prefix}.code: módulo no admitido.`);
    if (modules.has(module.code)) errors.push(`${prefix}.code: módulo duplicado.`);
    modules.add(module.code);
    if (!nonemptyText(module.name)) errors.push(`${prefix}.name: debe ser texto no vacío.`);
    if (Object.hasOwn(module, 'profile') && module.profile !== moduleProfilePath(module.code)) errors.push(`${prefix}.profile: ruta de información general no válida.`);
    if (Object.hasOwn(module, 'taskRegistry') && module.taskRegistry !== `${module.code}/tasks.json`) errors.push(`${prefix}.taskRegistry: ruta de tareas del módulo no válida.`);
    if (!Array.isArray(module.units)) { errors.push(`${prefix}.units: debe ser una lista.`); return; }
    module.units.forEach((unit, unitIndex) => {
      const unitPrefix = `${prefix}.units[${unitIndex}]`;
      if (!isObject(unit)) { errors.push(`${unitPrefix}: debe ser un objeto.`); return; }
      const entry = { moduleCode: module.code, unitCode: unit.code, unitId: unit.id, path: unit.path };
      for (const error of validateEntry(entry)) errors.push(`${unitPrefix}: ${error}`);
      if (!nonemptyText(unit.title)) errors.push(`${unitPrefix}.title: debe ser texto no vacío.`);
      if (identities.has(unit.id)) errors.push(`${unitPrefix}.id: unidad duplicada.`);
      if (paths.has(unit.path)) errors.push(`${unitPrefix}.path: ruta duplicada.`);
      identities.add(unit.id);
      paths.add(unit.path);
    });
  });
  return errors;
}

/** Validate without coercing, reordering, renumbering, or dropping unknown fields. */
export function validateDocument(doc, expectedEntry) {
  const errors = [];
  if (!isObject(doc)) return ['El documento debe ser un objeto JSON.'];
  validateJson(doc, 'document', errors);
  if (![1, 2, 3].includes(doc.schemaVersion)) errors.push('schemaVersion: debe ser 1, 2 o 3.');
  validateResources(doc.resources, errors);
  const isV2 = doc.schemaVersion === 2 || doc.schemaVersion === 3;
  const isV3 = doc.schemaVersion === 3;
  if (doc.pilot !== true) errors.push('pilot: debe ser true.');
  if (!isObject(doc.module) || !MODULE_CODES.has(doc.module.code) || !nonemptyText(doc.module.name)) errors.push('module: requiere un code admitido y name no vacío.');
  if (!isObject(doc.unit) || !isUnitCode(doc.unit.code) || doc.unit.id !== `${doc.module?.code}-${doc.unit.code}` || !nonemptyText(doc.unit.title)) errors.push('unit: requiere code válido, id MÓDULO-UNIDAD coherente y title no vacío.');
  if (expectedEntry !== undefined) {
    errors.push(...validateEntry(expectedEntry));
    if (doc.module?.code !== expectedEntry?.moduleCode || doc.unit?.code !== expectedEntry?.unitCode || doc.unit?.id !== expectedEntry?.unitId) errors.push('document: la identidad del módulo y la unidad no coincide con el destino seleccionado.');
  }
  if (isV2) {
    if (Object.hasOwn(doc, 'source')) errors.push('source: no forma parte de schemaVersion 2; el origen se conserva en el archivo privado.');
    if (!isObject(doc.provenance)) errors.push('provenance: debe ser un objeto.');
    else {
      if (!isArchivePath(doc.provenance.archivePath)) errors.push('provenance.archivePath: debe ser una ruta relativa segura a un archivo JSON privado.');
      if (!isText(doc.provenance.sha256) || !/^[a-fA-F0-9]{64}$/.test(doc.provenance.sha256)) errors.push('provenance.sha256: debe ser una huella SHA-256 de 64 caracteres hexadecimales.');
    }
  } else if (!isObject(doc.source)) errors.push('source: debe ser un objeto.');
  if (!Array.isArray(doc.sessions)) {
    errors.push('sessions: debe ser una lista.');
    return errors;
  }
  const ids = new Set();
  const numbers = new Set();
  const checkId = (id, path) => {
    if (!nonemptyText(id)) errors.push(`${path}: debe ser un identificador no vacío.`);
    else if (ids.has(id)) errors.push(`${path}: identificador duplicado.`);
    else ids.add(id);
  };
  doc.sessions.forEach((session, index) => {
    const path = `sessions[${index}]`;
    if (!isObject(session)) {
      errors.push(`${path}: debe ser un objeto.`);
      return;
    }
    checkId(session.id, `${path}.id`);
    if (!positiveInteger(session.number)) errors.push(`${path}.number: debe ser un entero positivo.`);
    else if (numbers.has(session.number)) errors.push(`${path}.number: número de sesión duplicado.`);
    else numbers.add(session.number);
    if (!isValidDate(session.date)) errors.push(`${path}.date: debe ser una fecha válida con formato YYYY-MM-DD.`);
    if (!STATES.has(session.state)) errors.push(`${path}.state: estado no permitido.`);
    if (Object.hasOwn(session, 'eventTypes') && (!Array.isArray(session.eventTypes) || session.eventTypes.some(type => !['task', 'exam'].includes(type)) || new Set(session.eventTypes).size !== session.eventTypes.length)) errors.push(`${path}.eventTypes: lista sin duplicados de task y/o exam.`);
    if (Object.hasOwn(session, 'taskPresented') && typeof session.taskPresented !== 'boolean') errors.push(`${path}.taskPresented: debe ser booleano.`);
    validateTaskMetadata(session, path, errors);
    if (Object.hasOwn(session, 'examAnnouncedFor') && !isValidDate(session.examAnnouncedFor)) errors.push(`${path}.examAnnouncedFor: fecha de examen avisada no válida.`);
    if (!Array.isArray(session.activities) || session.activities.length === 0) {
      errors.push(`${path}.activities: requiere una primera porción Cabecera.`);
      return;
    }
    let previousEnd = null;
    session.activities.forEach((activity, activityIndex) => {
      const activityPath = `${path}.activities[${activityIndex}]`;
      if (!isObject(activity)) {
        errors.push(`${activityPath}: debe ser un objeto.`);
        return;
      }
      checkId(activity.id, `${activityPath}.id`);
      if (activity.kind !== (activityIndex === 0 ? 'Cabecera' : 'Actividad')) errors.push(`${activityPath}.kind: solo la primera porción debe ser Cabecera; las demás deben ser Actividad.`);
      for (const field of TEXT_FIELDS) {
        if (!isText(activity[field])) errors.push(`${activityPath}.${field}: debe ser texto.`);
      }
      if (Object.hasOwn(activity, 'eventType') && !['task', 'exam'].includes(activity.eventType)) errors.push(`${activityPath}.eventType: debe ser task o exam, o estar ausente.`);
      if (Object.hasOwn(activity, 'taskPresented') && typeof activity.taskPresented !== 'boolean') errors.push(`${activityPath}.taskPresented: debe ser booleano.`);
      validateTaskMetadata(activity, activityPath, errors);
      if (isV2) {
        if (Object.hasOwn(activity, 'sourceRow')) errors.push(`${activityPath}.sourceRow: no forma parte de schemaVersion 2.`);
        if (Object.hasOwn(activity, 'calendar')) {
          if (!isObject(activity.calendar)) errors.push(`${activityPath}.calendar: debe ser un objeto.`);
          else if (!nonemptyText(activity.calendar.uid)) errors.push(`${activityPath}.calendar.uid: debe ser un identificador no vacío.`);
        }
      } else if (!positiveInteger(activity.sourceRow)) errors.push(`${activityPath}.sourceRow: debe ser un entero positivo.`);
      const start = timeToMinutes(activity.start);
      const end = timeToMinutes(activity.end);
      if (start === null || end === null) errors.push(`${activityPath}: las horas requieren formato HH:mm válido.`);
      else {
        if (end <= start) errors.push(`${activityPath}: la hora final debe ser posterior a la inicial.`);
        if (previousEnd !== null && start < previousEnd) errors.push(`${activityPath}: las porciones deben estar ordenadas y no solaparse.`);
        previousEnd = end;
      }
    });
  });
  if (Object.hasOwn(doc.unit ?? {}, 'preparation') && !['draft', 'ready'].includes(doc.unit.preparation)) errors.push('unit.preparation: debe ser draft o ready.');
  if (Object.hasOwn(doc, 'tasks')) {
    if (!Array.isArray(doc.tasks)) errors.push('tasks: debe ser una lista.');
    else {
      const codes = new Set();
      doc.tasks.forEach((task, index) => {
        const path = `tasks[${index}]`;
        if (!isObject(task)) { errors.push(`${path}: debe ser un objeto.`); return; }
        checkId(task.id, `${path}.id`);
        if (task.type !== undefined && !['task', 'exam'].includes(task.type)) errors.push(`${path}.type: debe ser task o exam.`);
        if (Object.hasOwn(task, 'preparation') && !['draft', 'ready'].includes(task.preparation)) errors.push(`${path}.preparation: debe ser draft o ready.`);
        if (isV3) validateExtendedTask(task, path, errors, isValidDate);
        else if (!isText(task.code) || !(task.type === 'exam' ? /^\d{2}(?:\d{2}|te|ex|ia)?$/ : /^\d{4}$/).test(task.code)) errors.push(`${path}.code: código oficial no válido.`);
        const codeKey = isV3 ? JSON.stringify([task.type, task.code]) : task.code;
        if (codes.has(codeKey)) errors.push(`${path}.code: código de tarea duplicado.`);
        codes.add(codeKey);
        if (!nonemptyText(task.title)) errors.push(`${path}.title: título oficial obligatorio.`);
        const session = doc.sessions.find(item => item?.id === task.presentation?.sessionId);
        if (!Object.hasOwn(task, 'presentation')) { /* New official tasks may await a planned session in any supported format. */ }
        else if (!isObject(task.presentation) || !session) errors.push(`${path}.presentation: requiere una sesión existente de esta UT.`);
        else if (Object.hasOwn(task.presentation, 'activityId') && (!Array.isArray(session.activities) || !session.activities.some(activity => activity?.id === task.presentation.activityId))) errors.push(`${path}.presentation.activityId: debe pertenecer a la sesión indicada.`);
        if (Object.hasOwn(task, 'taskPresented') && typeof task.taskPresented !== 'boolean') errors.push(`${path}.taskPresented: debe ser booleano.`);
        validateTaskMetadata(task, path, errors);
      });
    }
  }
  validatePlanningChanges(doc, errors);
  if (isV3) validateV3Document(doc, errors);
  return errors;
}

/** Durations include Cabecera and exclude gaps between portions. */
export function validateTaskRegistry(doc, moduleCode) {
  const errors = [];
  if (!isObject(doc) || ![1, 2].includes(doc.schemaVersion) || !MODULE_CODES.has(moduleCode) || doc.moduleCode !== moduleCode || !Array.isArray(doc.tasks)) return ['Registro de tareas no válido.'];
  validateJson(doc, 'registry', errors);
  const ids = new Set(); const identities = new Set();
  doc.tasks.forEach((task, index) => {
    const path = `tasks[${index}]`;
    if (!isObject(task)) { errors.push(`${path}: debe ser un objeto.`); return; }
    if (!nonemptyText(task.id) || ids.has(task.id)) errors.push(`${path}.id: identificador no válido o duplicado.`);
    ids.add(task.id);
    if (!isUnitCode(task.unitCode) || !['task', 'exam'].includes(task.type) || !nonemptyText(task.title) || !(doc.schemaVersion === 2 ? officialCode(task.code) : isText(task.code) && (task.type === 'exam' ? /^\d{2}(?:\d{2}|te|ex|ia)?$/ : /^\d{4}$/).test(task.code))) errors.push(`${path}: identidad de tarea no válida.`);
    if (doc.schemaVersion === 2) validateExtendedTask(task, path, errors, isValidDate);
    const identity = `${task.unitCode}/${task.type}/${task.code}`;
    if (identities.has(identity)) errors.push(`${path}: código duplicado.`);
    identities.add(identity);
    if (Object.hasOwn(task, 'taskPresented') && typeof task.taskPresented !== 'boolean') errors.push(`${path}.taskPresented: debe ser booleano.`);
    validateTaskMetadata(task, path, errors);
  });
  return errors;
}

export function summarize(doc) {
  const sessions = (Array.isArray(doc?.sessions) ? doc.sessions : []).map(session => {
    const minutes = (Array.isArray(session.activities) ? session.activities : []).reduce((sum, activity) => {
      const start = timeToMinutes(activity.start);
      const end = timeToMinutes(activity.end);
      return sum + (start !== null && end !== null && end > start ? end - start : 0);
    }, 0);
    return { id: session.id, number: session.number, minutes, state: session.state };
  });
  const totalMinutes = sessions.reduce((sum, session) => sum + session.minutes, 0);
  const delivered = sessions.filter(session => session.state === 'Impartida');
  return {
    totalSessions: sessions.length,
    deliveredSessions: delivered.length,
    totalMinutes,
    plannedMinutes: totalMinutes,
    deliveredMinutes: delivered.reduce((sum, session) => sum + session.minutes, 0),
    sessions,
  };
}

export function encodeUtf8Base64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return btoa(binary);
}

export function decodeUtf8Base64(value) {
  if (!isText(value)) throw new TypeError('Contenido codificado no válido.');
  const compact = value.replace(/\s/g, '');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compact)) throw new TypeError('Base64 no válido.');
  const binary = atob(compact);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function httpError(status) {
  const messages = {
    401: 'GitHub no acepta el token. Comprueba que siga vigente.',
    403: 'GitHub ha denegado el acceso. Revisa los permisos del token o los límites de uso.',
    404: 'No se encuentra el archivo solicitado o el token no tiene acceso al repositorio privado.',
    422: 'GitHub ha rechazado los datos del guardado. No se ha reintentado.',
    429: 'GitHub ha limitado temporalmente las peticiones. No se ha reintentado.',
  };
  return new ApiError(messages[status] ?? `GitHub devolvió un error HTTP ${status}.`, { status, code: `HTTP_${status}` });
}

/** Fixed private repository and immutable per-instance target; token only in memory. */
export class GithubStore {
  #token;
  #fetch;
  #timeout;
  #queue = Promise.resolve();
  #needsReload = false;
  #entry = DEFAULT_ENTRY;

  constructor({ token, fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
    if (!nonemptyText(token)) throw new ApiError('Introduce un token para conectar con GitHub.', { code: 'MISSING_TOKEN' });
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl debe ser una función.');
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('timeoutMs debe ser positivo.');
    this.#token = token.trim();
    // Native browser fetch requires its Window/Worker receiver, not this store.
    this.#fetch = fetchImpl.bind(globalThis);
    this.#timeout = timeoutMs;
  }

  forDocument(entry) {
    const errors = validateEntry(entry);
    if (errors.length) throw new ApiError('El destino del documento no es válido.', { code: 'INVALID_TARGET', errors });
    const bound = new GithubStore({ token: this.#token, fetchImpl: this.#fetch, timeoutMs: this.#timeout });
    bound.#entry = Object.freeze({ moduleCode: entry.moduleCode, unitCode: entry.unitCode, unitId: entry.unitId, path: entry.path });
    return bound;
  }

  #enqueue(operation) {
    const result = this.#queue.then(operation, operation);
    this.#queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async #request(method, body, path, repository = `${OWNER}/${REPOSITORY}`) {
    const writing = method === 'PUT';
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(writing ? new UnknownSaveError('timeout') : new ApiError('La lectura ha tardado demasiado. Puedes volver a cargar el archivo.', { code: 'READ_TIMEOUT' }));
      }, this.#timeout);
    });
    const request = (async () => {
      let response;
      try {
        const endpoint = repository === `${OWNER}/${REPOSITORY}` ? `${CONTENTS_ENDPOINT}${path}` : `https://api.github.com/repos/${repository}/contents/${path}`;
        response = await this.#fetch(writing ? endpoint : `${endpoint}?ref=${BRANCH}`, {
          method,
          signal: controller.signal,
          cache: 'no-store',
          redirect: 'error',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${this.#token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            ...(writing ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(writing ? { body: JSON.stringify(body) } : {}),
        });
      } catch {
        if (controller.signal.aborted) {
          throw writing ? new UnknownSaveError('timeout') : new ApiError('La lectura ha tardado demasiado. Puedes volver a cargar el archivo.', { code: 'READ_TIMEOUT' });
        }
        throw writing ? new UnknownSaveError('network') : new ApiError('No se pudo conectar con GitHub. Puedes volver a cargar el archivo.', { code: 'READ_FAILED' });
      }
      if (!response || !Number.isInteger(response.status)) throw writing ? new UnknownSaveError('invalid-response') : new ApiError('La respuesta de GitHub no es válida.', { code: 'INVALID_RESPONSE' });
      if (writing && response.status === 409) throw new ConflictError();
      if (writing && (response.status >= 500 || response.status === 408)) throw new UnknownSaveError('server', response.status);
      if (response.status < 200 || response.status >= 300) throw httpError(response.status);
      try {
        return await response.json();
      } catch {
        throw writing ? new UnknownSaveError('invalid-response', response.status) : new ApiError('GitHub devolvió una respuesta ilegible.', { status: response.status, code: 'INVALID_RESPONSE' });
      }
    })();
    try {
      return await Promise.race([request, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  async #readJson(path, code) {
    const result = await this.#request('GET', undefined, path);
    try {
      if (!isObject(result) || result.encoding !== 'base64' || !nonemptyText(result.sha)) throw new Error();
      if (Object.hasOwn(result, 'path') && result.path !== path) throw new Error();
      return { value: JSON.parse(decodeUtf8Base64(result.content)), sha: result.sha };
    } catch {
      throw new ApiError('El archivo de GitHub no contiene el JSON UTF-8 esperado.', { code });
    }
  }

  loadCatalog() {
    return this.#enqueue(async () => {
      const { value: catalog, sha } = await this.#readJson('catalog.json', 'INVALID_CATALOG');
      const errors = validateCatalog(catalog);
      if (errors.length) throw new ApiError('El catálogo privado no cumple el formato del piloto.', { code: 'INVALID_CATALOG', errors });
      return { catalog, sha };
    });
  }

  loadCommon(catalog) {
    const path = commonCoursePath(catalog);
    if (!path) return Promise.reject(new ApiError('El catálogo no tiene un destino común confirmado.', { code: 'INVALID_TARGET' }));
    return this.#enqueue(async () => {
      const { value: document, sha } = await this.#readJson(path, 'INVALID_DOCUMENT');
      const errors = validateCommonCourse(document, path);
      validateJson(document, 'common', errors);
      if (errors.length) throw new ApiError('Los datos comunes no cumplen el contrato.', { code: 'INVALID_DOCUMENT', errors });
      return { document, sha };
    });
  }

  loadModuleProfile(module) {
    const code = module?.code;
    const path = moduleProfilePath(code);
    if (!path || module.profile !== path) return Promise.reject(new ApiError('El módulo no tiene un destino general confirmado.', { code: 'INVALID_TARGET' }));
    return this.#enqueue(async () => {
      const { value: document, sha } = await this.#readJson(path, 'INVALID_DOCUMENT');
      const errors = validateModuleProfile(document, code);
      if (errors.length) throw new ApiError('La información general no cumple el contrato.', { code: 'INVALID_DOCUMENT', errors });
      return { document, sha };
    });
  }

  loadPrivateResource(location) {
    if (!validGithubLocation(location)) return Promise.reject(new ApiError('La referencia privada no es válida.', { code: 'INVALID_TARGET' }));
    return this.#enqueue(async () => {
      const path = location.path.split('/').map(encodeURIComponent).join('/');
      const result = await this.#request('GET', undefined, path, location.repository);
      if (!isObject(result) || result.encoding !== 'base64' || !nonemptyText(result.sha) || result.path !== location.path || typeof result.content !== 'string' || result.content.length > 1500000 || result.size > 1000000) throw new ApiError('La ficha no contiene Markdown UTF-8 legible de hasta 1 MB.', { code: 'INVALID_RESOURCE' });
      try { return { content: decodeUtf8Base64(result.content), sha: result.sha, path: result.path }; }
      catch { throw new ApiError('No se ha podido leer el texto UTF-8 de la ficha.', { code: 'INVALID_RESOURCE' }); }
    });
  }

  forModuleResources(code) {
    const path = moduleResourcePath(code);
    if (!path) throw new ApiError('Módulo no válido.', { code: 'INVALID_TARGET' });
    const bound = new GithubStore({ token: this.#token, fetchImpl: this.#fetch, timeoutMs: this.#timeout });
    let missingRead = false;
    return {
      load: () => bound.#enqueue(async () => {
        try {
          const { value: document, sha } = await bound.#readJson(path, 'INVALID_DOCUMENT');
          const errors = validateModuleResources(document, code); validateJson(document, 'resources', errors);
          if (errors.length) throw new ApiError('El registro de recursos no cumple el contrato.', { code: 'INVALID_DOCUMENT', errors });
          missingRead = false; bound.#needsReload = false; return { document, sha };
        } catch (error) {
          if (error.code !== 'HTTP_404') throw error;
          missingRead = true; bound.#needsReload = false;
          return { document: { schemaVersion: 1, kind: 'module-resources', moduleCode: code, resources: [] }, sha: null };
        }
      }),
      save: (document, sha) => bound.#enqueue(async () => {
        const errors = validateModuleResources(document, code); validateJson(document, 'resources', errors);
        if (errors.length) throw new ApiError('Revisa los recursos del módulo.', { code: 'INVALID_DOCUMENT', errors });
        if (bound.#needsReload) throw new UnknownSaveError('reload-required');
        if (!nonemptyText(sha) && !(sha === null && missingRead)) throw new ApiError('Falta la versión leída.', { code: 'MISSING_SHA' });
        const snapshot = structuredClone(document);
        try {
          const result = await bound.#request('PUT', { message: `Actualizar recursos ${code}`, content: encodeUtf8Base64(JSON.stringify(snapshot, null, 2) + '\n'), ...(sha ? { sha } : {}), branch: BRANCH }, path);
          if (!nonemptyText(result?.content?.sha) || !nonemptyText(result?.commit?.sha) || result.content.path !== path) throw new UnknownSaveError('invalid-response');
          missingRead = false;
          return { document: snapshot, sha: result.content.sha, commitSha: result.commit.sha };
        } catch (error) { if (error instanceof UnknownSaveError || error.code === 'HTTP_422' || error.code === 'CONFLICT') bound.#needsReload = true; throw error; }
      }),
    };
  }

  load() {
    const entry = this.#entry;
    return this.#enqueue(async () => {
      const { value: document, sha } = await this.#readJson(entry.path, 'INVALID_DOCUMENT');
      const errors = validateDocument(document, entry);
      if (errors.length) throw new ApiError('El documento de GitHub no cumple el formato del piloto.', { code: 'INVALID_DOCUMENT', errors });
      this.#needsReload = false;
      return { document, sha };
    });
  }

  async save(document, sha) {
    const entry = this.#entry;
    const errors = validateDocument(document, entry);
    if (errors.length) throw new ApiError('Revisa los datos antes de guardar.', { code: 'INVALID_DOCUMENT', errors });
    if (!nonemptyText(sha)) throw new ApiError('Falta la versión original del archivo. Vuelve a cargarlo.', { code: 'MISSING_SHA' });
    const text = `${JSON.stringify(document, null, 2)}\n`;
    const snapshot = JSON.parse(text);
    return this.#enqueue(async () => {
      if (this.#needsReload) throw new UnknownSaveError('reload-required');
      try {
        const result = await this.#request('PUT', {
          message: `Actualizar piloto ${entry.moduleCode} ${entry.unitCode}`,
          content: encodeUtf8Base64(text),
          sha,
          branch: BRANCH,
        }, entry.path);
        if (!isObject(result) || !nonemptyText(result.content?.sha) || !nonemptyText(result.commit?.sha)) throw new UnknownSaveError('invalid-response');
        if (Object.hasOwn(result.content, 'path') && result.content.path !== entry.path) throw new UnknownSaveError('invalid-response');
        return { document: snapshot, sha: result.content.sha, commitSha: result.commit.sha };
      } catch (error) {
        if (error instanceof UnknownSaveError) this.#needsReload = true;
        throw error;
      }
    });
  }
}

