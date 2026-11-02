// The supported conversational workflow: an approved plan and its trace are one operation.
import { validateDocument } from './core.mjs?v=20261102-task-notes-resources';
import { planningSnapshot, validatePlanningChanges, excludedSession } from './replanning.mjs?v=20261102-task-notes-resources';

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = value => structuredClone(value);
const sha = value => /^[a-f0-9]{40}$/i.test(value ?? '');
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const isoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;

export class PlanningSaveError extends Error {
  constructor(code, message, { requiresReview = false } = {}) {
    super(message); this.name = 'PlanningSaveError'; this.code = code; this.requiresReview = requiresReview;
  }
}
const fail = message => { throw new PlanningSaveError('INVALID_PLANNING_OPERATION', message); };
const changed = () => { throw new PlanningSaveError('PLANNING_STALE', 'La versión del plan ha cambiado. Conserva la propuesta y vuelve a revisarla antes de publicar.', { requiresReview: true }); };

/**
 * Pure dry run. before/after have the same complete affected scope, as records
 * {entry,document,sha?}. Decisions are explicit; snapshots, added IDs and history
 * are generated, never reconstructed from prose or matching activity titles.
 */
export function preparePlanningOperation({ before, after, approval } = {}) {
  if (!approval || approval.approved !== true || !isoDate(approval.approvedOn) || !nonempty(approval.reason)) fail('Faltan la aprobación expresa, su fecha o el motivo.');
  if (approval.baseCommit !== undefined && !sha(approval.baseCommit)) fail('La versión anterior de referencia no es válida.');
  if (!Array.isArray(before) || !before.length || !Array.isArray(after) || before.length !== after.length) fail('Revisa el ámbito completo antes y después de la operación.');
  const bases = new Map(), proposals = new Map(); let moduleCode;
  for (const record of before) {
    if (!record?.entry || validateDocument(record.document, record.entry).length || !sha(record.sha)) fail('Una base no contiene un documento y una versión remota válidos.');
    if (bases.has(record.entry.unitId) || moduleCode && moduleCode !== record.entry.moduleCode) fail('El ámbito debe contener una vez cada UT de un único módulo.');
    moduleCode = record.entry.moduleCode; bases.set(record.entry.unitId, record);
  }
  for (const record of after) {
    const id = record?.entry?.unitId, base = bases.get(id);
    if (!base || proposals.has(id) || !equal(record.entry, base.entry) || validateDocument(record.document, record.entry).length) fail('La propuesta debe conservar las identidades y el ámbito leídos.');
    if (!equal(record.document.planningChanges, base.document.planningChanges)) fail('La propuesta no puede añadir ni sustituir a mano la traza anterior.');
    proposals.set(id, record);
  }
  if (proposals.size !== bases.size) fail('Falta una UT del ámbito afectado.');
  const id = approval.id ?? `planning-${globalThis.crypto.randomUUID()}`;
  if (!nonempty(id) || [...bases.values()].some(r => r.document.planningChanges?.some(c => c.id === id))) fail('La operación necesita un identificador nuevo y estable.');
  const decisions = approval.resolutions ?? [];
  if (!Array.isArray(decisions)) fail('Las resoluciones deben ser una lista explícita.');
  const decisionKeys = new Set();
  for (const decision of decisions) {
    const key = `${decision?.unitId}/${decision?.sessionId}`;
    if (!bases.has(decision?.unitId) || decisionKeys.has(key)) fail('Una resolución falta en el ámbito o está repetida.');
    decisionKeys.add(key);
  }
  const scope = [...bases.keys()].sort(), changes = [];
  for (const [unitId, base] of bases) {
    const document = clone(proposals.get(unitId).document);
    const resolutions = decisions.filter(r => r.unitId === unitId).map(decision => {
      const source = base.document.sessions.find(s => s.id === decision.sessionId);
      const retained = document.sessions.find(s => s.id === decision.sessionId);
      if (!source || !retained || !excludedSession(retained)) fail('Una resolución necesita un antecedente conservado como Cancelada o Reprogramada.');
      delete retained.replanningPending;
      return { sessionId: source.id, sourceDate: source.date, outcome: decision.outcome, targets: clone(decision.targets ?? []), ...(decision.note !== undefined ? { note: decision.note } : {}) };
    });
    // Other explicitly unresolved incidents remain unresolved; resolving one does not resolve the rest.
    for (const session of document.sessions) {
      const previous = base.document.sessions.find(s => s.id === session.id);
      if (previous?.replanningPending === true && !resolutions.some(r => r.sessionId === session.id) && session.replanningPending !== true) fail('No se puede retirar un pendiente sin su resolución explícita.');
      if (excludedSession(session) && previous && !excludedSession(previous) && !resolutions.some(r => r.sessionId === session.id) && session.replanningPending !== true) fail('Una nueva incidencia sin resolver debe quedar pendiente de reprogramar.');
    }
    const beforeSessions = planningSnapshot(base.document), afterSessions = planningSnapshot(document);
    const addedSessionIds = afterSessions.filter(s => !beforeSessions.some(b => b.id === s.id)).map(s => s.id);
    const change = { id, affectedUnitIds: scope, approvedOn: approval.approvedOn, reason: approval.reason,
      ...(approval.baseCommit ? { baseCommit: approval.baseCommit } : {}), beforeSessions, afterSessions, addedSessionIds, resolutions };
    document.planningChanges = [...clone(base.document.planningChanges ?? []), change];
    const errors = [...validateDocument(document, base.entry), ...validatePlanningChanges(document)];
    if (errors.length) fail('La operación no conserva el contrato de planificación: ' + errors.join(' '));
    changes.push({ entry: clone(base.entry), sha: base.sha, document });
  }
  // Validate destinations against the whole new scope; a missing/cancelled target cannot clear a pending incident.
  for (const record of changes) for (const resolution of record.document.planningChanges.at(-1).resolutions) {
    for (const target of resolution.targets) {
      const destination = changes.find(r => r.entry.unitId === target.unitId);
      const session = destination?.document.sessions.find(s => s.id === target.sessionId);
      if (!session || excludedSession(session)) fail('Falta un destino activo y confirmado de recuperación en el ámbito.');
      const isAdded = destination.document.planningChanges.at(-1).addedSessionIds.includes(session.id);
      if (resolution.outcome === 'added' && !isAdded || resolution.outcome === 'absorbed' && isAdded) fail('La resolución debe distinguir una sesión añadida de una ya prevista.');
    }
  }
  if (!changes.some(r => !equal(r.document.sessions, bases.get(r.entry.unitId).document.sessions)) && !decisions.length) fail('La propuesta no contiene un cambio de planificación ni una resolución.');
  return { id, moduleCode, approval: clone(approval), bases: clone(before), changes };
}

