import { PreparationError, assertPreparationRead, preparePreparationSave } from './preparation.mjs?v=20261101-preparation-links';
import { taskLinks, sameTaskLinks, detachTaskLinks, removalImpact } from './preparation-links.mjs?v=20261101-preparation-links';
import { saveTaskDocument } from './task-edit.mjs?v=20261101-preparation-links';

const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const conflict = () => { throw new PreparationError('PREPARATION_STALE','Han cambiado las sesiones vinculadas o su versión. Conserva el borrador y vuelve a revisar la eliminación antes de guardar.'); };

export async function savePreparationWithLinks({loaded,entry,values,active,records=[],confirmations=new Map(),store,unitStore}) {
  const ids = values.removals ?? [];
  for (const id of ids) if (!equal(confirmations.get(id),removalImpact(loaded.document,id,records))) conflict();
  const prepared = preparePreparationSave(loaded,entry,values,active,records);
  const candidates = ids.length ? records.filter(record => record.entry.path !== entry.path && record.document.module.code === entry.moduleCode) : [];
  if (!candidates.length) return {prepared,result:await saveTaskDocument(store,prepared,{entry},loaded.sha),related:[]};
  // Reread the whole module: a new continuation elsewhere also needs confirmation.
  const reads = await Promise.allSettled(candidates.map(record => unitStore(record.entry).load()));
  const fresh = reads.map((read,index) => {
    if (read.status !== 'fulfilled') throw read.reason;
    const target = candidates[index].entry;
    assertPreparationRead(read.value,target,active);
    if (ids.some(id => !sameTaskLinks(candidates[index].document,read.value.document,id))) conflict();
    return {entry:target,...read.value};
  });
  const freshRecords = records.map(record => fresh.find(item => item.entry.path===record.entry.path) ?? record);
  for (const id of ids) if (!equal(confirmations.get(id),removalImpact(loaded.document,id,freshRecords))) conflict();
  const patches = fresh.filter(item => ids.some(id=>taskLinks(item.document,id).length)).map(item => {
    let unitDraft = null;
    if (active?.path === item.entry.path) {
      if (ids.some(id => !sameTaskLinks(item.document,active.draft,id))) conflict();
      unitDraft = detachTaskLinks(structuredClone(active.draft),ids);
    }
    return {entry:item.entry,sha:item.sha,document:detachTaskLinks(structuredClone(item.document),ids),prepared:{unitDraft}};
  });
  const guards = fresh.filter(item=>!patches.some(patch=>patch.entry.path===item.entry.path)).map(item=>({entry:item.entry,sha:item.sha}));
  const written = await store.saveDocuments([{entry,sha:loaded.sha,document:prepared.document},...patches],guards);
  return {prepared,result:written.results.find(item => item.entry.path===entry.path),
    related:patches.map(patch=>({entry:patch.entry,prepared:patch.prepared,result:written.results.find(item=>item.entry.path===patch.entry.path)}))};
}
