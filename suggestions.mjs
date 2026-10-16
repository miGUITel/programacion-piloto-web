const ROOT = 'https://api.github.com/repos/miGUITel/programacion-piloto-datos/contents/';
const DIRECTORY = 'APP/sugerencias/';
const BRANCH = 'main';
const KEYS = ['schemaVersion', 'id', 'createdAt', 'type', 'title', 'description', 'status'];
const TYPES = new Set(['mejora', 'error', 'idea']);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{40}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const text = value => typeof value === 'string';

export class SuggestionError extends Error {
  constructor(code, { status = null, requiresVerification = false } = {}) {
    super('No se ha podido confirmar la operación de sugerencias.');
    this.name = 'SuggestionError';
    this.code = code;
    this.status = status;
    this.requiresVerification = requiresVerification;
  }
}

function uncertain(code = 'SAVE_UNKNOWN', status = null) {
  return new SuggestionError(code, { status, requiresVerification: true });
}

/** Only app feedback: no module, unit, session, academic data, URL or credential fields. */
export function validateSuggestion(entry) {
  const errors = [];
  if (!object(entry)) return ['La sugerencia debe ser un objeto simple.'];
  if (Object.keys(entry).length !== KEYS.length || Object.keys(entry).some(key => !KEYS.includes(key))) errors.push('Los campos de la sugerencia no son los esperados.');
  if (entry.schemaVersion !== 1) errors.push('La versión de formato debe ser 1.');
  if (!text(entry.id) || !UUID.test(entry.id)) errors.push('El identificador debe ser un UUID seguro.');
  if (!text(entry.createdAt) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.createdAt)
    || !Number.isFinite(Date.parse(entry.createdAt)) || new Date(entry.createdAt).toISOString() !== entry.createdAt) errors.push('La fecha de creación no es válida.');
  if (!TYPES.has(entry.type)) errors.push('El tipo debe ser mejora, error o idea.');
  if (!text(entry.title) || !entry.title.trim() || entry.title.length > 120) errors.push('El título debe contener entre 1 y 120 caracteres.');
  if (!text(entry.description) || !entry.description.trim() || entry.description.length > 5000) errors.push('La descripción debe contener entre 1 y 5000 caracteres.');
  if (entry.status !== 'pendiente') errors.push('Una sugerencia nueva debe estar pendiente.');
  return errors;
}

/** Call once per draft. Keep this same immutable entry after an uncertain send. */
export function createSuggestion({ type, title, description } = {}) {
  let id;
  try { id = globalThis.crypto.randomUUID(); }
  catch { throw new SuggestionError('ID_UNAVAILABLE'); }
  const entry = {
    schemaVersion: 1, id, createdAt: new Date().toISOString(), type,
    title: text(title) ? title.trim() : title,
    description: text(description) ? description.trim() : description,
    status: 'pendiente',
  };
  if (validateSuggestion(entry).length) throw new SuggestionError('INVALID_SUGGESTION');
  return Object.freeze(entry);
}

function snapshot(entry) {
  if (validateSuggestion(entry).length) throw new SuggestionError('INVALID_SUGGESTION');
  return Object.freeze(Object.fromEntries(KEYS.map(key => [key, entry[key]])));
}

function serialize(entry) { return `${JSON.stringify(entry, null, 2)}\n`; }

export function suggestionPath(entry) {
  if (validateSuggestion(entry).length) throw new SuggestionError('INVALID_SUGGESTION');
  return `${DIRECTORY}${entry.id}.json`;
}

function encode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}

function decode(value) {
  if (!text(value)) throw new Error();
  const compact = value.replace(/\s/g, '');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compact)) throw new Error();
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(compact), letter => letter.charCodeAt(0)));
}

