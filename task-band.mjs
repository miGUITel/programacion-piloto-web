import { visiblePlanTasks } from './task-plan.mjs?v=20261109-common-preparation';
import { safeResourceUrl, validGithubLocation } from './resources.mjs?v=20261109-common-preparation';

const preferredTypes = ['assignment', 'guide'];
const fallbackTypes = new Set(['presentation', 'web', 'tool', 'notes', 'example', 'moodle', 'other']);
const examParts = new Set(['test', 'practical']);
const unique = values => [...new Set(values)];
const accessible = resource => validGithubLocation(resource.location)
  || resource.location?.kind === 'https' && safeResourceUrl(resource.location.url, resource.location.public === true);

// A resource is optional navigation, never the authority for preparation.
function examRoles(task, links) {
  if (Object.hasOwn(task, 'examPart')) return task.examPart === 'both' ? ['test', 'practical'] : examParts.has(task.examPart) ? [task.examPart] : [];
  return unique(links.resources.filter(resource => resource.type === 'exam' && examParts.has(resource.examPart)).map(resource => resource.examPart));
}

function examAccess(task, links, part) {
  const guides = links.resources.filter(resource => resource.type === 'guide' && resource.audience === 'teacher');
  const availableGuides = guides.filter(accessible);
  if (availableGuides.length) return { resources: availableGuides, warnings: [] };
  const explicit = Object.hasOwn(task, 'examPart');
  const documents = links.resources.filter(resource => resource.type === 'exam'
    && (!part || resource.examPart === part || explicit && !examParts.has(resource.examPart)));
  return { resources: documents.length ? documents : guides,
    warnings: [...links.unresolved, ...(explicit ? [] : links.resources.filter(resource => resource.type === 'exam' && !examParts.has(resource.examPart)))] };
}

export function taskBandLabel(code) {
  const value = String(code ?? '');
  if (/^\d{4}$/.test(value)) return value.slice(-2);
  if (/^\d{1,2}$/.test(value)) return value.padStart(2, '0');
  return value || 'Sin código';
}

// Navigation only: the official list and its explicit references remain untouched.
export function taskBand(document) {
  if (!document) return { tasks: [], exams: [] };
  const resources = new Map((document.resources ?? []).map(resource => [resource.id, resource]));
  const seen = new Set();
  const visible = visiblePlanTasks(document).filter(task => {
    if (seen.has(task.id)) return false;
    seen.add(task.id); return true;
  });
  const linked = task => {
    const refs = unique(task.resourceRefs ?? []);
    return {
      resources: refs.filter(id => resources.has(id)).map(id => resources.get(id)),
      unresolved: refs.filter(id => !resources.has(id)),
    };
  };
  const tasks = visible.filter(task => task.type !== 'exam').map(task => {
    const links = linked(task);
    const preferred = preferredTypes.flatMap(type => links.resources.filter(resource => resource.type === type));
    const selected = preferred.length ? preferred : links.resources.filter(resource => fallbackTypes.has(resource.type) && resource.audience !== 'teacher');
    return { id: task.id, code: task.code, label: taskBandLabel(task.code), title: task.title, prepared: task.preparation === 'ready', known: true,
      resources: structuredClone(selected), unresolved: links.unresolved };
  });
  const examTasks = visible.filter(task => task.type === 'exam');
  const details = examTasks.map(task => { const links = linked(task); return { task, links, roles: examRoles(task, links) }; });
  function examItem(id, label, title, owners, part) {
    const access = owners.map(owner => examAccess(owner.task, owner.links, part));
    const selected = new Map(access.flatMap(item => item.resources).map(resource => [resource.id, resource]));
    const guides = [...selected.values()].filter(resource => resource.type === 'guide' && resource.audience === 'teacher' && accessible(resource));
    const unclassified = new Map(owners.flatMap(owner => owner.links.resources)
      .filter(resource => resource.type === 'exam' && !examParts.has(resource.examPart)).map(resource => [resource.id, resource]));
    return { id, ...(part ? { examPart: part } : {}), label, title,
      ownerIds: owners.map(owner => owner.task.id),
      prepared: owners.length > 0 && owners.every(owner => owner.task.preparation === 'ready'), known: owners.length > 0,
      resources: structuredClone(guides.length ? guides : [...selected.values()]), unresolved: unique(owners.flatMap(owner => owner.links.unresolved)),
      unclassified: structuredClone([...unclassified.values()]), accessWarnings: guides.length ? [] : structuredClone(unique(access.flatMap(item => item.warnings))) };
  }
  const exams = [];
  for (const [part, label, title] of [['test', 'Test', 'Examen test'], ['practical', 'Práctico', 'Examen práctico']]) {
    const owners = details.filter(owner => owner.roles.includes(part));
    if (owners.length || !examTasks.length) exams.push(examItem(part, label, title, owners, part));
  }
  // Unclassified exams retain their own identity and mark instead of inventing parts.
  for (const owner of details.filter(item => !item.roles.length)) {
    exams.push(examItem(owner.task.id, String(owner.task.code || 'Sin código'), owner.task.title, [owner]));
  }
  return { tasks, exams };
}
