/** Read-only acceptance against the user-authorized frame; warm phase forbids network I/O. */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import type { Photo, Target } from '../src/shared';
const directory=resolve(`artifacts/device-cache-${Date.now()}`),dataRoot=join(directory,'data');
function worker(guard?:string){
  const child=spawn(process.execPath,[...(guard?['--require',guard]:[]),resolve('dist-backend/worker.cjs'),dataRoot,resolve('vendor')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let next=0,stderr='';const replies=new Map<number,{resolve:(value:any)=>void;reject:(e:Error)=>void}>();
  child.stderr.on('data',data=>{stderr+=data;});
  createInterface({input:child.stdout}).on('line',line=>{const value=JSON.parse(line),reply=replies.get(value.id);if(reply){replies.delete(value.id);value.error?reply.reject(new Error(value.error)):reply.resolve(value.result);}});
  child.on('exit',()=>{for(const reply of replies.values())reply.reject(Error('Worker exited: '+stderr));replies.clear();});
  return {
    rpc:(method:string,...args:unknown[])=>new Promise<any>((resolve,reject)=>{const id=++next;replies.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,method,args})+'\n');}),
    stop:async()=>{child.stdin.end();await new Promise<void>(resolve=>child.once('exit',()=>resolve()));assert.equal(stderr,'');},
    kill:()=>child.kill(),
  };
}
async function main(){
  await mkdir(directory,{recursive:true});const guard=join(directory,'deny-network.cjs');
  await writeFile(guard,"require('node:http').request=()=>{throw Error('Warm cache attempted device HTTP')};globalThis.fetch=async()=>{throw Error('Warm cache attempted device fetch')};\n");
  let service=worker();const timeout=setTimeout(()=>service.kill(),120000);
  try{
    const devices=await service.rpc('discover').catch(()=>[]),ip=process.env.DIVOOM_TEST_IP??'192.168.13.142';
    const target:Target=await service.rpc('connect',devices.find((device:any)=>device.DevicePrivateIP===ip)??{DevicePrivateIP:ip});
    assert.equal(target.Hardware,530);assert.ok(target.cacheIdentity);const started=Date.now();
    const albums=await service.rpc('albums',target),album=albums.find((a:any)=>a.AlbumType===1);assert.ok(album);
    const photos:Photo[]=await service.rpc('photos',target,album.ClockId,1);assert.ok(photos.length>0);
    const thumbnails:string[]=[];
    for(const photo of photos){const image=await service.rpc('thumbnail',target,photo);assert.match(image,/^data:image\//);thumbnails.push(image);}
    const selected=photos.find(photo=>photo.OriginalFileId?.endsWith('/20.webp'))??photos.find(photo=>photo.MediaType==='photo');assert.ok(selected);
    const preview=await service.rpc('preview',target,selected);assert.ok(preview.width>0&&preview.height>0);
    // An intentionally nonexistent read-only path exercises local thumbnail regeneration.
    const missing={...selected,FileId:'/userdata/divoom_thumb/__pc_cache_acceptance_missing__.webp'};
    const fallback=await service.rpc('thumbnail',target,missing);assert.match(fallback,/^data:image\/jpeg;base64,/);
    const coldMs=Date.now()-started;await service.stop();service=worker(guard);const warmStarted=Date.now();
    assert.deepEqual(await service.rpc('albums',target),albums);assert.deepEqual(await service.rpc('photos',target,album.ClockId,1),photos);
    for(let index=0;index<photos.length;index++)assert.equal(await service.rpc('thumbnail',target,photos[index]),thumbnails[index]);
    assert.equal(await service.rpc('thumbnail',target,missing),fallback);
    const warm=await service.rpc('preview',target,selected);assert.equal(warm.width,preview.width);assert.equal(warm.size,preview.size);
    const report={result:'PASS',device:target.DevicePrivateIP,deviceId:target.DeviceId,cacheIdentity:target.cacheIdentity,hardware:target.Hardware,photos:photos.length,thumbnails:thumbnails.length,coldMs,warmMs:Date.now()-warmStarted,warmDeviceNetworkRequests:0,checks:['sequential real-device thumbnail reads','missing thumbnail regenerated from original','original-file preview','persistent cache across worker restart','warm cache with HTTP and fetch forbidden'],directory};
    await writeFile(join(directory,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }finally{clearTimeout(timeout);await service.stop();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
