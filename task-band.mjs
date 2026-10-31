import { visiblePlanTasks } from './task-plan.mjs?v=20261027-rf32';

const preferredTypes = ['assignment', 'guide'];
const fallbackTypes = new Set(['presentation', 'web', 'tool', 'notes', 'example', 'moodle', 'other']);
const examParts = new Set(['test', 'practical']);
const unique = values => [...new Set(values)];

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
    return { id: task.id, code: task.code, label: taskBandLabel(task.code), title: task.title,
      resources: structuredClone(selected), unresolved: links.unresolved };
  });
  const examLinks = visible.filter(task => task.type === 'exam').map(linked);
  const examResources = new Map(examLinks.flatMap(links => links.resources).filter(resource => resource.type === 'exam').map(resource => [resource.id, resource]));
  const unresolved = unique(examLinks.flatMap(links => links.unresolved));
  const unclassified = [...examResources.values()].filter(resource => !examParts.has(resource.examPart));
  const exams = [ ['test', 'Test', 'Examen test'], ['practical', 'Práctico', 'Examen práctico'] ].map(([id, label, title]) => ({
    id, label, title,
    resources: structuredClone([...examResources.values()].filter(resource => resource.examPart === id)),
    unresolved: [...unresolved], unclassified: structuredClone(unclassified),
  }));
  return { tasks, exams };
}
