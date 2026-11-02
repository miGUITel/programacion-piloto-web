import { approvedChanges, planningSnapshot, excludedSession, planningStatus, sessionDisplayLabel, sessionPlanningLabel, resolutionLabels, planningLimit, planningMargin, teachingDates, formatPlanningComparison, operationComplete, PlanningError } from './replanning.mjs?v=20261102-task-notes-resources';
const $ = id => document.getElementById(id);
import { movesInChange } from './planning-shifts.mjs?v=20261102-task-notes-resources';
const node = (tag, className = '', value) => { const el = document.createElement(tag); el.className = className; if (value !== undefined) el.textContent = value; return el; };
const shortDate = d => d.split('-').reverse().join('/');

/** Read-only trace: no store/save API, and no replacement of the Unit draft. */
export function createReplanningUI({ getState, isBusy }) {
  let generation = 0, returnFocus = null;
  const dialog = $('replanning-dialog');
  function close() { generation++; dialog.close(); returnFocus?.focus?.({ preventScroll: true }); }
  for (const id of ['replanning-close', 'replanning-hide']) $(id).addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });

  function statusNodes(doc) {
    const root = node('span', 'replanning-signals'), state = getState(), status = planningStatus(doc, state.records);
    const count = new Set((doc.sessions ?? []).filter(excludedSession).map(s => s.id)).size;
    if (!count && !status.modified && !status.unchecked.length) return root;
    const detail = [`Reprogramaciones e historial${count ? `: ${count} ${count === 1 ? 'sesión' : 'sesiones'}` : ''}`];
    if (status.pending.length) detail.push(`${status.pending.length} ${status.pending.length === 1 ? 'pendiente' : 'pendientes'} de planificar`);
    if (status.unchecked.length) detail.push('lectura de la resolución por comprobar');
    if (status.legacy.length) detail.push('antecedentes históricos por revisar');
    if (status.modified) detail.push('plan modificado');
    const button = node('button', `plan-signal plan-summary${status.pending.length ? ' plan-pending' : ''}`, `↪${count ? ` ${count}` : ''}`);
    button.type = 'button'; button.title = detail.join(' · ');
    button.setAttribute('aria-label', button.title); button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', 'replanning-dialog');
    button.addEventListener('click', () => open(doc)); root.append(button);
    return root;
  }
  function render() {
    const doc = getState().document, root = $('unit-replanning'); root.replaceChildren();
    const signals = doc ? statusNodes(doc) : null;
    root.hidden = !signals?.children.length;
    if (signals) root.append(signals);
  }
  function sessionSignal(doc, session) {
    if (!['Cancelada', 'Reprogramada'].includes(session.state)) return null;
    const label = `S${session.number} · ${shortDate(session.date)} · ${sessionPlanningLabel(doc, session, getState().records)}`;
    const b = node('button', 'plan-session-signal', '↪');
    b.type = 'button'; b.title = label; b.setAttribute('aria-label', label); b.setAttribute('aria-haspopup', 'dialog');
    b.setAttribute('aria-controls', 'replanning-dialog'); b.addEventListener('click', () => open(doc)); return b;
  }
  async function open(doc, focus = null) {
    if (isBusy() || dialog.open || document.querySelector('dialog[open]')) return;
    returnFocus = document.activeElement;
    const request = ++generation, state = getState(), records = state.records.filter(r => r.entry.moduleCode === doc.module.code);
    $('replanning-title').textContent = `${doc.module.code} · ${doc.unit.code} · Reprogramaciones`;
    const root = $('replanning-content'); root.replaceChildren();
    root.append(node('p', 'scope-note', 'Solo consulta. La reprogramación se acuerda en la conversación del módulo. Las notas pendientes permanecen en Unidad.'));
    const status = planningStatus(doc, records);
    if (status.pending.length) root.append(node('p', 'plan-open-note', `${status.pending.length} ${status.pending.length === 1 ? 'sesión pendiente' : 'sesiones pendientes'} de decidir cómo recuperar. Al aprobar la nueva distribución se guardará junto con su registro.`));
    if (status.legacy.length) root.append(node('p', 'scope-note', 'Los antecedentes históricos sin una resolución estructurada requieren revisión. No indican por sí solos que falte reprogramar ni que haya que cambiar las clases actuales.'));
    if (status.unchecked.length) root.append(node('p', 'scope-note', 'Hay resoluciones cuya lectura no está completa. Se conserva su registro; todavía no puede confirmarse el alcance.'));
    for (const s of doc.sessions.filter(s => ['Cancelada', 'Reprogramada'].includes(s.state))) {
      root.append(node('p', '', `S${s.number} · ${shortDate(s.date)} · ${sessionPlanningLabel(doc, s, records)}`));
    }
    const changes = approvedChanges(doc); let focusedDetail = null;
    if (!changes.length) root.append(node('p', 'scope-note', 'Se conservan los estados y anotaciones históricos. No se deducen recuperaciones por fechas o títulos ni se crean registros al abrir esta consulta.'));
    for (const change of changes) {
      const section = node('section', 'plan-change');
      section.append(node('h3', '', `${shortDate(change.approvedOn)} · ${change.reason}`));
      if (focus?.changeId === change.id) focusedDetail = section;
      section.append(node('p', 'scope-note', `Unidades afectadas: ${change.affectedUnitIds.join(', ')}${operationComplete(change, records) ? '' : ' · Lectura incompleta de esta operación'}`));
      const dates = change.beforeSessions.map(s => s.date).sort();
      if (dates.length) section.append(node('p', '', `Intervalo anterior: ${shortDate(dates[0])}–${shortDate(dates.at(-1))}`));
      for (const move of movesInChange(change)) {
        const detail = node('p', 'plan-shift-detail', `${sessionDisplayLabel(doc, move.before, records)} · Antes: ${shortDate(move.before.date)} ${move.before.intervals[0].start} → Ahora: ${shortDate(move.after.date)} ${move.after.intervals[0].start}`);
        section.append(detail);
        if (focus?.changeId === change.id && focus.sourceDate === move.before.date) focusedDetail = detail;
      }
      for (const r of change.resolutions) {
        const source = change.beforeSessions.find(s => s.id === r.sessionId);
        const destinations = r.targets.map(t => {
          const target = records.find(record => record.document.unit.id === t.unitId);
          const s = target?.document.sessions.find(s => s.id === t.sessionId);
          return s ? `${target.document.unit.code} · ${sessionDisplayLabel(target.document, s, records)} · ${shortDate(s.date)}` : `${t.unitId} · destino pendiente de comprobar`;
        });
        section.append(node('p', '', `S${source.number} · ${resolutionLabels[r.outcome]}${destinations.length ? ' → ' + destinations.join('; ') : ''}${r.note ? ' · ' + r.note : ''}`));
      }
      // The same operation id groups all affected units, retaining each snapshot.
      const affected = records.map(record => ({ doc: record.document, change: approvedChanges(record.document).find(c => c.id === change.id) })).filter(r => r.change);
      if (!affected.some(r => r.doc.unit.id === doc.unit.id)) affected.push({ doc, change });
      for (const item of affected) {
        const group = node('div', 'plan-comparison'); group.append(node('h4', '', `${item.doc.unit.code} · ${item.doc.unit.title}`));
        const pre = node('pre', 'plan-comparison-text');
        try { pre.textContent = formatPlanningComparison(item.change.beforeSessions, item.change.afterSessions, { afterLabels: Object.fromEntries(item.change.afterSessions.map(s => [s.id, sessionDisplayLabel(item.doc, s, records, { padded: true })])) }); }
        catch (e) { pre.textContent = e.message; }
        group.append(pre); section.append(group);
      }
      root.append(section);
    }
    const margin = node('p', 'plan-margin', 'Consultando el tope de programación…'); root.append(margin); dialog.showModal();
    if (focusedDetail) { focusedDetail.tabIndex = -1; focusedDetail.focus({ preventScroll: true }); focusedDetail.scrollIntoView({ block: 'nearest' }); }
    try {
      const result = await state.connection.loadCommon(state.catalog);
      if (request !== generation || !dialog.open || getState().connection !== state.connection) return;
      const common = result.document, limit = planningLimit(common, doc.module.code);
      if (!state.complete || changes.some(change => !operationComplete(change, records))) throw new PlanningError('Lectura incompleta del módulo o de la operación aprobada: margen sin confirmar.');
      const capacity = planningMargin(common, doc.module.code, records, { complete: state.complete });
      margin.textContent = `Tope de programación: ${shortDate(limit)} · Final previsto del módulo: ${shortDate(capacity.end)} · ${capacity.overrun ? `Sobrepasa el tope en ${capacity.overrun} sesiones` : `Margen: ${capacity.remaining} sesiones`} · ${capacity.periods} periodos (${capacity.minutes} minutos).`;
      // Margin belongs to the whole module, even if only an earlier UT changed.
      const last = records.map(r => r.document).find(d => d.sessions.some(s => !excludedSession(s) && s.date === capacity.end));
      if (last) {
        const change = [...changes].reverse().map(c => approvedChanges(last).find(h => h.id === c.id)).find(Boolean);
        const after = planningSnapshot(last), before = change?.beforeSessions ?? after;
        const all = [...before, ...after].map(s => s.date).sort(), from = all[0], through = all.at(-1) > limit ? all.at(-1) : limit;
        const pre = node('pre', 'plan-comparison-text');
        pre.textContent = formatPlanningComparison(before, after, { dates: teachingDates(common, doc.module.code, from, through).map(s => s.date), limit, afterLabels: Object.fromEntries(after.map(s => [s.id, sessionDisplayLabel(last, s, records, { padded: true })])) });
        root.append(node('h4', '', `${last.unit.code} · Tramo final vigente hasta el tope${change ? '' : ' · Sin cambios en esta operación'}`), pre);
      }
    } catch (error) {
      if (request === generation && dialog.open) margin.textContent = `Margen sin confirmar. ${error instanceof PlanningError ? error.message : 'No se han podido consultar los datos comunes vigentes.'}`;
    }
  }
  return { render, statusNodes, sessionSignal, open, clear: close };
}
