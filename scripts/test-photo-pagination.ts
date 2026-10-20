import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { albums, command, connect, filePath, photos, request, upload } from '../backend/transport';
import { convert, probe, run } from '../backend/media';
import type { Media } from '../src/shared';

async function main(){
  const require=createRequire(import.meta.url),ffmpeg=require('ffmpeg-static'),ffprobe=require('@ffprobe-installer/ffprobe').path;
  const target=await connect({DevicePrivateIP:'127.0.0.1',DeviceName:'AstroToo 仿真'});
  const folder=resolve('artifacts/simulator/photos');await mkdir(folder,{recursive:true});
  const source=join(folder,'landscape.jpg');
  await run(ffmpeg,['-y','-v','error','-i','C:/Users/Administrator/Desktop/400000012-1792157474503-0.mp4','-vf','scale=640:360','-frames:v','1',source]);
  const media:Media={id:'fixture',path:source,name:'landscape.jpg',preview:'',...await probe(ffprobe,source)};
  const converted=await convert(ffmpeg,ffprobe,media,{mediaId:media.id,x:0,y:140,width:360,height:360,rotation:90,start:0,end:0,coverTime:0},target,join(folder,'converted'),new AbortController().signal,()=>{});
  const info=await probe(ffprobe,converted.file);assert.equal(info.width,480);assert.equal(info.height,480);
  const clockId=910000000+Date.now()%1000000,now=Date.now(),flag=now%2147483647;
  await command(target,'Photo/NewAlbum',{ClockId:clockId,ClockName:'TimesFrame 分页验收 '+now});
  const uploaded:number[]=[];
  try{
    for(let i=0;i<51;i++){
      const file=join(folder,`timesframe-${now}-${i}.webp`);await copyFile(converted.file,file);
      await upload(target,{Command:'Photo/LocalAddToAlbum',ClockId:clockId,DeviceId:target.DeviceId,UserId:1,PhotoX:0,PhotoY:0,PhotoWidth:480,PhotoHeight:480,PhotoTotalCnt:51,PhotoIndex:i,PhotoFlag:flag,SendTime:now,TakingTime:now,FileName:basename(file),PreviewFileName:'',PhotoTitle:'分页测试',ParentClockId:0,ParentItemId:'0'},[file],new AbortController().signal,()=>{});
      if(i%10===0)console.log(`Uploaded photo ${i+1}/51`);
    }
    let first=await photos(target,clockId,1),second=await photos(target,clockId,51);
    for(let i=0;i<10&&first.length+second.length<51;i++){await new Promise(r=>setTimeout(r,300));first=await photos(target,clockId,1);second=await photos(target,clockId,51);}
    uploaded.push(...first.map(p=>p.PhotoId),...second.map(p=>p.PhotoId));
    assert.equal(first.length,50);assert.equal(second.length,1);assert.equal(new Set(uploaded).size,51);
    const other=(await albums(target)).find(a=>a.AlbumType===1)!;await photos(target,other.ClockId,1);
    assert.deepEqual((await photos(target,clockId,51)).map(p=>p.PhotoId),second.map(p=>p.PhotoId));
    assert.deepEqual((await photos(target,clockId,1)).map(p=>p.PhotoId),first.map(p=>p.PhotoId));
    const {data}=await request(target,filePath(first[0].FileId),'GET');assert.ok(data.length>0);
    const report={result:'PASS',photos:51,pageSizes:[50,1],uniqueIds:new Set(uploaded).size,checks:['JPEG rotation + crop to 480x480 WebP','51 same-timestamp uploads','stable page order','switch-album independent pagination','HTTP photo preview']};
    await writeFile(join(folder,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{
    for(let offset=0;offset<uploaded.length;offset+=50)await command(target,'Photo/DeletePhoto',{ClockId:clockId,PhotoList:uploaded.slice(offset,offset+50),ParentClockId:0,ParentItemId:'0'}).catch(()=>{});
    await command(target,'Photo/DeleteAlbum',{ClockId:clockId}).catch(()=>{});
  }
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