/** Do not render raw exceptions or response bodies: they may contain private content. */
export function suggestionErrorFeedback(error) {
  if (error?.requiresVerification === true) return {
    code: error.code === 'CONTENT_MISMATCH' ? 'CONTENT_MISMATCH' : 'SAVE_UNKNOWN',
    kind: 'warning', requiresVerification: true,
    message: error.code === 'CONTENT_MISMATCH'
      ? 'El registro de GitHub no coincide con esta sugerencia. No se ha sobrescrito. Conserva el borrador y revisa el registro antes de continuar.'
      : 'No se puede confirmar si GitHub recibió la sugerencia. El texto se conserva. Pulsa «Comprobar guardado» antes de volver a enviarla; no se ha realizado ningún reintento automático.',
  };
  const messages = {
    MISSING_TOKEN: 'Conecta el cuaderno para registrar la sugerencia con tu acceso a GitHub.',
    INVALID_SUGGESTION: 'Revisa el tipo, el título (máximo 120 caracteres) y la descripción (máximo 5000).',
    ID_UNAVAILABLE: 'El navegador no puede generar un identificador seguro. Abre la app mediante su dirección HTTPS.',
    ENTRY_CHANGED: 'Conserva la sugerencia original hasta comprobar su envío. No se ha enviado un texto distinto con el mismo identificador.',
    HTTP_401: 'GitHub no acepta el token. Comprueba que siga vigente.',
    HTTP_403: 'GitHub ha denegado el envío. Comprueba Contents: lectura y escritura en el repositorio privado de datos; también puede haber límites o restricciones.',
    HTTP_404: 'No se encuentra el repositorio de datos o el token no tiene acceso.',
    HTTP_429: 'GitHub ha limitado las peticiones. Espera antes de volver a intentarlo.',
    READ_TIMEOUT: 'La comprobación ha tardado demasiado. Puedes volver a comprobar el envío.',
    READ_FAILED: 'No se ha podido consultar GitHub. Puedes volver a comprobar el envío.',
    INVALID_RESPONSE: 'La respuesta de GitHub no permite comprobar el envío.',
  };
  const code = Object.hasOwn(messages, error?.code ?? '') ? error.code : 'SUGGESTION_ERROR';
  return {
    code, kind: 'error', requiresVerification: false,
    message: `${messages[code] ?? 'No se ha podido completar la operación.'} El borrador se conserva. No se ha realizado ningún reintento automático.`,
  };
}

/** One creation-only JSON per UUID, separate from all academic files. Token stays in memory. */
export class SuggestionsStore {
  #token;
  #fetch;
  #timeout;
  #queue = Promise.resolve();
  #attempts = new Map();

  constructor({ token, fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
    if (!text(token) || !token.trim()) throw new SuggestionError('MISSING_TOKEN');
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl debe ser una función.');
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('timeoutMs debe ser positivo.');
    this.#token = token.trim();
    this.#fetch = fetchImpl.bind(globalThis);
    this.#timeout = timeoutMs;
  }

  #enqueue(operation) {
    const result = this.#queue.then(operation, operation);
    this.#queue = result.then(() => undefined, () => undefined);
    return result;
  }

