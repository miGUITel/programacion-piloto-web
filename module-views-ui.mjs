import { moduleOverview, moduleTasks, filterTasks } from './module-views.mjs?v=20261017-2';
import { eventTypes } from './teaching.mjs?v=20261016-4';
import { taskStates } from './task-cycle.mjs?v=20261017-2';

const $ = id => document.getElementById(id);
function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function option(value, text) { const item = el('option', '', text); item.value = value; return item; }
function fillSelect(select, choices, previous) {
  select.replaceChildren(...choices.map(([value, text]) => option(value, text)));
  if (choices.some(([value]) => value === previous)) select.value = previous;
}
function shortDate(date) { return date ? `${date.slice(8)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : '—'; }
function monthName(month) {
  return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(month + '-15T12:00:00Z'));
}

export function createModuleViews({ getState, onOpen, onEdit, onCorrected, onPresented, onRetry }) {
  let filterModule = '';

  function render() {
    const { module, records, allRecords, catalog, failures, allFailures, errors, ready, today, activePath, busy } = getState();
    if (!module) return;
    if (filterModule !== module.code) {
      $('overview-month').value = '';
      filterModule = module.code;
    }
    const missing = (failures.length ? ` No se han podido leer: ${failures.join(', ')}.` : '')
      + (errors?.length ? ' Hay fechas o estados incompatibles en sesiones compartidas: revisa la planificación.' : '');
    const scope = `${module.code} · ${records.length}/${module.units.length} UT del piloto.${missing}${!ready ? ' Cargando otras unidades…' : ''} No incluye las UT que aún no se han incorporado.`;
    $('module-scope').textContent = scope;
    const total = catalog.modules.reduce((count, item) => count + item.units.length, 0);
    $('tasks-scope').textContent = `${allRecords.length}/${total} UT leídas de todos los módulos del piloto.${!ready ? ' Cargando…' : ''}${allFailures.length ? ` Lista incompleta: no se han podido leer ${allFailures.map(entry => entry.moduleCode + ' · ' + entry.unitCode).join(', ')}.` : ''} No incluye UT aún no incorporadas.`;
    const overview = moduleOverview(module, records, $('overview-month').value);
    fillSelect($('overview-month'), [['', 'Todas las fechas'], ...overview.months.map(month => [month, monthName(month)])], $('overview-month').value);
    // If a refreshed catalog removed the selected month, render the valid selection.
    const model = moduleOverview(module, records, $('overview-month').value);
    const table = $('module-grid'); table.replaceChildren(el('caption', 'visually-hidden', 'Fechas con sesiones de las UT del piloto. Cada casilla contiene el número de sesión dentro de su UT.'));
    const header = el('thead'); const months = el('tr'); const dates = el('tr');
    const corner = el('th', 'overview-unit', 'Unidad'); corner.scope = 'col'; corner.rowSpan = 2; months.append(corner);
    for (const month of [...new Set(model.dates.map(date => date.slice(0, 7)))]) {
      const group = el('th', 'overview-month', monthName(month)); group.scope = 'colgroup';
      group.colSpan = model.dates.filter(date => date.startsWith(month + '-')).length; months.append(group);
    }
    model.dates.forEach(date => {
      const weekday = ['D', 'L', 'M', 'X', 'J', 'V', 'S'][new Date(date + 'T12:00:00Z').getUTCDay()];
      const cell = el('th', `overview-date${date === today ? ' is-today' : ''}`, `${weekday} ${Number(date.slice(8))}`);
      cell.scope = 'col'; cell.title = shortDate(date); dates.append(cell);
    });
    header.append(months, dates); table.append(header);
    const body = el('tbody');
    for (const row of model.rows) {
      const tr = el('tr'); const label = el('th', 'overview-unit'); label.scope = 'row';
      const title = el('button', 'unit-link', `${row.unit.code} · ${row.record?.document.unit.title ?? row.unit.title}`);
      title.type = 'button'; title.title = title.textContent;
      title.addEventListener('click', () => onOpen(row.unit.path)); label.append(title);
      if (row.unit.path === activePath) label.append(el('span', 'overview-active', 'Abierta'));
      if (!row.record) label.append(el('span', 'overview-unavailable', 'Sin datos · reintenta Actualizar'));
      else if (!row.record.document.sessions.length) label.append(el('span', 'overview-unavailable', 'Sin sesiones'));
      tr.append(label);
      row.cells.forEach((sessions, index) => {
        const cell = el('td', `overview-slot${model.dates[index] === today ? ' is-today' : ''}`);
        for (const session of sessions) {
          const types = eventTypes(session);
          const button = el('button', `overview-session band-day${types.includes('task') ? ' has-task' : ''}${types.includes('exam') ? ' has-exam' : ''}${['Cancelada', 'Reprogramada'].includes(session.state) ? ' excluded-session' : ''}${session.date < today ? ' elapsed-session' : ''}`, String(session.number));
          button.type = 'button';
          const description = `${row.unit.code} · Sesión ${session.number} · ${shortDate(session.date)} · ${session.activities[0].start} · ${session.activities[0].title}${types.length ? ' · ' + types.map(type => type === 'task' ? 'Tarea' : 'Examen').join(' y ') : ''}${session.state ? ' · ' + session.state : ''}`;
          button.title = description; button.setAttribute('aria-label', description);
          button.addEventListener('click', () => onOpen(row.unit.path, session.id)); cell.append(button);
        }
        tr.append(cell);
      });
      body.append(tr);
    }
    table.append(body);
    $('overview-empty').hidden = model.dates.length > 0;

    fillSelect($('tasks-module'), [['', 'Todos los módulos'], ...catalog.modules.map(item => [item.code, item.code])], $('tasks-module').value);
    const units = catalog.modules.filter(item => !$('tasks-module').value || item.code === $('tasks-module').value).flatMap(item => item.units.map(unit => [unit.path, `${item.code} · ${unit.code}`]));
    fillSelect($('tasks-unit'), [['', 'Todas las UT'], ...units], $('tasks-unit').value);
    const tasks = moduleTasks(allRecords, undefined, today);
    const visible = filterTasks(tasks, { moduleCode: $('tasks-module').value, unitPath: $('tasks-unit').value, status: $('tasks-status').value });
    $('tasks-count').textContent = `${visible.length} de ${tasks.length} tareas`;
    const due = tasks.filter(task => task.status === 'to-correct').length;
    $('view-tasks').textContent = `Tareas${due ? ' · ' + due : ''}${allFailures.length ? ' !' : ''}`;
    $('view-tasks').setAttribute('aria-label', `Tareas de todos los módulos${due ? ` · ${due} por corregir` : ''}${allFailures.length ? ' · Lista incompleta' : ''}`);
    const list = $('tasks-list'); list.replaceChildren();
    for (const task of visible) {
      const overdue = task.status === 'to-correct' && task.correctBy < today;
      const row = el('article', `task-row task-compact${task.corrected ? ' is-corrected' : overdue ? ' is-overdue' : task.presented ? ' is-presented' : ''}`); row.setAttribute('aria-label', `${task.entry.moduleCode} · ${task.title}`);
      row.title = `${taskStates[task.status]} · ${task.entry.moduleCode} · ${task.entry.unitCode} · Sesión ${task.number} · ${shortDate(task.date)} · Entrega: ${shortDate(task.dueOn)}${task.state ? ' · ' + task.state : ''}`;
      const title = el('div', 'task-name');
      const source = el('span', 'task-source', `${task.entry.moduleCode} · ${task.entry.unitCode}`);
      const name = el('strong', '', task.title); name.title = task.title;
      title.append(source, name, el('span', 'visually-hidden', taskStates[task.status]));
      if (task.missingDates) { const missing = el('span', 'task-missing-dates', '!'); missing.title = 'Tarea presentada con fechas pendientes de completar'; missing.setAttribute('aria-label', missing.title); title.append(missing); }
      row.append(title);
      for (const [letter, selected, date, label, action] of [
        ['P', task.presented, task.presentedOn, 'Presentada', onPresented],
        ['C', task.corrected, task.correctBy, 'Corregida', onCorrected]
      ]) {
        const control = el('div', 'task-inline-control');
        const confirmation = el('label', 'task-toggle'); const checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.checked = selected;
        checkbox.setAttribute('aria-label', `${label}: ${task.entry.moduleCode} · ${task.entry.unitCode} · ${task.title}`);
        confirmation.title = `${label} · ${taskStates[task.status]}`;
        checkbox.addEventListener('change', () => { const checked = checkbox.checked; checkbox.checked = selected; action(task, checked); });
        const symbol = el('span', '', letter); symbol.setAttribute('aria-hidden', 'true'); confirmation.append(checkbox, symbol);
        const value = el('time', 'task-inline-date', date ? `${date.slice(8)}/${date.slice(5, 7)}` : '—'); if (date) value.dateTime = date;
        value.title = `${letter === 'P' ? 'Fecha de presentación' : 'Fecha de aviso de corrección'}: ${shortDate(date)}`;
        value.setAttribute('aria-label', value.title); control.append(confirmation, value); row.append(control);
      }
      const edit = el('button', 'button button-small task-edit', '✎'); edit.type = 'button'; edit.title = 'Editar tarea'; edit.setAttribute('aria-label', `Editar tarea de ${task.entry.moduleCode} · ${task.entry.unitCode}, sesión ${task.number}: ${task.title}`);
      edit.addEventListener('click', () => onEdit(task)); row.append(edit); list.append(row);
    }
    if (!visible.length) list.append(el('p', 'empty-sessions', tasks.length ? 'No hay tareas con estos filtros.' : 'No hay tareas marcadas en las UT leídas. Marca su porción como Tarea o utiliza la casilla de la sesión.'));
    if (busy) for (const root of [$('module-view'), $('tasks-view')]) root.querySelectorAll('button,select,input').forEach(element => { element.disabled = true; });
  }

  ['overview-month', 'tasks-module', 'tasks-unit', 'tasks-status'].forEach(id => $(id).addEventListener('change', render));
  $('retry-tasks').addEventListener('click', onRetry);
  return { render, clear() {
    filterModule = ''; $('module-grid').replaceChildren(); $('tasks-list').replaceChildren();
    for (const id of ['module-scope', 'tasks-scope', 'tasks-count']) $(id).textContent = '';
    for (const id of ['overview-month', 'tasks-module', 'tasks-unit']) $(id).replaceChildren();
    $('tasks-status').value = 'all';
    $('view-tasks').textContent = 'Tareas'; $('view-tasks').setAttribute('aria-label', 'Tareas de todos los módulos');
  } };
}
