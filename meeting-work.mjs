const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value + 'T12:00:00Z'))
  && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
const key = record => record.id ?? `schedule:${record.meetingId}:${record.date}`;
export const MEETING_TASK_STATES = ['pending', 'in-progress', 'completed'];
export const MEETING_MINUTE_STATES = ['draft', 'reviewed'];
export const MEETING_TASK_LABELS = { pending: 'Pendiente', 'in-progress': 'En curso', completed: 'Completada' };

const groupOf = (doc, record) => doc?.groups?.find(group => group.id === record?.groupId)
  ?? doc?.groups?.find(group => group.scheduleRefs?.includes(record?.meetingId)) ?? null;

/** Optional RF 24 fields. Absence leaves schema 1/2 documents unchanged. */
export function validateMeetingWork(doc) {
  if (!object(doc) || !Array.isArray(doc.meetings)) return ['Registro de reuniones no válido.'];
  const errors = [], records = new Map(doc.meetings.filter(object).map(record => [key(record), record]));
  const taskIds = new Set(), minuteIds = new Set();
  if (doc.meetingTasks !== undefined && !Array.isArray(doc.meetingTasks)) errors.push('Las tareas de reuniones deben ser una lista.');
  for (const task of Array.isArray(doc.meetingTasks) ? doc.meetingTasks : []) {
    if (!object(task)) { errors.push('Tarea de reunión no válida.'); continue; }
    if (!text(task.id) || taskIds.has(task.id)) errors.push('Identificador de tarea de reunión no válido o duplicado.');
    taskIds.add(task.id);
    if (!text(task.title)) errors.push('La tarea de reunión necesita un título.');
    if (!MEETING_TASK_STATES.includes(task.status)) errors.push('Estado de tarea de reunión no válido.');
    const record = records.get(task.recordId);
    if (!text(task.recordId) || !record) errors.push('La reunión de origen de la tarea no existe.');
    if (task.groupId !== undefined && (!text(task.groupId) || groupOf(doc, record)?.id !== task.groupId)) errors.push('El grupo de la tarea no coincide con su reunión.');
    if (task.dueOn !== undefined && !date(task.dueOn)) errors.push('Plazo de tarea de reunión no válido.');
    if (task.notes !== undefined && typeof task.notes !== 'string') errors.push('Las observaciones de tarea deben ser texto.');
    if (task.deleted !== undefined && typeof task.deleted !== 'boolean') errors.push('Marca de eliminación de tarea no válida.');
  }
  for (const record of doc.meetings.filter(object)) {
    if (record.minutes === undefined) continue;
    const minutes = record.minutes;
    if (!object(minutes)) { errors.push('Memoria de reunión no válida.'); continue; }
    if (!text(minutes.id) || minuteIds.has(minutes.id)) errors.push('Identificador de memoria no válido o duplicado.');
    minuteIds.add(minutes.id);
    if (!MEETING_MINUTE_STATES.includes(minutes.status)) errors.push('Estado de memoria no válido.');
    if (!text(minutes.text)) errors.push('La memoria de reunión necesita texto.');
    if (minutes.taskSnapshot !== undefined && !Array.isArray(minutes.taskSnapshot)) errors.push('Las tareas de la memoria deben ser una lista.');
    const snapshotIds = new Set();
    for (const task of Array.isArray(minutes.taskSnapshot) ? minutes.taskSnapshot : []) {
      if (!object(task) || !text(task.id) || snapshotIds.has(task.id) || !text(task.title) || !MEETING_TASK_STATES.includes(task.status) || (task.dueOn !== undefined && !date(task.dueOn))) {
        errors.push('Referencia histórica de tarea no válida en la memoria.');
      }
      if (object(task)) snapshotIds.add(task.id);
    }
  }
  return errors;
}

function assertDocument(doc) {
  if (!object(doc) || ![1, 2].includes(doc.schemaVersion) || doc.kind !== 'meeting-notes' || validateMeetingWork(doc).length) throw Error('Registro de reuniones no válido.');
}

function selectedRecord(doc, anchor) {
  if (typeof anchor === 'string') return doc.meetings.find(record => key(record) === anchor) ?? null;
  if (!object(anchor)) return null;
  if (text(anchor.id)) {
    const exact = doc.meetings.find(record => record.id === anchor.id);
    if (exact) return exact;
  }
  return text(anchor.meetingId) && date(anchor.date)
    ? doc.meetings.find(record => record.meetingId === anchor.meetingId && record.date === anchor.date) ?? null : null;
}

function metadata(record) {
  const result = { date: record.date };
  for (const field of ['id', 'meetingId', 'groupId', 'title']) if (record[field] !== undefined) result[field] = record[field];
  return result;
}

/** Clean identity only: pending note controls are never copied into independent saves. */
export function meetingAnchor(doc, anchor) {
  assertDocument(doc);
  const existing = selectedRecord(doc, anchor);
  if (existing) return metadata(existing);
  if (!object(anchor) || !date(anchor.date)) throw Error('Selecciona una reunión válida.');
  const result = metadata(anchor);
  if (result.id !== undefined && !text(result.id)) throw Error('Identificador de reunión no válido.');
  if (result.groupId !== undefined && !doc.groups?.some(group => group.id === result.groupId)) throw Error('Grupo de reunión no válido.');
  if (text(result.meetingId)) {
    const group = groupOf(doc, result);
    if (group && result.groupId === undefined) result.groupId = group.id;
  } else if (doc.schemaVersion !== 2 || !text(result.id) || !text(result.title) || !doc.groups?.some(group => group.id === result.groupId)) {
    throw Error('La reunión manual necesita un identificador, grupo y título.');
  }
  return result;
}