/** No automatic retries. All bases are reread before the single atomic writer. */
export async function savePlanningOperation({ operation, store, unitStore, guards = [] } = {}) {
  if (!operation || !Array.isArray(operation.bases) || !Array.isArray(operation.changes) || typeof store?.saveDocuments !== 'function' || typeof unitStore !== 'function') fail('Falta una operación preparada y el guardado conjunto.');
  // Rebuild the plan to prevent a caller from changing the generated trace after review.
  const proposals = operation.changes.map(record => {
    const copy = clone(record), base = operation.bases.find(r => r.entry.unitId === copy.entry.unitId);
    if (!base) fail('La operación ha perdido su base.');
    if (Object.hasOwn(base.document, 'planningChanges')) copy.document.planningChanges = clone(base.document.planningChanges);
    else delete copy.document.planningChanges;
    return copy;
  });
  const rebuilt = preparePlanningOperation({ before: operation.bases, after: proposals, approval: { ...operation.approval, id: operation.id } });
  if (!equal(rebuilt.changes, operation.changes)) fail('El plan o su traza cambiaron después de preparar la operación.');
  const consulted = [...operation.bases, ...guards];
  if (new Set(consulted.map(r => r.entry?.path)).size !== consulted.length) fail('Hay versiones consultadas repetidas.');
  const reads = await Promise.all(consulted.map(async record => {
    const current = await unitStore(record.entry).load();
    if (current.sha !== record.sha || record.document && !equal(current.document, record.document)) changed();
    return current;
  }));
  if (reads.length !== consulted.length) changed();
  const result = await store.saveDocuments(clone(operation.changes), guards.map(r => ({ entry: clone(r.entry), sha: r.sha })), { message: `Reprogramar ${operation.moduleCode} y registrar traza` });
  // The underlying store verifies its commit; this independent reread also protects custom writers.
  for (const record of operation.changes) {
    let current;
    try { current = await unitStore(record.entry).load(); }
    catch { throw new PlanningSaveError('PLANNING_SAVE_UNKNOWN', 'No se ha podido confirmar la reprogramación. Conserva la propuesta y revisa GitHub antes de reenviar.', { requiresReview: true }); }
    if (!equal(current.document, record.document) || !result?.results?.some(r => r.entry.path === record.entry.path && r.sha === current.sha)) throw new PlanningSaveError('PLANNING_SAVE_UNKNOWN', 'La relectura no confirma el plan y su traza. Conserva la propuesta y revisa GitHub antes de reenviar.', { requiresReview: true });
  }
  return result;
}
