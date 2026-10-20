/** Authorized real-frame WebP upload; remove only uniquely named photos created here. */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import assert from 'node:assert/strict';
import * as lan from '../backend/transport';
import { run } from '../backend/media';
import type { Album, Job, Photo, Target } from '../src/shared';

async function main(){
  const directory=resolve(`artifacts/webp-device-${Date.now()}`),dataRoot=join(directory,'data');await mkdir(directory,{recursive:true});
  const child=spawn(process.execPath,[resolve('dist-backend/worker.cjs'),dataRoot,resolve('vendor')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const replies=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();let sequence=0,stderr='';
  child.stderr.on('data',data=>stderr+=data);
  createInterface({input:child.stdout}).on('line',line=>{const value=JSON.parse(line),reply=replies.get(value.id);if(reply){replies.delete(value.id);value.error?reply.reject(Error(value.error)):reply.resolve(value.result);}});
  const rpc=(method:string,...args:unknown[])=>new Promise<any>((resolve,reject)=>{const id=++sequence;replies.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,method,args})+'\n');});
  const allPhotos=async(target:Target,album:Album)=>{const result:Photo[]=[];for(let start=1;start<=5000;start+=50){const page=await lan.photos(target,album.ClockId,start);result.push(...page);if(page.length<50)return result;}throw Error('Pagination limit');};
  let target:Target|undefined,album:Album|undefined;const created:Photo[]=[];
  const timeout=setTimeout(()=>child.kill(),180000);
  try{
    const devices=await rpc('discover');const ip=process.env.DIVOOM_TEST_IP??'192.168.13.142';
    target=await rpc('connect',devices.find((device:any)=>device.DevicePrivateIP===ip)??{DevicePrivateIP:ip});assert.equal(target!.Hardware,530);
    const albums:Album[]=await lan.albums(target!);const all=albums.find(a=>a.AlbumType===1);assert.ok(all);
    const before=await allPhotos(target!,all);
    // Verify the known JPEG now bypasses the malformed device-generated thumbnail.
    const jpeg=before.find(p=>p.OriginalFileId?.endsWith('300426474-1792388534004.jpg'));
    if(jpeg){const fixed=await rpc('thumbnail',target,jpeg);assert.match(fixed,/^data:image\/jpeg;base64,/);await writeFile(join(directory,'corrected-jpeg-thumbnail.jpg'),Buffer.from(fixed.split(',')[1],'base64'));}
    album={ClockId:910000000+Date.now()%1000000,ClockName:'PC WebP validation '+Date.now(),AlbumType:0};
    assert.ok(!albums.some(a=>a.ClockId===album!.ClockId));await lan.command(target!,'Photo/NewAlbum',{...album});
    const source=join(directory,'pc-webp-test.png');
    await run(resolve('vendor/ffmpeg.exe'),['-y','-v','error','-f','lavfi','-i','testsrc2=size=640x480:rate=1','-frames:v','1',source]);
    const imported=await rpc('import',[source]);assert.equal(imported.failures.length,0);const media=imported.media[0];
    const snapshots:unknown[]=[];
    for(const destination of [album,all]){
      await rpc('enqueue',target,destination,{mediaId:media.id,x:80,y:0,width:480,height:480,rotation:0,start:0,end:0,coverTime:0});
      let job:Job|undefined;
      for(let i=0;i<100;i++){job=(await rpc('jobs')).at(-1);if(job&&['已完成','需检查','已取消'].includes(job.state))break;await new Promise(r=>setTimeout(r,250));}
      assert.equal(job?.state,'已完成',job?.error);assert.ok(job!.photoId);
      const list=await allPhotos(target!,destination);const photo=list.find(p=>p.PhotoId===job!.photoId);assert.ok(photo);created.push(photo);
      assert.match(photo.OriginalFileId!,/\.webp$/);const file=lan.filePath(photo.OriginalFileId!);
      const raw=await lan.request(target!,file,'GET');assert.equal(raw.data.toString('ascii',8,12),'WEBP');
      const local=join(directory,basename(file));await writeFile(local,raw.data);
      const info=JSON.parse(await run(resolve('vendor/ffprobe.exe'),['-v','error','-show_streams','-of','json',local]));
      assert.equal(info.streams[0].codec_name,'webp');assert.equal(info.streams[0].width,480);assert.equal(info.streams[0].height,480);
      const uploaded=await readFile(join(dataRoot,'exports',job!.id,basename(file)));assert.deepEqual(raw.data,uploaded);
      // Firmware thumbnail production is asynchronous; read without storing a premature error.
      let thumb:Buffer|undefined;
      for(let i=0;i<20;i++){try{thumb=(await lan.request(target!,lan.filePath(photo.FileId),'GET')).data;break;}catch{await new Promise(r=>setTimeout(r,300));}}
      assert.ok(thumb);await writeFile(join(directory,`device-thumbnail-${photo.PhotoId}.webp`),thumb);
      assert.ok((await allPhotos(target!,all)).some(p=>p.PhotoId===photo.PhotoId),'uploaded ordinary-album photo absent from All Photos');
      console.log(`Uploaded ${destination.AlbumType===1?'All Photos':'test album'}: ${photo.PhotoId} ${basename(file)}`);
    }
    const started=Date.now();
    for(const seconds of [0,5,15,30,60]){
      while(Date.now()-started<seconds*1000)await new Promise(r=>setTimeout(r,500));
      const global=await allPhotos(target!,all),ordinary=await allPhotos(target!,album);
      for(const photo of created){assert.ok(global.some(p=>p.PhotoId===photo.PhotoId),`photo ${photo.PhotoId} disappeared at ${seconds}s`);await lan.request(target!,lan.filePath(photo.OriginalFileId!),'GET');}
      assert.ok(ordinary.some(p=>p.PhotoId===created[0].PhotoId));
      snapshots.push({seconds,allCount:global.length,ordinaryCount:ordinary.length,ids:created.map(p=>p.PhotoId)});
      console.log(`Retained at ${seconds}s; All Photos ${global.length}`);
    }
    assert.equal(stderr,'');
    const report={result:'PASS',deviceId:target!.DeviceId,hardware:target!.Hardware,photos:created,oldJpegPreviewRegenerated:!!jpeg,snapshots,checks:['actual WebP codec and dimensions','uploaded bytes match exported file','firmware-generated thumbnails','ordinary and All Photos upload','both records and files retained for 60 seconds'],directory};
    await writeFile(join(directory,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }finally{
    // Existing frame photos are never selected for cleanup. Each ID must match our exported file.
    if(target)for(const photo of created)await lan.command(target,'Photo/DeletePhoto',{ClockId:album!.ClockId,ParentClockId:0,ParentItemId:'0',PhotoList:[photo.PhotoId]}).catch(error=>console.error('Test-photo cleanup:',error));
    if(target&&album)await lan.command(target,'Photo/DeleteAlbum',{ClockId:album.ClockId}).catch(error=>console.error('Test-album cleanup:',error));
    clearTimeout(timeout);child.stdin.end();
  }
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
