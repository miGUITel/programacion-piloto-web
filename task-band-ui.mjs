import { taskBand } from './task-band.mjs?v=20261031-task-band';
import { safeResourceUrl, validGithubLocation } from './resources.mjs?v=20261031-task-band';

export function renderTaskBand(section, list, document, { resourceUI, isBusy, onManage }) {
  list.replaceChildren();section.hidden=!document;
  if(!document)return;
  const band=taskBand(document);
  for(const [kind,items] of [['task',band.tasks],['exam',band.exams]]) {
    for(const item of items) {
      const cell=globalThis.document.createElement('li');cell.className=`task-band-cell task-band-${kind}`;
      cell.dataset[kind==='task'?'taskId':'examPart']=item.id;
      const title=`${kind==='task'?'Tarea '+item.label:item.label} · ${item.title}`;
      const access=resourceUI.access({resources:item.resources,moduleCode:document.module.code,label:item.label,title,
        unresolved:[...(item.unresolved??[]),...(item.unclassified??[])],onManage,
        emptyMessage:kind==='task'?'Esta tarea todavía no tiene un enunciado o ficha enlazados.':'Todavía no hay un recurso enlazado y clasificado para esta parte del examen.'});
      access.classList.add('task-band-tile');
      if(!item.resources.some(resource=>resource.location?.kind==='https'&&safeResourceUrl(resource.location.url,resource.location.public===true)||validGithubLocation(resource.location))) {
        access.classList.add('task-band-unlinked');access.title+=' · Sin enlace';access.setAttribute('aria-label',access.title);
        const hint=globalThis.document.createElement('small');hint.textContent='Sin enlace';access.append(hint);
      }
      if(access.tagName==='BUTTON')access.disabled=isBusy();
      cell.append(access);list.append(cell);
    }
  }
}
