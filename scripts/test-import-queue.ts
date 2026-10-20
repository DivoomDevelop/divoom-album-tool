/** Simulator-side queue validation, idempotency, content matching and restart persistence. */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { command, connect } from '../backend/transport';
import { run } from '../backend/media';
import { editFromSettings } from '../src/importing';
import type { Album, Job, Media, Target } from '../src/shared';

async function main(){
  const directory=resolve(`artifacts/import-queue-${Date.now()}`);await mkdir(directory,{recursive:true});
  const source='C:/Users/Administrator/Desktop/400000012-1792157474503-0.mp4',ffmpeg=resolve('vendor/ffmpeg.exe'),paths=[join(directory,'landscape.jpg'),join(directory,'portrait.jpg'),join(directory,'clip.mp4')];
  await run(ffmpeg,['-y','-v','error','-i',source,'-vf','scale=960:640','-frames:v','1',paths[0]]);
  await run(ffmpeg,['-y','-v','error','-ss','1','-i',source,'-vf','crop=320:480,scale=640:960','-frames:v','1',paths[1]]);
  await run(ffmpeg,['-y','-v','error','-i',source,'-t','2','-vf','scale=480:480','-c:v','libx264','-pix_fmt','yuv420p','-an',paths[2]]);
  const target=await connect({DevicePrivateIP:'127.0.0.1'}),album:Album={ClockId:940000000+Date.now()%1000000,ClockName:'Import queue '+Date.now(),AlbumType:0};
  await command(target,'Photo/NewAlbum',{...album});const created:number[]=[];
  function worker(guard?:string){
    const child=spawn(process.execPath,[...(guard?['--require',guard]:[]),resolve('dist-backend/worker.cjs'),join(directory,'data'),resolve('vendor')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let next=0,stderr='';const replies=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();
    child.stderr.on('data',data=>stderr+=data);createInterface({input:child.stdout}).on('line',line=>{const value=JSON.parse(line),reply=replies.get(value.id);if(reply){replies.delete(value.id);value.error?reply.reject(Error(value.error)):reply.resolve(value.result);}});
    child.on('exit',()=>{for(const reply of replies.values())reply.reject(Error('Worker exited: '+stderr));replies.clear();});
    return {rpc:(method:string,...args:unknown[])=>new Promise<any>((resolve,reject)=>{const id=++next;replies.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,method,args})+'\n');}),stop:async()=>{child.stdin.end();await new Promise<void>(ok=>child.once('exit',()=>ok()));assert.equal(stderr,'');}};
  }
  let service=worker();
  try{
    const imported=await service.rpc('import',paths),media:Media[]=imported.media;assert.equal(imported.failures.length,0);assert.equal(media.length,3);
    const edits=media.map(item=>editFromSettings(item,target));
    await assert.rejects(service.rpc('enqueueBatch',target,album,[edits[0],edits[2]],'invalid-mixed-batch'),/IMPORT_SELECTION_RULE/);
    await assert.rejects(service.rpc('enqueueBatch',target,album,[edits[0],{...edits[1],width:99999}],'invalid-crop-batch'),/裁剪/);
    assert.equal((await service.rpc('jobs')).length,0,'invalid batch partially queued');
    const ids=await service.rpc('enqueueBatch',target,album,edits.slice(0,2),'valid-photo-batch');
    assert.deepEqual(await service.rpc('enqueueBatch',target,album,edits.slice(0,2),'valid-photo-batch'),ids);
    await assert.rejects(service.rpc('enqueueBatch',target,album,[edits[0]],'valid-photo-batch'),/勿重复上传/);
    assert.equal((await service.rpc('jobs')).length,2,'duplicate batch added jobs');
    let completed:Job[]=[];
    for(let i=0;i<100;i++){completed=await service.rpc('jobs');if(completed.every(job=>['已完成','需检查'].includes(job.state)))break;await new Promise(r=>setTimeout(r,200));}
    assert.ok(completed.every(job=>job.state==='已完成'),JSON.stringify(completed));created.push(...completed.map(job=>job.photoId!));
    assert.deepEqual(await service.rpc('importStatus',target,media.map(item=>item.id)),media.slice(0,2).map(item=>item.id));
    assert.deepEqual(await service.rpc('importStatus',{...target,DeviceId:target.DeviceId+1},media.map(item=>item.id)),[]);
    const renamed=join(directory,'renamed.jpg');await copyFile(paths[0],renamed);
    await service.stop();const guard=join(directory,'deny-network.cjs');await writeFile(guard,"require('node:http').request=()=>{throw Error('Warm status attempted network')};globalThis.fetch=async()=>{throw Error('Warm status attempted fetch')};\n");service=worker(guard);
    const repeated:Media[]=(await service.rpc('import',[renamed,paths[1]])).media;
    assert.deepEqual(await service.rpc('importStatus',target,repeated.map(item=>item.id)),repeated.map(item=>item.id));
    await service.stop();service=worker();
    await command(target,'Photo/DeletePhoto',{ClockId:album.ClockId,PhotoList:[created[0]],ParentClockId:0,ParentItemId:'0'});
    const refreshed:Media[]=(await service.rpc('import',[renamed,paths[1]])).media;
    assert.deepEqual(await service.rpc('importStatus',target,refreshed.map(item=>item.id),true),[refreshed[1].id]);
    const report={result:'PASS',checks:['mixed video/photo batch rejected','invalid second crop causes zero queued jobs','same request ID never duplicates jobs','changed request payload rejected','two actual simulator uploads','content history survives rename and restart','warm status forbids network','other DeviceId isolated','deleted photo becomes eligible after refresh'],photoIds:created,directory};
    await writeFile(join(directory,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }finally{
    await service.stop();for(const id of created)await command(target,'Photo/DeletePhoto',{ClockId:album.ClockId,PhotoList:[id],ParentClockId:0,ParentItemId:'0'}).catch(()=>{});
    await command(target,'Photo/DeleteAlbum',{ClockId:album.ClockId}).catch(()=>{});
  }
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
