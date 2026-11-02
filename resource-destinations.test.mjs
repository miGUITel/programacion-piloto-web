import test from 'node:test';
import assert from 'node:assert/strict';
import { modulePresentationFolder, modulePublishedWebRoot, modulePublishedRepository, effectiveResourceDestination, effectiveResourceDestinations, validateModuleResources } from './resources.mjs?v=20261102-ppt-guided-icons';
import { publicWorkspaceCandidate, verifyPublishedResource, createRowResourcesUI } from './row-resources-ui.mjs?v=20261102-ppt-guided-icons';

const clone=value=>structuredClone(value);
const config=(code='SR',repository=`miGUITel/${code}`)=>[
  {id:`${code}-ppt`,title:`PPT ${code}`,type:'presentation',role:'presentation-folder',location:{kind:'https',url:`https://1drv.ms/f/c/fictitious-${code}`,public:true}},
  {id:`${code}-web`,title:`Web ${code}`,type:'web',role:'published-web-root',repository,location:{kind:'https',url:`https://miguitel.github.io/${repository.split('/')[1]}/`}},
];
const local=(path,type='notes')=>({id:'source',title:'Apuntes',type,location:{kind:'workspace',path}});
const source=(candidate,extra={})=>({type:'file',path:candidate.path,sha:'public-file',html_url:candidate.url,download_url:candidate.url.replace('https://github.com/','https://raw.githubusercontent.com/').replace('/blob/main/','/main/'),...extra});
const response=(value,{ok=true,status=200,type='text/html; charset=utf-8',url=''}={})=>({ok,status,url,headers:{get:name=>name==='content-type'?type:null},json:async()=>value});

test('module destinations are explicit, unique, validated and read without mutating configuration',()=>{
  const shared=config(),before=clone(shared);
  assert.equal(modulePresentationFolder(shared).id,'SR-ppt');
  assert.equal(modulePublishedWebRoot(shared),'https://miguitel.github.io/SR/');
  assert.equal(modulePublishedRepository(shared),'miGUITel/SR');
  assert.deepEqual(validateModuleResources({schemaVersion:1,kind:'module-resources',moduleCode:'SR',resources:shared},'SR'),[]);
  assert.equal(modulePresentationFolder([...shared,clone(shared[0])]),null);
  assert.equal(modulePresentationFolder([{...shared[0],location:{...shared[0].location,public:false}}]),null);
  assert.equal(modulePresentationFolder([{...shared[0],audience:'teacher'}]),null);
  assert.equal(modulePublishedWebRoot([{...shared[1],location:{kind:'https',url:'https://miguitel.github.io.evil.test/SR/'}}]),null);
  assert.equal(modulePublishedRepository([{...shared[1],repository:'../private'}]),null);
  assert.deepEqual(shared,before);
});

test('all modules use their own public PPT folder without changing academic IDs or private resources',()=>{
  for(const code of ['SR','LM','ED','PRO','SOS']) {
    const shared=config(code),ppt=local('PPT/UT01.pptx','presentation'),before=clone(ppt);
    const effective=effectiveResourceDestination(ppt,shared);
    assert.equal(effective.id,ppt.id);assert.equal(effective.location.url,shared[0].location.url);assert.equal(effective.location.public,true);
    assert.deepEqual(ppt,before);
    const teacherSlides={...ppt,audience:'teacher'},teacherBefore=clone(teacherSlides);
    assert.equal(effectiveResourceDestination(teacherSlides,shared).location.url,shared[0].location.url);
    assert.equal(effectiveResourceDestination(teacherSlides,shared).audience,'teacher');
    assert.deepEqual(teacherSlides,teacherBefore);
    for(const resource of [{...ppt,location:{kind:'github',repository:'miGUITel/private',path:'notes.md'}},{...ppt,type:'assignment'}])assert.equal(effectiveResourceDestination(resource,shared),resource);
    assert.equal(effectiveResourceDestination(ppt,[]),ppt);
  }
});

