import { SuggestionsStore, createSuggestion, suggestionErrorFeedback } from './suggestions.mjs?v=20261018-rf12';

/** Separate UI and persistence: never reads or writes the academic document. */
export function createSuggestionsUI({ isBusy, setBusy, onStateChange, isAcademicEditorOpen, onSaved = () => {} }) {
  const $ = id => document.getElementById(id);
  const dialog = $('suggestions-dialog');
  const inputs = ['suggestion-type', 'suggestion-title', 'suggestion-description'];
  let store = null;
  let entry = null;
  let uncertain = false;
  let saved = false;
  let returnOrigin = null;
  const launchers = [ $('open-suggestions') ];

  const hasPending = () => !saved && Boolean(entry || $('suggestion-title').value || $('suggestion-description').value);
  function message(content = '', kind = '') {
    $('suggestion-message').textContent = content;
    $('suggestion-message').className = `message${kind ? ` ${kind}` : ''}`;
    $('suggestion-message').hidden = !content;
  }
  function updateAvailability() {
    const busy = isBusy();
    for (const button of launchers) {
      button.disabled = busy || !store || (button === $('open-suggestions') && isAcademicEditorOpen());
      if (button !== $('open-suggestions')) button.hidden = !store;
      button.title = store ? 'Sugerencias sobre la aplicación' : 'Conecta con GitHub para enviar una sugerencia';
      button.classList.toggle('has-content', hasPending());
      button.setAttribute('aria-label', `Sugerencias sobre la aplicación${hasPending() ? ' · Borrador pendiente' : ''}`);
    }
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
    const confirmation = `Sugerencia guardada y confirmada en GitHub.${revision} No se han modificado las notas de tus cursos.`;
    message(confirmation);
    // Build the URL from our generated UUID, never from remote text.
    $('saved-suggestion-link').href = `https://github.com/miGUITel/programacion-piloto-datos/blob/main/APP/sugerencias/${entry.id}.json`;
    $('saved-suggestion-link').hidden = false;
    onSaved({ message: confirmation, url: $('saved-suggestion-link').href });
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
    finally { setBusy(false); if (saved) close(); }
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
    finally { setBusy(false); if (saved) close(); }
  }
  function close() {
    if (isBusy()) return;
    const origin = returnOrigin; returnOrigin = null;
    dialog.close();
    onStateChange();
    // Global busy controls may have toggled callers while the suggestion was saved.
    for (const state of origin?.controls ?? []) {
      if (state.element.isConnected && state.element.closest('dialog')?.open) state.element.disabled = state.disabled;
    }
    const target = origin?.button.isConnected && origin.host?.open ? origin.button : $('open-suggestions');
    target.focus({ preventScroll: true });
    for (const selection of origin?.selections ?? []) {
      if (selection.element.isConnected) selection.element.setSelectionRange(selection.start, selection.end, selection.direction);
    }
    for (const position of origin?.scrolls ?? []) {
      if (position.element.isConnected) { position.element.scrollLeft = position.left; position.element.scrollTop = position.top; }
    }
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
  function openFrom(button) {
    const host = button.closest('dialog');
    if (isBusy() || !store || dialog.open || (host ? !host.open : isAcademicEditorOpen())) return;
    const scrollElements = [document.scrollingElement, host, ...(host?.querySelectorAll('*') ?? [])]
      .filter(element => element && (element === host || element === document.scrollingElement || element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth));
    const callers = [...document.querySelectorAll('dialog[open]')].filter(caller => caller !== dialog);
    const controls = callers.flatMap(caller => [...caller.querySelectorAll('button,input,textarea,select')]).map(element => ({ element, disabled: element.disabled }));
    const selections = controls.filter(({ element }) => typeof element.selectionStart === 'number').map(({ element }) => ({ element, start: element.selectionStart, end: element.selectionEnd, direction: element.selectionDirection }));
    returnOrigin = { button, host, controls, selections, scrolls: scrollElements.map(element => ({ element, left: element.scrollLeft, top: element.scrollTop })) };
    if (saved) reset();
    $('suggestions-return-info').hidden = !host;
    // The caller stays open in the modal stack: no close, apply or save is sent to it.
    dialog.showModal();
    updateAvailability();
    if (!entry && !saved) $('suggestion-title').focus();
    else $('hide-suggestions').focus();
  }
  for (const host of document.querySelectorAll('dialog')) {
    if (host === dialog) continue;
    const header = host.querySelector('header'); if (!header) continue;
    const button = $('open-suggestions').cloneNode(true);
    button.id = 'suggestions-from-' + host.id; button.className = 'button dialog-suggestions'; button.hidden = true;
    button.dataset.suggestionsLauncher = host.id;
    const actions = document.createElement('div'); actions.className = 'dialog-header-actions';
    const closeButton = [...header.children].find(element => element.tagName === 'BUTTON');
    header.append(actions); actions.append(button);
    if (closeButton) actions.append(closeButton);
    launchers.push(button);
  }
  for (const button of launchers) button.addEventListener('click', () => openFrom(button));
  $('suggestions-form').addEventListener('submit', send);
  $('suggestions-form').addEventListener('input', () => { updateAvailability(); onStateChange(); });
  $('close-suggestions').addEventListener('click', close);
  $('hide-suggestions').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  $('verify-suggestion').addEventListener('click', verify);
  $('download-suggestion').addEventListener('click', download);
  $('new-suggestion').addEventListener('click', () => { if (!isBusy() && saved) { reset(); $('suggestion-title').focus(); } });
  return {
    connect(token) { store = new SuggestionsStore({ token }); },
    disconnect() { returnOrigin = null; dialog.close(); store = null; reset(); },
    hasPending,
    updateAvailability,
  };
}
