import { unitCurriculum } from './unit-curriculum.mjs?v=20261109-common-preparation';

export function createUnitCurriculumUI({ isBusy, getConnection, getTarget, otherEditorOpen, onStateChange = () => {} }) {
  const $ = id => document.getElementById(id);
  const dialog = $('unit-curriculum-dialog'), opener = $('unit-curriculum-open');
  const content = $('unit-curriculum-content'), message = $('unit-curriculum-message');
  let target = null, loading = false, request = 0;
  function node(tag, value, className = '') {
    const element = document.createElement(tag);
    if (value) element.textContent = value;
    if (className) element.className = className;
    return element;
  }
  function updateAvailability() {
    const active = getTarget();
    opener.hidden = !active;
    opener.disabled = !active || !getConnection() || isBusy() || otherEditorOpen() || dialog.open;
    $('unit-curriculum-refresh').disabled = loading || isBusy() || !target;
  }
  function reset() {
    request++; target = null; loading = false;
    content.replaceChildren(); message.textContent = ''; message.hidden = true;
    $('unit-curriculum-context').textContent = '';
    $('unit-curriculum-source').textContent = '';
  }
  async function load() {
    if (!target || loading || isBusy()) return;
    const current = ++request, connection = getConnection(), snapshot = target;
    loading = true; content.replaceChildren();
    $('unit-curriculum-source').textContent = '';
    message.textContent = 'Leyendo los RA y CE de la información del módulo…';
    message.className = 'message'; message.hidden = false; updateAvailability();
    try {
      if (!snapshot.module.profile) {
        message.textContent = 'La información general de este módulo está pendiente de incorporar.';
        return;
      }
      const loaded = await connection.loadModuleProfile(snapshot.module);
      if (current !== request || connection !== getConnection() || !dialog.open || getTarget()?.document.unit.id !== snapshot.document.unit.id) return;
      const view = unitCurriculum(snapshot.document, loaded.document);
      content.append(node('p', view.associationSource, 'scope-note'));
      for (const value of view.messages) content.append(node('p', value, 'profile-pending'));
      for (const ra of view.outcomes) {
        const section = node('section', '', 'unit-curriculum-outcome');
        section.append(node('h3', ra.label), node('p', ra.text));
        if (ra.criteria.length) {
          const ul = node('ul');
          for (const ce of ra.criteria) {
            const li = node('li');
            li.append(node('strong', `${ce.code} · `), node('span', ce.text || 'Definición no disponible.'));
            ul.append(li);
          }
          section.append(ul);
        }
        for (const warning of ra.warnings) section.append(node('p', warning, 'profile-pending'));
        content.append(section);
      }
      $('unit-curriculum-source').textContent = [view.sourceLabel, 'Solo lectura'].filter(Boolean).join(' · ');
      message.hidden = true;
    } catch {
      if (current !== request || !dialog.open) return;
      content.replaceChildren();
      message.textContent = 'No se han podido consultar los RA y CE. Pulsa Actualizar para reintentar. Las notas pendientes se conservan.';
      message.className = 'message error'; message.hidden = false;
    } finally {
      if (current === request) { loading = false; updateAvailability(); }
    }
  }
  async function open() {
    if (isBusy() || otherEditorOpen() || dialog.open || !getConnection()) return;
    const active = getTarget(); if (!active) return;
    target = structuredClone(active);
    $('unit-curriculum-context').textContent = `${target.document.module.code} · ${target.document.unit.code} · ${target.document.unit.title}`;
    dialog.showModal(); updateAvailability(); onStateChange(); await load();
  }
  opener.addEventListener('click', open);
  // Restore the shortcut after any other modal closes.
  document.addEventListener('close', updateAvailability, true);
  $('unit-curriculum-refresh').addEventListener('click', load);
  for (const id of ['unit-curriculum-close', 'unit-curriculum-hide']) $(id).addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    reset(); updateAvailability(); onStateChange();
    if (getConnection() && !opener.hidden) opener.focus({ preventScroll: true });
  });
  return { updateAvailability, isOpen: () => dialog.open, clear() { reset(); dialog.close(); updateAvailability(); } };
}
