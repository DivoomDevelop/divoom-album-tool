import { spawn } from 'node:child_process';
import { outputDimensions } from '../src/importing';
import { jpegOrientation } from './orientation';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { MAX_VIDEO_SECONDS, MAX_UPLOAD_BYTES, isSupportedHardware, type Edit, type Media, type Target } from '../src/shared';

export async function run(binary:string,args:string[],signal?:AbortSignal,onProgress?:(text:string)=>void):Promise<string> {
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{windowsHide:true,signal});let output='',errors='';
    child.stdout.on('data',data=>{output+=data;onProgress?.(String(data));});child.stderr.on('data',data=>{errors=(errors+data).slice(-12000);});
    child.on('error',reject);child.on('close',code=>{if(code===0)resolve(output);else reject(new Error(signal?.aborted?'已取消':errors||`媒体处理退出 ${code}`));});
  });
}
export async function probe(binary:string,file:string):Promise<{width:number;height:number;duration:number;kind:'photo'|'video';size:number}> {
  const result=JSON.parse(await run(binary,['-v','error','-show_streams','-show_format','-of','json',file]));
  const video=result.streams?.find((s:any)=>s.codec_type==='video');if(!video)throw new Error('文件没有可读取的图像轨道');
  const duration=Number(video.duration??result.format.duration??0)||0;
  const photo=['.jpg','.jpeg','.png','.webp','.bmp','.heic','.avif'].includes(path.extname(file).toLowerCase());
  const rotation=Number(video.side_data_list?.find((d:any)=>d.rotation!==undefined)?.rotation??video.tags?.rotate??0);
  const orientation=/\.jpe?g$/i.test(file)?await jpegOrientation(file):1;
  const swap=orientation>=5||Math.abs(rotation)%180===90;
  return {width:swap?video.height:video.width,height:swap?video.width:video.height,duration:photo?0:duration,kind:photo?'photo':'video',size:(await stat(file)).size};
}
export function validateEdit(media:Media,edit:Edit,target:Pick<Target,'width'|'height'|'Hardware'|'maxVideoSeconds'>):void {
  if(![0,90,180,270].includes(edit.rotation))throw new Error('旋转角度无效');
  const sw=edit.rotation%180?media.height:media.width,sh=edit.rotation%180?media.width:media.height;
  const values=[edit.x,edit.y,edit.width,edit.height,edit.start,edit.end,edit.coverTime];
  if(values.some(n=>!Number.isFinite(n))||edit.x<0||edit.y<0||edit.width<2||edit.height<2||edit.x+edit.width>sw+1||edit.y+edit.height>sh+1)throw new Error('裁剪区域超出原图范围');
  const fit=edit.fit??'crop';
  if(!['crop','width','height'].includes(fit))throw new Error('裁剪比例与目标屏幕不一致');
  const aspect=sw/sh;
  if(Math.abs(edit.width/edit.height-aspect)>0.0001)throw new Error('裁剪比例与目标屏幕不一致');
  if(media.kind==='video'&&(edit.start<0||edit.end>media.duration+0.05||edit.end<=edit.start||edit.end-edit.start>Math.min(MAX_VIDEO_SECONDS,target.maxVideoSeconds)+0.001||edit.coverTime<edit.start||edit.coverTime>edit.end))throw new Error('视频片段必须在源视频范围内且不超过 10 分钟，预览图必须在片段内');
  if(media.kind==='video'&&!isSupportedHardware(target.Hardware))throw new Error('目前仅支持 TimsFrame（510/511/512）和 AstroToo（530）');
}
export function filters(edit:Edit,target:Pick<Target,'width'|'height'>,kind:Media['kind']='video'):string {
  const rotate=edit.rotation===90?['transpose=1']:edit.rotation===180?['hflip','vflip']:edit.rotation===270?['transpose=2']:[];
  const size=outputDimensions(edit,target,kind);
  return [...rotate,`crop=${edit.width}:${edit.height}:${edit.x}:${edit.y}:exact=1`,`scale=${size.width}:${size.height}:flags=lanczos`,'setsar=1'].join(',');
}
export function videoEncoding(target:Pick<Target,'Hardware'|'maxUploadBytes'>,duration:number):{fps:number;args:string[]} {
  if(target.Hardware===530)return {fps:30000/1001,args:['-an','-c:v','libx264','-profile:v','baseline','-level:v','2.1','-pix_fmt','yuv420p','-r','30000/1001','-b:v','1000k','-maxrate','1500k','-bufsize','3000k','-g','60']};
  if(!isSupportedHardware(target.Hardware))throw new Error('目前仅支持 TimsFrame（510/511/512）和 AstroToo（530）');
  // Ai1.mp4: HEVC Main/Level 4, hvc1, 30 fps, BT.709 limited range,
  // ~9.6 Mbps (12 Mbps nominal), AAC-LC 44.1 kHz stereo. Reserve room
  // for audio, MP4 overhead and the mandatory cover within the device limit.
  const budget=Math.floor((Math.min(target.maxUploadBytes,MAX_UPLOAD_BYTES)*.94*8/duration-128000)/1000);
  if(!Number.isFinite(budget)||budget<64)throw new Error('视频和预览图超过设备上传大小上限，请缩短片段或升级固件');
  const peak=Math.min(12000,budget),average=Math.min(10000,peak);
  return {fps:30,args:['-map','0:a:0?','-c:a','aac','-profile:a','aac_low','-ar','44100','-ac','2','-b:a','128k','-c:v','libx265','-preset','fast','-profile:v','main','-tag:v','hvc1','-pix_fmt','yuv420p','-r','30','-b:v',`${average}k`,'-maxrate',`${peak}k`,'-bufsize',`${peak*2}k`,'-g','60','-x265-params','level-idc=4:high-tier=0:bframes=1:ref=1:pools=4:frame-threads=2:log-level=error','-color_range','tv','-colorspace','bt709','-color_trc','bt709','-color_primaries','bt709']};
}
export async function convert(ffmpeg:string,ffprobe:string,media:Media,edit:Edit,target:Target,directory:string,signal:AbortSignal,progress:(n:number)=>void):Promise<{file:string;cover?:string;width:number;height:number}> {
  validateEdit(media,edit,target);await mkdir(directory,{recursive:true});
  const stem=`${target.DeviceId||target.Hardware}-${Date.now()}`;
  const file=path.join(directory,stem+(media.kind==='video'?'.mp4':'.webp'));
  const common=['-y','-hide_banner','-loglevel','error'];
  // Match the app's WebP photo path; device JPEG thumbnail conversion can mix
  // RGB565 output with the BGRA input expected by WebPEncodeBGRA.
  if(media.kind==='photo')await run(ffmpeg,[...common,'-i',media.path,'-vf',filters(edit,target,'photo'),'-frames:v','1','-c:v','libwebp','-quality','90','-preset','picture',file],signal);
  else{
    const duration=edit.end-edit.start,encoding=videoEncoding(target,duration);
    const vf=target.Hardware===530?filters(edit,target):filters(edit,target).replace(':flags=lanczos',':flags=lanczos:out_color_matrix=bt709:out_range=tv');
    await run(ffmpeg,[...common,'-ss',String(edit.start),'-i',media.path,'-t',String(duration),'-map','0:v:0','-vf',vf,...encoding.args,'-frames:v',String(Math.max(1,Math.floor(duration*encoding.fps))),'-movflags','+faststart','-progress','pipe:1',file],signal,text=>{const match=text.match(/out_time_us=(\d+)/);if(match)progress(Math.min(99,Number(match[1])/1000000/duration*100));});
  }
  const size=outputDimensions(edit,target,media.kind),output=await probe(ffprobe,file);if(output.width!==size.width||output.height!==size.height)throw new Error('输出尺寸校验失败');
  if(media.kind==='photo')return {file,width:output.width,height:output.height};
  const cover=path.join(directory,`preview-${stem}.webp`);
  await run(ffmpeg,[...common,'-ss',String(Math.min(edit.coverTime-edit.start,Math.max(0,output.duration-0.04))),'-i',file,'-frames:v','1','-c:v','libwebp','-quality','85',cover],signal);
  const coverInfo=await probe(ffprobe,cover);if(coverInfo.width!==size.width||coverInfo.height!==size.height||!coverInfo.size)throw new Error('视频预览图校验失败');
  return {file,cover,width:output.width,height:output.height};
}
