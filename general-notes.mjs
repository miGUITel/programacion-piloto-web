import { ApiError, ConflictError, UnknownSaveError, validateCatalog, validateTaskRegistry, encodeUtf8Base64, decodeUtf8Base64 } from './core.mjs?v=20261017-4';

const codes = new Set(['LM', 'SR', 'SOS', 'ED', 'PRO']);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string';
const endpoint = 'https://api.github.com/repos/miGUITel/programacion-piloto-datos/contents/';
export const generalNotesPath = code => {
  if (!codes.has(code)) throw new ApiError('Módulo no válido.', { code: 'INVALID_TARGET' });
  return `APP/mejoras/${code}.json`;
};
export const emptyGeneralNotes = moduleCode => ({ schemaVersion: 1, moduleCode, improvements: '', units: {} });

export function validateGeneralNotes(value, moduleCode) {
  const errors = [];
  if (!object(value) || value.schemaVersion !== 1 || value.moduleCode !== moduleCode || !codes.has(moduleCode)) return ['Identidad de mejoras no válida.'];
  if (!text(value.improvements) || value.improvements.length > 20000) errors.push('Texto general no válido.');
  if (!object(value.units)) return [...errors, 'Unidades no válidas.'];
  for (const [code, unit] of Object.entries(value.units)) {
    if (!/^(?:UT|RA|B)\d{1,3}[A-Z]?$/.test(code) || !object(unit) || unit.id !== `${moduleCode}-${code}` || !text(unit.improvements) || unit.improvements.length > 20000) errors.push('Mejoras de unidad no válidas.');
  }
  return errors;
}

export function getGeneralText(document, target) {
  return target.unitCode ? document.units[target.unitCode]?.improvements ?? '' : document.improvements;
}

export function withGeneralText(document, target, value) {
  if (!text(value) || value.length > 20000 || target.moduleCode !== document.moduleCode) throw new ApiError('Revisa el texto y su destino.', { code: 'INVALID_DOCUMENT' });
  const next = structuredClone(document);
  if (target.unitCode) {
    if (!/^(?:UT|RA|B)\d{1,3}[A-Z]?$/.test(target.unitCode) || target.unitId !== `${target.moduleCode}-${target.unitCode}`) throw new ApiError('Unidad no válida.', { code: 'INVALID_TARGET' });
    next.units[target.unitCode] = { ...next.units[target.unitCode], id: target.unitId, improvements: value };
  } else next.improvements = value;
  return next;
}

