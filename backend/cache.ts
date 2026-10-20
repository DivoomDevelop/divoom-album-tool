import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Target } from '../src/shared';
import {diagnostic,deviceDetails} from './diagnostics';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function deviceCacheKey(target:Pick<Target,'Hardware'|'DeviceId'|'cacheIdentity'>):string {
  if(!target.cacheIdentity&&!target.DeviceId)throw new Error('Device cache requires a verified identity');
  return hash(`${target.Hardware}:${target.DeviceId>0?`id:${target.DeviceId}`:target.cacheIdentity}`);
}
/** Immutable entries and a persisted list revision prevent a late read undoing invalidation. */
export class DeviceCache {
  private revisions=new Map<string,Promise<string>>();
  private pending=new Map<string,Promise<any>>();
  private invalidations=new Map<string,Promise<void>>();
  constructor(private root:string){}
  private directory(target:Target){return join(this.root,deviceCacheKey(target));}
  private revision(target:Target):Promise<string>{
    const directory=this.directory(target);let value=this.revisions.get(directory);
    if(!value){value=readFile(join(directory,'revision'),'utf8').catch(()=>'initial');this.revisions.set(directory,value);}
    return value;
  }
  private async atomic(file:string,data:string|Buffer){
    const temp=file+'.'+randomUUID()+'.partial';
    try{await writeFile(temp,data);await rename(temp,file);}finally{await unlink(temp).catch(()=>{});}
  }
  async invalidateLists(target:Target):Promise<void>{
    const directory=this.directory(target),revision=randomUUID();diagnostic('cache.invalidate',{target:deviceDetails(target),revision});
    // Set synchronously before disk I/O, so new readers cannot reuse an old listing.
    this.revisions.set(directory,Promise.resolve(revision));
    const previous=this.invalidations.get(directory)??Promise.resolve();
    const write=previous.catch(()=>{}).then(async()=>{await mkdir(directory,{recursive:true});await this.atomic(join(directory,'revision'),revision);});
    this.invalidations.set(directory,write);
    try{await write;}finally{if(this.invalidations.get(directory)===write)this.invalidations.delete(directory);}
  }
  async json<T>(target:Target,key:string,load:()=>Promise<T>,list=false):Promise<T>{
    const directory=this.directory(target),revision=list?await this.revision(target):'media';
    const file=join(directory,hash(`${revision}:${key}`)+'.json');
    if(this.pending.has(file)){diagnostic('cache.shared',{target:deviceDetails(target),key});return this.pending.get(file);}
    const task=(async()=>{
      try{const value=JSON.parse(await readFile(file,'utf8')) as T;diagnostic('cache.json.hit',{target:deviceDetails(target),key,revision,count:Array.isArray(value)?value.length:undefined});return value;}catch(error){diagnostic('cache.json.miss',{target:deviceDetails(target),key,revision,reason:(error as NodeJS.ErrnoException).code??String(error)});}
      try{const value=await load();await mkdir(directory,{recursive:true});await this.atomic(file,JSON.stringify(value));diagnostic('cache.json.stored',{target:deviceDetails(target),key,revision,count:Array.isArray(value)?value.length:undefined});return value;}catch(error){diagnostic('cache.json.error',{target:deviceDetails(target),key,error},'error');throw error;}
    })();
    this.pending.set(file,task);try{return await task;}finally{this.pending.delete(file);}
  }
  async file(target:Target,key:string,extension:string,load:(temporary:string)=>Promise<void>):Promise<string>{
    const directory=this.directory(target),file=join(directory,hash('file:'+key)+(/^[.][a-z0-9]{1,8}$/i.test(extension)?extension:'.bin'));
    if(this.pending.has(file)){diagnostic('cache.shared',{target:deviceDetails(target),key});return this.pending.get(file);}
    const task=(async()=>{
      try{if((await stat(file)).size>0){diagnostic('cache.file.hit',{target:deviceDetails(target),key});return file;}}catch{}
      diagnostic('cache.file.miss',{target:deviceDetails(target),key});
      await mkdir(directory,{recursive:true});const temporary=file+'.'+randomUUID()+'.partial';
      try{await load(temporary);if(!(await stat(temporary)).size)throw new Error('源文件无效');await rename(temporary,file);return file;}
      finally{await unlink(temporary).catch(()=>{});}
    })();
    this.pending.set(file,task);try{return await task;}finally{this.pending.delete(file);}
  }
}
