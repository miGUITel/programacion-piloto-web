import { FOLLOWUP_SETTING, SUMMARY_CHANNEL, followupBase, followupUrl, pendingCount, validatePendingCounts } from './student-followup.mjs?v=20261113-followup';

export function createStudentFollowupUI({ getContext = () => ({}), isBusy = () => false, getCurriculum = () => [], getSelectedModule = () => '',
  onCountsChange = () => {} } = {}) {
  const node = (tag, text = '') => { const el = document.createElement(tag); el.textContent = text; return el; };
  let base = ''; try { base = followupBase(localStorage.getItem(FOLLOWUP_SETTING)) || ''; } catch {}
  let counts = null, request = null;
  const summaryStatus = document.getElementById('student-followup-summary-status');
  const summaryButton = document.getElementById('student-followup-summary');
  function showStatus(text = 'Seguimiento sin consultar') {
    if (!summaryStatus) return;
    summaryStatus.hidden = !base && !request;
    summaryStatus.textContent = text;
  }
  showStatus();
  const dialog = node('dialog'); dialog.id = 'student-followup-settings'; dialog.className = 'suggestions-dialog';
  dialog.setAttribute('aria-labelledby', 'student-followup-title');
  const form = node('form'); form.className = 'suggestions-form';
  const title = node('h2', 'Seguimiento del alumnado'); title.id = 'student-followup-title';
  const header = node('header'); header.className = 'suggestions-header'; header.append(title);
  const body = node('div'); body.className = 'suggestions-body';
  const label = node('label', 'URL de tu aplicación privada de Apps Script');
  const input = node('input'); input.id = 'student-followup-url'; input.type = 'url'; input.placeholder = 'https://script.google.com/macros/s/…/exec'; label.htmlFor = input.id;
  const help = node('p', 'Copia la URL de Aplicación web terminada en /exec. Si incluye /a/macros/ y el dominio de tu organización, conserva la dirección completa. Se guarda solo esta dirección en este navegador. Los nombres y el seguimiento se consultan y guardan en Google.'); help.className = 'scope-note';
  const status = node('p'); status.setAttribute('role', 'status');
  body.append(label, input, help, status);
  const footer = node('footer'); footer.className = 'suggestions-footer';
  const close = node('button', 'Cerrar'); close.type = 'button'; close.className = 'button button-secondary'; close.addEventListener('click', () => dialog.close());
  const save = node('button', 'Guardar enlace'); save.type = 'submit'; save.className = 'button button-primary';
  footer.append(close, save); form.append(header, body, footer); dialog.append(form); document.body.append(dialog);
  function configure() { input.value = base; status.textContent = ''; if (!dialog.open) dialog.showModal(); input.focus(); }
  form.addEventListener('submit', event => {
    event.preventDefault(); const value = input.value.trim(), checked = value ? followupBase(value) : '';
    if (value && !checked) { status.textContent = 'Usa la URL de Aplicación web de script.google.com terminada en /exec, sin parámetros ni fragmentos. Se admiten las direcciones generales y las de tu organización (/a/macros/dominio/s/…/exec).'; return; }
    try {
      if (checked) localStorage.setItem(FOLLOWUP_SETTING, checked);
      else localStorage.removeItem(FOLLOWUP_SETTING);
      if (base !== checked) { base = checked; clear(); }
      status.textContent = 'Enlace guardado. Cierra y pulsa el acceso al examen o RA.';
    }
    catch { status.textContent = 'El navegador no permite guardar la configuración. No se ha cambiado el enlace.'; }
  });
  function openLink(url) {
    const link = node('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.referrerPolicy = 'no-referrer';
    document.body.append(link);
    link.click();
    link.remove();
  }
  function open(context = {}) {
    if (isBusy()) return;
    if (!base) { configure(); return; }
    const full = { ...getContext(context.module), ...context };
    const destination = base;
    const curriculum = getCurriculum();
    if (!curriculum?.then) {
      openLink(followupUrl(destination, full, curriculum));
      return;
    }
    // Open while the click is still active. The destination has no opener.
    const tab = window.open('', '_blank');
    if (!tab) {
      status.textContent = 'El navegador ha bloqueado la pestaña. Permite abrirla y vuelve a pulsar el enlace.';
      input.value = base;
      if (!dialog.open) dialog.showModal();
      return;
    }
    tab.opener = null;
    tab.document.title = 'Seguimiento del alumnado';
    tab.document.body.textContent = 'Cargando los RA…';
    void curriculum.catch(() => []).then(items => {
      if (!tab.closed) tab.location.replace(followupUrl(destination, full, items));
    });
  }
  function closeRequest() {
    if (!request) return;
    clearTimeout(request.timeout);
    request.channel.close();
    request = null;
  }
  function clear(notify = true) {
    closeRequest();
    const hadCounts = counts !== null;
    counts = null;
    showStatus();
    if (hadCounts && notify) onCountsChange();
  }
  function refreshCounts() {
    if (isBusy()) return;
    if (!base) { configure(); return; }
    closeRequest();
    const tab = window.open('', '_blank');
    if (!tab) {
      showStatus('El navegador ha bloqueado la pestaña. Permite abrirla y vuelve a consultar los avisos.');
      return;
    }
    tab.opener = null;
    try {
      const nonce = [...crypto.getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2, '0')).join('');
      const channel = new BroadcastChannel(SUMMARY_CHANNEL);
      const timeout = setTimeout(() => {
        closeRequest();
        showStatus('Consulta sin completar. Pulsa Actualizar avisos para reintentar.');
      }, 10 * 60 * 1000);
      request = { channel, timeout };
      channel.onmessage = ({ data }) => {
        if (data?.type !== 'summary' || data.nonce !== nonce || request?.channel !== channel) return;
        const next = validatePendingCounts(data.rows);
        if (!next) return;
        channel.postMessage({ type: 'received', nonce });
        closeRequest();
        counts = next;
        const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format();
        showStatus('Avisos consultados a las ' + time);
        onCountsChange();
      };
      const url = new URL(base);
      url.searchParams.set('mode', 'summary');
      url.searchParams.set('bridge', nonce);
      showStatus('En Google, pulsa Enviar a Cuaderno.');
      tab.location.replace(url.href);
    } catch {
      closeRequest();
      tab.close();
      showStatus('No se ha podido abrir la consulta de avisos. Vuelve a intentarlo.');
    }
  }
  function count(target) {
    return pendingCount(counts, { ...getContext(target.module), ...target });
  }
  function pendingLabel(target, pending = count(target)) {
    return pending === 1 ? '1 alumno pendiente' : pending + ' alumnos pendientes';
  }
  function button(context, text = 'Seguimiento del alumnado ↗') {
    const pending = count(context);
    const el = node('button', pending ? text + ' · ' + pendingLabel(context, pending) : text);
    el.type = 'button'; el.className = 'button button-small student-followup-link';
    el.dataset.followupKind = context.kind; el.dataset.followupRef = context.ref || '';
    el.addEventListener('click', () => open(context)); return el;
  }
  const detail = node('dialog');
  detail.className = 'suggestions-dialog followup-detail';
  const detailTitle = node('h2');
  detailTitle.id = 'followup-detail-title';
  detail.setAttribute('aria-labelledby', detailTitle.id);
  const detailHeader = node('header');
  detailHeader.className = 'suggestions-header';
  detailHeader.append(detailTitle);
  const detailBody = node('div');
  detailBody.className = 'suggestions-body followup-detail-links';
  const detailFooter = node('div');
  detailFooter.className = 'suggestions-footer';
  const detailClose = node('button', 'Cerrar');
  detailClose.type = 'button';
  detailClose.className = 'button';
  detailClose.addEventListener('click', () => detail.close());
  detailFooter.append(detailClose);
  detail.append(detailHeader, detailBody, detailFooter);
  document.body.append(detail);
  function unitMarker(label, alerts) {
    if (!alerts.length) return null;
    const marker = node('button', alerts.length + ' RA');
    marker.type = 'button';
    marker.className = 'followup-unit-marker';
    marker.setAttribute('aria-haspopup', 'dialog');
    marker.setAttribute('aria-label', label + ' · ' + alerts.length + ' RA con alumnado pendiente');
    marker.title = marker.getAttribute('aria-label');
    marker.addEventListener('click', () => {
      if (isBusy() || detail.open) return;
      detailTitle.textContent = 'Seguimiento · ' + label;
      detailBody.replaceChildren(...alerts.map(({ target }) => button(target, target.label)));
      detail.showModal();
    });
    return marker;
  }
  document.getElementById('student-followup-open')?.addEventListener('click', () => open({module:getSelectedModule()}));
  document.getElementById('student-followup-configure')?.addEventListener('click', configure);
  summaryButton?.addEventListener('click', refreshCounts);
  return { open, button, configure, count, unitMarker, clear };
}