/** One versioned file per module. No access to session documents or suggestions. */
export class GeneralNotesStore {
  #registry;
  #path() { return this.#registry ? `${this.#code}/tasks.json` : generalNotesPath(this.#code); }
  #validate(doc) { return this.#registry ? validateTaskRegistry(doc, this.#code) : validateGeneralNotes(doc, this.#code); }
  #token; #fetch; #timeout; #code; #version; #blocked = false; #queue = Promise.resolve();
  constructor({ token, moduleCode, fetchImpl = globalThis.fetch, timeoutMs = 15000 }, registry = false) {
    generalNotesPath(moduleCode);
    if (!text(token) || !token.trim()) throw new ApiError('Falta la conexión.', { code: 'MISSING_TOKEN' });
    this.#registry = registry === true;
    this.#token = token.trim(); this.#code = moduleCode; this.#fetch = fetchImpl.bind(globalThis); this.#timeout = timeoutMs;
  }
  #enqueue(operation) {
    const result = this.#queue.then(operation, operation);
    this.#queue = result.catch(() => {});
    return result;
  }
  async #request(method, path, body) {
    const writing = method === 'PUT';
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => {
      controller.abort(); reject(writing ? new UnknownSaveError('timeout') : new ApiError('Lectura agotada.', { code: 'READ_TIMEOUT' }));
    }, this.#timeout); });
    try {
      return await Promise.race([timeout, (async () => {
        let response;
        try {
          response = await this.#fetch(`${endpoint}${path}${writing ? '' : '?ref=main'}`, {
            method, cache: 'no-store', redirect: 'error', signal: controller.signal,
            headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.#token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(writing ? { 'Content-Type': 'application/json' } : {}) },
            ...(writing ? { body: JSON.stringify(body) } : {}),
          });
        } catch { throw writing ? new UnknownSaveError('network') : new ApiError('No se pudo leer GitHub.', { code: 'READ_FAILED' }); }
        if (!Number.isInteger(response?.status)) throw writing ? new UnknownSaveError('invalid-response') : new ApiError('Respuesta no válida.', { code: 'INVALID_RESPONSE' });
        if (writing && response.status === 409) throw new ConflictError();
        if (writing && (response.status >= 500 || response.status === 408)) throw new UnknownSaveError('server', response.status);
        if (response.status < 200 || response.status >= 300) throw new ApiError('GitHub no aceptó la petición.', { status: response.status, code: `HTTP_${response.status}` });
        try { return { status: response.status, value: await response.json() }; }
        catch { throw writing ? new UnknownSaveError('invalid-response') : new ApiError('Respuesta ilegible.', { code: 'INVALID_RESPONSE' }); }
      })()]);
    } finally { clearTimeout(timer); }
  }
  async #read(path) {
    const { value } = await this.#request('GET', path);
    try {
      if (!object(value) || value.type !== 'file' || value.path !== path || value.encoding !== 'base64' || !text(value.sha) || !value.sha) throw new Error();
      return { document: JSON.parse(decodeUtf8Base64(value.content)), sha: value.sha };
    } catch { throw new ApiError('El registro no contiene el formato esperado.', { code: 'INVALID_DOCUMENT' }); }
  }
  async #load() {
    let loaded;
    try { loaded = await this.#read(this.#path()); }
    catch (error) {
      if (error.code !== 'HTTP_404' || this.#registry) throw error;
      // A missing private file may conceal loss of access. Confirm the catalog first.
      const result = await this.#read('catalog.json');
      if (validateCatalog(result.document).length || !result.document.modules.some(module => module.code === this.#code)) throw new ApiError('No se pudo confirmar el acceso al módulo.', { code: 'INVALID_CATALOG' });
      loaded = { document: emptyGeneralNotes(this.#code), sha: null };
    }
    if (this.#validate(loaded.document).length) throw new ApiError('Registro no válido.', { code: 'INVALID_DOCUMENT' });
    return loaded;
  }
  load() {
    return this.#enqueue(async () => {
      const result = await this.#load();
      this.#version = result.sha; this.#blocked = false;
      return result;
    });
  }
  save(document, sha) {
    if (this.#validate(document).length) return Promise.reject(new ApiError('Revisa el registro antes de guardar.', { code: 'INVALID_DOCUMENT' }));
    const snapshot = structuredClone(document);
    return this.#enqueue(async () => {
      if (this.#blocked) throw new UnknownSaveError('reload-required');
      if (this.#version === undefined || sha !== this.#version) throw new ApiError('Vuelve a leer las mejoras.', { code: 'MISSING_SHA' });
      const path = this.#path();
      try {
        const result = await this.#request('PUT', path, {
          message: `Actualizar ${this.#registry ? 'tareas históricas' : 'mejoras generales'} ${this.#code}`,
          content: encodeUtf8Base64(JSON.stringify(snapshot, null, 2) + '\n'), branch: 'main', ...(sha === null ? {} : { sha }),
        });
        if (result.status !== (sha === null ? 201 : 200) || !text(result.value.content?.sha) || !text(result.value.commit?.sha) || result.value.content.path !== path) throw new UnknownSaveError('invalid-response');
        let confirmed;
        try { confirmed = await this.#load(); } catch { throw new UnknownSaveError('verification-failed'); }
        if (confirmed.sha !== result.value.content.sha || JSON.stringify(confirmed.document) !== JSON.stringify(snapshot)) throw new UnknownSaveError('verification-differs');
        this.#version = confirmed.sha;
        return { ...confirmed, commitSha: result.value.commit.sha };
      } catch (error) {
        if (error instanceof UnknownSaveError || error instanceof ConflictError || error.code === 'HTTP_422') this.#blocked = true;
        throw error;
      }
    });
  }
}

export class TaskRegistryStore extends GeneralNotesStore {
  constructor(options) { super(options, true); }
}
