import { GeneralNotesStore, getGeneralText, withGeneralText } from './general-notes.mjs?v=20261018-rf1';
import { saveErrorFeedback } from './core.mjs?v=20261018-rf1';

export function createGeneralNotesUI({ isBusy, setBusy, onStateChange, getTarget, otherEditorOpen, improvementIcon, onMessage = () => {} }) {
  const $ = id => document.getElementById(id);
  const dialog = $('general-notes-dialog');
  let token = null, target = null, store = null, loaded = null, blocked = false, remote = null;
  const hasPending = () => Boolean(loaded && (blocked || $('general-notes-text').value !== getGeneralText(loaded.document, target)));
  const sameTarget = value => value?.moduleCode === target?.moduleCode && value?.unitCode === target?.unitCode;
  const message = (value = '', kind = '') => {
    $('general-notes-message').textContent = value;
    $('general-notes-message').className = `message${kind ? ` ${kind}` : ''}`;
    $('general-notes-message').hidden = !value;
  };
  function updateAvailability() {
    const busy = isBusy();
    for (const [scope, id] of [['module', 'module-improvements'], ['unit', 'unit-improvements']]) {
      const next = getTarget(scope);
      $(id).disabled = busy || !token || !next || otherEditorOpen() || (hasPending() && !sameTarget(next));
      const pending = hasPending() && sameTarget(next);
      if (improvementIcon) {
        const label = document.createElement('span'); label.textContent = scope === 'module' ? 'Mejoras del módulo' : 'Mejoras de la UT';
        $(id).replaceChildren(improvementIcon(), label); $(id).classList.toggle('has-content', pending);
      }
      else $(id).textContent = `Mejoras${pending ? ' •' : ''}`;
      $(id).setAttribute('aria-label', `${scope === 'module' ? 'Mejoras generales del módulo' : 'Mejoras generales de la unidad abierta'}${pending ? ' · Borrador pendiente' : ''}`);
      $(id).title = next ? `Mejoras generales de ${next.unitCode ? `${next.moduleCode} ${next.unitCode}` : next.moduleCode}` : 'Conecta y elige el ámbito';
    }
    $('general-notes-text').disabled = busy || !loaded || blocked;
    $('save-general-notes').disabled = busy || !loaded || blocked || !hasPending();
    $('reload-general-notes').disabled = busy || !store;
    $('download-general-notes').disabled = busy || !loaded;
    $('download-general-notes').hidden = !hasPending();
    $('discard-general-notes').hidden = !hasPending();
    $('discard-general-notes').disabled = busy;
    $('close-general-notes').disabled = busy;
    $('hide-general-notes').disabled = busy;
    $('use-remote-general-notes').disabled = busy;
    $('keep-general-notes').disabled = busy;
    $('general-notes-comparison').hidden = !remote;
  }
  function accept(result) {
    loaded = result; blocked = false; remote = null;
    $('general-notes-remote').value = '';
    $('general-notes-text').value = getGeneralText(result.document, target);
  }
  async function open(scope) {
    if (isBusy() || !token || otherEditorOpen()) return;
    const next = getTarget(scope);
    if (!next || (hasPending() && !sameTarget(next))) return;
    if (hasPending()) { dialog.showModal(); updateAvailability(); return; }
    target = Object.freeze({ ...next });
    store = new GeneralNotesStore({ token, moduleCode: target.moduleCode });
    loaded = null; blocked = false; remote = null;
    $('general-notes-text').value = '';
    $('general-notes-title').textContent = target.unitCode ? `Mejoras de ${target.moduleCode} · ${target.unitCode}` : `Mejoras de ${target.moduleCode}`;
    $('general-notes-context').textContent = target.title;
    message('Leyendo tus mejoras de GitHub…');
    dialog.showModal();
    setBusy(true);
    try { accept(await store.load()); message(); }
    catch { message('No se han podido leer las mejoras. Pulsa Revisar GitHub para intentarlo de nuevo.', 'error'); }
    finally { setBusy(false); }
    if (loaded) $('general-notes-text').focus();
  }
  async function save(event) {
    event.preventDefault();
    if (isBusy() || !loaded || blocked || !hasPending()) return;
    let confirmed = false;
    setBusy(true); message('Guardando tus mejoras…');
    try {
      const document = withGeneralText(loaded.document, target, $('general-notes-text').value);
      const result = await store.save(document, loaded.sha);
      accept(result);
      const revision = /^[a-f0-9]{7,64}$/i.test(result.commitSha || '') ? ` Revisión ${result.commitSha.slice(0, 8)}.` : '';
      onMessage(`Mejoras guardadas y confirmadas en GitHub.${revision}`);
      confirmed = true;
    } catch (error) {
      const feedback = saveErrorFeedback(error);
      blocked = Boolean(feedback.requiresReload || error?.code === 'HTTP_422');
      message(`${feedback.message}${blocked ? ' Pulsa Revisar GitHub para comprobar el texto guardado.' : ''} [${feedback.code}]`, blocked ? 'warning' : 'error');
    } finally { setBusy(false); if (confirmed) close(); }
  }
  async function review() {
    if (isBusy() || !store) return;
    const pending = hasPending();
    const localText = $('general-notes-text').value;
    const baseText = loaded ? getGeneralText(loaded.document, target) : null;
    setBusy(true); message('Comprobando el texto guardado en GitHub…');
    try {
      const result = await store.load();
      const remoteText = getGeneralText(result.document, target);
      if (!pending || remoteText === localText) {
        accept(result); message(pending ? 'El texto está guardado y confirmado en GitHub.' : 'Mejoras actualizadas desde GitHub.');
      } else if (remoteText === baseText) {
        loaded = result; blocked = false; remote = null;
        message('Tu borrador se conserva. GitHub mantiene el texto anterior; puedes pulsar Guardar mejoras cuando quieras.', 'warning');
      } else {
        remote = result; blocked = true;
        $('general-notes-remote').value = remoteText;
        message('Hay otro texto en GitHub. Compara ambos y elige cuál conservar antes de guardar.', 'warning');
      }
    } catch { message('No se ha podido comprobar GitHub. El borrador se conserva.', 'error'); }
    finally { setBusy(false); }
  }
  function resolve(keepLocal) {
    if (isBusy() || !remote) return;
    const localText = $('general-notes-text').value;
    accept(remote);
    if (keepLocal) $('general-notes-text').value = localText;
    message(keepLocal ? 'Has conservado tu borrador. Revísalo y pulsa Guardar mejoras para actualizar esta versión.' : 'Se está mostrando el texto de GitHub.');
    onStateChange();
  }
  function close() {
    if (isBusy()) return;
    dialog.close(); onStateChange();
    $(target?.unitCode ? 'unit-improvements' : 'module-improvements').focus({ preventScroll: true });
  }
  function download() {
    if (!loaded || isBusy()) return;
    const value = withGeneralText(loaded.document, target, $('general-notes-text').value);
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url;
    anchor.download = `${target.moduleCode}${target.unitCode ? `-${target.unitCode}` : ''}-mejoras-borrador.json`;
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('module-improvements').addEventListener('click', () => open('module'));
  $('unit-improvements').addEventListener('click', () => open('unit'));
  $('general-notes-form').addEventListener('submit', save);
  $('general-notes-text').addEventListener('input', onStateChange);
  $('reload-general-notes').addEventListener('click', review);
  $('close-general-notes').addEventListener('click', close);
  $('hide-general-notes').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  $('download-general-notes').addEventListener('click', download);
  $('use-remote-general-notes').addEventListener('click', () => resolve(false));
  $('keep-general-notes').addEventListener('click', () => resolve(true));
  $('discard-general-notes').addEventListener('click', () => {
    if (isBusy() || !loaded || !window.confirm('¿Descartar el borrador de estas mejoras?')) return;
    if (blocked && !remote) {
      loaded = null; target = null; store = null; blocked = false;
      $('general-notes-text').value = '';
      message(); close(); return;
    }
    if (remote) accept(remote); else accept(loaded);
    message(); onStateChange();
  });
  return {
    hasPending, isOpen: () => dialog.open, updateAvailability,
    connect(value) { token = value; },
    disconnect() {
      dialog.close(); token = null; target = null; store = null; loaded = null; blocked = false; remote = null;
      ['general-notes-text', 'general-notes-remote'].forEach(id => { $(id).value = ''; });
      ['general-notes-title', 'general-notes-context'].forEach(id => { $(id).textContent = ''; });
      message();
    },
  };
}