test('multiple PPT portions share one destination while private teacher slides remain separately available',()=>{
  const first=local('PPT/first.pptx','presentation'),second={...local('PPT/second.pptx','presentation'),id:'other'};
  const privateSlides={...first,id:'private',audience:'teacher',location:{kind:'github',repository:'miGUITel/private',path:'slides.md'}};
  const effective=effectiveResourceDestinations([first,second,privateSlides],config());
  assert.equal(effective.length,2);assert.equal(effective[0].id,first.id);assert.equal(effective[1],privateSlides);
});

test('public proof uses the explicit repository: PRO resolves PROsmr rather than guessing PRO',()=>{
  const resource=local('repositorio/APUNTES/Guía 1.md');
  const candidate=publicWorkspaceCandidate(resource,'PRO',config('PRO','miGUITel/PROsmr'));
  assert.equal(candidate.api,'https://api.github.com/repos/miGUITel/PROsmr/contents/APUNTES/Gu%C3%ADa%201.md?ref=main');
  assert.equal(candidate.url,'https://github.com/miGUITel/PROsmr/blob/main/APUNTES/Gu%C3%ADa%201.md');
  assert.equal(publicWorkspaceCandidate(resource,'PRO'),null);
  assert.equal(publicWorkspaceCandidate({...resource,audience:'teacher'},'PRO',config('PRO','miGUITel/PROsmr')),null);
  for(const path of ['SOLUCIONES/private.md','repositorio/../private.md','repositorio//a.md','repositorio/a.md?token=x','repositorio/C:\\private.md'])assert.equal(publicWorkspaceCandidate(local(path),'SR',config()),null);
});

test('explicit GitHub blob references use the same verified Pages route; external sites and private readers are untouched',()=>{
  const blob={...local('unused'),location:{kind:'https',url:'https://github.com/miGUITel/SR/blob/main/APUNTES/Gu%C3%ADa.md'}};
  assert.equal(publicWorkspaceCandidate(blob,'SR',config()).path,'APUNTES/Guía.md');
  for(const resource of [{...blob,location:{kind:'https',url:'https://github.com/other/SR/blob/main/a.md'}},{...blob,location:{kind:'github',repository:'miGUITel/private',path:'SR/ficha.md'}},{...blob,location:{kind:'https',url:'https://example.org/a.md'}}])assert.equal(publicWorkspaceCandidate(resource,'SR',config()),null);
});

test('Markdown opens only after public source proof and a successful HTML response, without credentials',async()=>{
  const candidate=publicWorkspaceCandidate(local('repositorio/APUNTES/Guía 1.md'),'SR',config()),calls=[];
  const fetchImpl=async(url,options)=>{calls.push({url,options});return calls.length===1?response(source(candidate)):response(null,{url});};
  assert.equal(await verifyPublishedResource(candidate,modulePublishedWebRoot(config()),{fetchImpl}),'https://miguitel.github.io/SR/APUNTES/Gu%C3%ADa%201.html');
  assert.equal(calls.length,2);assert.equal(calls[0].options.method,'GET');assert.equal(calls[1].options.method,'HEAD');
  for(const {options}of calls){assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.redirect,'error');assert.equal(options.headers?.Authorization,undefined);}
});

test('unpublished, missing, mismatching or non-HTML destinations never fall back to GitHub blob',async()=>{
  const candidate=publicWorkspaceCandidate(local('repositorio/not-published.md'),'SR',config());
  for(const kind of ['source404','wrongPath','wrongHtmlUrl','missingRoot','html404','rawMarkdown','redirect']) {
    let calls=0;
    const fetchImpl=async(url)=>{calls++;if(calls===1)return response(source(candidate,kind==='wrongPath'?{path:'different.md'}:kind==='wrongHtmlUrl'?{html_url:'https://github.com/other/repo/blob/main/not-published.md'}:{}),kind==='source404'?{ok:false,status:404}:{});return response(null,kind==='html404'?{ok:false,status:404}:kind==='rawMarkdown'?{type:'text/plain'}:kind==='redirect'?{url:'https://evil.test/other.html'}:{url});};
    assert.equal(await verifyPublishedResource(candidate,kind==='missingRoot'?null:modulePublishedWebRoot(config()),{fetchImpl}),null,kind);
    if(['source404','wrongPath','wrongHtmlUrl','missingRoot'].includes(kind))assert.equal(calls,1,kind);
  }
});

