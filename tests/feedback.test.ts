import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {run,probe,convert} from '../backend/media';
import {editFromSettings} from '../src/importing';
import {SessionStore} from '../backend/session';
import {lanFixture} from './lan-fixture';
import type {Media,Target,Job,WorkflowDraft} from '../src/shared';
const ffmpeg=resolve('vendor/ffmpeg'+(process.platform==='win32'?'.exe':'')),ffprobe=resolve('vendor/ffprobe'+(process.platform==='win32'?'.exe':''));
const target:Target={DeviceId:770000511,cacheIdentity:'id:770000511',Hardware:511,DeviceName:'Fixture',DevicePrivateIP:'127.0.0.1',port:9000,apiPath:'/divoom_api',width:800,height:1280,maxUploadBytes:104857600,maxVideoSeconds:600};
async function cleanup(directory:string){const inside=relative(resolve(tmpdir()),resolve(directory));assert.ok(inside&&!inside.startsWith('..')&&!isAbsolute(inside));await rm(directory,{recursive:true,force:true});}
function worker(directory:string){
 const child=spawn(process.execPath,[resolve('dist-backend/worker.cjs'),directory,resolve('vendor')],{windowsHide:true,stdio:['pipe','pipe','pipe']});let serial=0,stderr='';const replies=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>();
 child.stderr.on('data',value=>stderr+=value);createInterface({input:child.stdout}).on('line',line=>{const value=JSON.parse(line),entry=replies.get(value.id);if(entry){replies.delete(value.id);value.error?entry.reject(Error(value.error)):entry.resolve(value.result);}});
 child.on('exit',()=>{for(const entry of replies.values())entry.reject(Error('Worker exited '+stderr));replies.clear();});
 return {child,rpc:(method:string,...args:any[])=>new Promise<any>((resolve,reject)=>{const id=++serial;replies.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,method,args})+'\n');}),stop:async()=>{child.stdin.end();await new Promise<void>(ok=>child.once('exit',()=>ok()));}};
}
async function until(check:()=>Promise<boolean>){for(let i=0;i<200;i++){if(await check())return;await new Promise(r=>setTimeout(r,50));}throw Error('Condition timed out');}
test('background padding and blur use actual device size, preserve subject, and quality changes real WebP bytes',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'divoom-background-'));
 try{
  const path=join(directory,'source.png');await run(ffmpeg,['-v','error','-f','lavfi','-i','testsrc2=s=640x360','-frames:v','1',path]);
  const media:Media={id:'p',path,name:'source.png',preview:'',...await probe(ffprobe,path)};
  const outputs:Record<string,number>={};
  for(const background of ['none','black','white','blur'] as const)for(const quality of [50,90]){
   const edit={...editFromSettings(media,target),background,quality},output=await convert(ffmpeg,ffprobe,media,edit,target,join(directory,background+quality),new AbortController().signal,()=>{});assert.deepEqual([output.width,output.height],background==='none'?[800,450]:[800,1280]);outputs[background+quality]=(await readFile(output.file)).length;
   if(background==='black'||background==='white'){const rgb=join(directory,background+quality+'.rgb');await run(ffmpeg,['-v','error','-i',output.file,'-f','rawvideo','-pix_fmt','rgb24',rgb]);const pixels=await readFile(rgb),wanted=background==='white'?255:0;for(const value of pixels.subarray(120,123))assert.ok(Math.abs(value-wanted)<5);}
  }
  assert.ok(outputs.none50<outputs.none90);assert.ok(outputs.blur90>0);
  const videoPath=join(directory,'source.mp4');await run(ffmpeg,['-v','error','-loop','1','-i',path,'-t','0.5','-c:v','libx264','-pix_fmt','yuv420p',videoPath]);const video={...media,...await probe(ffprobe,videoPath),path:videoPath};
  for(const background of ['black','blur'] as const){const device={...target,Hardware:530,width:480,height:480},output=await convert(ffmpeg,ffprobe,video,{...editFromSettings(video,device),background,end:.3,coverTime:.1},device,join(directory,'video-'+background),new AbortController().signal,()=>{});assert.deepEqual([output.width,output.height],[480,480]);assert.equal((await probe(ffprobe,output.cover!)).height,480);}
 }finally{await cleanup(directory);}
});
test('atomic snapshots preserve the last concurrent update',async()=>{const directory=await mkdtemp(join(tmpdir(),'divoom-session-'));try{const file=join(directory,'session.json'),store=new SessionStore<{n:number}>(file);await Promise.all(Array.from({length:15},(_,n)=>store.write({n})));assert.deepEqual(await new SessionStore(file).read(null),{n:14});}finally{await cleanup(directory);}});
test('real worker restores drafts and jobs, duplicate choices are safe, navigation does not cancel, interrupted upload never auto replays',{timeout:120000},async()=>{
 execFileSync(process.execPath,[resolve('scripts/build-backend.mjs')],{windowsHide:true});
 const directory=await mkdtemp(join(tmpdir(),'divoom-feedback-')),fixture=await lanFixture();let service=worker(join(directory,'data'));
 try{
  const path=join(directory,'source.png');await run(ffmpeg,['-v','error','-f','lavfi','-i','testsrc2=s=640x480','-frames:v','1',path]);
  const media:Media=(await service.rpc('import',[path])).media[0],edit={...editFromSettings(media,target),quality:80,background:'black' as const};
  const draft:WorkflowDraft={stage:'edit',candidates:[media],selected:[media.id],chosen:[media],edits:[edit],modified:[media.id],index:0,mode:'each',adjusting:false,requestId:'draft-request-01'};
  await service.rpc('saveDraft',target,fixture.albums[1],draft);await service.rpc('albums',target);assert.equal((await service.rpc('loadDraft',target,fixture.albums[1])).edits[0].quality,80);
  assert.equal(await service.rpc('loadDraft',target,fixture.albums[2]),null);
  const encoded=await service.rpc('estimate',target,edit);assert.deepEqual([encoded.width,encoded.height],[800,1280]);assert.ok(encoded.bytes>0);assert.equal((await fetch(encoded.url)).status,200);
  const first=await Promise.all([service.rpc('enqueueBatch',target,fixture.albums[1],[edit],'request-first-01'),service.rpc('enqueueBatch',target,fixture.albums[1],[edit],'request-first-01')]);assert.deepEqual(first[0],first[1]);
  await service.rpc('albums',target);await service.rpc('photos',target,100002,1);await until(async()=>((await service.rpc('jobs')) as Job[]).every(j=>j.state==='已完成'));assert.equal(fixture.uploads.length,1);
  const storage=await service.rpc('storage',target);assert.equal(storage.photoCount,1);assert.equal(storage.freeBytes,2147483648);fixture.setStorageBytes(false);const legacy=await service.rpc('storage',target);assert.equal(legacy.freeBytes,undefined);assert.equal(legacy.full,false);
  assert.equal((await service.rpc('duplicateMatches',target,[media.id]))[0].photos.length,1);
  await assert.rejects(service.rpc('enqueueBatch',target,fixture.albums[1],[edit],'request-nochoice'),/DUPLICATE/);
  assert.deepEqual(await service.rpc('enqueueBatch',target,fixture.albums[1],[edit],'request-skip-01','skip'),[]);assert.equal(fixture.uploads.length,1);
  await service.rpc('enqueueBatch',target,fixture.albums[1],[edit],'request-keep-01','keep');await until(async()=>((await service.rpc('jobs')) as Job[]).every(j=>j.state==='已完成'));assert.equal(fixture.records.size,2);
  await service.rpc('enqueueBatch',target,fixture.albums[1],[edit],'request-replace','replace');await until(async()=>((await service.rpc('jobs')) as Job[]).every(j=>j.state==='已完成'));assert.equal([...fixture.records.values()].filter(row=>row.albums.has(100001)).length,1);assert.equal(fixture.records.size,3,'other albums retain old originals');
  await service.rpc('enqueueBatch',target,fixture.albums[0],[edit],'request-replace-all','replace');await until(async()=>((await service.rpc('jobs')) as Job[]).every(j=>j.state==='已完成'));assert.equal(fixture.records.size,1,'All Photos replacement deletes only confirmed old source matches');assert.equal(fixture.uploads.length,4);
  await service.stop();service=worker(join(directory,'data'));const restored=await service.rpc('loadDraft',target,fixture.albums[1]);assert.equal(restored.edits[0].background,'black');assert.notEqual(restored.candidates[0].path,media.path);assert.equal((await fetch(restored.candidates[0].path)).status,200);assert.equal((await service.rpc('jobs')).length,4);
  fixture.setDelay(5000);await service.rpc('enqueueBatch',target,fixture.albums[1],[edit],'request-interrupt','keep');await until(async()=>fixture.uploads.length===5);await service.stop();service=worker(join(directory,'data'));const jobs:Job[]=await service.rpc('jobs');assert.equal(jobs.at(-1)!.state,'需检查');assert.equal(jobs.at(-1)!.error,'UPLOAD_INTERRUPTED');await new Promise(r=>setTimeout(r,300));assert.equal(fixture.uploads.length,5,'uncertain upload must not be replayed');
  fixture.setDelay(0);fixture.setFull(1);fixture.setAlbumFailure(true);const full=await service.rpc('storage',target);assert.equal(full.full,true,'failed album listing must not hide full storage');assert.equal(full.photoCount,undefined);
  const before=(await service.rpc('jobs')).length;await assert.rejects(service.rpc('enqueueBatch',target,fixture.albums[1],[edit],'request-full-reject','keep'),/DEVICE_STORAGE_FULL/);assert.equal((await service.rpc('jobs')).length,before);assert.equal(fixture.uploads.length,5);fixture.setAlbumFailure(false);
  fixture.setFull(0);const batch=(await service.rpc('import',[path,path])).media;fixture.setFullAfterUpload(6);await service.rpc('enqueueBatch',target,fixture.albums[1],batch.map((item:Media)=>editFromSettings(item,target)),'request-fill-during','keep');
  await until(async()=>{const jobs:Job[]=await service.rpc('jobs');return jobs.length===before+2&&['已完成','需检查'].includes(jobs.at(-1)!.state);});const final:Job[]=await service.rpc('jobs');assert.equal(final.at(-2)!.state,'已完成');assert.equal(final.at(-1)!.error,'DEVICE_STORAGE_FULL');assert.equal(fixture.uploads.length,6,'next queued photo must not upload after Full becomes 1');

 }finally{await service.stop();fixture.close();await cleanup(directory);}
});
