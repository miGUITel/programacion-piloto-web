import { safeResourceUrl, validGithubLocation, resourceTypes, effectiveResourceDestination, effectiveResourceDestinations, modulePublishedWebRoot, modulePublishedRepository } from './resources.mjs?v=20261102-ppt-guided-icons';

const groups = [
  { id:'assignment', label:'Tarea o enunciado', paths:['M9 5H6v16h12V5h-3','M9 3h6v4H9z','M9 11h6M9 15h6'] },
  { id:'presentation', label:'Presentación', paths:['M3 4h18M5 4v12h14V4','M12 16v5M8 21l4-3 4 3','M8 12l3-4 3 3 2-3'] },
  { id:'notes', label:'Apuntes o web del módulo', paths:['M12 5C9 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-6-1-9 1z','M12 5v15'] },
  { id:'guided-example', label:'Ejemplo guiado', paths:['M9 3h6M10 3v7L4 20h16l-6-10V3','M7 15h10'] },
  { id:'web', label:'Web externa', paths:['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z','M3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18z'] },
  { id:'tool', label:'Aplicación o herramienta', paths:['M14 5a5 5 0 0 0-6 6L3 16l5 5 5-5a5 5 0 0 0 6-6l-3 3-4-4z'] },
  { id:'guide', label:'Ficha docente', paths:['M5 3h11l3 3v15H5z','M15 3v5h4M8 11h8M8 15h5'] },
  { id:'other', label:'Otros recursos', paths:['M3 6h7l2 2h9v12H3z'] },
];
const icons = new Map(groups.map(group=>[group.id,group]));
const node = (tag,css='',text) => { const el=document.createElement(tag);el.className=css;if(text!==undefined)el.textContent=text;return el; };

export function resourceGroup(resource) {
  if(resource.type==='example'&&resource.exampleKind==='guided')return 'guided-example';
  if(['assignment','presentation','tool','guide'].includes(resource.type))return resource.type;
  if(resource.type==='web') {
    try { if(new URL(resource.location?.url).hostname.toLowerCase()==='miguitel.github.io')return 'notes'; } catch {}
    return 'web';
  }
  return ['notes','example'].includes(resource.type)?'notes':'other';
}

export function groupRowResources(resources) {
  return groups.map(group=>({...group,resources:resources.filter(resource=>resourceGroup(resource)===group.id)})).filter(group=>group.resources.length);
}

