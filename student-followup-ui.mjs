import { FOLLOWUP_SETTING, followupBase, followupUrl } from './student-followup.mjs?v=20261111-followup';

export function createStudentFollowupUI({ getContext = () => ({}), isBusy = () => false } = {}) {
  const node = (tag, text = '') => { const el = document.createElement(tag); el.textContent = text; return el; };
  let base = ''; try { base = followupBase(localStorage.getItem(FOLLOWUP_SETTING)) || ''; } catch {}
  const dialog = node('dialog'); dialog.id = 'student-followup-settings'; dialog.className = 'suggestions-dialog';
  dialog.setAttribute('aria-labelledby', 'student-followup-title');
  const form = node('form'); form.className = 'suggestions-form';
  const title = node('h2', 'Seguimiento del alumnado'); title.id = 'student-followup-title';
  const header = node('header'); header.className = 'suggestions-header'; header.append(title);
  const body = node('div'); body.className = 'suggestions-body';
  const label = node('label', 'URL de tu aplicación privada de Apps Script');
  const input = node('input'); input.id = 'student-followup-url'; input.type = 'url'; input.placeholder = 'https://script.google.com/macros/s/…/exec'; label.htmlFor = input.id;
  const help = node('p', 'Se guarda solo esta dirección en este navegador. Los nombres y el seguimiento se consultan y guardan en Google.'); help.className = 'scope-note';
  const status = node('p'); status.setAttribute('role', 'status');
  body.append(label, input, help, status);
  const footer = node('footer'); footer.className = 'suggestions-footer';
  const close = node('button', 'Cerrar'); close.type = 'button'; close.className = 'button button-secondary'; close.addEventListener('click', () => dialog.close());
  const save = node('button', 'Guardar enlace'); save.type = 'submit'; save.className = 'button button-primary';
  footer.append(close, save); form.append(header, body, footer); dialog.append(form); document.body.append(dialog);
  function configure() { input.value = base; status.textContent = ''; if (!dialog.open) dialog.showModal(); input.focus(); }
  form.addEventListener('submit', event => {
    event.preventDefault(); const value = input.value.trim(), checked = value ? followupBase(value) : '';
    if (value && !checked) { status.textContent = 'Usa la URL https://script.google.com/macros/s/…/exec, sin parámetros ni fragmentos.'; return; }
    try { if (checked) localStorage.setItem(FOLLOWUP_SETTING, checked); else localStorage.removeItem(FOLLOWUP_SETTING); base = checked; status.textContent = 'Enlace guardado. Cierra y pulsa el acceso al examen o RA.'; }
    catch { status.textContent = 'El navegador no permite guardar la configuración. No se ha cambiado el enlace.'; }
  });
  function open(context = {}) {
    if (isBusy()) return;
    if (!base) { configure(); return; }
    const full = { ...getContext(context.module), ...context };
    const a = node('a'); a.href = followupUrl(base, full); a.target = '_blank'; a.rel = 'noopener noreferrer'; a.referrerPolicy = 'no-referrer';
    document.body.append(a); a.click(); a.remove();
  }
  function button(context, text = 'Seguimiento del alumnado ↗') {
    const el = node('button', text); el.type = 'button'; el.className = 'button button-small student-followup-link';
    el.dataset.followupKind = context.kind; el.dataset.followupRef = context.ref || '';
    el.addEventListener('click', () => open(context)); return el;
  }
  document.getElementById('student-followup-open')?.addEventListener('click', () => open());
  document.getElementById('student-followup-configure')?.addEventListener('click', configure);
  return { open, button, configure };
}
