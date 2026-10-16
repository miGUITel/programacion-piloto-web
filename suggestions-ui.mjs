import { SuggestionsStore, createSuggestion, suggestionErrorFeedback } from './suggestions.mjs?v=20261016-1';

/** Separate UI and persistence: never reads or writes the academic document. */
export function createSuggestionsUI({ isBusy, setBusy, onStateChange, isAcademicEditorOpen }) {
  const $ = id => document.getElementById(id);
  const dialog = $('suggestions-dialog');
  const inputs = ['suggestion-type', 'suggestion-title', 'suggestion-description'];
  let store = null;
  let entry = null;
  let uncertain = false;
  let saved = false;

  const hasPending = () => !saved && Boolean(entry || $('suggestion-title').value || $('suggestion-description').value);
  function message(content = '', kind = '') {
    $('suggestion-message').textContent = content;
    $('suggestion-message').className = `message${kind ? ` ${kind}` : ''}`;
    $('suggestion-message').hidden = !content;
  }
  function updateAvailability() {
    const busy = isBusy();
    $('open-suggestions').disabled = busy || !store || isAcademicEditorOpen();
    $('open-suggestions').title = store ? 'Sugerir mejoras de la aplicación, no de los cursos' : 'Conecta con GitHub para enviar una sugerencia';
    $('open-suggestions').textContent = hasPending() ? 'Sugerencias •' : 'Sugerencias';
    for (const id of inputs) $(id).disabled = busy || Boolean(entry) || saved;
    $('send-suggestion').disabled = busy || !store || uncertain || saved;
    $('send-suggestion').hidden = saved;
    $('new-suggestion').hidden = !saved;
    $('new-suggestion').disabled = busy;
    $('verify-suggestion').hidden = !uncertain;
    $('verify-suggestion').disabled = busy || !store;
    $('download-suggestion').hidden = !hasPending();
    $('download-suggestion').disabled = busy;
    $('close-suggestions').disabled = busy;
    $('hide-suggestions').disabled = busy;
  }
  function reset() {
    entry = null;
    uncertain = false;
    saved = false;
    $('suggestions-form').reset();
    message();
    $('saved-suggestion-link').hidden = true;
    $('saved-suggestion-link').removeAttribute('href');
    updateAvailability();
  }
  function confirm(result) {
    saved = true;
    uncertain = false;
    const sha = result.commitSha || result.sha;
    const revision = typeof sha === 'string' && /^[0-9a-f]{7,64}$/i.test(sha) ? ` Referencia ${sha.slice(0, 8)}.` : '';
    message(`Sugerencia guardada y confirmada en GitHub.${revision} No se han modificado las notas de tus cursos.`);
    // Build the URL from our generated UUID, never from remote text.
    $('saved-suggestion-link').href = `https://github.com/miGUITel/programacion-piloto-datos/blob/main/APP/sugerencias/${entry.id}.json`;
    $('saved-suggestion-link').hidden = false;
    $('suggestion-message').scrollIntoView({ block: 'nearest' });
  }
  function reportError(error) {
    const feedback = suggestionErrorFeedback(error);
    uncertain = Boolean(error?.requiresVerification || feedback.requiresVerification || uncertain);
    // A definitive rejection allows editing the draft before another explicit send.
    if (!uncertain) entry = null;
    message(`${feedback.message} [${feedback.code}]`, uncertain ? 'warning' : 'error');
    $('suggestion-message').scrollIntoView({ block: 'nearest' });
  }
  async function send(event) {
    event.preventDefault();
    if (isBusy() || !store || uncertain || saved) return;
    if (!$('suggestions-form').reportValidity()) return;
    try {
      entry ??= createSuggestion({ type: $('suggestion-type').value, title: $('suggestion-title').value.trim(), description: $('suggestion-description').value.trim() });
      setBusy(true);
      message('Guardando la sugerencia en el registro privado…');
      confirm(await store.save(entry));
    } catch (error) { reportError(error); }
    finally { setBusy(false); }
  }
  async function verify() {
    if (isBusy() || !store || !entry || !uncertain) return;
    setBusy(true);
    message('Comprobando si GitHub recibió esta sugerencia, sin volver a enviarla…');
    try {
      const result = await store.verify(entry);
      if (result.saved) confirm(result);
      else {
        uncertain = false;
        message('GitHub no encuentra esta sugerencia; también puede deberse al acceso al repositorio. Puedes revisar el acceso y volver a pulsar Guardar sugerencia; se conservará el mismo identificador sin sobrescribir un registro existente.', 'warning');
      }
    } catch (error) { reportError(error); }
    finally { setBusy(false); }
  }
  function close() {
    if (isBusy()) return;
    dialog.close();
    onStateChange();
    $('open-suggestions').focus();
  }
  function download() {
    if (isBusy() || !hasPending()) return;
    const value = entry ?? { type: $('suggestion-type').value, title: $('suggestion-title').value, description: $('suggestion-description').value };
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sugerencia-app-${entry?.id ?? 'borrador'}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('open-suggestions').addEventListener('click', () => {
    if (isBusy() || !store || isAcademicEditorOpen()) return;
    dialog.showModal();
    updateAvailability();
    if (!entry && !saved) $('suggestion-title').focus();
    else $('hide-suggestions').focus();
  });
  $('suggestions-form').addEventListener('submit', send);
  $('suggestions-form').addEventListener('input', updateAvailability);
  $('close-suggestions').addEventListener('click', close);
  $('hide-suggestions').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  $('verify-suggestion').addEventListener('click', verify);
  $('download-suggestion').addEventListener('click', download);
  $('new-suggestion').addEventListener('click', () => { if (!isBusy() && saved) { reset(); $('suggestion-title').focus(); } });
  return {
    connect(token) { store = new SuggestionsStore({ token }); },
    disconnect() { dialog.close(); store = null; reset(); },
    hasPending,
    updateAvailability,
  };
}
