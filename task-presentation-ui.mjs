const $ = id => document.getElementById(id);
import { presentationDefaults } from './task-cycle.mjs?v=20261018-rf35';

/** A modal draft only. Nothing changes until every required date is confirmed. */
export function createTaskPresentationUI({ onConfirm, onClose }) {
  let pending = null;
  let inputs = [];
  function clear() {
    pending = null; inputs = [];
    $('presentation-items').replaceChildren();
    $('presentation-error').textContent = '';
    $('presentation-dialog').close();
  }
  function close() { const focusId = pending?.focusId; clear(); onClose(focusId); }
  $('presentation-cancel').addEventListener('click', close);
  $('presentation-dialog').addEventListener('cancel', event => { event.preventDefault(); close(); });
  $('presentation-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!pending || !$('presentation-form').reportValidity()) return;
    const values = inputs.map(item => ({ id: item.id, presentedOn: item.presented.value, dueOn: item.due.value, correctBy: item.notice.value }));
    if (!onConfirm(pending, values)) { $('presentation-error').textContent = 'La tarea ha cambiado o alguna fecha no es válida. Cancela y revisa la sesión.'; return; }
    close();
  });
  return { isOpen: () => $('presentation-dialog').open, clear,
    open(context, targets, session) {
      if (!targets.length) return;
      clear(); pending = context;
      inputs = targets.map(target => {
        const section = document.createElement('section'); section.className = 'presentation-item';
        const heading = document.createElement('h3');
        heading.textContent = target === session ? session.activities[0].title : target.title; section.append(heading);
        const controls = document.createElement('div'); controls.className = 'task-date-inputs';
        function dateInput(text, value) {
          const label = document.createElement('label'); label.textContent = text;
          const input = document.createElement('input'); input.type = 'date'; input.required = true; input.value = value || '';
          label.append(input); controls.append(label); return input;
        }
        const defaults = presentationDefaults(target);
        const presented = dateInput('Presentada', defaults.presentedOn);
        const due = dateInput('Entrega', defaults.dueOn);
        const notice = dateInput('Corregir', defaults.correctBy);
        section.append(controls); $('presentation-items').append(section);
        return { id: target.id, presented, due, notice };
      });
      $('presentation-dialog').showModal(); inputs[0].due.focus();
    }
  };
}
