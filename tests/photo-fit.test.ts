import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {editFromSettings,settingsFromEdit,outputDimensions,resizeCrop} from '../src/importing';
import {convert,run,validateEdit,filters} from '../backend/media';
import type {Media,Target,Edit,PhotoFit} from '../src/shared';
const device:Target={DeviceId:123456789,Hardware:511,DeviceName:'Fixture',DevicePrivateIP:'127.0.0.1',width:800,height:1280,port:9000,apiPath:'/divoom_api',maxUploadBytes:104857600,maxVideoSeconds:600};
const photo:Media={id:'photo',name:'wide.png',path:'wide.png',width:3264,height:2448,kind:'photo',duration:0,size:1,preview:''};
test('whole-photo fits use the selected device bounds, preserve the full rotated source and survive batch templates',()=>{
 for(const target of [device,{...device,width:480,height:480,Hardware:530},{...device,width:1280,height:800,Hardware:512},{...device,width:479,height:481}])for(const fit of ['crop','width','height'] as const)for(const rotation of [0,90,180,270]){
  const first=editFromSettings(photo,target,{fit,rotation,zoom:1,centerX:.5,centerY:.5});validateEdit(photo,first,target);
  assert.deepEqual([first.x,first.y,first.width,first.height],[0,0,rotation%180?2448:3264,rotation%180?3264:2448]);
  const template=settingsFromEdit(photo,target,first);
  for(const source of [photo,{...photo,id:'portrait',width:1080,height:1920},{...photo,id:'panorama',width:10000,height:21}]){
   const edit=editFromSettings(source,target,template),size=outputDimensions(edit,target);validateEdit(source,edit,target);assert.equal(edit.fit,fit);assert.equal(edit.rotation,rotation);assert.ok(size.width>0&&size.height>0&&size.width<=target.width&&size.height<=target.height);assert.ok(Math.abs(size.width/edit.width-size.height/edit.height)<=1/Math.min(edit.width,edit.height));assert.match(filters(edit,target,'photo'),/crop=.*:exact=1/);
  }
 }
 for(const fit of ['crop','width','height'] as const){
  assert.deepEqual(outputDimensions(editFromSettings(photo,device,{fit,rotation:0,zoom:1,centerX:.5,centerY:.5}),device),{width:800,height:600});
  const tall={...photo,width:1080,height:1920};assert.deepEqual(outputDimensions(editFromSettings(tall,device,{fit,rotation:0,zoom:1,centerX:.5,centerY:.5}),device),{width:720,height:1280});
 }
});
test('photo and video crops retain the original ratio with a shared fit selection',()=>{
 const edit=editFromSettings(photo,device,{fit:'width',rotation:0,zoom:1,centerX:.5,centerY:.5});
 for(const change of [{x:2},{width:photo.width-10},{fit:'stretch'}])assert.throws(()=>validateEdit(photo,{...edit,...change} as Edit,device));
 assert.doesNotThrow(()=>validateEdit({...photo,kind:'video',duration:5},{...edit,end:1},device));
 assert.deepEqual(outputDimensions(editFromSettings(photo,device),device),{width:800,height:600});
 for(const fit of ['crop','width','height'] as const){const cropped=editFromSettings(photo,device,{fit,rotation:0,zoom:2,centerX:.4,centerY:.6});validateEdit(photo,cropped,device);assert.equal(cropped.width/photo.width,.5);assert.equal(cropped.height/photo.height,.5);assert.equal(settingsFromEdit(photo,device,cropped).zoom,2);}
});
test('real WebP fits preserve all four image edges, odd source dimensions, rotation and device limits',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'divoom-fit-')),ffmpeg=resolve('vendor/ffmpeg'+(process.platform==='win32'?'.exe':'')),ffprobe=resolve('vendor/ffprobe'+(process.platform==='win32'?'.exe':''));
 try{
  const width=641,height=479,pixels=Buffer.alloc(width*height*3),color=(x:number,y:number)=>x<.1?[220,30,30]:x>.9?[30,30,220]:y<.1?[30,210,30]:y>.9?[220,210,30]:[210,210,210];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)pixels.set(color(x/width,y/height),(y*width+x)*3);
  const path=join(directory,'edges.ppm');await writeFile(path,Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`),pixels]));const media={...photo,path,width,height};
  const cases:[number,Target,PhotoFit,number][]=[[0,device,'width',0],[1,device,'height',90],[2,{...device,width:480,height:480,Hardware:530},'height',270],[3,{...device,width:1280,height:800,Hardware:512},'width',180]];
  for(const [index,target,fit,rotation] of cases){
   const edit=editFromSettings(media,target,{fit,rotation,zoom:1,centerX:.5,centerY:.5}),expected=outputDimensions(edit,target),output=await convert(ffmpeg,ffprobe,media,edit,target,join(directory,String(index)),new AbortController().signal,()=>{});
   assert.equal(output.width,expected.width);assert.equal(output.height,expected.height);assert.ok(output.width<=target.width&&output.height<=target.height);assert.equal(output.cover,undefined);
   const raw=join(directory,index+'.rgb');await run(ffmpeg,['-v','error','-i',output.file,'-f','rawvideo','-pix_fmt','rgb24',raw]);const data=await readFile(raw);assert.equal(data.length,expected.width*expected.height*3);
   for(const [u,v] of [[.04,.5],[.96,.5],[.5,.04],[.5,.96]]){
    const [sx,sy]=rotation===90?[v,1-u]:rotation===180?[1-u,1-v]:rotation===270?[1-v,u]:[u,v],wanted=color(sx,sy),offset=(Math.floor(v*expected.height)*expected.width+Math.floor(u*expected.width))*3;
    for(let c=0;c<3;c++)assert.ok(Math.abs(data[offset+c]-wanted[c])<18,`lost source edge at ${u},${v}, rotation ${rotation}`);
   }
  }
 }finally{const inside=relative(resolve(tmpdir()),resolve(directory));assert.ok(inside&&!inside.startsWith('..')&&!isAbsolute(inside));await rm(directory,{recursive:true,force:true});}
});


test('corner resizing locks source proportions and the opposite corner at every boundary',()=>{
 for(const [sw,sh] of [[1600,1200],[1080,1920],[10000,21]])for(const corner of ['nw','ne','sw','se'] as const){
  const media={...photo,width:sw,height:sh},original=editFromSettings(media,device,{rotation:0,zoom:2,centerX:.5,centerY:.5});
  for(const [px,py] of [[0,0],[sw,sh],[-sw,-sh],[2*sw,2*sh],[sw/2,sh/2]]){
   const resized=resizeCrop(sw,sh,original,corner,px,py),edit=editFromSettings(media,device,{rotation:0,...resized});validateEdit(media,edit,device);
   assert.ok(resized.zoom>=1&&resized.zoom<=5);assert.ok(Math.abs(edit.width/edit.height-sw/sh)<1e-9);
   assert.ok(Math.abs(edit.x+(corner.endsWith('e')?0:edit.width)-(original.x+(corner.endsWith('e')?0:original.width)))<1e-7);
   assert.ok(Math.abs(edit.y+(corner.startsWith('s')?0:edit.height)-(original.y+(corner.startsWith('s')?0:original.height)))<1e-7);
  }
 }
});

test('real off-center WebP crops match displayed rotation and both mirrors, and batch templates retain mirrors',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'divoom-mirror-')),ffmpeg=resolve('vendor/ffmpeg'+(process.platform==='win32'?'.exe':'')),ffprobe=resolve('vendor/ffprobe'+(process.platform==='win32'?'.exe':''));
 try{
  const width=320,height=240,pixels=Buffer.alloc(width*height*3),color=(u:number,v:number)=>[Math.round(30+u*180),Math.round(30+v*180),70];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)pixels.set(color(x/width,y/height),(y*width+x)*3);
  const path=join(directory,'gradient.ppm');await writeFile(path,Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`),pixels]));const media={...photo,path,width,height};
  let index=0;
  for(const rotation of [0,90,180,270])for(const flipX of [false,true])for(const flipY of [false,true]){
   const edit=editFromSettings(media,device,{rotation,flipX,flipY,zoom:2,centerX:.35,centerY:.6});
   const template=settingsFromEdit(media,device,edit),batch=editFromSettings({...media,id:'next',width:640,height:480},device,template);assert.equal(batch.flipX,flipX);assert.equal(batch.flipY,flipY);
   const output=await convert(ffmpeg,ffprobe,media,edit,device,join(directory,String(index)),new AbortController().signal,()=>{}),raw=join(directory,`${index++}.rgb`);
   await run(ffmpeg,['-v','error','-i',output.file,'-f','rawvideo','-pix_fmt','rgb24',raw]);const data=await readFile(raw),sw=rotation%180?height:width,sh=rotation%180?width:height;
   for(const [u,v] of [[.2,.2],[.8,.2],[.2,.8],[.8,.8]]){
    let ru=(edit.x+u*edit.width)/sw,rv=(edit.y+v*edit.height)/sh;if(flipX)ru=1-ru;if(flipY)rv=1-rv;
    const [sx,sy]=rotation===90?[rv,1-ru]:rotation===180?[1-ru,1-rv]:rotation===270?[1-rv,ru]:[ru,rv],expected=color(sx,sy),offset=(Math.floor(v*output.height)*output.width+Math.floor(u*output.width))*3;
    expected.forEach((value,c)=>assert.ok(Math.abs(data[offset+c]-value)<8,`${rotation}, ${flipX}, ${flipY}, channel ${c}`));
   }
  }
 }finally{const inside=relative(resolve(tmpdir()),resolve(directory));assert.ok(inside&&!inside.startsWith('..')&&!isAbsolute(inside));await rm(directory,{recursive:true,force:true});}
});
