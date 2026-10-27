import { approvedChanges, planningSnapshot, excludedSession, planningStatus, sessionDisplayLabel, sessionPlanningLabel, resolutionLabels, planningLimit, planningMargin, teachingDates, formatPlanningComparison, operationComplete, PlanningError } from './replanning.mjs?v=20261027-rf32-labels';
const $ = id => document.getElementById(id);
import { movesInChange } from './planning-shifts.mjs?v=20261027-rf32-gaps';
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
    const add = (label, kind = '') => { const b = node('button', `plan-signal ${kind}`, label); b.type = 'button'; b.setAttribute('aria-haspopup', 'dialog'); b.addEventListener('click', () => open(doc)); root.append(b); };
    if (status.pending.length) add(`Pendiente de reprogramar · ${status.pending.length}`, 'plan-pending');
    if (status.unchecked.length) add('Resolución pendiente de comprobar', 'plan-pending');
    if (status.legacy.length) add('Reprogramación sin traza', 'plan-legacy');
    if (status.modified) add('Plan modificado', 'plan-modified');
    return root;
  }
  function render() {
    const doc = getState().document, root = $('unit-replanning'); root.replaceChildren();
    if (doc) root.append(statusNodes(doc));
  }
  function sessionSignal(doc, session) {
    if (!['Cancelada', 'Reprogramada'].includes(session.state)) return null;
    const b = node('button', 'plan-session-signal', sessionPlanningLabel(doc, session, getState().records));
    b.type = 'button'; b.setAttribute('aria-haspopup', 'dialog'); b.addEventListener('click', () => open(doc)); return b;
  }
  async function open(doc, focus = null) {
    if (isBusy() || dialog.open || document.querySelector('dialog[open]')) return;
    returnFocus = document.activeElement;
    const request = ++generation, state = getState(), records = state.records.filter(r => r.entry.moduleCode === doc.module.code);
    $('replanning-title').textContent = `${doc.module.code} · ${doc.unit.code} · Reprogramaciones`;
    const root = $('replanning-content'); root.replaceChildren();
    root.append(node('p', 'scope-note', 'Solo consulta. La reprogramación se acuerda en la conversación del módulo. Las notas pendientes permanecen en Unidad.'));
    for (const s of doc.sessions.filter(s => ['Cancelada', 'Reprogramada'].includes(s.state))) {
      root.append(node('p', '', `S${s.number} · ${shortDate(s.date)} · ${sessionPlanningLabel(doc, s, records)}`));
    }
    const changes = approvedChanges(doc); let focusedDetail = null;
    if (!changes.length) root.append(node('p', '', 'No hay una traza aprobada de RF 32. Se conservan los estados anteriores; no se deducen recuperaciones por fechas o títulos.'));
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
