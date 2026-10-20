import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { albums, command, connect, endpoint, filePath, upload } from '../backend/transport';
import { filters, validateEdit, videoEncoding } from '../backend/media';
import { MAX_UPLOAD_BYTES, deviceTitle, type Edit, type Media, type Target } from '../src/shared';
const target:Target={DeviceId:123,Hardware:530,DeviceName:'Test',DevicePrivateIP:'127.0.0.1',width:480,height:480,port:9000,apiPath:'/divoom_api',maxUploadBytes:MAX_UPLOAD_BYTES,maxVideoSeconds:1800};
const media:Media={id:'1',name:'video.mp4',path:'video.mp4',width:1920,height:1080,duration:1801,size:1,kind:'video',preview:''};
const edit:Edit={mediaId:'1',x:0,y:0,width:1920,height:1080,rotation:0,start:0,end:600,coverTime:0};
test('device-specific title follows hardware selection',()=>{for(const h of [510,511,512])assert.equal(deviceTitle(h),'TimsFrame');assert.equal(deviceTitle(530),'AstroToo');assert.equal(deviceTitle(),'Divoom 相簿');assert.equal(deviceTitle(999),'Divoom 相簿');});
test('10-minute boundary and invalid trim/crop/cover are enforced',()=>{
  assert.doesNotThrow(()=>validateEdit(media,edit,target));
  for(const change of [{end:600.1},{start:-1},{end:0},{coverTime:600.1},{width:2000},{x:NaN},{rotation:45}])assert.throws(()=>validateEdit(media,{...edit,...change},target));
  assert.match(filters(edit,target),/scale=480:270/);
  assert.match(filters({...edit,rotation:90},target),/^transpose=1/);
});
test('all supported models enforce 600 seconds even with stale higher device capabilities',()=>{
  for(const Hardware of [510,511,512,530]){
    assert.doesNotThrow(()=>validateEdit(media,{...edit,start:100,end:700,coverTime:100},{...target,Hardware}));
    assert.throws(()=>validateEdit(media,{...edit,start:100,end:700.1,coverTime:100},{...target,Hardware}),/10 分钟/);
    assert.throws(()=>validateEdit(media,edit,{...target,Hardware,maxVideoSeconds:599}));
  }
  assert.throws(()=>validateEdit(media,edit,{...target,Hardware:999}));
});
test('HEVC long-clip bitrate leaves space for audio, cover and upload overhead',()=>{
  for(const Hardware of [510,511,512])for(const maxUploadBytes of [100*1024*1024,536870912]){
    const {fps,args}=videoEncoding({Hardware,maxUploadBytes},600),peak=parseInt(args[args.indexOf('-maxrate')+1])*1000;
    assert.equal(fps,30);assert.ok((peak+128000)*600/8<maxUploadBytes*.95);
    assert.equal(args[args.indexOf('-c:v')+1],'libx265');assert.equal(args[args.indexOf('-tag:v')+1],'hvc1');
  }
});
test('route selection and device paths',()=>{
  assert.deepEqual(endpoint({...target,Hardware:400}),{port:80,apiPath:'/post'});
  assert.deepEqual(endpoint(target),{port:9000,apiPath:'/divoom_api'});
  for(const path of ['/userdata/../secret','http://host/file','/userdata/a%2fb','/userdata/a?x'])assert.throws(()=>filePath(path));
  assert.equal(filePath('/userdata/app_pic/123.mp4'),'/userdata/app_pic/123.mp4');
});
test('hardware request is first and dimensions come from device',async()=>{
  const commands:string[]=[];
  const t=await connect(target,async(_,command)=>{commands.push(command);return {ReturnCode:0,Hardware:530,CanvasWidth:640,CanvasHeight:360,PhotoUploadMaxBytes:MAX_UPLOAD_BYTES};});
  assert.equal(t.width,640);assert.equal(t.height,360);assert.equal(commands[0],'Device/GetHardwareVersion');
});
test('multipart includes JSON first and MP4 + preview with exact byte lengths',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'timesframe-test-'));const video=join(directory,'123.mp4'),cover=join(directory,'preview-123.webp');
  await writeFile(video,Buffer.from([0,1,2,13,10,255]));await writeFile(cover,'cover bytes');
  const server=createServer((req,res)=>{const chunks:Buffer[]=[];req.on('data',d=>chunks.push(d));req.on('end',()=>{try{const raw=Buffer.concat(chunks);assert.equal(raw.length,Number(req.headers['content-length']));const text=raw.toString('latin1');assert.ok(text.indexOf('name="json"')<text.indexOf('filename="123.mp4"'));assert.match(text,/filename="preview-123.webp"/);assert.match(text,/Content-Length: 6\r\n/);res.end('{"ReturnCode":0}');}catch(e){res.statusCode=500;res.end(String(e));}});});
  await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));
  try{const port=(server.address() as any).port;await upload({...target,port},{Command:'Photo/LocalAddToAlbum',PreviewFileName:'preview-123.webp'},[video,cover],new AbortController().signal,()=>{});}
  finally{await new Promise<void>(ok=>server.close(()=>ok()));await rm(directory,{recursive:true,force:true});}
});
test('nonzero business code and missing success code fail',async()=>{
  let calls=0;
  const server=createServer((req,res)=>{req.resume();req.on('end',()=>res.end(calls++===0?'{"ReturnCode":1,"ReturnMessage":"busy"}':'{"ReturnMessage":"missing code"}'));});
  await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));
  try{await assert.rejects(command({...target,port:(server.address() as any).port},'Photo/DeletePhoto'),/busy/);await assert.rejects(command({...target,port:(server.address() as any).port},'Photo/DeletePhoto'),/missing code/);}
  finally{await new Promise<void>(ok=>server.close(()=>ok()));}
});

test('legacy album errors explain missing firmware support and do not hide empty or other responses',async()=>{
  const replies=[{ReturnCode:1,ReturnMessage:'Only accept JSON parameters'},{ReturnCode:0,AlbumList:[]},{ReturnCode:1,ReturnMessage:'busy'},{ReturnCode:0}];
  const server=createServer((req,res)=>{let body='';req.on('data',data=>body+=data);req.on('end',()=>{assert.equal(JSON.parse(body).Command,'Photo/GetLocalAlbumList');res.end(JSON.stringify(replies.shift()));});});
  await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));
  const frame={...target,Hardware:511,port:(server.address() as any).port};
  try{
    await assert.rejects(albums(frame),/固件尚未提供本地相簿列表接口/);
    assert.deepEqual(await albums(frame),[]);
    await assert.rejects(albums(frame),/^Error: busy$/);
    await assert.rejects(albums(frame),/固件尚未提供本地相簿列表接口/);
    assert.equal(replies.length,0);
  }finally{await new Promise<void>(ok=>server.close(()=>ok()));}
});