function ensureRecord(doc, anchor) {
  const existing = selectedRecord(doc, anchor);
  if (existing) return existing;
  const clean = meetingAnchor(doc, anchor);
  const record = { ...clean, topics: [], requests: [], notes: '' };
  doc.meetings.push(record);
  return record;
}

/** One administrative task has one origin, regardless of how many later meetings review it. */
export function withMeetingTask(doc, anchor, taskId = null, fields = {}, { remove = false } = {}) {
  assertDocument(doc);
  const next = structuredClone(doc);
  const source = selectedRecord(next, anchor);
  const index = taskId ? (next.meetingTasks ?? []).findIndex(task => task.id === taskId) : -1;
  if (taskId && index < 0) throw Error('La tarea original ya no existe.');
  const previous = index >= 0 ? next.meetingTasks[index] : null;
  if (previous && (!source || previous.recordId !== key(source))) throw Error('La tarea pertenece a otra reunión.');
  if (remove) {
    if (!previous) throw Error('Selecciona una tarea para eliminar.');
    next.meetingTasks[index] = { ...previous, deleted: true };
  } else {
    if (!object(fields)) throw Error('Revisa los campos de la tarea.');
    if (previous?.deleted) throw Error('La tarea está eliminada.');
    const record = previous ? source : ensureRecord(next, anchor);
    const group = groupOf(next, record);
    const task = previous ? { ...previous } : { id: fields.id, recordId: key(record), ...(group ? { groupId: group.id } : {}), status: 'pending' };
    for (const field of ['title', 'status', 'notes']) if (Object.hasOwn(fields, field)) task[field] = fields[field];
    if (Object.hasOwn(fields, 'dueOn')) { if (fields.dueOn === '' || fields.dueOn === undefined || fields.dueOn === null) delete task.dueOn; else task.dueOn = fields.dueOn; }
    if (!next.meetingTasks) next.meetingTasks = [];
    if (previous) next.meetingTasks[index] = task; else next.meetingTasks.push(task);
  }
  const errors = validateMeetingWork(next);
  if (errors.length) throw Error(errors[0]);
  return next;
}

export function meetingTaskRows(doc, { groupId = null, recordId = null, includeCompleted = true } = {}) {
  const records = new Map((doc?.meetings ?? []).filter(object).map(record => [key(record), record]));
  const order = status => MEETING_TASK_STATES.indexOf(status);
  return (Array.isArray(doc?.meetingTasks) ? doc.meetingTasks : [])
    .filter(task => object(task) && !task.deleted && (!recordId || task.recordId === recordId)
      && (!groupId || (task.groupId ?? groupOf(doc, records.get(task.recordId))?.id) === groupId)
      && (includeCompleted || task.status !== 'completed'))
    .map(task => structuredClone(task))
    .sort((a, b) => order(a.status) - order(b.status) || (a.dueOn ?? '9999-99-99').localeCompare(b.dueOn ?? '9999-99-99') || a.title.localeCompare(b.title, 'es') || a.id.localeCompare(b.id));
}

function taskSnapshot(doc, record) {
  return meetingTaskRows(doc, { recordId: key(record) }).map(task => ({ id: task.id, title: task.title, status: task.status, ...(task.dueOn ? { dueOn: task.dueOn } : {}) }));
}

/** Saving a reviewed memory freezes the task facts of that review, rather than live links. */
export function withMeetingMinutes(doc, anchor, fields) {
  assertDocument(doc);
  if (!object(fields) || !text(fields.text)) throw Error('Añade texto a la memoria antes de guardar.');
  const next = structuredClone(doc), record = ensureRecord(next, anchor), previous = record.minutes;
  const minutes = previous ? { ...previous } : { id: fields.id, status: 'draft' };
  for (const field of ['text', 'status']) if (Object.hasOwn(fields, field)) minutes[field] = fields[field];
  if (!previous?.taskSnapshot || previous.status !== 'reviewed' || minutes.status === 'draft') minutes.taskSnapshot = taskSnapshot(next, record);
  record.minutes = minutes;
  const errors = validateMeetingWork(next);
  if (errors.length) throw Error(errors[0]);
  return next;
}

/** A plain editable working-memory template, never an assertion that planned topics happened. */
export function draftMeetingMinutes(doc, anchor) {
  assertDocument(doc);
  const record = selectedRecord(doc, anchor), clean = meetingAnchor(doc, anchor), group = groupOf(doc, record ?? clean);
  const list = values => values?.length ? values.map(value => '- ' + value).join('\n') : 'Sin contenido guardado.';
  const tasks = record ? meetingTaskRows(doc, { recordId: key(record) }) : [];
  return [
    '# Memoria de trabajo', '', `Reunión: ${record?.title || clean.title || group?.title || 'Reunión'}`, `Fecha: ${clean.date}`, '',
    '## Temas previstos', list(record?.topics), '',
    '## Temas tratados', 'Por completar al revisar las notas.', '',
    '## Notas recogidas', record?.notes || 'Sin notas guardadas.', '',
    '## Acuerdos expresos', 'Por anotar o confirmar. Los temas previstos no implican acuerdos.', '',
    '## Tareas vinculadas', tasks.length ? tasks.map(task => `- ${task.title} — ${MEETING_TASK_LABELS[task.status]}${task.dueOn ? ` — Plazo: ${task.dueOn}` : ''}`).join('\n') : 'Sin tareas guardadas.', '',
    '## Ruegos y propuestas', list(record?.requests), '',
  ].join('\n');
}
