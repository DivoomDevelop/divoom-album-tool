/** Encode the user's reference through production profiles, inspect and fully decode outputs. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { convert, probe, run, validateEdit } from '../backend/media';
import { editFromSettings, outputDimensions } from '../src/importing';
import { MAX_VIDEO_SECONDS, type Media, type Target } from '../src/shared';

async function main(){
  const source='Z:/allwinner/tina_t113_v5.0/platform/thirdparty/gui/lvgl-8/divoom_app/aw_res/default_pic/Ai1.mp4';
  const ffmpeg=resolve('vendor/ffmpeg.exe'),ffprobe=resolve('vendor/ffprobe.exe'),directory=resolve(`artifacts/video-profiles-${Date.now()}`);
  await mkdir(directory,{recursive:true});
  const digest=async()=>createHash('sha256').update(await readFile(source)).digest('hex'),before=await digest();
  const inspect=async(file:string)=>JSON.parse(await run(ffprobe,['-v','error','-show_streams','-show_format','-of','json',file]));
  const reference=await inspect(source),reports=[];
  assert.equal(reference.streams[0].codec_name,'hevc');assert.equal(MAX_VIDEO_SECONDS,600);
  const silent=join(directory,'no-audio.mp4');
  await run(ffmpeg,['-y','-v','error','-i',source,'-t','2','-map','0:v:0','-c','copy',silent]);
  for(const [Hardware,width,height] of [[510,800,1280],[511,480,480],[512,1280,800],[530,480,480]]){
    const path=Hardware===511?silent:source,media:Media={...await probe(ffprobe,path),id:'profile',name:'Ai1.mp4',path,preview:''};
    const target:Target={DeviceId:Hardware,Hardware,DeviceName:'Profile test',DevicePrivateIP:'127.0.0.1',port:9000,apiPath:'/divoom_api',width,height,maxUploadBytes:536870912,maxVideoSeconds:1800};
    const edit={...editFromSettings(media,target),end:2,coverTime:1};
    assert.throws(()=>validateEdit({...media,duration:601},{...edit,end:600.1},target),/10 分钟/);
    const output=await convert(ffmpeg,ffprobe,media,edit,target,join(directory,String(Hardware)),new AbortController().signal,()=>{});
    assert.ok(output.cover);const metadata=await inspect(output.file),video=metadata.streams.find((s:any)=>s.codec_type==='video'),audio=metadata.streams.find((s:any)=>s.codec_type==='audio');
    assert.equal(video.codec_name,Hardware===530?'h264':'hevc');assert.equal(video.pix_fmt,'yuv420p');
    const size=outputDimensions(edit,target,'video');assert.equal(video.width,size.width);assert.equal(video.height,size.height);assert.ok(Math.abs(Number(video.duration)-2)<.06);
    if(Hardware!==530){
      assert.equal(video.profile,'Main');assert.equal(video.codec_tag_string,'hvc1');assert.equal(video.level,120);assert.equal(video.r_frame_rate,'30/1');
      for(const key of ['color_space','color_transfer','color_primaries'])assert.equal(video[key],'bt709');assert.equal(video.color_range,'tv');
      if(Hardware===511)assert.equal(audio,undefined);else{assert.equal(audio.codec_name,'aac');assert.equal(audio.profile,'LC');assert.equal(audio.sample_rate,'44100');assert.equal(audio.channels,2);}
    }else{assert.match(video.profile,/Baseline/);assert.equal(video.level,21);assert.equal(audio,undefined);}
    const cover=await probe(ffprobe,output.cover!);assert.equal(cover.width,size.width);assert.equal(cover.height,size.height);assert.ok(cover.size>0);
    await run(ffmpeg,['-v','error','-xerror','-i',output.file,'-f','null','-']);
    reports.push({Hardware,output,video,audio,cover,decode:'PASS'});
  }
  assert.equal(await digest(),before);
  const report={result:'PASS',limitSeconds:MAX_VIDEO_SECONDS,source,sourceSha256:before,reference,outputs:reports,physicalTimesFrameTested:false};
  await writeFile(join(directory,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({result:report.result,directory,models:reports.map(r=>r.Hardware)}));
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
