// Navigation only. No student records or Google credentials enter Cuaderno.
export const FOLLOWUP_SETTING = 'cuaderno.student-followup.url.v1';
const clean = value => typeof value === 'string' && value.length <= 300 && !/[\u0000-\u001f\u007f]/.test(value) ? value : '';
export function followupBase(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || url.port || url.username || url.password
      || !/^\/(?:macros|a\/macros\/[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname) || url.search || url.hash) return null;
    return url.href;
  } catch { return null; }
}
export function examFollowup(task) {
  const id = task?.officialTaskId || task?.registryTaskId;
  if (task?.type !== 'exam' || !clean(id) || !clean(task.entry?.moduleCode)) return null;
  return { kind: 'exam', module: task.entry.moduleCode, ref: id,
    label: clean([task.code, task.title].filter(Boolean).join(' · ')) };
}
export function followupUrl(base, context = {}) {
  const safe = followupBase(base); if (!safe) throw Error('Pega la URL de Apps Script terminada en /exec, sin parámetros.');
  const kind = context.kind || 'all';
  if (!['all', 'exam', 'ra'].includes(kind) || kind !== 'all' && (!clean(context.module) || !clean(context.ref))) throw Error('Falta la identidad del examen o RA.');
  const url = new URL(safe); url.searchParams.set('v', '1'); url.searchParams.set('kind', kind);
  for (const key of ['course', 'group', 'module', 'ref', 'label']) if (clean(context[key])) url.searchParams.set(key, context[key]);
  return url.href;
}
