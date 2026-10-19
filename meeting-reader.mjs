import { ApiError, decodeUtf8Base64 } from './core.mjs?v=20261018-rf12';
import { meetingNotesPath, validateMeetingNotes } from './startup-context.mjs?v=20261019-context';

// Fixed private destination, read-only. Does not share or modify UT transactions.
export class MeetingReader {
  #token; #fetch; #timeout;
  constructor({token, fetchImpl = globalThis.fetch, timeoutMs = 15000}) {
    if (typeof token !== 'string' || !token.trim()) throw new ApiError('Falta la conexión.',{code:'MISSING_TOKEN'});
    this.#token=token.trim(); this.#fetch=fetchImpl.bind(globalThis); this.#timeout=timeoutMs;
  }
  clear() { this.#token=''; }
  async load(catalog) {
    if (!Object.hasOwn(catalog,'meetings')) return {document:null,sha:null};
    const path=meetingNotesPath(catalog);
    if (!path || !this.#token) throw new ApiError('Referencia o conexión de reunión no válida.',{code:'INVALID_TARGET'});
    const controller=new AbortController(); let timer;
    try {
      return await Promise.race([
        new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new ApiError('Lectura agotada.',{code:'READ_TIMEOUT'}));},this.#timeout);}),
        (async()=>{
          let response;
          try { response=await this.#fetch(`https://api.github.com/repos/miGUITel/programacion-piloto-datos/contents/${path}?ref=main`,{
            method:'GET',cache:'no-store',redirect:'error',signal:controller.signal,
            headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${this.#token}`,'X-GitHub-Api-Version':'2022-11-28'},
          }); } catch { throw new ApiError('No se pudo leer la reunión.',{code:'READ_FAILED'}); }
          if (!response || response.status < 200 || response.status >= 300) throw new ApiError('Lectura de reunión rechazada.',{code:'READ_FAILED'});
          try {
            const raw=await response.json();
            if (raw.path !== path || raw.encoding !== 'base64' || typeof raw.sha !== 'string' || !raw.sha) throw Error();
            const document=JSON.parse(decodeUtf8Base64(raw.content));
            if (validateMeetingNotes(document).length) throw Error();
            return {document,sha:raw.sha};
          } catch { throw new ApiError('Formato de reunión no válido.',{code:'INVALID_DOCUMENT'}); }
        })(),
      ]);
    } finally {clearTimeout(timer);}
  }
}
