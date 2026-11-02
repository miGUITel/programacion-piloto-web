import { rowResources, modulePresentationFolder, effectiveResourceDestinations } from './resources.mjs?v=20261102-ppt-guided-icons';

/** A display shortcut, never another academic association or preparation input. */
export function sessionRowResources(document, session, activity, records = [], moduleResources = []) {
  const linked = rowResources(document, session, activity, records);
  const firstId = session.activities?.[0]?.id;
  if (!firstId || activity?.id !== firstId) return linked;
  const folder = modulePresentationFolder(moduleResources);
  if (!folder) return linked;
  return { ...linked, resources: effectiveResourceDestinations([...linked.resources, folder], moduleResources) };
}
