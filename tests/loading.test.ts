import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { request, connect, discover } from '../backend/transport';
import { ThumbnailQueue } from '../src/thumbnails';
import { isSupportedHardware, type Photo, type Target } from '../src/shared';
const target:Target={DeviceId:11,Hardware:530,DeviceName:'A',DevicePrivateIP:'127.0.0.1',port:9000,apiPath:'/divoom_api',width:480,height:480,maxUploadBytes:536870912,maxVideoSeconds:1800};
const photo:Photo={PhotoId:1,Time:1,FileId:'/userdata/1.webp'};
test('device HTTP fan-out is serialized even across independent callers',async()=>{
  let active=0,maximum=0;
  const server=createServer((_,res)=>{active++;maximum=Math.max(maximum,active);setTimeout(()=>{active--;res.end('image');},15);});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const port=(server.address() as any).port;
    const result=await Promise.all(Array.from({length:12},(_,index)=>request({...target,port},`/${index}`,'GET')));
    assert.equal(result.length,12);assert.equal(maximum,1);assert.ok(result.every(item=>item.data.toString()==='image'));
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('thumbnail queue serializes, caches, drops obsolete work and isolates devices',async()=>{
  let active=0,maximum=0,calls=0;
  const queue=new ThumbnailQueue(async device=>{calls++;active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,10));active--;return `image:${device.DeviceId}`;});
  const controller=new AbortController(),obsolete=new AbortController();
  const first=queue.get(target,photo,controller.signal),canceled=queue.get(target,{...photo,PhotoId:2},obsolete.signal);obsolete.abort();
  const rejected=assert.rejects(canceled);
  const again=queue.get(target,photo,controller.signal),other=queue.get({...target,DeviceId:12},photo,controller.signal);
  assert.deepEqual(await Promise.all([first,again,other]),['image:11','image:11','image:12']);await rejected;
  assert.equal(calls,2);assert.equal(maximum,1);
});
test('temporary thumbnail failure retries but permanent failure is not cached',async()=>{
  let calls=0;const queue=new ThumbnailQueue(async()=>{if(++calls===1)throw Error('ECONNRESET');return 'image';});
  assert.equal(await queue.get(target,photo,new AbortController().signal),'image');assert.equal(calls,2);
  let permanent=0;const missing=new ThumbnailQueue(async()=>{permanent++;throw Error('HTTP 404');});
  await assert.rejects(missing.get(target,photo,new AbortController().signal));await assert.rejects(missing.get(target,photo,new AbortController().signal));assert.equal(permanent,2);
});
test('discovery and manual connection accept only 510, 511, 512 and 530',async()=>{
  for(const value of [510,511,512,530])assert.equal(isSupportedHardware(value),true);
  for(const value of [0,90,400,999])assert.equal(isSupportedHardware(value),false);
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({DeviceList:[510,511,512,530,400,90].map(Hardware=>({...target,Hardware}))}));
  try{assert.deepEqual((await discover()).map(device=>device.Hardware),[510,511,512,530]);}finally{globalThis.fetch=original;}
  const commands:string[]=[];
  await assert.rejects(connect(target,async(_,name)=>{commands.push(name);return {Hardware:400,ReturnCode:0};}),/仅支持/);
  assert.deepEqual(commands,['Device/GetHardwareVersion']);
});
