/** Tauri 独立媒体进程：stdin/stdout 为 JSON RPC，媒体通过随机令牌的 loopback URL 读取。 */
import appPackage from '../package.json';
import {diagnostic,diagnosticContext,initializeDiagnostics,deviceDetails} from './diagnostics';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, stat, unlink, rmdir } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { MAX_UPLOAD_BYTES,isSupportedHardware, type Album, type Device, type Edit, type Job, type Media, type Photo, type Target, type WorkflowDraft, type DuplicatePolicy, type DuplicateMatch } from '../src/shared';
import * as lan from './transport';
import { convert, probe, run, validateEdit } from './media';
import { DeviceCache, deviceCacheKey } from './cache';
import {SessionStore} from './session';
import {storageStatus,requireStorageSpace} from './storage';
import { UploadHistory, sourceFingerprint } from './history';
import { validImportSelection } from '../src/importing';
import { addPhotosToAlbum } from './albums';

const dataRoot=resolve(process.argv[2]??'artifacts/worker-data'),binRoot=resolve(process.argv[3]??'vendor');
const binary=(name:string)=>join(binRoot,name+(process.platform==='win32'?'.exe':''));
const dataPath=(name:string)=>join(dataRoot,name);
const logRoot=resolve(process.argv[4]??dataPath('logs'));
initializeDiagnostics(logRoot,{version:appPackage.version,platform:process.platform,arch:process.arch,node:process.version,dataRoot,binRoot,logRoot});
process.on('uncaughtExceptionMonitor',error=>diagnostic('worker.uncaught',{error},'error'));
process.on('exit',code=>diagnostic('worker.exit',{code}));
const cache=new DeviceCache(dataPath('devices-cache'));
const history=new UploadHistory(dataPath('upload-history'));
const batches=new Map<string,{ids:string[];signature:string}>();
const mediaKey=(photo:Photo)=>`${photo.PhotoId}:${photo.Time}:${photo.FileId}:${photo.OriginalFileId??''}`;
async function original(target:Target,photo:Photo):Promise<string>{
  const source=lan.filePath(photo.OriginalFileId??photo.FileId);
  return cache.file(target,mediaKey(photo),extname(source),temporary=>lan.withDeviceConnection(target,async()=>{
    diagnostic('media.download.start',{target:deviceDetails(target),source});
    const response=await fetch(`http://${target.DevicePrivateIP}:${target.port}${source}`,{signal:AbortSignal.timeout(10*60*1000),headers:{Connection:'close'}});
    diagnostic('media.download.response',{target:deviceDetails(target),source,status:response.status,contentType:response.headers.get('content-type'),contentLength:response.headers.get('content-length')});
    if(!response.ok||!response.body){await response.body?.cancel();throw new Error(`读取原文件失败 ${response.status}`);}
    await pipeline(Readable.fromWeb(response.body as any),createWriteStream(temporary));
    await probe(binary('ffprobe'),temporary);
  }));
}
async function thumbnail(target:Target,photo:Photo):Promise<string>{
  const jpegPhoto=photo.MediaType!=='video'&&/\.jpe?g$/i.test(photo.OriginalFileId??photo.FileId);
  // A decodable WebP can still contain wrongly interpreted RGB565 pixels. Bypass
  // old JPEG-derived device thumbnails, and do not reuse the old cached preview.
  return cache.json(target,(jpegPhoto?'jpeg-original-thumbnail-v2:':'thumbnail:')+mediaKey(photo),async()=>{
    try{
      if(jpegPhoto)throw new Error('暂无可用预览图');
      const {data,headers}=await lan.request(target,lan.filePath(photo.FileId),'GET',undefined,undefined,5000);
      const type=String(headers['content-type']??'image/webp');
      if(!type.startsWith('image/')||!data.length)throw new Error('暂无可用预览图');
      return `data:${type};base64,${data.toString('base64')}`;
    }catch(error){
      // Transient connection failures return to the read-only retry queue. Missing previews
      // are generated locally from the original instead of persisting an error placeholder.
      if(!/HTTP 404|HTTP 410|暂无可用预览图/.test(String(error)))throw error;
      const source=await original(target,photo),temp=join(dataPath('cache'),randomUUID()+'.jpg');
      await run(binary('ffmpeg'),['-y','-v','error','-i',source,'-vf','scale=480:480:force_original_aspect_ratio=decrease','-frames:v','1',temp]);
      return `data:image/jpeg;base64,${(await readFile(temp)).toString('base64')}`;
    }
  });
}
const files=new Map<string,string>(),imports=new Map<string,Media>();
type QueueEntry={job:Job;target:Target;album:Album;edit:Edit;replace?:Photo[]};
const jobs:Job[]=[],pending:QueueEntry[]=[],records=new Map<string,QueueEntry>(),drafts=new Map<string,WorkflowDraft>();
type Saved={media:Media[];jobs:Job[];queue:QueueEntry[];drafts:[string,WorkflowDraft][];batches:[string,{ids:string[];signature:string}][]};
const session=new SessionStore<Saved>(dataPath('session.json'));
const estimates=new Map<string,{key:string;abort:AbortController;result:Promise<unknown>}>(),estimateFiles=new Map<string,string>();
let shuttingDown=false;
function persist(){return session.write({media:[...imports.values()],jobs,queue:[...records.values()],drafts:[...drafts],batches:[...batches]});}
const draftKey=(target:Target,album:Album)=>`${deviceCacheKey(target)}:${album.ClockId}`;
function publicMedia(media:Media):Media{return {...media,path:localUrl(media.path)};}
async function duplicateMatches(target:Target,ids:string[]):Promise<DuplicateMatch[]>{
 const media=ids.map(id=>imports.get(id));if(media.some(item=>!item))throw Error('源文件无效');
 const entries=await history.matching(target,media.flatMap(item=>item?.sourceKey?[item.sourceKey]:[]));if(!entries.length)return [];
 const all=(await lan.albums(target)).find(a=>a.AlbumType===1);if(!all)return [];
 const photos:Photo[]=[];for(let start=1;start<=50000;start+=50){const page=await lan.photos(target,all.ClockId,start);photos.push(...page);if(page.length<50)break;if(start===49951)throw Error('照片列表响应不完整');}
 return media.flatMap(item=>{const matches=photos.filter(photo=>entries.some(e=>e.sourceKey===item!.sourceKey&&e.photoId===photo.PhotoId&&e.time===photo.Time&&e.path===(photo.OriginalFileId??photo.FileId)));return matches.length?[{mediaId:item!.id,photos:matches}]:[];});
}
async function restore(){
 const saved=await session.read({media:[],jobs:[],queue:[],drafts:[],batches:[]});
 for(const media of saved.media)imports.set(media.id,media);jobs.push(...saved.jobs);
 for(const [key,draft] of saved.drafts)drafts.set(key,draft);for(const [key,batch] of saved.batches)batches.set(key,batch);
 for(const entry of saved.queue){const job=jobs.find(job=>job.id===entry.job.id);if(!job)continue;entry.job=job;
  if(['等待处理','正在转换'].includes(job.state)){job.state='等待处理';job.progress=0;records.set(job.id,entry);pending.push(entry);}
  else if(['正在上传','确认入库'].includes(job.state)){job.state='需检查';job.error='UPLOAD_INTERRUPTED';}
 }
 await persist();
}
const controllers=new Map<string,AbortController>();let working=false;
let discovered:Device[]=[];
const emit=(value:unknown)=>process.stdout.write(JSON.stringify(value)+'\n');
let lastBroadcast=0,broadcastTimer:ReturnType<typeof setTimeout>|undefined;
// 大视频上传以 64 KiB 分块，进度只需每 200 ms 推送一次，避免淹没 WebView IPC。
const broadcast=()=>{const gap=Date.now()-lastBroadcast;if(gap<200){if(!broadcastTimer)broadcastTimer=setTimeout(()=>{broadcastTimer=undefined;broadcast();},200-gap);return;}lastBroadcast=Date.now();emit({event:'jobs',data:jobs});void persist().catch(error=>diagnostic('session.save.error',{error},'error'));};
let port=0;const token=randomUUID();
function localUrl(file:string){const id=randomUUID();files.set(id,file);return `http://127.0.0.1:${port}/${token}/${id}`;}
const server=createServer(async(req,res)=>{
  try{
    const [_,key,id]=new URL(req.url??'/',`http://127.0.0.1:${port}`).pathname.split('/');
    const file=key===token?files.get(id):undefined;
    if(!file||!['GET','HEAD'].includes(req.method??'')){res.writeHead(404).end();return;}
    const size=(await stat(file)).size;
    const type:Record<string,string>={'.mp4':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
    res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Accept-Ranges','bytes');res.setHeader('Content-Type',type[extname(file).toLowerCase()]??'application/octet-stream');
    let start=0,end=size-1;
    if(req.headers.range){const match=req.headers.range.match(/^bytes=(\d+)-(\d*)$/);if(!match){res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();return;}start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;if(start>end){res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();return;}res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`);}
    res.setHeader('Content-Length',end-start+1);if(req.method==='HEAD'){res.end();return;}
    const stream=createReadStream(file,{start,end});res.on('close',()=>stream.destroy());stream.on('error',()=>res.destroy());stream.pipe(res);
  }catch{res.writeHead(500).end();}
});
function validateTarget(t:Target){lan.endpoint(t);if(!isSupportedHardware(t.Hardware))throw new Error('目前仅支持 TimsFrame（510/511/512）和 AstroToo（530）');if(![80,9000].includes(t.port)||!['/post','/divoom_api'].includes(t.apiPath))throw new Error('设备接口无效');}
function validateAlbum(a:Album){if(!Number.isInteger(a.ClockId)||a.ClockId<100000)throw new Error('第一版仅管理本地相簿');}
async function recent():Promise<Device[]>{try{return JSON.parse(await readFile(dataPath('devices.json'),'utf8'));}catch{return [];}}
async function processQueue(){
  if(working)return;working=true;
  try{while(pending.length&&!shuttingDown){
    const {job,target,album,edit,replace}=pending.shift()!;if(job.state==='已取消')continue;
    const abort=new AbortController();controllers.set(job.id,abort);
    try{
      await requireStorageSpace(target);
      const media=imports.get(edit.mediaId);if(!media)throw new Error('源文件已失效，请重新导入');
      if(media.sourceKey&&await sourceFingerprint(media.path)!==media.sourceKey)throw new Error('源文件无效，请重新导入');
      diagnostic('job.convert.start',{jobId:job.id,target:deviceDetails(target),edit});job.state='正在转换';broadcast();
      const output=await convert(binary('ffmpeg'),binary('ffprobe'),media,edit,target,dataPath(`exports/${job.id}`),abort.signal,n=>{job.progress=n;broadcast();});
      job.outputBytes=(await stat(output.file)).size;if(media.kind==='photo'&&job.outputBytes+2048>Math.min(target.maxUploadBytes,MAX_UPLOAD_BYTES))throw Error('PHOTO_TOO_LARGE');diagnostic('job.convert.done',{jobId:job.id,output});job.state='正在上传';job.progress=0;await persist();broadcast();
      const now=Date.now();
      const metadata={Command:'Photo/LocalAddToAlbum',DeviceId:target.DeviceId,UserId:1,ClockId:album.ClockId,ParentClockId:0,ParentItemId:'0',PhotoTitle:'',PhotoX:0,PhotoY:0,PhotoWidth:output.width,PhotoHeight:output.height,PhotoTotalCnt:1,PhotoIndex:0,SendTime:now,TakingTime:(await stat(media.path)).mtimeMs,PhotoFlag:now%2147483647,FileName:basename(output.file),PreviewFileName:output.cover?basename(output.cover):''};
      await requireStorageSpace(target);
      try{await lan.upload(target,metadata,[output.file,...(output.cover?[output.cover]:[])],abort.signal,n=>{job.progress=n;broadcast();});}
      finally{await cache.invalidateLists(target);}
      const receipt=dataPath(`exports/${job.id}/upload-receipt.json`);
      await writeFile(receipt,JSON.stringify({deviceId:target.DeviceId,metadata,state:'received'},null,2));
      job.state='确认入库';broadcast();let found=false;
      const allAlbum=(await lan.albums(target)).find(a=>a.AlbumType===1);
      const confirmationIds=[...new Set([album.ClockId,...(allAlbum?[allAlbum.ClockId]:[])])];
      const confirmed=new Map<number,Photo>();
      for(let attempt=0;attempt<8&&!found;attempt++){
        abort.signal.throwIfAborted();confirmed.clear();
        for(const clockId of confirmationIds){
          for(let start=1;start<=5000;start+=50){const page=await lan.photos(target,clockId,start);const photo=page.find(p=>(p.OriginalFileId??p.FileId).endsWith('/'+basename(output.file)));if(photo){confirmed.set(clockId,photo);if(clockId===album.ClockId)job.photoId=photo.PhotoId;break;}if(page.length<50)break;}
        }
        found=!!allAlbum&&confirmed.size===confirmationIds.length;
        if(!found)await new Promise(r=>setTimeout(r,500));
      }
      if(!found)throw new Error('设备已接收文件，尚未确认入库，请刷新核对，勿重复上传');
      await writeFile(receipt,JSON.stringify({deviceId:target.DeviceId,sourceKey:media.sourceKey,metadata,state:'confirmed',albums:[...confirmed].map(([clockId,photo])=>({clockId,...photo}))},null,2));
      if(media.sourceKey)await history.confirm(target,media.sourceKey,confirmed.get(allAlbum!.ClockId)!);
      if(replace?.length){
        // Upload and confirm the new copy first. Replace only exact source matches still present.
        const current=await duplicateMatches(target,[media.id]);const valid=new Set(current.flatMap(match=>match.photos).map(photo=>mediaKey(photo)));
        let ids=replace.filter(photo=>valid.has(mediaKey(photo))&&photo.PhotoId!==job.photoId).map(photo=>photo.PhotoId);
        if(album.AlbumType===0){const members=new Set<number>();for(let start=1;start<=50000;start+=50){const page=await lan.photos(target,album.ClockId,start);page.forEach(photo=>members.add(photo.PhotoId));if(page.length<50)break;}ids=ids.filter(id=>members.has(id));}
        for(let offset=0;offset<ids.length;offset+=50)await lan.command(target,album.AlbumType===0?'Photo/RemovePhotoFromAlbum':'Photo/DeletePhoto',{ClockId:album.ClockId,ParentClockId:0,ParentItemId:'0',PhotoList:ids.slice(offset,offset+50)});
      }
      await cache.invalidateLists(target);job.state='已完成';job.progress=100;diagnostic('job.completed',{jobId:job.id,target:deviceDetails(target),photoId:job.photoId});
    }catch(e){if(shuttingDown)continue;job.state=abort.signal.aborted?'已取消':'需检查';job.error=(e as Error).message;diagnostic('job.error',{jobId:job.id,target:deviceDetails(target),state:job.state,error:e},'error');}
    finally{controllers.delete(job.id);if(!shuttingDown)records.delete(job.id);await persist();broadcast();}
  }}finally{working=false;}
}
async function dispatch(method:string,args:any[]):Promise<unknown>{
  switch(method){
    case 'shutdown':shuttingDown=true;for(const value of estimates.values())value.abort.abort();await persist();for(const controller of controllers.values())controller.abort();server.close();setTimeout(()=>process.exit(),500);return null;
    case 'jobs':return jobs;
    case 'storage':{
      const [target]=args as [Target];validateTarget(target);const storage=await storageStatus(target);let photoCount:number|undefined,videoCount:number|undefined;
      try{
        const all=(await lan.albums(target)).find(a=>a.AlbumType===1);
        if(all){let photos=0,videos=0;for(let start=1;start<=50000;start+=50){const page=await lan.photos(target,all.ClockId,start);for(const photo of page)photo.MediaType==='video'?videos++:photos++;if(page.length<50)break;if(start===49951)throw Error('照片列表响应不完整');}photoCount=photos;videoCount=videos;}
      }catch(error){diagnostic('storage.counts.unavailable',{error},'warn');}
      return {...storage,photoCount,videoCount};
    }
    case 'loadDraft':{
      const [target,album]=args as [Target,Album];validateTarget(target);validateAlbum(album);const draft=drafts.get(draftKey(target,album));if(!draft)return null;
      if(batches.has(`${target.DeviceId}:${target.cacheIdentity}:${album.ClockId}:${draft.requestId}`)){drafts.delete(draftKey(target,album));await persist();return null;}
      const renew=(item:Media)=>{const stored=imports.get(item.id);if(!stored)throw Error('源文件已失效，请重新导入');return publicMedia(stored);};
      return {...draft,candidates:draft.candidates.map(renew),chosen:draft.chosen.map(renew)};
    }
    case 'saveDraft':{
      const [target,album,draft]=args as [Target,Album,WorkflowDraft|null];validateTarget(target);validateAlbum(album);const key=draftKey(target,album);
      if(draft===null)drafts.delete(key);else{
        if(!Array.isArray(draft.candidates)||!Array.isArray(draft.chosen)||!Array.isArray(draft.edits)||[...draft.candidates,...draft.chosen].some(m=>!imports.has(m.id)))throw Error('源文件无效');
        drafts.set(key,JSON.parse(JSON.stringify(draft)));
      }await persist();return null;
    }
    case 'duplicateMatches':{const [target,ids]=args;validateTarget(target);if(!Array.isArray(ids))throw Error('请选择有效媒体');return duplicateMatches(target,ids);}
    case 'estimate':{
      const [target,edit]=args as [Target,Edit];validateTarget(target);const media=imports.get(edit.mediaId);if(!media||media.kind!=='photo')throw Error('源文件无效');
      const key=JSON.stringify([edit,target.width,target.height]),previous=estimates.get(media.id);if(previous?.key===key)return previous.result;previous?.abort.abort();const abort=new AbortController();
      const result=(async()=>{const output=await convert(binary('ffmpeg'),binary('ffprobe'),media,edit,target,dataPath(`estimates/${randomUUID()}`),abort.signal,()=>{});
        const old=estimateFiles.get(media.id);estimateFiles.set(media.id,output.file);if(old&&old!==output.file){for(const [id,path] of files)if(path===old)files.delete(id);await unlink(old).catch(()=>{});await rmdir(resolve(old,'..')).catch(()=>{});}
        return {bytes:(await stat(output.file)).size,width:output.width,height:output.height,url:localUrl(output.file)};})();estimates.set(media.id,{key,abort,result});void result.catch(()=>{if(estimates.get(media.id)?.result===result)estimates.delete(media.id);});return result;
    }
    case 'discover':discovered=await lan.discover();return discovered;
    case 'recent':return (await recent()).filter(d=>isSupportedHardware(Number(d.Hardware)));
    case 'connect':{const list=await recent(),input=args[0];const known=[...discovered,...list].find(d=>d.DevicePrivateIP===input.DevicePrivateIP);const target=await lan.connect({...known,...input,DeviceId:Number(input.DeviceId)||known?.DeviceId||0});await writeFile(dataPath('devices.json'),JSON.stringify([target,...list.filter(d=>d.DevicePrivateIP!==target.DevicePrivateIP&&!(target.DeviceId>0&&d.DeviceId===target.DeviceId))].slice(0,12),null,2));return target;}
    case 'albums':{const [target,refresh]=args;validateTarget(target);if(refresh)await cache.invalidateLists(target);return cache.json(target,'albums',()=>lan.albums(target),true);}
    case 'photos':{const [target,id,start,refresh]=args;validateTarget(target);if(!Number.isInteger(id)||!Number.isInteger(start)||start<1)throw new Error('分页参数无效');if(refresh)await cache.invalidateLists(target);return cache.json(target,`photos:${id}:${start}`,()=>lan.photos(target,id,start),true);}
    case 'thumbnail':{const [target,photo]=args as [Target,Photo];validateTarget(target);return thumbnail(target,photo);}
    case 'preview':{
      const [target,photo]=args as [Target,Photo];validateTarget(target);const file=await original(target,photo);
      return {...await cache.json(target,'info-v2:'+mediaKey(photo),()=>probe(binary('ffprobe'),file)),url:localUrl(file)};
    }
    case 'import':{
      const paths=args[0];if(!Array.isArray(paths)||paths.some(p=>typeof p!=='string'))throw new Error('导入文件列表无效');
      const media:Media[]=[],failures:{name:string;error:string}[]=[];
      for(const file of paths){try{
        const info=await probe(binary('ffprobe'),file);const id=randomUUID(),thumb=join(dataPath('cache'),id+'.jpg');
        await run(binary('ffmpeg'),['-y','-v','error','-i',file,'-vf','scale=480:480:force_original_aspect_ratio=decrease','-frames:v','1',thumb]);
        const item:Media={id,path:localUrl(file),name:basename(file),...info,sourceKey:await sourceFingerprint(file),preview:`data:image/jpeg;base64,${(await readFile(thumb)).toString('base64')}`};
        imports.set(id,{...item,path:file});media.push(item);
      }catch(e){failures.push({name:basename(file),error:(e as Error).message});}}
      await persist();return {media,failures};
    }
    case 'importStatus':{
      const [target,ids,refresh]=args as [Target,string[],boolean];validateTarget(target);
      if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!imports.has(id)))throw new Error('源文件无效');
      const media=ids.map(id=>imports.get(id)!),keys=media.flatMap(item=>item.sourceKey?[item.sourceKey]:[]);
      if(!(await history.matching(target,keys)).length)return [];
      if(refresh)await cache.invalidateLists(target);
      const albums=await cache.json(target,'albums',()=>lan.albums(target),true),all=albums.find(album=>album.AlbumType===1);
      if(!all)return [];
      const photos:Photo[]=[];
      for(let start=1;start<=50000;start+=50){const page=await cache.json(target,`photos:${all.ClockId}:${start}`,()=>lan.photos(target,all.ClockId,start),true);photos.push(...page);if(page.length<50)break;if(start===49951)throw Error('照片列表响应不完整');}
      const uploaded=await history.uploaded(target,keys,photos);return media.filter(item=>item.sourceKey&&uploaded.has(item.sourceKey)).map(item=>item.id);
    }
    case 'enqueueBatch':{
      const [target,album,edits,requestId,policy]=args as [Target,Album,Edit[],string,DuplicatePolicy?];validateTarget(target);validateAlbum(album);
      if(typeof requestId!=='string'||!/^[a-zA-Z0-9-]{8,100}$/.test(requestId))throw new Error('请选择有效媒体');
      const key=`${target.DeviceId}:${target.cacheIdentity}:${album.ClockId}:${requestId}`,signature=JSON.stringify({edits,policy}),existing=batches.get(key);
      if(existing){if(existing.signature!==signature)throw new Error('设备已接收文件，尚未确认入库，请刷新核对，勿重复上传');return existing.ids;}
      if(!Array.isArray(edits)||!edits.length||new Set(edits.map(e=>e?.mediaId)).size!==edits.length)throw new Error('请选择有效媒体');
      const media=edits.map(edit=>imports.get(edit?.mediaId));if(media.some(item=>!item))throw new Error('源文件无效');
      if(!validImportSelection(media as Media[]))throw new Error('IMPORT_SELECTION_RULE');
      for(let index=0;index<edits.length;index++)validateEdit(media[index]!,edits[index],target);
      await requireStorageSpace(target);
      const matches=await duplicateMatches(target,edits.map(edit=>edit.mediaId));
      if(policy==='replace'&&album.AlbumType!==0&&album.AlbumType!==1)throw Error('系统相簿不支持移出操作');
      if(matches.length&&!['skip','keep','replace'].includes(policy??''))throw Error('DUPLICATE_CHOICE_REQUIRED');
      const concurrent=batches.get(key);if(concurrent){if(concurrent.signature!==signature)throw Error('设备已接收文件，尚未确认入库，请刷新核对，勿重复上传');return concurrent.ids;}
      const ids:string[]=[];
      for(let index=0;index<edits.length;index++){
        const duplicate=matches.find(match=>match.mediaId===edits[index].mediaId);if(duplicate&&policy==='skip')continue;
        const item=media[index]!,job:Job={id:randomUUID(),name:item.name,preview:item.preview,state:'等待处理',progress:0,clockId:album.ClockId,albumName:album.ClockName,deviceIdentity:target.cacheIdentity};
        const entry:QueueEntry={job,target:{...target},album:{...album},edit:{...edits[index]},replace:policy==='replace'?duplicate?.photos:undefined};
        jobs.push(job);ids.push(job.id);records.set(job.id,entry);pending.push(entry);
      }
      batches.set(key,{ids,signature});await persist();broadcast();void processQueue();return ids;
    }
    case 'enqueue':{
      const [target,album,edit]=args as [Target,Album,Edit];validateTarget(target);validateAlbum(album);const media=imports.get(edit.mediaId);if(!media)throw new Error('源文件无效');validateEdit(media,edit,target);
      const job:Job={id:randomUUID(),name:media.name,preview:media.preview,state:'等待处理',progress:0,clockId:album.ClockId,deviceIdentity:target.cacheIdentity};await requireStorageSpace(target);const matches=await duplicateMatches(target,[edit.mediaId]);if(matches.length)throw Error('DUPLICATE_CHOICE_REQUIRED');const entry={job,target:{...target},album:{...album},edit:{...edit}};jobs.push(job);records.set(job.id,entry);pending.push(entry);await persist();broadcast();void processQueue();return null;
    }
    case 'addToAlbum':{
      const [target,source,toClockId,ids]=args as [Target,Album,number,number[]];validateTarget(target);validateAlbum(source);
      await addPhotosToAlbum(target,source.ClockId,toClockId,ids,()=>cache.invalidateLists(target));return null;
    }
    case 'cancel':{const job=jobs.find(j=>j.id===args[0]);if(job&&!['已完成','需检查','已取消'].includes(job.state)){controllers.get(job.id)?.abort();job.state='已取消';broadcast();}return null;}
    case 'manage':{
      const [target,album,ids,removeOnly]=args as [Target,Album,number[],boolean];validateTarget(target);validateAlbum(album);
      if(!Array.isArray(ids)||!ids.length||ids.some(id=>!Number.isInteger(id)||id<1))throw new Error('请选择有效媒体');
      if(removeOnly&&album.AlbumType!==0)throw new Error('系统相簿不支持移出操作');
      try{for(let offset=0;offset<ids.length;offset+=50)await lan.command(target,removeOnly?'Photo/RemovePhotoFromAlbum':'Photo/DeletePhoto',{ClockId:album.ClockId,ParentClockId:0,ParentItemId:'0',PhotoList:ids.slice(offset,offset+50)});}
      finally{await cache.invalidateLists(target);}
      return null;
    }
    default:throw new Error('不支持的操作');
  }
}
async function main(){
  await mkdir(dataPath('cache'),{recursive:true});
  await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));port=(server.address() as any).port;
  await restore();void processQueue();
  const input=createInterface({input:process.stdin});
  input.on('line',line=>{void(async()=>{
    let message:any;try{message=JSON.parse(line);}catch(error){diagnostic('rpc.invalid',{error},'error');emit({error:(error as Error).message});return;}
    await diagnosticContext(message.id,message.method,async()=>{
      const started=Date.now(),poll=message.method==='jobs';
      if(!poll)diagnostic('rpc.start',{target:deviceDetails(message.args?.[0]),args:message.args});
      try{const result=await dispatch(message.method,message.args??[]);if(!poll)diagnostic('rpc.success',{elapsedMs:Date.now()-started,target:deviceDetails(message.args?.[0]),result});emit({id:message.id,result});}
      catch(error){diagnostic('rpc.error',{elapsedMs:Date.now()-started,target:deviceDetails(message.args?.[0]),error},'error');emit({id:message.id,error:(error as Error).message});}
    });
  })();});
  input.on('close',()=>{shuttingDown=true;for(const value of estimates.values())value.abort.abort();void persist().finally(()=>{for(const c of controllers.values())c.abort();server.close();setTimeout(()=>process.exit(),500).unref();});});
}
void main().catch(e=>{diagnostic('worker.fatal',{error:e},'error');emit({event:'fatal',error:String(e)});process.exitCode=1;});
