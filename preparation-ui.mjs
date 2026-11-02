import { preparationMaterials, materialLabels, preparationValues, preparationSummary, preparationSnapshot, assertPreparationRead, preparePreparationSave, PreparationError } from './preparation.mjs?v=20261102-replanning-signals';
import { renderSessionResourceBand } from './session-band-ui.mjs?v=20261102-replanning-signals';
import { taskPreparationGroups, taskAdditionIssue, createPreparationTask, taskRemovalIssue, taskType } from './preparation-tasks.mjs?v=20261102-replanning-signals';
import { saveTaskDocument } from './task-edit.mjs?v=20261102-replanning-signals';
import { saveErrorFeedback } from './core.mjs?v=20261102-replanning-signals';
import { removalImpact, removalWarning, taskLinks } from './preparation-links.mjs?v=20261102-replanning-signals';
import { savePreparationWithLinks } from './preparation-save.mjs?v=20261102-replanning-signals';
const $ = id => document.getElementById(id);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const el = (tag, css = '', text) => { const item = document.createElement(tag); item.className = css; if (text !== undefined) item.textContent = text; return item; };
const examPartOptions = [['', 'Sin asignar'], ['test', 'Test (T)'], ['practical', 'Práctico (P)'], ['both', 'Test y práctico (T/P)']];

export function preparationBadge(document, onClick, records = []) {
  const summary = preparationSummary(document, records);
  const badge = el('button', 'preparation-badge preparation-' + summary.state, summary.label);
  badge.type = 'button'; badge.title = `${summary.materials}/4 materiales · ${summary.sessions}/${summary.total} sesiones activas por recursos${summary.excluded ? ' · '+summary.excluded+' cancelada/s o reprogramada/s fuera del cómputo' : ''}${summary.detail ? ' · '+summary.detail : ''}`;
  badge.setAttribute('aria-label', `${document.module.code} · ${document.unit.code}: ${summary.label}. Editar preparación`);
  badge.addEventListener('click', onClick); return badge;
}

