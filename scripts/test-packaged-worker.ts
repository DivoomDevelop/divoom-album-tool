import appPackage from '../package.json';
import {createServer} from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {editFromSettings} from '../src/importing';
async function main(){
 const output=resolve('artifacts/packaged-upload-'+Date.now());await mkdir(output,{recursive:true});
 const pack=resolve(process.env.DIVOOM_PACK_DIRECTORY??`release/DivoomAlbum-win-x64-v${appPackage.version}`),ffmpeg=join(process.env.DIVOOM_PACK_RESOURCES??pack,'bin','ffmpeg'+(process.platform==='win32'?'.exe':''));
 const image=join(output,'red.JPG'),video=join(output,'blue.mp4');
 execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','color=c=red:s=640x480','-frames:v','1',image],{windowsHide:true});
 execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','color=c=blue:s=360x640:r=30','-t','1','-c:v','libx264','-pix_fmt','yuv420p',video],{windowsHide:true});
 const jpeg=await readFile(image);await writeFile(image,Buffer.concat([jpeg.subarray(0,2),Buffer.from('ffe1002245786966000049492a0008000000010012010300010000000600000000000000','hex'),jpeg.subarray(2)]));
 const uploads:any[]=[],records:any[]=[];let storageFull=0;
 const server=createServer(async(req,res)=>{try{
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const body=Buffer.concat(chunks);let value:any={ReturnCode:0};
  if(req.url==='/upload'){
   assert.equal(Number(req.headers['content-length']),body.length);const text=body.toString('utf8'),start=text.indexOf('\r\n\r\n')+4,end=text.indexOf('\r\n--',start),metadata=JSON.parse(text.slice(start,end));assert.equal(metadata.PhotoTitle,'');assert.equal(metadata.Command,'Photo/LocalAddToAlbum');
   assert.ok(metadata.FileName.endsWith(uploads.length===0?'.webp':'.mp4'));if(uploads.length===1){assert.ok(metadata.PreviewFileName.endsWith('.webp'));assert.ok(text.includes('filename="'+metadata.PreviewFileName+'"'));}
   uploads.push(metadata);records.push({PhotoId:100+uploads.length,Time:Date.now()/1000,FileId:'/userdata/app_pic/'+(metadata.PreviewFileName||metadata.FileName),OriginalFileId:'/userdata/app_pic/'+metadata.FileName,MediaType:uploads.length===1?'photo':'video'});
  }else{const json=JSON.parse(body.toString());if(json.Command==='Device/GetStorageStatus')value.Full=storageFull;else if(json.Command==='Photo/GetLocalAlbumList')value.AlbumList=[{ClockId:100000,ClockName:'All',AlbumType:1},{ClockId:100001,ClockName:'Test',AlbumType:0}];else if(json.Command==='Photo/GetPhotoList')value.PhotoList=records;else throw Error('Unexpected request '+json.Command);}
  res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(value));
 }catch(error){res.writeHead(500).end(JSON.stringify({ReturnCode:1,ReturnMessage:String(error)}));}});
 await new Promise<void>((ok,fail)=>{server.once('error',fail);server.listen(9000,'127.0.0.1',ok);});
 const child=spawn(join(pack,'timesframe-worker'+(process.platform==='win32'?'.exe':'')),[join(process.env.DIVOOM_PACK_RESOURCES??pack,'worker.cjs'),join(output,'data'),join(process.env.DIVOOM_PACK_RESOURCES??pack,'bin')],{windowsHide:true,stdio:['pipe','pipe','pipe']});let next=0,stderr='';const pending=new Map<number,any>();child.stderr.on('data',x=>stderr+=x);createInterface({input:child.stdout}).on('line',line=>{const value=JSON.parse(line),reply=pending.get(value.id);if(reply){pending.delete(value.id);value.error?reply.reject(Error(value.error)):reply.resolve(value.result);}});
 const rpc=(method:string,...args:any[])=>new Promise<any>((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,method,args})+'\n');});
 try{
 const target={DeviceId:123456789,Hardware:511,DeviceName:'Fixture',DevicePrivateIP:'127.0.0.1',width:800,height:1280,port:9000,apiPath:'/divoom_api',maxUploadBytes:104857600,maxVideoSeconds:600},album={ClockId:100001,ClockName:'Test',AlbumType:0};
 storageFull=1;assert.equal((await rpc('storage',target)).full,true);const blockedMedia=(await rpc('import',[image])).media[0];await assert.rejects(rpc('enqueueBatch',target,album,[editFromSettings(blockedMedia,target,{fit:'width',rotation:0,zoom:1,centerX:.5,centerY:.5})],'fixture-full'),/DEVICE_STORAGE_FULL/);assert.equal((await rpc('jobs')).length,0);assert.equal(uploads.length,0);storageFull=0;assert.equal((await rpc('storage',target)).full,false);
 for(const source of [image,video]){const {media}=await rpc('import',[source]);assert.equal(media.length,1);await rpc('enqueueBatch',target,album,[editFromSettings(media[0],target,{fit:source===image?'width':'crop',rotation:0,zoom:1,centerX:.5,centerY:.5})],'fixture-'+uploads.length);let jobs:any[]=[];for(let i=0;i<100;i++){jobs=await rpc('jobs');if(jobs.every(x=>['已完成','需检查'].includes(x.state)))break;await new Promise(r=>setTimeout(r,100));}assert.ok(jobs.every(x=>x.state==='已完成'),JSON.stringify(jobs));}
 assert.equal(uploads.length,2);for(const metadata of uploads)assert.equal(metadata.PhotoTitle,'');assert.deepEqual(uploads.map(m=>[m.PhotoWidth,m.PhotoHeight]),[[800,1066],[720,1280]]);
 const log=await readFile(join(output,'data/logs/diagnostics.jsonl'),'utf8'),events=log.trim().split('\n').map(line=>JSON.parse(line));assert.ok(events.some(x=>x.event==='worker.start'));assert.ok(events.some(x=>x.event==='command.response'&&x.details.Command==='Photo/GetLocalAlbumList'));assert.ok(events.some(x=>x.event==='job.completed'));assert.ok(!log.includes('data:image/'));
 await writeFile(join(output,'report.json'),JSON.stringify({result:'PASS',checks:['packaged executable worker','Device/GetStorageStatus Full=1 blocks enqueue; Full=0 restores upload','EXIF portrait WebP 800x1066, matching multipart dimensions','HEVC MP4 and WebP preview upload preserve source aspect at 720x1280','photo and video PhotoTitle empty on actual HTTP wire','target and all-album confirmation'],uploads},null,2));console.log('PASS: '+output);
 }finally{child.stdin.end();await new Promise<void>(r=>child.once('exit',()=>r()));server.close();assert.equal(stderr,'');}
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
