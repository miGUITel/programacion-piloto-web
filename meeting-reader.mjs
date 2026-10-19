import { ApiError, ConflictError, UnknownSaveError, decodeUtf8Base64, encodeUtf8Base64 } from './core.mjs?v=20261018-rf12';
import { meetingNotesPath, validateMeetingNotes } from './startup-context.mjs?v=20261019-meeting-calendar';

// One fixed private registry. Every note save has a version and confirmed reread.
export class MeetingReader {
  #token; #fetch; #timeout; #blocked=false; #tail=Promise.resolve();
  constructor({token,fetchImpl=globalThis.fetch,timeoutMs=15000}) {
    if(typeof token!=='string'||!token.trim())throw new ApiError('Falta la conexión.',{code:'MISSING_TOKEN'});
    this.#token=token.trim();this.#fetch=fetchImpl.bind(globalThis);this.#timeout=timeoutMs;
  }
  clear(){this.#token='';}
  #enqueue(operation){const result=this.#tail.then(operation,operation);this.#tail=result.catch(()=>{});return result;}
  async #request(method,path,body){
    const writing=method==='PUT',controller=new AbortController();let timer;
    try{return await Promise.race([
      new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(writing?new UnknownSaveError('timeout'):new ApiError('Lectura agotada.',{code:'READ_TIMEOUT'}));},this.#timeout);}),
      (async()=>{
        let response;
        try{response=await this.#fetch(`https://api.github.com/repos/miGUITel/programacion-piloto-datos/contents/${path}${writing?'':'?ref=main'}`,{
          method,cache:'no-store',redirect:'error',signal:controller.signal,
          headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${this.#token}`,'X-GitHub-Api-Version':'2022-11-28',...(writing?{'Content-Type':'application/json'}:{})},
          ...(writing?{body:JSON.stringify(body)}:{}),
        });}catch{throw writing?new UnknownSaveError('network'):new ApiError('No se pudo leer la reunión.',{code:'READ_FAILED'});}
        if(!Number.isInteger(response?.status))throw writing?new UnknownSaveError('invalid-response'):new ApiError('Respuesta no válida.',{code:'INVALID_RESPONSE'});
        if(writing&&response.status===409)throw new ConflictError();
        if(writing&&(response.status>=500||response.status===408))throw new UnknownSaveError('server',response.status);
        if(response.status<200||response.status>=300)throw new ApiError('GitHub no aceptó la petición.',{code:`HTTP_${response.status}`});
        try{return await response.json();}catch{throw writing?new UnknownSaveError('invalid-response'):new ApiError('Respuesta ilegible.',{code:'INVALID_RESPONSE'});}
      })(),
    ]);}finally{clearTimeout(timer);}
  }
  #path(catalog){const path=meetingNotesPath(catalog);if(!path||!this.#token)throw new ApiError('Referencia o conexión de reunión no válida.',{code:'INVALID_TARGET'});return path;}
  async #read(path){
    const raw=await this.#request('GET',path);
    try{
      if(raw.path!==path||raw.encoding!=='base64'||typeof raw.sha!=='string'||!raw.sha)throw Error();
      const document=JSON.parse(decodeUtf8Base64(raw.content));
      if(validateMeetingNotes(document).length)throw Error();
      return {document,sha:raw.sha};
    }catch{throw new ApiError('Formato de reunión no válido.',{code:'INVALID_DOCUMENT'});}
  }
  load(catalog){return this.#enqueue(async()=>{
    if(!Object.hasOwn(catalog,'meetings'))return {document:null,sha:null};
    const result=await this.#read(this.#path(catalog));this.#blocked=false;return result;
  });}
  save(catalog,document,sha){return this.#enqueue(async()=>{
    if(this.#blocked)throw new UnknownSaveError('reload-required');
    if(typeof sha!=='string'||!sha||validateMeetingNotes(document).length)throw new ApiError('Revisa la reunión y su versión.',{code:'INVALID_DOCUMENT'});
    const path=this.#path(catalog),snapshot=structuredClone(document);
    try{
      const remote=await this.#read(path);
      if(remote.sha!==sha)throw new ConflictError();
      const response=await this.#request('PUT',path,{message:'Guardar notas de reunión',content:encodeUtf8Base64(JSON.stringify(snapshot,null,2)+'\n'),sha,branch:'main'});
      if(response?.content?.path!==path||!response.content.sha||!response?.commit?.sha)throw new UnknownSaveError('invalid-response');
      let confirmed;
      try{confirmed=await this.#read(path);}catch{throw new UnknownSaveError('verification-failed');}
      if(confirmed.sha!==response.content.sha||JSON.stringify(confirmed.document)!==JSON.stringify(snapshot))throw new UnknownSaveError('verification-mismatch');
      return confirmed;
    }catch(error){if(error instanceof ConflictError||error instanceof UnknownSaveError)this.#blocked=true;throw error;}
  });}
}
