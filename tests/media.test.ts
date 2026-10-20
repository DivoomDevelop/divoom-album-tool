import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { convert, run } from '../backend/media';
import { MAX_UPLOAD_BYTES, type Target } from '../src/shared';

test('photo export is a real 480x360 WebP with correct color and no duplicate cover',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'divoom-webp-'));
  const ffmpeg=resolve('vendor/ffmpeg.exe'),ffprobe=resolve('vendor/ffprobe.exe');
  const target:Target={DeviceId:123,Hardware:530,DeviceName:'Test',DevicePrivateIP:'127.0.0.1',width:480,height:480,port:9000,apiPath:'/divoom_api',maxUploadBytes:MAX_UPLOAD_BYTES,maxVideoSeconds:1800};
  try{
    // Distinct color bands expose RGB565/BGRA confusion, double images and half-height data.
    const width=640,height=480,pixels=Buffer.alloc(width*height*3);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const offset=(y*width+x)*3,color=y<240?(x<320?[220,30,30]:[30,210,30]):(x<320?[30,30,220]:[220,210,30]);
      pixels.set(color,offset);
    }
    const source=join(directory,'source.ppm');await writeFile(source,Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`),pixels]));
    const output=await convert(ffmpeg,ffprobe,{id:'1',path:source,name:'source.ppm',width,height,duration:0,size:pixels.length,kind:'photo',preview:''},{mediaId:'1',x:0,y:0,width:640,height:480,rotation:0,start:0,end:0,coverTime:0},target,directory,new AbortController().signal,()=>{});
    assert.match(output.file,/\.webp$/);assert.equal(output.cover,undefined);
    const bytes=await readFile(output.file);assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
    const info=JSON.parse(await run(ffprobe,['-v','error','-show_streams','-of','json',output.file]));
    assert.equal(info.streams[0].codec_name,'webp');assert.equal(info.streams[0].width,480);assert.equal(info.streams[0].height,360);
    const decoded=join(directory,'decoded.rgb');await run(ffmpeg,['-y','-v','error','-i',output.file,'-f','rawvideo','-pix_fmt','rgb24',decoded]);
    const rgb=await readFile(decoded);assert.equal(rgb.length,480*360*3);
    for(const [x,y,expected] of [[120,90,[220,30,30]],[360,90,[30,210,30]],[120,270,[30,30,220]],[360,270,[220,210,30]]] as const){
      const offset=(y*480+x)*3;
      for(let channel=0;channel<3;channel++)assert.ok(Math.abs(rgb[offset+channel]-expected[channel])<12,`wrong color at ${x},${y}: ${Array.from(rgb.subarray(offset,offset+3))}`);
    }
  }finally{await rm(directory,{recursive:true,force:true});}
});
