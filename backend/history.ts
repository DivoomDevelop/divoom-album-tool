import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Photo, Target } from '../src/shared';
import { deviceCacheKey } from './cache';

export async function sourceFingerprint(file:string):Promise<string>{
  const before=await stat(file),hash=createHash('sha256');
  for await(const chunk of createReadStream(file))hash.update(chunk);
  const after=await stat(file);
  if(before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw Error('源文件无效，请重新导入');
  return hash.digest('hex');
}
type Entry={sourceKey:string;photoId:number;path:string;time:number};
/** A content match is hidden only while that exact confirmed photo remains in this device's list. */
export class UploadHistory{
  private tail:Promise<unknown>=Promise.resolve();
  constructor(private root:string){}
  private file(target:Target){return join(this.root,deviceCacheKey(target)+'.json');}
  private async entries(target:Target):Promise<Entry[]>{
    try{const rows=JSON.parse(await readFile(this.file(target),'utf8'));return Array.isArray(rows)?rows.filter(row=>typeof row.sourceKey==='string'&&typeof row.path==='string'&&Number.isInteger(row.photoId)):[];}
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'||error instanceof SyntaxError)return [];throw error;}
  }
  async matching(target:Target,sourceKeys:string[]):Promise<Entry[]>{
    await this.tail;const keys=new Set(sourceKeys);return (await this.entries(target)).filter(row=>keys.has(row.sourceKey));
  }
  async uploaded(target:Target,sourceKeys:string[],photos:Photo[]):Promise<Set<string>>{
    const existing=new Set(photos.map(photo=>`${photo.PhotoId}:${photo.Time}:${photo.OriginalFileId??photo.FileId}`));
    return new Set((await this.matching(target,sourceKeys)).filter(row=>existing.has(`${row.photoId}:${row.time}:${row.path}`)).map(row=>row.sourceKey));
  }
  async confirm(target:Target,sourceKey:string,photo:Photo):Promise<void>{
    const task=this.tail.catch(()=>{}).then(async()=>{
      const rows=await this.entries(target),entry={sourceKey,photoId:photo.PhotoId,path:photo.OriginalFileId??photo.FileId,time:photo.Time};
      if(rows.some(row=>row.sourceKey===sourceKey&&row.path===entry.path&&row.photoId===entry.photoId))return;
      await mkdir(this.root,{recursive:true});const file=this.file(target),temp=file+'.'+randomUUID()+'.partial';
      try{await writeFile(temp,JSON.stringify([...rows,entry]));await rename(temp,file);}finally{await unlink(temp).catch(()=>{});}
    });
    this.tail=task.catch(()=>{});await task;
  }
}