// A workspace path is never treated as a working web link without a public read.
export function publicWorkspaceCandidate(resource,moduleCode,moduleResources=[]) {
  if(!['SR','LM','ED','PRO','SOS'].includes(moduleCode)||resource.audience==='teacher')return null;
  const repository=modulePublishedRepository(moduleResources);if(!repository)return null;
  let relative;
  if(resource.location?.kind==='workspace') {
    const path=resource.location.path;if(typeof path!=='string'||!path.startsWith('repositorio/'))return null;
    relative=path.slice('repositorio/'.length);
  } else if(resource.location?.kind==='https'&&safeResourceUrl(resource.location.url,resource.location.public===true)) {
    try {
      const url=new URL(resource.location.url),prefix=`/${repository}/blob/main/`;
      if(url.hostname!=='github.com'||!url.pathname.startsWith(prefix)||url.search||url.hash)return null;
      relative=url.pathname.slice(prefix.length).split('/').map(decodeURIComponent).join('/');
    } catch { return null; }
  } else return null;
  if(!relative||/[\\\x00-\x1f?#]/.test(relative)||relative.split('/').some(part=>!part||part==='.'||part==='..'))return null;
  const encoded=relative.split('/').map(encodeURIComponent).join('/');
  return {path:relative,api:`https://api.github.com/repos/${repository}/contents/${encoded}?ref=main`,url:`https://github.com/${repository}/blob/main/${encoded}`};
}

function publicMarkdownSource(resource) {
  try { const url=new URL(resource.location?.url);return resource.audience!=='teacher'&&resource.location?.kind==='https'&&url.hostname==='github.com'&&/\/blob\/main\/.+\.(?:md|markdown)$/i.test(url.pathname); }
  catch { return false; }
}

// A guessed Markdown route is only a candidate. It is opened after a public
// source read and a successful HTML response from the explicitly registered site.
export async function verifyPublishedResource(candidate, webRoot, { fetchImpl = globalThis.fetch } = {}) {
  if(!candidate)return null;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  const options={credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal};
  try {
    const source=await fetchImpl(candidate.api,{...options,method:'GET',headers:{Accept:'application/vnd.github+json'}});
    if(!source.ok)return null;
    const file=await source.json();
    if(file.type!=='file'||file.path!==candidate.path||typeof file.sha!=='string'||!file.sha||new URL(file.html_url).href!==candidate.url)return null;
    if(/\.(?:md|markdown|html?)$/i.test(candidate.path)) {
      if(!webRoot)return null;
      const base=new URL(webRoot);
      if(base.protocol!=='https:'||base.hostname!=='miguitel.github.io'||base.search||base.hash||!base.pathname.endsWith('/'))return null;
      const relative=candidate.path.replace(/\.(?:md|markdown)$/i,'.html').split('/').map(encodeURIComponent).join('/');
      const url=new URL(relative,base);
      if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return null;
      let response=await fetchImpl(url.href,{...options,method:'HEAD'});
      if(response.status===405||response.status===501)response=await fetchImpl(url.href,{...options,method:'GET'});
      if(!response.ok||!/^text\/html(?:;|$)/i.test(response.headers?.get('content-type')??''))return null;
      if(response.url&&new URL(response.url).href!==url.href)return null;
      return url.href;
    }
    const raw=new URL(file.download_url);
    const sourceUrl=new URL(candidate.url),expected=`${sourceUrl.pathname.replace('/blob/main/','/main/')}`;
    if(raw.hostname!=='raw.githubusercontent.com'||raw.pathname!==expected||!safeResourceUrl(raw.href))return null;
    return raw.href;
  } catch { return null; } finally { clearTimeout(timer); }
}

function icon(id) {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
  for(const d of icons.get(id)?.paths??['M5 12h.01M12 12h.01M19 12h.01']){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);svg.append(path);}
  return svg;
}

export function createRowResourcesUI({isBusy,canOpen,openPrivate,getModuleResources=()=>[],fetchImpl=globalThis.fetch}) {
  let picker=null,body=null,heading=null,returnTo=null,generation=0;
  const publicReads=new Map();
  const allowed=()=>!isBusy()&&canOpen();
  function closePicker() {
    if(!picker?.open)return;
    const target=returnTo;returnTo=null;picker.close();body.replaceChildren();heading.textContent='';
    if(target?.isConnected)target.focus({preventScroll:true});
  }
  function ensurePicker() {
    if(picker)return;
    picker=node('dialog','row-resource-picker');picker.id='row-resource-picker';picker.setAttribute('aria-labelledby','row-resource-picker-title');
    const header=node('header','row-resource-picker-header');heading=node('h2');heading.id='row-resource-picker-title';
    const close=node('button','resource-picker-close','×');close.type='button';close.setAttribute('aria-label','Cerrar recursos');close.addEventListener('click',closePicker);
    header.append(heading,close);body=node('div','row-resource-picker-body');picker.append(header,body);document.body.append(picker);
    picker.addEventListener('cancel',event=>{event.preventDefault();closePicker();});
    picker.addEventListener('click',event=>{if(event.target!==picker)return;const rect=picker.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closePicker();});
  }
  function showInfo(resource,trigger,message) {
    if(!allowed())return;
    ensurePicker();returnTo=trigger;heading.textContent=resource.title;body.replaceChildren(node('p','',message),node('p','resource-local-path',resource.location?.path||resource.location?.url||'Ubicación pendiente'));
    picker.showModal();
  }
  async function resolvePublic(candidate,moduleCode) {
    const root=modulePublishedWebRoot(getModuleResources(moduleCode)),key=`${candidate.api}|${root??''}`;
    if(!publicReads.has(key))publicReads.set(key,verifyPublishedResource(candidate,root,{fetchImpl}));
    const result=await publicReads.get(key);
    if(!result)publicReads.delete(key);
    return result;
  }
  async function openWorkspace(resource,moduleCode,trigger) {
    const candidate=publicWorkspaceCandidate(resource,moduleCode,getModuleResources(moduleCode));
    if(!candidate){showInfo(resource,trigger,'Todavía no hay un destino web comprobado para este material. Revisa los enlaces del módulo; se conserva su referencia original.');return;}
    // Reserve the tab during the tap so mobile browsers do not block the opening.
    const tab=window.open('about:blank','_blank');if(tab){tab.opener=null;tab.document.title='Abriendo recurso';tab.document.body.textContent='Comprobando el material…';}
    const current=generation;trigger?.setAttribute('aria-busy','true');
    const url=await resolvePublic(candidate,moduleCode);trigger?.removeAttribute('aria-busy');
    if(current!==generation){tab?.close();return;}
    if(url&&tab&&!tab.closed){tab.location.replace(url);return;}
    tab?.close();
    if(url&&allowed()) {
      ensurePicker();returnTo=trigger;heading.textContent=resource.title;body.replaceChildren();
      body.append(control({...resource,location:{kind:'https',url}},moduleCode,resource.title,trigger));picker.showModal();return;
    }
    if(!url)showInfo(resource,trigger,'No se ha podido comprobar una versión pública de este material. Se conserva su ubicación local.');
  }
  function control(resource,moduleCode,label,origin) {
    resource=effectiveResourceDestination(resource,getModuleResources(moduleCode));
    const location=resource.location;
    const candidate=publicWorkspaceCandidate(resource,moduleCode,getModuleResources(moduleCode));
    let item;
    if(!candidate&&!publicMarkdownSource(resource)&&location?.kind==='https'&&safeResourceUrl(location.url,location.public===true)) {
      item=node('a','resource-choice',label);item.href=location.url;item.target='_blank';item.rel='noopener noreferrer';item.referrerPolicy='no-referrer';
      item.addEventListener('click',event=>{if(!allowed()){event.preventDefault();return;}closePicker();});
    } else {
      item=node('button','resource-choice',label);item.type='button';
      item.addEventListener('click',()=>{
        if(!allowed())return;
        const trigger=origin||item;closePicker();
        if(location?.kind==='github')openPrivate(resource);
        else if(candidate||publicMarkdownSource(resource)||location?.kind==='workspace')openWorkspace(resource,moduleCode,trigger);
        else showInfo(resource,trigger,'Este recurso todavía no tiene un destino enlazado.');
      });
    }
    return item;
  }
  function showGroups(selected,moduleCode,trigger) {
    if(!allowed())return;
    ensurePicker();returnTo=trigger;heading.textContent=selected.length===1?selected[0].label:'Recursos';body.replaceChildren();
    for(const group of selected) {
      if(selected.length>1)body.append(node('h3','',group.label));
      const list=node('ul','resource-choice-list');
      for(const resource of group.resources){const li=node('li');li.append(control(resource,moduleCode,resource.title,trigger));list.append(li);}
      body.append(list);
    }
    picker.showModal();body.querySelector('a,button')?.focus();
  }
  function render(cell,resources,moduleCode,unresolved=[]) {
    const deduplicated=effectiveResourceDestinations(resources,getModuleResources(moduleCode));
    const selected=groupRowResources(deduplicated),overflow=selected.length>4;
    cell.setAttribute('role','group');cell.setAttribute('aria-label','Recursos');
    for(const group of selected.slice(0,overflow?3:4)) {
      const single=group.resources.length===1,resource=group.resources[0];
      const label=single?`${group.label}: ${resource.title}`:`${group.label}: ${group.resources.length} recursos. Elegir material`;
      const item=single?control(resource,moduleCode,''):node('button');
      item.className='resource-icon';item.dataset.resourceGroup=group.id;item.title=label;item.setAttribute('aria-label',label);item.append(icon(group.id));
      if(!single){item.type='button';item.setAttribute('aria-haspopup','dialog');item.setAttribute('aria-controls','row-resource-picker');const count=node('span','resource-count',String(group.resources.length));count.setAttribute('aria-hidden','true');item.append(count);item.addEventListener('click',()=>showGroups([group],moduleCode,item));}
      cell.append(item);
    }
    if(overflow){const more=node('button','resource-icon');more.type='button';more.title='Más recursos';more.setAttribute('aria-label','Más tipos de recurso');more.setAttribute('aria-haspopup','dialog');more.append(icon('more'));more.addEventListener('click',()=>showGroups(selected.slice(3),moduleCode,more));cell.append(more);}
    if(unresolved.length){const warning=node('span','resource-reference-warning','!');warning.title='Hay referencias pendientes de resolver';warning.setAttribute('aria-label',warning.title);cell.append(warning);}
    cell.classList.toggle('is-empty',!resources.length&&!unresolved.length);
  }
  // The task band shares the same private reader and safe external links as rows.
  // Missing destinations are explicit; opening a resource never writes a document.
  function access({resources,moduleCode,label,title,unresolved=[],onManage,emptyMessage='Todavía no hay un recurso enlazado.'}) {
    resources=effectiveResourceDestinations(resources,getModuleResources(moduleCode));
    const location=resources[0]?.location;
    const direct=resources.length===1&&!unresolved.length&&(location?.kind==='https'&&safeResourceUrl(location.url,location.public===true)||validGithubLocation(location)||publicWorkspaceCandidate(resources[0],moduleCode,getModuleResources(moduleCode)));
    const item=direct?control(resources[0],moduleCode,label):node('button','',label);
    item.title=title;item.setAttribute('aria-label',title);
    if(direct&&location.kind==='github'){item.setAttribute('aria-haspopup','dialog');item.setAttribute('aria-controls','resource-private-dialog');}
    if(!direct) {
      item.type='button';item.setAttribute('aria-haspopup','dialog');item.setAttribute('aria-controls','row-resource-picker');
      item.addEventListener('click',()=>{
        if(!allowed())return;
        ensurePicker();returnTo=item;heading.textContent=title;body.replaceChildren();
        if(!resources.length)body.append(node('p','',emptyMessage));
        const list=node('ul','resource-choice-list');
        for(const resource of resources) {
          const li=node('li');
          // Local paths remain visible until the teacher supplies a published URL.
          li.append(control(resource,moduleCode,`${resourceTypes[resource.type]??'Recurso'} · ${resource.title}`,item));
          list.append(li);
        }
        body.append(list);
        if(unresolved.length)body.append(node('p','message warning','Hay referencias pendientes de resolver o de clasificar como Test/Práctico. Revísalas en Recursos.'));
        if(onManage) {
          const manage=node('button','resource-choice','Gestionar recursos');manage.type='button';
          manage.addEventListener('click',()=>{if(!allowed())return;closePicker();onManage();});body.append(manage);
        }
        picker.showModal();body.querySelector('a,button')?.focus();
      });
    }
    return item;
  }
  return {render,access,link:control,clear(){generation++;closePicker();publicReads.clear();}};
}
