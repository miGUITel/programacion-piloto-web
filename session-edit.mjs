// Only titles and planned descriptions belong to this independent transaction.
export class SessionEditError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = (code, message) => { throw new SessionEditError(code, message); };
const sessionFor = (document, sessionId) => document?.sessions?.find(session => session.id === sessionId);

export function sessionTextValues(document, sessionId) {
  const session = sessionFor(document, sessionId);
  if (!session) fail('SESSION_MISSING', 'La sesión ya no está en esta unidad. Conserva el borrador y revisa la unidad.');
  return session.activities.map(({ id, title, planned }) => ({ id, title, planned }));
}

export function assertSessionRead(loaded, entry, sessionId, active) {
  if (!loaded?.sha || loaded.document?.unit?.id !== entry.unitId || loaded.document?.module?.code !== entry.moduleCode) {
    fail('SESSION_MISSING', 'No se ha podido comprobar la sesión y su unidad de origen.');
  }
  sessionTextValues(loaded.document, sessionId);
  if (!active || active.path !== entry.path || active.blocked || active.sha !== loaded.sha || !equal(active.savedDocument, loaded.document)) {
    fail('SESSION_STALE', 'La unidad abierta y GitHub tienen versiones distintas o un guardado pendiente de comprobar. Conserva sus notas y revisa la unidad antes de guardar la sesión.');
  }
}

export function prepareSessionSave(loaded, entry, sessionId, values, active) {
  assertSessionRead(loaded, entry, sessionId, active);
  const before = sessionTextValues(loaded.document, sessionId);
  if (!Array.isArray(values) || values.length !== before.length || new Set(values.map(a => a?.id)).size !== before.length
    || values.some(a => !a || !before.some(b => b.id === a.id) || typeof a.title !== 'string' || !a.title.trim() || /[\r\n]/.test(a.title) || typeof a.planned !== 'string')) {
    fail('SESSION_INVALID', 'Cada actividad necesita un título en una línea. Revisa los textos y las actividades de la sesión.');
  }
  const document = structuredClone(loaded.document), unitDraft = structuredClone(active.draft);
  const target = sessionFor(document, sessionId), local = sessionFor(unitDraft, sessionId);
  if (!local || !equal(local.activities.map(a => a.id), target.activities.map(a => a.id))) {
    fail('SESSION_LOCAL_CONFLICT', 'Las actividades han cambiado en el borrador de Unidad. Conserva y revisa ambos borradores.');
  }
  for (const value of values) {
    const original = before.find(a => a.id === value.id), remoteActivity = target.activities.find(a => a.id === value.id), localActivity = local.activities.find(a => a.id === value.id);
    for (const field of ['title', 'planned']) {
      if (original[field] === value[field]) continue;
      if (localActivity[field] !== original[field] && localActivity[field] !== value[field]) {
        fail('SESSION_LOCAL_CONFLICT', 'Hay dos cambios distintos en el mismo texto: uno en Unidad y otro en este editor. No se ha enviado ninguno. Conserva ambos borradores para revisarlos.');
      }
      remoteActivity[field] = value[field]; localActivity[field] = value[field];
    }
  }
  return { document, unitDraft };
}
