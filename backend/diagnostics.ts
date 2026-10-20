import {appendFileSync,existsSync,mkdirSync,renameSync,statSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';

const context=new AsyncLocalStorage<{rpcId:unknown;method:string}>();
const secret=/token|password|secret|authorization|cookie/i;
function text(value:string):string {
  return value.replace(/data:(?:image|video|audio)\/[^\s"']+/gi,'[media omitted]')
    .replace(/http:\/\/127\.0\.0\.1:\d+\/[^\s"']+/g,'[local media URL omitted]')
    .replace(/((?:["']?[\w-]*(?:token|password|secret|authorization|cookie)[\w-]*["']?)\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}]+)/gi,'$1[redacted]')
    .replace(/Bearer\s+[^\s"']+/gi,'Bearer [redacted]').slice(0,65536);
}
export function diagnosticValue(value:unknown,seen=new WeakSet<object>(),depth=0):unknown {
  if(value===null||value===undefined||typeof value==='boolean'||typeof value==='number')return value;
  if(typeof value==='string')return text(value);
  if(typeof value!=='object')return String(value);
  if(Buffer.isBuffer(value)||ArrayBuffer.isView(value))return {binaryBytes:value.byteLength};
  if(value instanceof Error)return {name:value.name,message:text(value.message),stack:text(value.stack??''),...('code' in value?{code:value.code}:{})};
  if(depth>12||seen.has(value))return '[nested value omitted]';
  seen.add(value);
  if(Array.isArray(value)){const result=value.slice(0,1000).map(item=>diagnosticValue(item,seen,depth+1));if(value.length>1000)result.push({omittedItems:value.length-1000});return result;}
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,secret.test(key)?'[redacted]':/^(preview|imageData|videoData)$/i.test(key)?'[media omitted]':diagnosticValue(item,seen,depth+1)]));
}
export function deviceDetails(value:any){return value&&typeof value==='object'?{DeviceId:value.DeviceId,Hardware:value.Hardware,DeviceName:value.DeviceName,ip:value.DevicePrivateIP,port:value.port,apiPath:value.apiPath,cacheIdentity:value.cacheIdentity}:undefined;}
export class DiagnosticLog {
  readonly file:string;
  private session=randomUUID();
  constructor(directory:string,private maxBytes=5*1024*1024,private backups=3){this.file=join(directory,'diagnostics.jsonl');}
  write(event:string,details:unknown={},level='info'){
    try{
      const safe=diagnosticValue(details),encoded=JSON.stringify(safe);
      const detail=encoded&&Buffer.byteLength(encoded)>192*1024?{truncated:true,preview:encoded.slice(0,65536)}:safe;
      const line=JSON.stringify({time:new Date().toISOString(),level,session:this.session,pid:process.pid,...context.getStore(),event,details:detail})+'\n';
      mkdirSync(join(this.file,'..'),{recursive:true});
      if(existsSync(this.file)&&statSync(this.file).size+Buffer.byteLength(line)>this.maxBytes){
        if(existsSync(this.file+'.'+this.backups))unlinkSync(this.file+'.'+this.backups);
        for(let i=this.backups-1;i>=1;i--)if(existsSync(this.file+'.'+i))renameSync(this.file+'.'+i,this.file+'.'+(i+1));
        renameSync(this.file,this.file+'.1');
      }
      appendFileSync(this.file,line,{encoding:'utf8'});
    }catch{/* Diagnostics must never change device requests or break media operations. */}
  }
}
let logger:DiagnosticLog|undefined;
export function initializeDiagnostics(directory:string,details:unknown){logger=new DiagnosticLog(directory);diagnostic('worker.start',details);}
export function diagnostic(event:string,details:unknown={},level='info'){logger?.write(event,details,level);}
export function diagnosticContext<T>(rpcId:unknown,method:string,work:()=>T):T{return context.run({rpcId,method},work);}