test('HEAD unsupported falls back to an anonymous GET and local HTML keeps its exact file name',async()=>{
  const candidate=publicWorkspaceCandidate(local('repositorio/ejemplos/demo.html'),'SR',config()),calls=[];
  const fetchImpl=async(url,options)=>{calls.push(options.method);return calls.length===1?response(source(candidate)):calls.length===2?response(null,{ok:false,status:405}):response(null,{url});};
  assert.equal(await verifyPublishedResource(candidate,modulePublishedWebRoot(config()),{fetchImpl}),'https://miguitel.github.io/SR/ejemplos/demo.html');
  assert.deepEqual(calls,['GET','HEAD','GET']);
});

test('downloadable files use only the matching public raw destination, rejecting tokenized or unrelated URLs',async()=>{
  const candidate=publicWorkspaceCandidate(local('repositorio/documentos/hoja.pdf','other'),'SR',config());
  const fetchImpl=async()=>response(source(candidate));
  assert.equal(await verifyPublishedResource(candidate,null,{fetchImpl}),'https://raw.githubusercontent.com/miGUITel/SR/main/documentos/hoja.pdf');
  for(const download_url of ['https://raw.githubusercontent.com/miGUITel/SR/main/documentos/hoja.pdf?token=secret','https://raw.githubusercontent.com/other/SR/main/documentos/hoja.pdf','https://evil.test/hoja.pdf'])assert.equal(await verifyPublishedResource(candidate,null,{fetchImpl:async()=>response(source(candidate,{download_url}))}),null);
});

test('read failures preserve the reference and return no fabricated destination',async()=>{
  const candidate=publicWorkspaceCandidate(local('repositorio/a.md'),'SR',config());
  assert.equal(await verifyPublishedResource(candidate,modulePublishedWebRoot(config()),{fetchImpl:async()=>{throw Error('offline');}}),null);
});

function withDom(run) {
  const previous=globalThis.document;
  const node=tag=>({tag,children:[],dataset:{},attributes:{},listeners:{},classList:{toggle(){}},append(...children){this.children.push(...children);},setAttribute(key,value){this.attributes[key]=value;},addEventListener(type,action){this.listeners[type]=action;}});
  globalThis.document={createElement:node,createElementNS:(ns,tag)=>({...node(tag),namespaceURI:ns}),body:node('body')};
  try{return run(node);}finally{globalThis.document=previous;}
}
test('row icons and direct band accesses open the public folder once, preserving private Markdown controls',()=>withDom(node=>{
  const ui=createRowResourcesUI({isBusy:()=>false,canOpen:()=>true,openPrivate(){},getModuleResources:()=>config()});
  const ppt1=local('PPT/a.pptx','presentation'),ppt2={...local('PPT/b.pptx','presentation'),id:'b'},cell=node('div');
  ui.render(cell,[ppt1,ppt2],'SR');assert.equal(cell.children.length,1);assert.equal(cell.children[0].tag,'a');assert.equal(cell.children[0].href,config()[0].location.url);
  const band=ui.access({resources:[ppt1,ppt2],moduleCode:'SR',label:'PPT',title:'Presentaciones'});assert.equal(band.tag,'a');assert.equal(band.href,config()[0].location.url);
  const fiche={id:'private',title:'Ficha',type:'guide',audience:'teacher',location:{kind:'github',repository:'miGUITel/programacion-piloto-datos',path:'SR/fichas/example.md'}};
  const privateControl=ui.link(fiche,'SR','Ficha');assert.equal(privateControl.tag,'button');assert.equal(privateControl.href,undefined);
}));
