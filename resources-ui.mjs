import { resourceTypes, resourceValues, assertResourceRead, prepareResourceSave, ResourceEditError, parsePrivateLocation, locationInput, safeResourceUrl, validateResources, validateModuleResources } from './resources.mjs?v=20261018-rf12';
import { saveTaskDocument } from './task-edit.mjs?v=20261018-rf12';
import { saveErrorFeedback } from './core.mjs?v=20261018-rf12';
import { renderPrivateMarkdown } from './private-markdown.mjs?v=20261018-rf12';
const $ = id => document.getElementById(id);
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const el = (tag, css = '', value) => { const item = document.createElement(tag); item.className = css; if (value !== undefined) item.textContent = value; return item; };
const button = (text, action, css = 'button button-small') => { const item = el('button', css, text); item.type = 'button'; item.addEventListener('click', action); return item; };
export function createResourcesUI({ getState, getActive, getConnection, unitStore, isBusy, setBusy, canOpen, onStateChange, onSaved, onBlocked, onMessage }) {
  const modules = new Map(), stores = new Map();
  let loaded = null, source = null, target = null, scope = 'unit', values = null, blocked = false, editing = null, initialForm = null, position = null;
  let privateGeneration = 0;
  const removed = new Map();
  const moduleStore = code => { if (!stores.has(code)) stores.set(code, getConnection().forModuleResources(code)); return stores.get(code); };
  const changed = () => Boolean(loaded && !equal(values, resourceValues(loaded.document)));
  const formValues = () => ({ title: $('resource-title').value, type: $('resource-type').value, locationKind: $('resource-location-kind').value, location: $('resource-location').value, public: $('resource-public').checked, description: $('resource-description').value, version: $('resource-version').value, audience: $('resource-audience').value, taskIds: [...$('resource-task-options').querySelectorAll('input:checked')].map(i => i.value) });
  const unfinished = () => !$('resource-form').hidden && !equal(formValues(), initialForm);
  const pending = () => Boolean(loaded && (blocked || changed() || unfinished()));
  function message(text = '', kind = '') { $('resources-message').textContent = text; $('resources-message').className = 'message ' + kind; $('resources-message').hidden = !text; }
  function availability() {
    $('resources-save').disabled = isBusy() || blocked || !changed() || !$('resource-form').hidden;
    $('resources-close').disabled = isBusy(); $('resources-cancel').disabled = isBusy();
    $('resources-download').hidden = !pending(); $('resources-download').disabled = isBusy();
    $('resources-editor-content').querySelectorAll('button,input,select,textarea').forEach(input => { input.disabled = isBusy() || blocked; });
    for (const id of ['resources-manage','resources-module-manage']) $(id).disabled = isBusy() || !getState().document || isOpen();
    $('resource-private-close').disabled = isBusy();
  }
  async function loadModule(code, refresh = false) {
    if (!getConnection() || (!refresh && modules.has(code))) return;
    const record = { loading: true }; modules.set(code, record); render();
    try { const result = await moduleStore(code).load(); if (modules.get(code) === record) modules.set(code, result); }
    catch { if (modules.get(code) === record) modules.set(code, { error: true }); }
    render();
  }
  function appendLink(parent, resource, label = resource.title) {
    const location = resource.location;
    if (location?.kind === 'https' && safeResourceUrl(location.url, location.public === true)) {
      const link = el('a','resource-link',label); link.href = location.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.referrerPolicy = 'no-referrer'; parent.append(link);
    } else if (location?.kind === 'github') parent.append(button(label, () => openPrivate(resource), 'resource-link resource-private-link'));
    else parent.append(el('span','scope-note',`${label} · ${location?.kind === 'workspace' ? 'Archivo local: ' + location.path : 'Pendiente de enlazar'}`));
  }
  function resourceRow(resource, common = false) {
    const row = el('li','resource-row'), title = el('div','resource-row-title'); appendLink(title, resource); row.append(title);
    if (common) row.append(el('span','resource-origin','Del módulo'));
    const detail = [resource.description, resource.version ? `Versión / configuración: ${resource.version}` : ''].filter(Boolean).join(' · ');
    if (detail) row.append(el('p','scope-note',detail));
    return row;
  }
  function render() {
    const state = getState(), root = $('resources-list'); root.replaceChildren();
    if (!state.document) return;
    const document = state.document, resources = document.resources ?? [], assigned = new Set();
    const tasks = document.tasks ?? [];
    if (tasks.length) {
      const group = el('section','resource-group'); group.append(el('h3','','Tareas y exámenes'));
      for (const task of tasks) {
        const row = el('div','resource-task-row'); row.append(el('strong','',`${task.code} · ${task.title}`));
        const refs = resources.filter(resource => task.resourceRefs?.includes(resource.id)); refs.forEach(r => assigned.add(r.id));
        const links = el('div','resource-task-links');
        for (const type of ['assignment','guide']) {
          const matches = refs.filter(r => r.type === type);
          if (!matches.length) links.append(el('span','scope-note',`${resourceTypes[type]} pendiente de enlazar`));
          for (const resource of matches) appendLink(links, resource, matches.length === 1 ? resourceTypes[type] : `${resourceTypes[type]}: ${resource.title}`);
        }
        for (const resource of refs.filter(r => !['assignment','guide'].includes(r.type))) appendLink(links,resource);
        row.append(links); group.append(row);
      }
      root.append(group);
    }
    const module = modules.get(state.entry.moduleCode), common = module?.document?.resources ?? [];
    for (const [name,types] of [['Presentaciones y web',['presentation','web']],['Herramientas y entornos',['tool']],['Otros recursos',['assignment','guide','notes','example','exam','solution','moodle','other']]]) {
      const ownResources = resources.filter(r => types.includes(r.type) && !assigned.has(r.id));
      const shared = common.filter(r => types.includes(r.type) && !resources.some(own => own.type === r.type && equal(own.location,r.location)));
      if (!ownResources.length && !shared.length) continue;
      const section = el('section','resource-group'); section.append(el('h3','',name)); const list = el('ul','resource-list');
      ownResources.forEach(r => list.append(resourceRow(r))); shared.forEach(r => list.append(resourceRow(r,true))); section.append(list); root.append(section);
    }
    if (!resources.length && !common.length) root.append(el('p','scope-note','Puedes añadir enunciados, fichas docentes, presentaciones, web y herramientas de esta UT.'));
    if (module?.loading) root.append(el('p','scope-note','Leyendo los enlaces del módulo…'));
    if (module?.error) { const warning = el('p','message warning','No se han podido leer los enlaces del módulo. '); warning.append(button('Reintentar', async () => { if (isBusy()) return; setBusy(true); try { await loadModule(state.entry.moduleCode,true); } finally { setBusy(false); } })); root.append(warning); }
  }
  function resetForm() { $('resource-form').hidden = true; editing = null; initialForm = null; for (const id of ['resource-title','resource-location','resource-description','resource-version']) $(id).value = ''; $('resource-public').checked = false; $('resource-task-options').replaceChildren(); $('resource-form-message').textContent = ''; }
  function renderEditor() {
    const root = $('resources-editor-list'); root.replaceChildren();
    for (const resource of values.resources) {
      const row = el('div','resource-editor-row'); row.append(el('strong','',resource.title),el('span','scope-note',`${resourceTypes[resource.type]} · ${locationInput(resource.location) || 'Pendiente de enlazar'}`));
      const actions = el('div','resource-row-actions'); actions.append(button('Editar', () => edit(resource.id)), button('Eliminar', () => remove(resource.id))); row.append(actions); root.append(row);
    }
    for (const [id, item] of removed) {
      const row = el('div','resource-editor-row resource-removed',`Se retirará: ${item.resource.title}`);
      row.append(button('Deshacer', () => {
        values.resources.splice(Math.min(item.index,values.resources.length),0,item.resource);
        for (const [taskId,index] of Object.entries(item.taskPositions)) if (values.taskRefs[taskId] && !values.taskRefs[taskId].includes(id)) values.taskRefs[taskId].splice(Math.min(index,values.taskRefs[taskId].length),0,id);
        removed.delete(id); renderEditor(); availability(); onStateChange();
      })); root.append(row);
    }
    if (!values.resources.length && !removed.size) root.append(el('p','scope-note','Todavía no hay recursos en esta lista.'));
    availability();
  }
  function remove(id) {
    if (isBusy() || blocked || !$('resource-form').hidden) return;
    const index = values.resources.findIndex(r => r.id === id), resource = values.resources[index];
    if (!window.confirm(`¿Retirar «${resource.title}» de esta lista? El archivo original se conserva. Podrás deshacer antes de guardar.`)) return;
    removed.set(id,{ resource, index, taskPositions: Object.fromEntries(Object.entries(values.taskRefs).filter(([,refs]) => refs.includes(id)).map(([taskId,refs]) => [taskId,refs.indexOf(id)])) });
    values.resources.splice(index,1); for (const key of Object.keys(values.taskRefs)) values.taskRefs[key] = values.taskRefs[key].filter(ref => ref !== id);
    renderEditor(); onStateChange();
  }
  function locationHelp() {
    const privateLocation = $('resource-location-kind').value === 'github';
    $('resource-location-label').textContent = privateLocation ? 'Ruta o enlace privado de GitHub (.md)' : 'Enlace HTTPS';
    $('resource-location-help').textContent = privateLocation ? 'Ejemplo de ruta: LM/fichas/tareas/0201.md. También admite un enlace github.com/propietario/repositorio/blob/main/archivo.md. El archivo debe existir y el token debe poder leerlo.' : 'Usa la página publicada del enunciado, la web oficial o el enlace público de OneDrive. No incluyas credenciales.';
    $('resource-public-label').hidden = privateLocation;
    if (privateLocation) $('resource-audience').value = 'teacher';
    $('resource-audience').disabled = privateLocation;
  }
  function edit(id = null) {
    if (isBusy() || blocked || !$('resource-form').hidden) return;
    const resource = values.resources.find(r => r.id === id); editing = id;
    $('resource-form').hidden = false; $('resource-form-heading').textContent = resource ? 'Editar recurso' : 'Añadir recurso';
    $('resource-title').value = resource?.title ?? ''; $('resource-description').value = resource?.description ?? ''; $('resource-version').value = resource?.version ?? '';
    const options = $('resource-type'); options.replaceChildren();
    for (const [type,label] of Object.entries(resourceTypes)) if (scope === 'unit' || ['presentation','web'].includes(type)) { const option = el('option','',label); option.value = type; options.append(option); }
    options.value = resource?.type ?? (scope === 'module' ? 'presentation' : 'assignment');
    $('resource-location-kind').value = resource?.location?.kind === 'github' ? 'github' : resource?.location?.kind === 'workspace' ? 'workspace' : 'https';
    $('resource-location').value = locationInput(resource?.location); $('resource-public').checked = resource?.location?.public === true; $('resource-audience').value = resource ? resource.audience ?? '' : 'both';
    const tasks = $('resource-task-options'); tasks.replaceChildren(); $('resource-task-fieldset').hidden = scope !== 'unit' || !loaded.document.tasks?.length;
    for (const task of loaded.document.tasks ?? []) { const label = el('label','resource-task-choice'), input = el('input'); input.type = 'checkbox'; input.value = task.id; input.checked = id ? values.taskRefs[task.id]?.includes(id) : false; label.append(input,document.createTextNode(`${task.code} · ${task.title}`)); tasks.append(label); }
    $('resource-apply').textContent = resource ? 'Aplicar edición a la lista' : 'Añadir a la lista';
    locationHelp(); initialForm = formValues(); availability(); locationHelp(); $('resource-title').focus(); onStateChange();
  }
  function apply() {
    if (isBusy() || blocked) return;
    const form = formValues();
    try {
      if (!form.title.trim()) throw new Error('Escribe un título para el recurso.');
      const old = values.resources.find(r => r.id === editing), resource = { ...old, id: old?.id ?? `resource-${crypto.randomUUID()}`, title: form.title.trim(), type: form.type };
      if (form.locationKind === 'github') resource.audience = 'teacher'; else if (form.audience) resource.audience = form.audience; else delete resource.audience;
      if (!form.location.trim()) throw new Error('Indica el enlace o la ruta del recurso.');
      if (form.locationKind === 'github') resource.location = parsePrivateLocation(form.location);
      else if (form.locationKind === 'workspace') resource.location = { kind:'workspace', path:form.location.trim() };
      else resource.location = { kind:'https', url:form.location.trim(), ...(form.public ? { public:true } : {}) };
      if (old?.location?.kind === resource.location.kind) resource.location = { ...old.location,...resource.location };
      if (resource.location.kind === 'https' && !form.public) delete resource.location.public;
      for (const key of ['description','version']) { if (form[key] || old && Object.hasOwn(old,key)) resource[key] = form[key]; }
      const errors = validateResources([resource]); if (errors.length) throw new Error(errors[0]);
      if (old) values.resources[values.resources.findIndex(r => r.id === old.id)] = resource; else values.resources.push(resource);
      for (const taskId of Object.keys(values.taskRefs)) { const refs = values.taskRefs[taskId]; if (form.taskIds.includes(taskId)) { if (!refs.includes(resource.id)) refs.push(resource.id); } else values.taskRefs[taskId] = refs.filter(id => id !== resource.id); }
      resetForm(); renderEditor(); message('Cambios añadidos a la lista. Pulsa Guardar recursos para conservarlos.'); onStateChange();
    } catch (error) { $('resource-form-message').textContent = error.message; }
  }
  async function open(nextScope = 'unit') {
    if (isBusy() || isOpen() || !canOpen()) return;
    const state = getState(); if (!state.entry) return;
    const nextTarget = { ...state.entry }; position = { x:window.scrollX,y:window.scrollY };
    setBusy(true);
    try {
      const candidate = nextScope === 'module' ? moduleStore(nextTarget.moduleCode) : unitStore(nextTarget), result = await candidate.load();
      if (nextScope === 'unit') assertResourceRead(result,nextTarget,getActive());
      source = candidate; loaded = result; target = nextTarget; scope = nextScope; blocked = false; values = resourceValues(result.document); removed.clear(); resetForm(); message();
      $('resources-editor-title').textContent = scope === 'module' ? `${target.moduleCode} · Enlaces del módulo` : `${target.moduleCode} · ${target.unitCode} · Recursos`;
      $('resources-editor-context').textContent = scope === 'module' ? 'PPT y Web compartidas por las UT del módulo.' : 'Enlaces, fichas docentes y herramientas de esta UT.';
      renderEditor(); $('resources-dialog').showModal();
    } catch (error) { if (error.code === 'RESOURCE_STALE') onBlocked(nextTarget); onMessage(error instanceof ResourceEditError ? error.message : 'No se han podido leer los recursos. Se conservan las notas pendientes.', 'error'); }
    finally { setBusy(false); availability(); onStateChange(); }
  }
  function close() {
    if (isBusy() || pending() && !window.confirm('Hay recursos sin guardar. ¿Descartar estos cambios y cerrar? Las notas de Unidad se conservan.')) return;
    const previous = position; clearEditor(); availability(); onStateChange(); $('resources-manage').focus({preventScroll:true}); if (previous) window.scrollTo({left:previous.x,top:previous.y,behavior:'instant'});
  }
  function clearEditor() { $('resources-dialog').close(); loaded = null; source = null; target = null; values = null; blocked = false; removed.clear(); resetForm(); message(); $('resources-editor-list').replaceChildren(); $('resources-editor-title').textContent = ''; $('resources-editor-context').textContent = ''; position = null; }
  async function save(event) {
    event.preventDefault(); if (isBusy() || blocked || !changed() || !$('resource-form').hidden) return;
    setBusy(true); let confirmed = false;
    try {
      const prepared = scope === 'unit' ? prepareResourceSave(loaded,target,values,getActive()) : { document:{ ...loaded.document,resources:structuredClone(values.resources) } };
      if (scope === 'module' && validateModuleResources(prepared.document,target.moduleCode).length) throw new Error('Invalid resources');
      const result = await saveTaskDocument(source,prepared,{entry:target},loaded.sha);
      if (scope === 'unit') onSaved(target,result,prepared); else { modules.set(target.moduleCode,result); render(); }
      loaded = result; values = resourceValues(result.document); removed.clear(); confirmed = true;
      onMessage(scope === 'unit' ? 'Recursos guardados y confirmados. Las notas pendientes de Unidad conservan su propio guardado.' : 'Enlaces del módulo guardados y confirmados. Se muestran en sus UT.');
    } catch (error) {
      if (error instanceof ResourceEditError) { message(error.message,'warning'); if (['RESOURCE_STALE','RESOURCE_LOCAL_CONFLICT'].includes(error.code)) { blocked = true; onBlocked(target); } }
      else { const feedback = saveErrorFeedback(error); blocked = feedback.requiresReload || error.code === 'HTTP_422'; if (blocked && scope === 'unit') onBlocked(target); message(feedback.message + (blocked ? ' Descarga este borrador antes de cerrar y revisar la versión.' : ''),feedback.kind); }
    } finally { setBusy(false); availability(); onStateChange(); if (confirmed) close(); }
  }
  async function openPrivate(resource) {
    if (isBusy() || isOpen() || !canOpen()) return;
    const generation = ++privateGeneration; $('resource-private-title').textContent = resource.title; $('resource-private-content').replaceChildren(); $('resource-private-message').textContent = 'Leyendo la ficha privada…'; $('resource-private-version').textContent = ''; $('resource-private-dialog').showModal(); setBusy(true);
    try { const result = await getConnection().loadPrivateResource(resource.location); if (generation !== privateGeneration) return; renderPrivateMarkdown($('resource-private-content'),result.content); $('resource-private-message').textContent = ''; $('resource-private-version').textContent = `Versión leída: ${result.sha.slice(0,8)}`; }
    catch { if (generation === privateGeneration) { $('resource-private-content').replaceChildren(); $('resource-private-message').textContent = 'No se ha podido leer la ficha. Comprueba que exista en GitHub y que el token tenga acceso al repositorio. No se han modificado recursos ni notas.'; } }
    finally { setBusy(false); availability(); }
  }
  function closePrivate() { if (isBusy()) return; ++privateGeneration; $('resource-private-dialog').close(); $('resource-private-content').replaceChildren(); $('resource-private-title').textContent = ''; $('resource-private-message').textContent = ''; $('resource-private-version').textContent = ''; availability(); onStateChange(); }
  function clear() { ++privateGeneration; clearEditor(); $('resource-private-dialog').close(); $('resource-private-content').replaceChildren(); $('resource-private-title').textContent = ''; $('resource-private-message').textContent = ''; $('resource-private-version').textContent = ''; modules.clear(); stores.clear(); $('resources-list').replaceChildren(); }
  function isOpen() { return $('resources-dialog').open || $('resource-private-dialog').open; }
  $('resources-manage').addEventListener('click',() => open('unit')); $('resources-module-manage').addEventListener('click',() => open('module'));
  $('resource-add').addEventListener('click',() => edit()); $('resource-apply').addEventListener('click',apply); $('resource-form-cancel').addEventListener('click',() => { resetForm(); availability(); onStateChange(); });
  $('resource-form').addEventListener('input',() => { availability(); onStateChange(); }); $('resource-form').addEventListener('change',() => { locationHelp(); availability(); locationHelp(); onStateChange(); });
  $('resource-type').addEventListener('change',() => { if ($('resource-type').value === 'guide') $('resource-location-kind').value = 'github'; locationHelp(); });
  $('resources-save-form').addEventListener('submit',save); for (const id of ['resources-close','resources-cancel']) $(id).addEventListener('click',close);
  $('resources-dialog').addEventListener('cancel',event => { event.preventDefault(); close(); }); $('resource-private-close').addEventListener('click',closePrivate); $('resource-private-dialog').addEventListener('cancel',event => {event.preventDefault();closePrivate();});
  $('resources-download').addEventListener('click',() => { if (!loaded || isBusy()) return; const data = { scope,path:scope === 'unit' ? target.path : `${target.moduleCode}/resources.json`,baseSha:loaded.sha,values,unfinished:unfinished() ? formValues() : null }; const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json;charset=utf-8'})); const link = el('a'); link.href = url; link.download = `${target.moduleCode}-${scope === 'unit' ? target.unitCode : 'modulo'}-borrador-recursos.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); });
  return { render,loadModule,availability,clear,isOpen,hasPending:pending,open,openPrivate,appendLink };
}