  #attempt(entry) {
    const previous = this.#attempts.get(entry.id);
    const serialized = serialize(entry);
    if (previous && previous.serialized !== serialized) throw new SuggestionError('ENTRY_CHANGED');
    if (previous) return previous;
    const attempt = { entry, serialized, state: 'ready', receipt: null };
    this.#attempts.set(entry.id, attempt);
    return attempt;
  }

  async #request(method, path, body) {
    const writing = method === 'PUT';
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(writing ? uncertain() : new SuggestionError('READ_TIMEOUT'));
      }, this.#timeout);
    });
    const request = (async () => {
      let response;
      try {
        response = await this.#fetch(`${ROOT}${path}${writing ? '' : `?ref=${BRANCH}`}`, {
          method, signal: controller.signal, cache: 'no-store', redirect: 'error',
          headers: {
            Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.#token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            ...(writing ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(writing ? { body: JSON.stringify(body) } : {}),
        });
      } catch {
        throw writing ? uncertain() : new SuggestionError(controller.signal.aborted ? 'READ_TIMEOUT' : 'READ_FAILED');
      }
      if (!response || !Number.isInteger(response.status)) throw writing ? uncertain() : new SuggestionError('INVALID_RESPONSE');
      const status = response.status;
      if (writing && (status >= 500 || [408, 409, 422].includes(status))) throw uncertain('SAVE_UNKNOWN', status);
      if (status < 200 || status >= 300) {
        if (!writing && status === 404) {
          let value;
          try { value = await response.json(); } catch { throw new SuggestionError('INVALID_RESPONSE'); }
          if (object(value) && value.message === 'Not Found' && (!Object.hasOwn(value, 'status') || String(value.status) === '404')) return { missing: true };
          throw new SuggestionError('INVALID_RESPONSE');
        }
        throw new SuggestionError(`HTTP_${status}`, { status });
      }
      if (status !== (writing ? 201 : 200)) throw writing ? uncertain() : new SuggestionError('INVALID_RESPONSE');
      try { return { value: await response.json() }; }
      catch { throw writing ? uncertain() : new SuggestionError('INVALID_RESPONSE'); }
    })();
    try { return await Promise.race([request, timeout]); }
    finally { clearTimeout(timer); }
  }

  async #read(entry) {
    const path = suggestionPath(entry);
    const result = await this.#request('GET', path);
    if (result.missing) return null;
    const value = result.value;
    let remote;
    try {
      if (!object(value) || value.encoding !== 'base64' || !text(value.sha) || !SHA.test(value.sha)
        || value.path !== path || (Object.hasOwn(value, 'type') && value.type !== 'file')) throw new Error();
      remote = snapshot(JSON.parse(decode(value.content)));
    } catch { throw new SuggestionError('INVALID_RESPONSE'); }
    if (serialize(remote) !== serialize(entry)) throw uncertain('CONTENT_MISMATCH');
    return { sha: value.sha, entry: remote };
  }

  async #confirmRepositoryAccess() {
    // GitHub also returns 404 when access to a private repository is lost.
    // The fixed registry README must still be readable before absence is trusted.
    const path = `${DIRECTORY}README.md`;
    const result = await this.#request('GET', path);
    if (result.missing) throw new SuggestionError('HTTP_404', { status: 404 });
    const value = result.value;
    try {
      if (!object(value) || value.type !== 'file' || value.path !== path
        || value.encoding !== 'base64' || !text(value.sha) || !SHA.test(value.sha)) throw new Error();
      decode(value.content);
    } catch { throw new SuggestionError('INVALID_RESPONSE'); }
  }

  #receipt(entry, sha, commitSha = null) {
    const path = suggestionPath(entry);
    return Object.freeze({ saved: true, entry, path, sha, commitSha,
      url: `https://github.com/miGUITel/programacion-piloto-datos/blob/${BRANCH}/${path}` });
  }

  async save(value) {
    const entry = snapshot(value);
    return this.#enqueue(async () => {
      const attempt = this.#attempt(entry);
      if (attempt.state === 'saved') return attempt.receipt;
      if (attempt.state === 'uncertain') throw uncertain();
      const path = suggestionPath(entry);
      attempt.state = 'uncertain';
      try {
        const { value: receipt } = await this.#request('PUT', path, {
          message: `Registrar sugerencia de la app ${entry.id}`,
          content: encode(attempt.serialized), branch: BRANCH,
        });
        if (!object(receipt) || !text(receipt.content?.sha) || !SHA.test(receipt.content.sha)
          || receipt.content.path !== path || !text(receipt.commit?.sha) || !SHA.test(receipt.commit.sha)) throw uncertain();
        let confirmation;
        try { confirmation = await this.#read(entry); }
        catch (error) { throw error.code === 'CONTENT_MISMATCH' ? error : uncertain(); }
        if (!confirmation || confirmation.sha !== receipt.content.sha) throw uncertain();
        attempt.receipt = this.#receipt(entry, confirmation.sha, receipt.commit.sha);
        attempt.state = 'saved';
        return attempt.receipt;
      } catch (error) {
        // A definite rejection permits a deliberate retry; uncertain outcomes never do.
        if (error instanceof SuggestionError && !error.requiresVerification) attempt.state = 'ready';
        throw error;
      }
    });
  }

  async verify(value) {
    const entry = snapshot(value);
    return this.#enqueue(async () => {
      const attempt = this.#attempt(entry);
      // A failed verification must never become implicit permission to create.
      attempt.state = 'uncertain';
      const confirmation = await this.#read(entry);
      if (!confirmation) {
        await this.#confirmRepositoryAccess();
        attempt.state = 'ready';
        attempt.receipt = null;
        return Object.freeze({ saved: false, path: suggestionPath(entry) });
      }
      attempt.receipt = this.#receipt(entry, confirmation.sha, attempt.receipt?.commitSha ?? null);
      attempt.state = 'saved';
      return attempt.receipt;
    });
  }
}
