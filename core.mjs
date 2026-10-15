const OWNER = 'miGUITel';
const REPOSITORY = 'programacion-piloto-datos';
const FILE_PATH = 'LM/UT02.json';
const BRANCH = 'main';
const ENDPOINT = `https://api.github.com/repos/${OWNER}/${REPOSITORY}/contents/${FILE_PATH}`;
const STATES = new Set(['', 'Impartida', 'Reprogramada', 'Cancelada']);
const TEXT_FIELDS = ['title', 'planned', 'observations', 'improvements', 'realized', 'pending'];

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string';
const nonemptyText = value => isText(value) && value.trim().length > 0;
const positiveInteger = value => Number.isInteger(value) && value > 0;

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

/** Validate without coercing, reordering, renumbering, or dropping unknown fields. */
export function validateDocument(doc) {
  const errors = [];
  if (!isObject(doc)) return ['El documento debe ser un objeto JSON.'];
  validateJson(doc, 'document', errors);
  if (doc.schemaVersion !== 1) errors.push('schemaVersion: debe ser 1.');
  if (doc.pilot !== true) errors.push('pilot: debe ser true.');
  if (!isObject(doc.module) || doc.module.code !== 'LM' || !nonemptyText(doc.module.name)) errors.push('module: requiere code LM y name no vacío.');
  if (!isObject(doc.unit) || doc.unit.id !== 'LM-UT02' || doc.unit.code !== 'UT02' || !nonemptyText(doc.unit.title)) errors.push('unit: requiere id LM-UT02, code UT02 y title no vacío.');
  if (!isObject(doc.source)) errors.push('source: debe ser un objeto.');
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
      if (!positiveInteger(activity.sourceRow)) errors.push(`${activityPath}.sourceRow: debe ser un entero positivo.`);
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
  return errors;
}

/** Durations include Cabecera and exclude gaps between portions. */
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
    404: 'No se encuentra LM/UT02.json o el token no tiene acceso al repositorio privado.',
    422: 'GitHub ha rechazado los datos del guardado. No se ha reintentado.',
    429: 'GitHub ha limitado temporalmente las peticiones. No se ha reintentado.',
  };
  return new ApiError(messages[status] ?? `GitHub devolvió un error HTTP ${status}.`, { status, code: `HTTP_${status}` });
}

/** One fixed repository/path; the token is held only in this object's private memory. */
export class GithubStore {
  #token;
  #fetch;
  #timeout;
  #queue = Promise.resolve();
  #needsReload = false;

  constructor({ token, fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
    if (!nonemptyText(token)) throw new ApiError('Introduce un token para conectar con GitHub.', { code: 'MISSING_TOKEN' });
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl debe ser una función.');
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('timeoutMs debe ser positivo.');
    this.#token = token.trim();
    // Native browser fetch requires its Window/Worker receiver, not this store.
    this.#fetch = fetchImpl.bind(globalThis);
    this.#timeout = timeoutMs;
  }

  #enqueue(operation) {
    const result = this.#queue.then(operation, operation);
    this.#queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async #request(method, body) {
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
        response = await this.#fetch(writing ? ENDPOINT : `${ENDPOINT}?ref=${BRANCH}`, {
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

  load() {
    return this.#enqueue(async () => {
      const result = await this.#request('GET');
      let document;
      try {
        if (!isObject(result) || result.encoding !== 'base64' || !nonemptyText(result.sha)) throw new Error();
        document = JSON.parse(decodeUtf8Base64(result.content));
      } catch {
        throw new ApiError('El archivo de GitHub no contiene un JSON UTF-8 válido.', { code: 'INVALID_DOCUMENT' });
      }
      const errors = validateDocument(document);
      if (errors.length) throw new ApiError('El documento de GitHub no cumple el formato del piloto.', { code: 'INVALID_DOCUMENT', errors });
      this.#needsReload = false;
      return { document, sha: result.sha };
    });
  }

  async save(document, sha) {
    const errors = validateDocument(document);
    if (errors.length) throw new ApiError('Revisa los datos antes de guardar.', { code: 'INVALID_DOCUMENT', errors });
    if (!nonemptyText(sha)) throw new ApiError('Falta la versión original del archivo. Vuelve a cargarlo.', { code: 'MISSING_SHA' });
    const text = `${JSON.stringify(document, null, 2)}\n`;
    const snapshot = JSON.parse(text);
    return this.#enqueue(async () => {
      if (this.#needsReload) throw new UnknownSaveError('reload-required');
      try {
        const result = await this.#request('PUT', {
          message: 'Actualizar piloto LM UT02',
          content: encodeUtf8Base64(text),
          sha,
          branch: BRANCH,
        });
        if (!isObject(result) || !nonemptyText(result.content?.sha) || !nonemptyText(result.commit?.sha)) throw new UnknownSaveError('invalid-response');
        return { document: snapshot, sha: result.content.sha, commitSha: result.commit.sha };
      } catch (error) {
        if (error instanceof UnknownSaveError) this.#needsReload = true;
        throw error;
      }
    });
  }
}
