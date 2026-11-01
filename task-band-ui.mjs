import { taskBand } from './task-band.mjs?v=20261101-preparation-links';
import { safeResourceUrl, validGithubLocation } from './resources.mjs?v=20261101-preparation-links';

export function renderTaskBand(section, list, document, { resourceUI, isBusy, onManage }) {
  list.replaceChildren();section.hidden=!document;
  if(!document)return;
  const band=taskBand(document);
  for(const [kind,items] of [['task',band.tasks],['exam',band.exams]]) {
    for(const item of items) {
      const cell=globalThis.document.createElement('li');cell.className=`task-band-cell task-band-${kind}`;
      cell.dataset[kind==='task'?'taskId':'examPart']=item.id;
      const readiness=item.prepared?(kind==='task'?'Preparada':'Preparado'):item.known?'Pendiente de preparar':'Preparación sin vincular';
      const title=`${kind==='task'?'Tarea '+item.label:item.label} · ${item.title} · ${readiness}`;
      const label=kind==='exam'?(item.id==='test'?'T':'P'):item.label;
      const access=resourceUI.access({resources:item.resources,moduleCode:document.module.code,label,title,
        unresolved:[...(item.unresolved??[]),...(item.unclassified??[])],onManage,
        emptyMessage:kind==='task'?'Esta tarea todavía no tiene un enunciado o ficha enlazados.':'Todavía no hay un recurso enlazado y clasificado para esta parte del examen.'});
      access.classList.add('task-band-tile');
      if(!item.prepared)access.classList.add('task-not-ready');
      if(!item.resources.some(resource=>resource.location?.kind==='https'&&safeResourceUrl(resource.location.url,resource.location.public===true)||validGithubLocation(resource.location))) {
        access.classList.add('task-band-unlinked');access.title+=' · Sin enlace';access.setAttribute('aria-label',access.title);
      }
      if(access.tagName==='BUTTON')access.disabled=isBusy();
      cell.append(access);list.append(cell);
    }
  }
}
