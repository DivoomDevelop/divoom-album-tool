import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
/** Serialize snapshots and use atomic rename so crashes cannot leave a half-written queue/draft. */
export class SessionStore<T>{
 private tail:Promise<void>=Promise.resolve();
 constructor(private file:string){}
 async read(fallback:T):Promise<T>{try{return JSON.parse(await readFile(this.file,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return fallback;throw error;}}
 write(value:T):Promise<void>{const json=JSON.stringify(value);const task=this.tail.catch(()=>{}).then(async()=>{await mkdir(dirname(this.file),{recursive:true});const temp=this.file+'.'+randomUUID()+'.partial';try{await writeFile(temp,json);await rename(temp,this.file);}finally{await unlink(temp).catch(()=>{});}});this.tail=task;return task;}
}
