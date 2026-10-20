import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {editFromSettings,settingsFromEdit,outputDimensions} from '../src/importing';
import {convert,probe,run,validateEdit} from '../backend/media';
import type {Media,Target} from '../src/shared';
const target:Target={DeviceId:123,Hardware:511,DeviceName:'Fixture',DevicePrivateIP:'127.0.0.1',width:800,height:1280,port:9000,apiPath:'/divoom_api',maxUploadBytes:104857600,maxVideoSeconds:600};
const video:Media={id:'v',name:'portrait.mp4',path:'portrait.mp4',kind:'video',width:1080,height:1920,duration:15,size:1,preview:''};
test('video fit, zoom and rotation preserve source proportions and bound even output pixels',()=>{
 for(const device of [target,{...target,Hardware:530,width:480,height:480},{...target,width:479,height:481}])for(const fit of ['crop','width','height'] as const)for(const rotation of [0,90,180,270])for(const zoom of [1,1.7]){
  const edit=editFromSettings(video,device,{fit,rotation,zoom,centerX:.4,centerY:.6}),size=outputDimensions(edit,device,'video');validateEdit(video,edit,device);
  const aspect=rotation%180?video.height/video.width:video.width/video.height;
  assert.ok(Math.abs(edit.width/edit.height-aspect)<1e-10);assert.equal(edit.fit,fit);assert.equal(size.width%2,0);assert.equal(size.height%2,0);assert.ok(size.width<=device.width&&size.height<=device.height);
  assert.ok(Math.abs(size.width-size.height*aspect)<2*(1+aspect));assert.ok(Math.abs(settingsFromEdit(video,device,edit).zoom-zoom)<1e-10);
 }
 assert.deepEqual(outputDimensions(editFromSettings(video,target),target,'video'),{width:720,height:1280});
 assert.deepEqual(outputDimensions(editFromSettings({...video,width:1920,height:1080},target),target,'video'),{width:800,height:450});
 assert.throws(()=>validateEdit(video,{...editFromSettings(video,target),width:800,height:1280},target));
});
test('real H.265/H.264 exports and selected covers retain geometry, trim, rotation and frame content',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'divoom-video-fit-')),ffmpeg=resolve('vendor/ffmpeg.exe'),ffprobe=resolve('vendor/ffprobe.exe');
 try{
  const width=360,height=640,pixels=Buffer.alloc(width*height*3);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)pixels.set(x<30?[220,30,30]:x>330?[30,30,220]:y<30?[220,210,30]:y>610?[220,30,210]:Math.hypot(x-180,y-320)<70?[30,210,30]:[200,200,200],(y*width+x)*3);
  const ppm=join(directory,'source.ppm'),source=join(directory,'source.mp4');await writeFile(ppm,Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`),pixels]));
  await run(ffmpeg,['-v','error','-loop','1','-i',ppm,'-f','lavfi','-i','sine=frequency=880:sample_rate=44100','-t','1','-r','30','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',source]);
  const media={...video,...await probe(ffprobe,source),path:source};
  for(const [index,Hardware,rotation,zoom,fit] of [[0,511,0,1,'width'],[1,530,90,1,'height'],[2,511,270,1.7,'crop']] as const){
   const device={...target,Hardware,...(Hardware===530?{width:480,height:480}:{})},edit={...editFromSettings(media,device,{fit,rotation,zoom,centerX:.5,centerY:.5}),start:.1,end:.7,coverTime:.4};
   const output=await convert(ffmpeg,ffprobe,media,edit,device,join(directory,String(index)),new AbortController().signal,()=>{});assert.ok(output.cover);const expected=outputDimensions(edit,device,'video');assert.deepEqual([output.width,output.height],[expected.width,expected.height]);
   const streams=JSON.parse(await run(ffprobe,['-v','error','-show_streams','-of','json',output.file])).streams,track=streams.find((s:any)=>s.codec_type==='video');assert.equal(track.codec_name,Hardware===530?'h264':'hevc');assert.ok(Math.abs(Number(track.duration)-.6)<.06);assert.equal(track.pix_fmt,'yuv420p');assert.equal(streams.some((s:any)=>s.codec_type==='audio'),Hardware!==530);
   const cover=await probe(ffprobe,output.cover!);assert.deepEqual([cover.width,cover.height],[expected.width,expected.height]);
   const rgbPath=join(directory,index+'.rgb');await run(ffmpeg,['-v','error','-i',output.cover!,'-f','rawvideo','-pix_fmt','rgb24',rgbPath]);const rgb=await readFile(rgbPath);let left=expected.width,right=0,top=expected.height,bottom=0;
   for(let y=0;y<expected.height;y++)for(let x=0;x<expected.width;x++){const i=(y*expected.width+x)*3;if(rgb[i+1]>145&&rgb[i]<90&&rgb[i+2]<90){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}
   assert.ok(right>left&&bottom>top);assert.ok(Math.abs((right-left)/(bottom-top)-1)<.035,'circle must stay round in video cover');
   await run(ffmpeg,['-v','error','-xerror','-i',output.file,'-f','null','-']);
  }
 }finally{const inside=relative(resolve(tmpdir()),resolve(directory));assert.ok(inside&&!inside.startsWith('..')&&!isAbsolute(inside));await rm(directory,{recursive:true,force:true});}
});
