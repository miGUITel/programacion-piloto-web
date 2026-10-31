import { sessionBand, madridToday } from './unit-tools.mjs?v=20261031-rf28-removal';
import { sessionDisplayLabel } from './replanning.mjs?v=20261027-rf32-labels';

export function renderSessionResourceBand(container, document, { records = [], today = madridToday(), onOpen, busy = false } = {}) {
  container.replaceChildren();container.dataset.today=today;
  for (const item of sessionBand(document.sessions, today, document, records)) {
    if (item.monthLabel) {
      const month=globalThis.document.createElement('li');month.className='band-month';month.textContent=item.monthLabel;
      month.title=item.monthName;month.setAttribute('aria-label',item.monthName);container.append(month);
    }
    const cell=globalThis.document.createElement('li');
    cell.className=`band-cell${item.past?' elapsed':''}${item.today?' today':''}`;cell.dataset.sessionId=item.id;
    const control=globalThis.document.createElement(onOpen?'button':'span');
    control.className=`band-day${item.task?' has-task':''}${item.exam?' has-exam':''}${item.preparation?.ready?'':' session-not-ready'}`;
    control.textContent=item.day;
    const date=new Intl.DateTimeFormat('es-ES',{dateStyle:'full',timeZone:'UTC'}).format(new Date(item.date+'T12:00:00Z'));
    const types=[item.task?'Tarea':'',item.exam?'Examen':''].filter(Boolean).join(' y ');
    const sessionLabel=sessionDisplayLabel(document,document.sessions[item.index],records);
    const label=`${sessionLabel} · ${date}${types?' · '+types:''} · ${item.preparation?.label??'Recursos sin vincular'}${item.today?' · Hoy':''}${item.past?' · Fecha pasada':''}`;
    control.title=label;control.setAttribute('aria-label',label);
    if(onOpen){control.type='button';control.disabled=busy;control.addEventListener('click',()=>{if(!busy)onOpen(item);});}
    else control.tabIndex=0;
    cell.append(control);container.append(cell);
  }
}
