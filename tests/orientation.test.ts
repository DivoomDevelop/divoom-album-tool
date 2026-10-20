import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {jpegOrientation} from '../backend/orientation';
import {probe,run,convert} from '../backend/media';
import {editFromSettings} from '../src/importing';
import type {Target} from '../src/shared';

function exif(orientation:number,little:boolean){
 const tiff=Buffer.alloc(26),u16=(n:number,p:number)=>little?tiff.writeUInt16LE(n,p):tiff.writeUInt16BE(n,p),u32=(n:number,p:number)=>little?tiff.writeUInt32LE(n,p):tiff.writeUInt32BE(n,p);
 tiff.write(little?'II':'MM');u16(42,2);u32(8,4);u16(1,8);u16(0x112,10);u16(3,12);u32(1,14);u16(orientation,18);
 return Buffer.concat([Buffer.from([0xff,0xe1,0,34]),Buffer.from('Exif\0\0'),tiff]);
}
test('all eight JPEG EXIF orientations match the decoder and retain proportions through WebP export',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'divoom-orientation-')),ffmpeg=resolve('vendor/ffmpeg'+(process.platform==='win32'?'.exe':'')),ffprobe=resolve('vendor/ffprobe'+(process.platform==='win32'?'.exe':''));
 const target:Target={DeviceId:123,Hardware:511,DeviceName:'Test',DevicePrivateIP:'127.0.0.1',width:800,height:1280,port:9000,apiPath:'/divoom_api',maxUploadBytes:104857600,maxVideoSeconds:600};
 try{
  const ppm=join(directory,'source.ppm'),pixels=Buffer.alloc(640*480*3);
  for(let y=0;y<480;y++)for(let x=0;x<640;x++)pixels.set(x<100?[220,30,30]:x>540?[30,30,220]:Math.hypot(x-320,y-240)<90?[30,210,30]:[210,210,210],(y*640+x)*3);
  await writeFile(ppm,Buffer.concat([Buffer.from('P6\n640 480\n255\n'),pixels]));const base=join(directory,'base.jpg');await run(ffmpeg,['-v','error','-i',ppm,'-frames:v','1','-q:v','2',base]);const jpeg=await readFile(base);
  for(const little of [false,true])for(let orientation=1;orientation<=8;orientation++){
   const file=join(directory,`${little}-${orientation}.JPG`);await writeFile(file,Buffer.concat([jpeg.subarray(0,2),exif(orientation,little),jpeg.subarray(2)]));
   assert.equal(await jpegOrientation(file),orientation);const info=await probe(ffprobe,file);assert.deepEqual([info.width,info.height],orientation>=5?[480,640]:[640,480]);
   const media={...info,id:'source',path:file,name:'source.JPG',preview:''},edit=editFromSettings(media,target),output=await convert(ffmpeg,ffprobe,media,edit,target,join(directory,`${little}-${orientation}`),new AbortController().signal,()=>{});
   assert.deepEqual([output.width,output.height],orientation>=5?[800,1066]:[800,600]);
   const raw=join(directory,`${little}-${orientation}.rgb`);await run(ffmpeg,['-v','error','-i',output.file,'-f','rawvideo','-pix_fmt','rgb24',raw]);const rgb=await readFile(raw);
   let left=output.width,right=0,top=output.height,bottom=0;
   for(let y=0;y<output.height;y++)for(let x=0;x<output.width;x++){const i=(y*output.width+x)*3;if(rgb[i+1]>150&&rgb[i]<80&&rgb[i+2]<80){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}
   assert.ok(right>left&&bottom>top);assert.ok(Math.abs((right-left)/(bottom-top)-1)<.025,'the circle must not stretch');
  }
  for(const bytes of [Buffer.from([0xff,0xd8,0xff,0xe1,0,2]),Buffer.concat([Buffer.from([0xff,0xd8]),exif(9,true)]),Buffer.concat([Buffer.from([0xff,0xd8]),exif(6,true).subarray(0,20)])]){const broken=join(directory,'broken.jpg');await writeFile(broken,bytes);assert.equal(await jpegOrientation(broken),1);}
 }finally{const inside=relative(resolve(tmpdir()),resolve(directory));assert.ok(inside&&!inside.startsWith('..')&&!isAbsolute(inside));await rm(directory,{recursive:true,force:true});}
});
