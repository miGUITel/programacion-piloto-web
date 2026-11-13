import { taskBand } from './task-band.mjs?v=20261109-common-preparation';
import { safeResourceUrl, validGithubLocation } from './resources.mjs?v=20261109-common-preparation';

export function renderTaskBand(section, list, document, { resourceUI, isBusy, onManage, makeExamAction, examPending = () => 0 }) {
  list.replaceChildren();section.hidden=!document;
  if(!document)return;
  const band=taskBand(document);
  for(const [kind,items] of [['task',band.tasks],['exam',band.exams]]) {
    for(const item of items) {
      const cell=globalThis.document.createElement('li');cell.className=`task-band-cell task-band-${kind}`;
      cell.dataset[kind==='task'?'taskId':item.examPart?'examPart':'examId']=item.id;
      const readiness=item.prepared?(kind==='task'?'Preparada':'Preparado'):item.known?'Pendiente de preparar':'Sin examen asociado';
      const pending=kind==='exam'?[...new Set(item.ownerIds??[])].reduce((total,id)=>total+examPending(id),0):0;
      const reminder=pending?(pending===1?' · 1 repetición pendiente':' · '+pending+' repeticiones pendientes'):'';
      const title=`${kind==='task'?'Tarea '+item.label:item.label} · ${item.title} · ${readiness}${reminder}`;
      const label=kind==='exam'&&item.examPart?(item.examPart==='test'?'T':'P'):item.label;
      const access=resourceUI.access({resources:item.resources,moduleCode:document.module.code,label,title,
        extraActions:kind==='exam'&&makeExamAction?(item.ownerIds??[]).map(id=>document.tasks.find(task=>task.id===id)).filter(Boolean).map(task=>()=>makeExamAction(task)):[],
        unresolved:item.accessWarnings??[...(item.unresolved??[]),...(item.unclassified??[])],onManage,
        emptyMessage:kind==='task'?'Esta tarea todavía no tiene un enunciado o ficha enlazados.':item.known
          ?'El cuestionario de Aula Virtual requiere autenticación y no necesita un enlace aquí. Puedes consultar desde esta banda su ficha docente privada cuando esté asociada.'
          :'Todavía no hay un examen asociado en la lista oficial.'});
      access.classList.add('task-band-tile');
      if(!item.prepared)access.classList.add('task-not-ready');
      if(!item.resources.some(resource=>resource.location?.kind==='https'&&safeResourceUrl(resource.location.url,resource.location.public===true)||validGithubLocation(resource.location))) {
        access.classList.add('task-band-unlinked');access.title+=' · Sin enlace';access.setAttribute('aria-label',access.title);
      }
      if(access.tagName==='BUTTON')access.disabled=isBusy();
      cell.append(access);list.append(cell);
      if (pending) {
        const badge=globalThis.document.createElement('span');
        badge.className='followup-count followup-exam-count';
        badge.textContent=pending>99?'99+':String(pending);
        badge.setAttribute('aria-hidden','true');
        cell.append(badge);
      }
    }
  }
}
