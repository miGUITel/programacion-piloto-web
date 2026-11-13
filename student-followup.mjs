import { unitCurriculum } from './unit-curriculum.mjs?v=20261111-followup';

// Navigation and counts only. Individual records stay in Google.
export const FOLLOWUP_SETTING = 'cuaderno.student-followup.url.v1';
export const SUMMARY_CHANNEL = 'cuaderno.followup-summary.v1';
export const validSummaryNonce = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
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
export function followupUrl(base, context = {}, curriculum = []) {
  const safe = followupBase(base); if (!safe) throw Error('Pega la URL de Apps Script terminada en /exec, sin parámetros.');
  const kind = context.kind || 'all';
  if (!['all', 'exam', 'ra'].includes(kind) || kind !== 'all' && (!clean(context.module) || !clean(context.ref))) throw Error('Falta la identidad del examen o RA.');
  const url = new URL(safe); url.searchParams.set('v', '1'); url.searchParams.set('kind', kind);
  for (const key of ['course', 'group', 'module', 'ref', 'label']) if (clean(context[key])) url.searchParams.set(key, context[key]);
  if (curriculum.length) url.searchParams.set('curriculum', JSON.stringify(curriculum));
  return url.href;
}

export function followupCurriculum(profiles) {
  return [...profiles].flatMap(([code, profile]) => {
    if (!/^[A-Z0-9_-]{1,20}$/.test(code) || profile?.module?.code !== code) return [];
    const ras = [...new Set((profile.curriculum?.outcomes ?? []).map(ra => ra.code)
      .filter(ref => clean(ref) && ref.trim() && ref.length <= 40))];
    return ras.length ? [{ code, ras }] : [];
  });
}

function countKey(row) {
  return JSON.stringify([row.course, row.group, row.module, row.kind, row.ref]);
}

export function validatePendingCounts(rows) {
  if (!Array.isArray(rows) || rows.length > 2000) return null;
  const counts = new Map();
  const allowed = ['course', 'group', 'module', 'kind', 'ref', 'count'];
  for (const row of rows) {
    if (!row || Object.keys(row).length !== allowed.length || !allowed.every(key => Object.hasOwn(row, key))
      || !['course', 'group', 'module', 'ref'].every(key => clean(row[key]) && row[key].trim())
      || !['exam', 'ra'].includes(row.kind) || !Number.isSafeInteger(row.count) || row.count < 1) return null;
    const key = countKey(row);
    if (counts.has(key)) return null;
    counts.set(key, row.count);
  }
  return counts;
}

export function pendingCount(counts, context) {
  return context.course && context.group ? counts?.get(countKey(context)) ?? 0 : 0;
}

export function unitFollowupAlerts(unit, profile, exams, count) {
  const ra = [], exam = [];
  const module = unit.module.code;
  if (profile?.module?.code === module && unit.unit.id) {
    const seen = new Set();
    for (const { code: ref, label } of unitCurriculum(unit, profile).outcomes) {
      if (!ref || seen.has(ref)) continue;
      seen.add(ref);
      const target = { kind: 'ra', module, ref, label };
      const pending = count(target);
      if (pending) ra.push({ target, pending });
    }
  }
  const seen = new Set();
  for (const task of exams) {
    const target = examFollowup(task);
    if (!target || target.module !== module || seen.has(target.ref)) continue;
    seen.add(target.ref);
    const pending = count(target);
    if (pending) exam.push({ target, pending });
  }
  return { ra, exam };
}
