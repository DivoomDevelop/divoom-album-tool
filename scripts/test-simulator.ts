import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { connect, albums, photos, command, filePath, request, upload } from '../backend/transport';
import { convert, probe, run } from '../backend/media';
import type { Media, Target } from '../src/shared';

async function main(){
  const require=createRequire(import.meta.url);const ffmpeg=require('ffmpeg-static') as string,ffprobe=require('@ffprobe-installer/ffprobe').path as string;
  const output=resolve('artifacts/simulator');await mkdir(output,{recursive:true});
  const source=process.env.TIMESFRAME_TEST_VIDEO??'C:/Users/Administrator/Desktop/400000012-1792157474503-0.mp4';
  const target=await connect({DevicePrivateIP:process.env.TIMESFRAME_SIM_IP??'127.0.0.1',DeviceName:'AstroToo 仿真'});
  assert.equal(target.width,480);assert.equal(target.height,480);assert.equal(target.maxVideoSeconds,600);assert.ok(target.maxUploadBytes>=512*1024*1024);
  const before=await albums(target);assert.ok(before.length>0);
  const clockId=900000000+Date.now()%1000000;
  const testAlbum={ClockId:clockId,ClockName:'TimesFrame 验收 '+Date.now(),AlbumType:0};
  await command(target,'Photo/NewAlbum',testAlbum).catch(async()=>{if(!(await albums(target)).some(a=>a.ClockId===clockId))throw new Error('无法建立隔离验收相簿');});
  const info=await probe(ffprobe,source);const media:Media={id:'fixture',path:source,name:basename(source),...info,preview:''};
  const entries:string[]=[];const uploaded:number[]=[];
  try{
    const long=process.argv.includes('--long');
    let input=media;
    if(long){
      const looped=join(output,'source-10min.mp4');
      await run(ffmpeg,['-y','-v','error','-stream_loop','-1','-i',source,'-t','600','-an','-c:v','copy',looped]);
      input={...media,path:looped,...await probe(ffprobe,looped)};
    }
    const end=long?600:2;
    console.log(`Converting ${end}s video and mandatory WebP cover`);
    const converted=await convert(ffmpeg,ffprobe,input,{mediaId:'fixture',x:0,y:0,width:480,height:480,rotation:0,start:0,end,coverTime:long?1:.5},target,join(output,long?'long':'short'),new AbortController().signal,()=>{});
    assert.ok(converted.cover);const finalInfo=await probe(ffprobe,converted.file);assert.ok(Math.abs(finalInfo.duration-end)<.1);
    const stream=JSON.parse(await run(ffprobe,['-v','error','-show_streams','-of','json',converted.file])).streams[0];
    assert.equal(stream.codec_name,'h264');assert.match(stream.profile,/Baseline/);assert.equal(stream.level,21);assert.equal(stream.pix_fmt,'yuv420p');assert.equal(stream.width,480);assert.equal(stream.height,480);
    const now=Date.now();const metadata={Command:'Photo/LocalAddToAlbum',DeviceId:target.DeviceId,ClockId:clockId,UserId:1,PhotoX:0,PhotoY:0,PhotoWidth:480,PhotoHeight:480,PhotoTotalCnt:1,PhotoIndex:0,PhotoFlag:now%2147483647,SendTime:now,TakingTime:now,FileName:basename(converted.file),PreviewFileName:basename(converted.cover!),PhotoTitle:'TimesFrame 测试视频',ParentClockId:0,ParentItemId:'0'};
    console.log('Uploading MP4 + cover to real simulator HTTP handler');
    await upload(target,metadata,[converted.file,converted.cover!],new AbortController().signal,()=>{});
    let photo;
    for(let i=0;i<30;i++){const list=await photos(target,clockId,1);photo=list.find(p=>p.OriginalFileId?.endsWith('/'+basename(converted.file)));if(photo)break;await new Promise(r=>setTimeout(r,500));}
    assert.ok(photo,'uploaded video must appear in local album');uploaded.push(photo.PhotoId);assert.equal(photo.MediaType,'video');
    const cover=await request(target,filePath(photo.FileId),'GET');assert.ok(cover.data.length>0);assert.ok(!cover.data.equals((await readFile(converted.file)).subarray(0,cover.data.length)));
    assert.equal((await request(target,filePath(photo.OriginalFileId!),'HEAD')).headers['content-length'],String(finalInfo.size));
    entries.push('hardware dimensions + capabilities','local album list','video encoding and duration','video + cover multipart upload','photo list original path and media type','HTTP preview + original HEAD');
    await command(target,'Photo/RemovePhotoFromAlbum',{ClockId:clockId,PhotoList:[photo.PhotoId],ParentClockId:0,ParentItemId:'0'});
    assert.ok(!(await photos(target,clockId,1)).some(p=>p.PhotoId===photo!.PhotoId));
    await request(target,filePath(photo.OriginalFileId!),'HEAD');entries.push('remove album reference preserves original');
    const all=before.find(a=>a.AlbumType===1)!;
    await command(target,'Photo/DeletePhoto',{ClockId:all.ClockId,PhotoList:[photo.PhotoId],ParentClockId:0,ParentItemId:'0'});
    let deleted=false;
    for(let i=0;i<50;i++){try{await request(target,filePath(photo.OriginalFileId!),'HEAD');}catch{deleted=true;break;}await new Promise(r=>setTimeout(r,100));}
    assert.ok(deleted,'background deletion must remove original within 5 seconds');entries.push('delete removes original');
    const report={time:new Date().toISOString(),target,video:finalInfo,checks:entries,result:'PASS'};
    await writeFile(join(output,long?'10min-report.json':'report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  }finally{
    await command(target,'Photo/DeleteAlbum',{ClockId:clockId}).catch(()=>{});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