export function createPreparationUI({ getState, getActive, unitStore, isBusy, setBusy, canOpen, onSaved, onBlocked, onStateChange, onMessage, onRetry, onOpenUnit, additionIssue = () => '', removalIssue = () => '' }) {
  let loaded = null, entry = null, sourceStore = null, blocked = false, values = null, position = null;
  const confirmations = new Map();
  const records = () => getState().records ?? [];
  function blockRemovalTargets() {
    const targets = [entry,...records().filter(record => record.entry.path !== entry.path && record.document.module.code === entry.moduleCode
      && (values.removals ?? []).some(id=>taskLinks(record.document,id).length)).map(record=>record.entry)];
    for (const target of targets) onBlocked(target);
  }
  const newTaskInput = () => ({ type: $('preparation-new-type').value, code: $('preparation-new-code').value, title: $('preparation-new-title').value, sessionId: $('preparation-new-session').value, ...($('preparation-new-type').value === 'exam' ? {examPart: $('preparation-new-exam-part').value} : {}) });
  const unfinishedTask = () => !$('preparation-task-editor').hidden && Boolean(newTaskInput().code || newTaskInput().title || newTaskInput().sessionId || newTaskInput().examPart);
  const changed = () => Boolean(loaded && !equal(values, preparationValues(loaded.document)));
  const pending = () => Boolean(loaded && (blocked || changed() || unfinishedTask()));
  function message(text = '', kind = '') { $('preparation-message').textContent = text; $('preparation-message').className = 'message ' + kind; $('preparation-message').hidden = !text; }
  function availability() {
    $('preparation-save').disabled = isBusy() || blocked || !changed() || unfinishedTask();
    $('preparation-close').disabled = isBusy();
    $('preparation-reload').disabled = isBusy() || !loaded;
    $('preparation-download').disabled = isBusy() || !loaded;
    $('preparation-fields').querySelectorAll('select,input,button').forEach(item => { item.disabled = isBusy() || blocked; });
    $('preparation-task-editor').querySelectorAll('select,input,button').forEach(item => { item.disabled = isBusy() || blocked; });
    $('preparation-refresh').disabled = isBusy();
    document.querySelectorAll('.preparation-badge').forEach(item => { item.disabled = isBusy(); });
  }
  function preview() {
    if (!loaded) return;
    const records = getState().records ?? [];
    const snapshot = preparationSnapshot(loaded.document, values, records), summary = preparationSummary(snapshot, records);
    $('preparation-result').textContent = summary.label;
    $('preparation-result').className = 'preparation-badge preparation-' + summary.state;
    $('preparation-detail').textContent = `${summary.materials}/4 materiales · ${summary.sessions}/${summary.total} sesiones activas por recursos${summary.excluded ? ' · '+summary.excluded+' cancelada/s o reprogramada/s fuera del cómputo' : ''}${summary.total ? '' : ' · Falta planificar las sesiones'}${summary.detail ? ' · '+summary.detail : ''}`;
    renderSessionResourceBand($('preparation-session-band'), snapshot, { records });
    for (const key of ['tasks', 'exam']) {
      const group = summary.groups[key];
      const text = `${group.ready}/${group.total} ${key === 'tasks' ? 'preparadas' : 'preparados'} · ${group.state === 'Sin mirar' ? 'Pendiente' : group.state}`;
      $('preparation-total-' + key).textContent = text;
      $('preparation-material-' + key).textContent = text;
    }
    availability(); onStateChange();
  }
  function resetNewTask() {
    $('preparation-task-editor').hidden = true;
    $('preparation-new-code').value = ''; $('preparation-new-title').value = ''; $('preparation-new-session').value = '';
    $('preparation-new-exam-part').value = ''; $('preparation-new-exam-part-label').hidden = true;
    $('preparation-new-message').textContent = '';
  }
  function editNewTask(type) {
    if (isBusy() || blocked || unfinishedTask()) return;
    resetNewTask(); $('preparation-new-type').value = type; $('preparation-task-editor').hidden = false;
    $('preparation-new-exam-part-label').hidden = type !== 'exam';
    $('preparation-task-editor').scrollIntoView({ block: 'nearest', behavior: 'instant' });
    $('preparation-new-code').focus(); availability();
  }
  function renderTaskLists() {
    const root = $('preparation-task-lists'); root.replaceChildren();
    const snapshot = preparationSnapshot(loaded.document, values), groups = taskPreparationGroups(snapshot);
    const issue = taskAdditionIssue(snapshot) || additionIssue(entry);
    for (const [key, type, name] of [['tasks', 'task', 'Tareas'], ['exam', 'exam', 'Exámenes']]) {
      const group = el('fieldset', 'preparation-task-group'); group.append(el('legend', '', name));
      const count = el('p', 'scope-note'); count.id = 'preparation-total-' + key; group.append(count);
      for (const task of groups[key].items) {
        const row = el('div', 'preparation-task'), label = el('label', 'preparation-task-label'), input = el('input'); input.type = 'checkbox'; input.checked = task.preparation === 'ready';
        input.setAttribute('aria-label', `${type === 'task' ? 'Preparada' : 'Preparado'}: ${task.code} · ${task.title}`);
        input.addEventListener('change', () => {
          const added = values.additions.find(item => item.id === task.id);
          if (added) added.preparation = input.checked ? 'ready' : 'draft'; else values.tasks[task.id] = input.checked ? 'ready' : 'draft';
          preview();
        });
        const text = el('span'); text.append(el('strong', '', `${task.code} · ${task.title}`));
        const session = snapshot.sessions.find(session => session.id === task.presentation?.sessionId);
        text.append(el('span', 'scope-note', `${session ? `Presentación prevista: S${session.number} · ${session.date}` : 'Sin sesión de presentación asignada'}${values.additions.some(item => item.id === task.id) ? ' · Nuevo, sin guardar' : ''}`));
        label.append(input, text); row.append(label);
        if (type === 'exam') {
          const partLabel = el('label', 'preparation-exam-part', 'Parte del examen'), select = el('select');
          select.setAttribute('aria-label', `Parte del examen ${task.code} · ${task.title}`);
          for (const [value, title] of examPartOptions) { const option = el('option', '', title); option.value = value; select.append(option); }
          select.value = task.examPart ?? '';
          select.addEventListener('change', () => {
            const added = values.additions.find(item => item.id === task.id);
            if (added) { if (select.value) added.examPart = select.value; else delete added.examPart; }
            else values.examParts[task.id] = select.value;
            preview();
          });
          partLabel.append(select); row.append(partLabel);
        }
        const remove = el('button', 'button button-small preparation-remove', 'Eliminar'); remove.type = 'button';
        remove.setAttribute('aria-label', `Eliminar ${type === 'task' ? 'tarea' : 'examen'} ${task.code} · ${task.title}`);
        remove.addEventListener('click', () => {
          if (isBusy() || blocked) return;
          const added = values.additions.some(item => item.id === task.id);
          const problem = added ? '' : taskRemovalIssue(loaded.document, task.id) || removalIssue(entry, task.id);
          if (problem) { message(problem, 'warning'); return; }
          if (!added && !window.confirm(removalWarning(loaded.document,task,records()))) return;
          if (!added) confirmations.set(task.id,removalImpact(loaded.document,task.id,records()));
          if (added) values.additions = values.additions.filter(item => item.id !== task.id); else values.removals.push(task.id);
          renderTaskLists(); preview(); message(added ? 'Elemento nuevo retirado del borrador.' : 'Eliminación pendiente. Puedes deshacerla o pulsar Guardar preparación para confirmarla.');
        });
        row.append(remove); group.append(row);
      }
      for (const task of (loaded.document.tasks ?? []).filter(task => values.removals.includes(task.id) && taskType(task) === type)) {
        const row = el('div', 'preparation-task preparation-removed'); row.append(el('span', '', `${task.code} · ${task.title} · Se eliminará al guardar`));
        const undo = el('button', 'button button-small', 'Deshacer'); undo.type = 'button'; undo.setAttribute('aria-label', `Deshacer eliminación de ${task.code} · ${task.title}`);
        undo.addEventListener('click', () => {
          if (isBusy() || blocked) return;
          const next = { ...values, removals: values.removals.filter(id => id !== task.id) };
          try { preparationSnapshot(loaded.document, next); values = next; confirmations.delete(task.id); renderTaskLists(); preview(); message('Eliminación deshecha.'); }
          catch (error) { message(error.message, 'warning'); }
        });
        row.append(undo); group.append(row);
      }
      if (!groups[key].total) group.append(el('p', 'scope-note', type === 'task' ? 'No hay tareas en la lista oficial.' : 'No hay exámenes en la lista oficial.'));
      if (!issue) {
        const add = el('button', 'button', type === 'task' ? 'Añadir tarea' : 'Añadir examen'); add.type = 'button';
        add.addEventListener('click', () => editNewTask(type)); group.append(add);
      }
      root.append(group);
    }
    if (issue) root.append(el('p', 'message warning', issue));
  }
  function fill() {
    confirmations.clear();
    values = preparationValues(loaded.document);
    resetNewTask();
    const fields = $('preparation-fields'); fields.replaceChildren();
    const materials = el('fieldset', 'preparation-materials'); materials.append(el('legend', '', 'Materiales'));
    for (const key of preparationMaterials) {
      if (['tasks', 'exam'].includes(key)) {
        const summary = el('div', 'preparation-material-summary'); summary.append(el('strong', '', materialLabels[key]));
        const count = el('p', 'scope-note'); count.id = 'preparation-material-' + key; summary.append(count); materials.append(summary); continue;
      }
      const label = el('label', '', materialLabels[key]), select = el('select'); select.setAttribute('aria-label', materialLabels[key]);
      for (const [value, title] of [['', 'Sin marcar'], ['Sin mirar', 'Sin mirar'], ['En proceso', 'En proceso'], ['Listo', 'Listo']]) {
        const option = el('option', '', title); option.value = value; select.append(option);
      }
      select.value = values.materials[key]; select.addEventListener('change', () => { values.materials[key] = select.value; preview(); });
      label.append(select); materials.append(label);
    }
    fields.append(materials);
    const tasks = el('div', 'preparation-task-lists'); tasks.id = 'preparation-task-lists';
    const sessions = el('fieldset', 'preparation-sessions'); sessions.append(el('legend', '', 'Sesiones'));
    if (!loaded.document.sessions.length) sessions.append(el('p', 'scope-note', 'Esta UT todavía no tiene sesiones.'));
    sessions.append(el('p','scope-note','Indicador automático por recursos. Color aclarado: falta preparación o vincular recursos.'));
    const scroll=el('div','unit-bands');scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','Preparación automática de sesiones; desliza para ver todas');
    const band=el('ol','session-band');band.id='preparation-session-band';scroll.append(band);sessions.append(scroll);
    fields.append(sessions);
    fields.append(tasks);renderTaskLists();
    const select = $('preparation-new-session'); select.replaceChildren();
    const empty = el('option', '', 'Sin sesión asignada'); empty.value = ''; select.append(empty);
    for (const session of loaded.document.sessions) { const option = el('option', '', `S${session.number} · ${session.date} · ${session.activities[0]?.title || 'Sesión'}`); option.value = session.id; select.append(option); }
    preview();
  }
  async function open(target, reloading = false) {
    if (isBusy() || (!reloading && ($('preparation-dialog').open || !canOpen()))) return;
    if (!reloading) position = { x: window.scrollX, y: window.scrollY, focus: document.activeElement };
    setBusy(true);
    try {
      const candidate = unitStore(target), result = await candidate.load();
      assertPreparationRead(result, target, getActive());
      loaded = result; entry = target; sourceStore = candidate; blocked = false;
      $('preparation-title').textContent = `${entry.moduleCode} · ${entry.unitCode} · ${result.document.unit.title}`;
      fill(); message(); if (!$('preparation-dialog').open) $('preparation-dialog').showModal();
    } catch (error) {
      if (error.code === 'PREPARATION_STALE') onBlocked(target);
      const text = error instanceof PreparationError ? error.message : 'No se ha podido leer la preparación. Se conservan las notas y cualquier borrador anterior.';
      if (reloading) message(text, 'error'); else onMessage(text, 'error');
    } finally { setBusy(false); availability(); onStateChange(); }
  }
  function clear() { loaded = null; entry = null; values = null; sourceStore = null; blocked = false; resetNewTask(); $('preparation-dialog').close(); $('preparation-fields').replaceChildren(); $('preparation-title').textContent = ''; $('preparation-result').textContent = ''; $('preparation-detail').textContent = ''; message(); }
  function close() {
    if (isBusy() || (pending() && !window.confirm('Hay cambios de preparación sin guardar. ¿Descartarlos y cerrar?'))) return;
    clear(); onStateChange(); render();
    position?.focus?.isConnected && position.focus.focus({ preventScroll: true });
    if (position) window.scrollTo({ left: position.x, top: position.y, behavior: 'instant' }); position = null;
  }
  $('preparation-form').addEventListener('submit', async event => {
    event.preventDefault(); if (isBusy() || blocked || !changed() || unfinishedTask()) return;
    let confirmed = false;
    setBusy(true);
    try {
      for (const id of values.removals) { const issue = removalIssue(entry, id); if (issue) throw new PreparationError('PREPARATION_LOCAL_CONFLICT', issue); }
      const saved = await savePreparationWithLinks({loaded,entry,values,active:getActive(),records:records(),confirmations,store:sourceStore,unitStore});
      const {prepared,result} = saved;
      for (const item of saved.related) onSaved(item.entry,item.result,item.prepared);
      onSaved(entry, result, prepared); loaded = result; blocked = false; fill();
      render(); onMessage('Preparación guardada y confirmada en GitHub.'); confirmed = true;
    } catch (error) {
      if (error instanceof PreparationError) { message(error.message, 'warning'); if (error.code === 'PREPARATION_STALE') { blocked = true; blockRemovalTargets(); } }
      else { const feedback = saveErrorFeedback(error); blocked = feedback.requiresReload || error.code === 'HTTP_422'; if (blocked) blockRemovalTargets(); message(feedback.message + ' [' + feedback.code + ']', feedback.kind); }
    } finally { setBusy(false); availability(); onStateChange(); if (confirmed) close(); }
  });
  for (const id of ['preparation-new-code', 'preparation-new-title', 'preparation-new-session', 'preparation-new-exam-part']) $(id).addEventListener('input', () => { availability(); onStateChange(); });
  $('preparation-new-type').addEventListener('change', () => {
    const exam = $('preparation-new-type').value === 'exam';
    $('preparation-new-exam-part-label').hidden = !exam;
    if (!exam) $('preparation-new-exam-part').value = '';
    availability(); onStateChange();
  });
  $('preparation-new-cancel').addEventListener('click', () => { if (isBusy()) return; resetNewTask(); availability(); onStateChange(); });
  $('preparation-new-add').addEventListener('click', () => {
    if (!loaded || isBusy() || blocked) return;
    try {
      const issue = additionIssue(entry); if (issue) throw new Error(issue);
      const snapshot = preparationSnapshot(loaded.document, values);
      const task = createPreparationTask(snapshot, newTaskInput(), `${entry.unitId}-item-${crypto.randomUUID()}`);
      values.additions.push(task); resetNewTask(); renderTaskLists(); preview();
      message('Elemento añadido al borrador. Pulsa Guardar preparación para incorporarlo a la lista oficial.');
    } catch (error) { $('preparation-new-message').textContent = error.message; }
  });
  $('preparation-close').addEventListener('click', close);
  $('preparation-dialog').addEventListener('cancel', event => { event.preventDefault(); close(); });
  $('preparation-reload').addEventListener('click', async () => { if (!entry || isBusy() || (pending() && !window.confirm('Descarga el borrador si quieres conservarlo. ¿Descartarlo y revisar GitHub?'))) return; await open(entry, true); });
  $('preparation-download').addEventListener('click', () => {
    if (!loaded || isBusy()) return;
    const data = { moduleCode: entry.moduleCode, unitCode: entry.unitCode, path: entry.path, baseSha: loaded.sha, preparation: values, ...(unfinishedTask() ? { unfinishedTask: newTaskInput() } : {}) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json;charset=utf-8' }));
    const link = el('a'); link.href = url; link.download = `${entry.moduleCode}-${entry.unitCode}-borrador-preparacion.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  function render() {
    const { catalog, records, activeEntry, draft, ready } = getState();
    const badge = $('unit-preparation'); badge.replaceChildren();
    if (draft) badge.append(preparationBadge(draft, () => open(activeEntry), records));
    const list = $('preparation-list'); list.replaceChildren(); if (!catalog) return;
    const filter = $('preparation-module'), previous = filter.value; filter.replaceChildren();
    for (const [value, title] of [['', 'Todos los módulos'], ...catalog.modules.map(module => [module.code, module.code])]) { const option = el('option', '', title); option.value = value; filter.append(option); }
    if (catalog.modules.some(module => module.code === previous)) filter.value = previous;
    const byPath = new Map(records.map(record => [record.entry.path, record]));
    const counts = { pending: 0, draft: 0, 'exam-pending': 0, ready: 0, unavailable: 0 }; let visible = 0, total = 0;
    for (const module of catalog.modules) for (const unit of module.units) {
      if (filter.value && filter.value !== module.code) continue;
      total++; const record = byPath.get(unit.path), summary = record ? preparationSummary(record.document, records) : null;
      const state = summary?.state ?? 'unavailable'; counts[state]++;
      if ($('preparation-status').value && $('preparation-status').value !== state) continue;
      visible++; const row = el('div', 'preparation-row');
      const link = el('a', 'preparation-unit-link', `${module.code} · ${unit.code}`); link.href = '#unit-view';
      link.setAttribute('aria-label', `Abrir sesiones de ${module.code} · ${unit.code}`);
      link.addEventListener('click', event => { event.preventDefault(); if (!isBusy()) onOpenUnit(unit.path); });
      row.append(link, el('span', 'preparation-unit-title', record?.document.unit.title ?? unit.title));
      if (record) {
        row.append(el('span', 'scope-note', `${summary.materials}/4 materiales · ${summary.sessions}/${summary.total} sesiones activas`));
        row.append(preparationBadge(record.document, () => open(record.entry), records));
      } else row.append(el('span', 'preparation-unavailable', ready ? 'No se ha podido consultar' : 'Cargando…'));
      list.append(row);
    }
    if (!visible) list.append(el('p', 'empty-sessions', 'No hay unidades con estos filtros.'));
    $('preparation-count').textContent = `${visible}/${total} · ${counts.ready} preparadas · ${counts['exam-pending']} con examen pendiente · ${counts.draft} en preparación · ${counts.pending} pendientes${counts.unavailable ? ` · ${counts.unavailable} sin leer` : ''}`;
    $('preparation-scope').textContent = ready ? 'Preparación calculada desde materiales, tareas y exámenes; las sesiones se deducen de sus recursos asociados.' : 'Leyendo las unidades del catálogo…';
    availability();
  }
  for (const id of ['preparation-module', 'preparation-status']) $(id).addEventListener('change', render);
  $('preparation-refresh').addEventListener('click', onRetry);
  return { open, render, availability, hasPending: pending, isOpen: () => $('preparation-dialog').open,
    clear() { clear(); position = null; $('unit-preparation').replaceChildren(); $('preparation-list').replaceChildren(); $('preparation-module').replaceChildren(); $('preparation-status').value = ''; $('preparation-count').textContent = ''; $('preparation-scope').textContent = ''; } };
}
