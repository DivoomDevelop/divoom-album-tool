/** Tauri 独立媒体进程：stdin/stdout 为 JSON RPC，媒体通过随机令牌的 loopback URL 读取。 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { isSupportedHardware, type Album, type Device, type Edit, type Job, type Media, type Photo, type Target } from '../src/shared';
import * as lan from './transport';
import { convert, probe, run, validateEdit } from './media';
import { DeviceCache } from './cache';
import { UploadHistory, sourceFingerprint } from './history';
import { validImportSelection } from '../src/importing';
import { addPhotosToAlbum } from './albums';

const dataRoot=resolve(process.argv[2]??'artifacts/worker-data'),binRoot=resolve(process.argv[3]??'vendor');
const binary=(name:string)=>join(binRoot,name+(process.platform==='win32'?'.exe':''));
const dataPath=(name:string)=>join(dataRoot,name);
const cache=new DeviceCache(dataPath('devices-cache'));
const history=new UploadHistory(dataPath('upload-history'));
const batches=new Map<string,{ids:string[];signature:string}>();
const mediaKey=(photo:Photo)=>`${photo.PhotoId}:${photo.Time}:${photo.FileId}:${photo.OriginalFileId??''}`;
async function original(target:Target,photo:Photo):Promise<string>{
  const source=lan.filePath(photo.OriginalFileId??photo.FileId);
  return cache.file(target,mediaKey(photo),extname(source),temporary=>lan.withDeviceConnection(target,async()=>{
    const response=await fetch(`http://${target.DevicePrivateIP}:${target.port}${source}`,{signal:AbortSignal.timeout(10*60*1000),headers:{Connection:'close'}});
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
const jobs:Job[]=[],pending:{job:Job;target:Target;album:Album;edit:Edit}[]=[];
const controllers=new Map<string,AbortController>();let working=false;
let discovered:Device[]=[];
const emit=(value:unknown)=>process.stdout.write(JSON.stringify(value)+'\n');
let lastBroadcast=0,broadcastTimer:ReturnType<typeof setTimeout>|undefined;
// 大视频上传以 64 KiB 分块，进度只需每 200 ms 推送一次，避免淹没 WebView IPC。
const broadcast=()=>{const gap=Date.now()-lastBroadcast;if(gap<200){if(!broadcastTimer)broadcastTimer=setTimeout(()=>{broadcastTimer=undefined;broadcast();},200-gap);return;}lastBroadcast=Date.now();emit({event:'jobs',data:jobs});};
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
  try{while(pending.length){
    const {job,target,album,edit}=pending.shift()!;if(job.state==='已取消')continue;
    const abort=new AbortController();controllers.set(job.id,abort);
    try{
      const media=imports.get(edit.mediaId);if(!media)throw new Error('源文件已失效，请重新导入');
      if(media.sourceKey&&await sourceFingerprint(media.path)!==media.sourceKey)throw new Error('源文件无效，请重新导入');
      job.state='正在转换';broadcast();
      const output=await convert(binary('ffmpeg'),binary('ffprobe'),media,edit,target,dataPath(`exports/${job.id}`),abort.signal,n=>{job.progress=n;broadcast();});
      job.state='正在上传';job.progress=0;broadcast();
      const now=Date.now();
      const metadata={Command:'Photo/LocalAddToAlbum',DeviceId:target.DeviceId,UserId:1,ClockId:album.ClockId,ParentClockId:0,ParentItemId:'0',PhotoTitle:'',PhotoX:0,PhotoY:0,PhotoWidth:target.width,PhotoHeight:target.height,PhotoTotalCnt:1,PhotoIndex:0,SendTime:now,TakingTime:(await stat(media.path)).mtimeMs,PhotoFlag:now%2147483647,FileName:basename(output.file),PreviewFileName:output.cover?basename(output.cover):''};
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
      await cache.invalidateLists(target);job.state='已完成';job.progress=100;
    }catch(e){job.state=abort.signal.aborted?'已取消':'需检查';job.error=(e as Error).message;}
    finally{controllers.delete(job.id);broadcast();}
  }}finally{working=false;}
}
async function dispatch(method:string,args:any[]):Promise<unknown>{
  switch(method){
    case 'shutdown':for(const controller of controllers.values())controller.abort();server.close();setTimeout(()=>process.exit(),200);return null;
    case 'jobs':return jobs;
    case 'discover':discovered=await lan.discover();return discovered;
    case 'recent':return (await recent()).filter(d=>isSupportedHardware(Number(d.Hardware)));
    case 'connect':{const list=await recent(),input=args[0];const known=[...discovered,...list].find(d=>d.DevicePrivateIP===input.DevicePrivateIP);const target=await lan.connect({...known,...input,DeviceId:Number(input.DeviceId)||known?.DeviceId||0});await writeFile(dataPath('devices.json'),JSON.stringify([target,...list.filter(d=>d.DevicePrivateIP!==target.DevicePrivateIP&&!(target.DeviceId>0&&d.DeviceId===target.DeviceId))].slice(0,12),null,2));return target;}
    case 'albums':{const [target,refresh]=args;validateTarget(target);if(refresh)await cache.invalidateLists(target);return cache.json(target,'albums',()=>lan.albums(target),true);}
    case 'photos':{const [target,id,start,refresh]=args;validateTarget(target);if(!Number.isInteger(id)||!Number.isInteger(start)||start<1)throw new Error('分页参数无效');if(refresh)await cache.invalidateLists(target);return cache.json(target,`photos:${id}:${start}`,()=>lan.photos(target,id,start),true);}
    case 'thumbnail':{const [target,photo]=args as [Target,Photo];validateTarget(target);return thumbnail(target,photo);}
    case 'preview':{
      const [target,photo]=args as [Target,Photo];validateTarget(target);const file=await original(target,photo);
      return {...await cache.json(target,'info:'+mediaKey(photo),()=>probe(binary('ffprobe'),file)),url:localUrl(file)};
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
      return {media,failures};
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
      const [target,album,edits,requestId]=args as [Target,Album,Edit[],string];validateTarget(target);validateAlbum(album);
      if(typeof requestId!=='string'||!/^[a-zA-Z0-9-]{8,100}$/.test(requestId))throw new Error('请选择有效媒体');
      const key=`${target.DeviceId}:${target.cacheIdentity}:${album.ClockId}:${requestId}`,signature=JSON.stringify(edits),existing=batches.get(key);
      if(existing){if(existing.signature!==signature)throw new Error('设备已接收文件，尚未确认入库，请刷新核对，勿重复上传');return existing.ids;}
      if(!Array.isArray(edits)||!edits.length||new Set(edits.map(e=>e?.mediaId)).size!==edits.length)throw new Error('请选择有效媒体');
      const media=edits.map(edit=>imports.get(edit?.mediaId));if(media.some(item=>!item))throw new Error('源文件无效');
      if(!validImportSelection(media as Media[]))throw new Error('IMPORT_SELECTION_RULE');
      for(let index=0;index<edits.length;index++)validateEdit(media[index]!,edits[index],target);
      const ids:string[]=[];
      for(let index=0;index<edits.length;index++){
        const item=media[index]!,job:Job={id:randomUUID(),name:item.name,preview:item.preview,state:'等待处理',progress:0,clockId:album.ClockId,deviceIdentity:target.cacheIdentity};
        jobs.push(job);ids.push(job.id);pending.push({job,target:{...target},album:{...album},edit:{...edits[index]}});
      }
      batches.set(key,{ids,signature});broadcast();void processQueue();return ids;
    }
    case 'enqueue':{
      const [target,album,edit]=args as [Target,Album,Edit];validateTarget(target);validateAlbum(album);const media=imports.get(edit.mediaId);if(!media)throw new Error('源文件无效');validateEdit(media,edit,target);
      const job:Job={id:randomUUID(),name:media.name,preview:media.preview,state:'等待处理',progress:0,clockId:album.ClockId,deviceIdentity:target.cacheIdentity};jobs.push(job);pending.push({job,target:{...target},album:{...album},edit:{...edit}});broadcast();void processQueue();return null;
    }
    case 'addToAlbum':{
      const [target,source,toClockId,ids]=args as [Target,Album,number,number[]];validateTarget(target);validateAlbum(source);
      await addPhotosToAlbum(target,source.ClockId,toClockId,ids,()=>cache.invalidateLists(target));return null;
    }
    case 'cancel':{const job=jobs.find(j=>j.id===args[0]);if(job&&job.state!=='已完成'){controllers.get(job.id)?.abort();job.state='已取消';broadcast();}return null;}
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
  const input=createInterface({input:process.stdin});
  input.on('line',line=>{void(async()=>{let id;try{const message=JSON.parse(line);id=message.id;const result=await dispatch(message.method,message.args??[]);emit({id,result});}catch(e){emit({id,error:(e as Error).message});}})();});
  input.on('close',()=>{for(const c of controllers.values())c.abort();server.close();setTimeout(()=>process.exit(),300).unref();});
}
void main().catch(e=>{emit({event:'fatal',error:String(e)});process.exitCode=1;});
