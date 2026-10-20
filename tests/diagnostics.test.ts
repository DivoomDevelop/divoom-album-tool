import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createServer} from 'node:http';
import {DiagnosticLog,initializeDiagnostics,diagnosticContext} from '../backend/diagnostics';
import {command} from '../backend/transport';
import {DeviceCache} from '../backend/cache';
import type {Target} from '../src/shared';

async function directory(t:any){const path=await mkdtemp(join(tmpdir(),'divoom-diagnostics-'));t.after(async()=>{assert.ok(resolve(path).startsWith(resolve(tmpdir())+sep));await rm(path,{recursive:true,force:true});});return path;}

test('diagnostics survive restart, redact nested credentials/media/errors, and never break operations on a blocked path',async t=>{
 const root=await directory(t),first=new DiagnosticLog(root);
 first.write('first',{LocalToken:92736451,nested:{authorization:'private-auth',Password:'private-pass'},preview:'data:image/jpeg;base64,PRIVATE_IMAGE',raw:'{"LocalToken":92736451,"password":"private-pass"}',url:'http://127.0.0.1:1234/private-media-token/file',error:Error('LocalToken=92736451'),binary:Buffer.from('PRIVATE_IMAGE')});
 new DiagnosticLog(root).write('second',{count:0});
 const raw=await readFile(first.file,'utf8'),lines=raw.trim().split('\n').map(s=>JSON.parse(s));assert.deepEqual(lines.map(x=>x.event),['first','second']);assert.notEqual(lines[0].session,lines[1].session);
 for(const secret of ['92736451','private-auth','private-pass','PRIVATE_IMAGE','private-media-token'])assert.ok(!raw.includes(secret),secret);
 const blocked=join(root,'blocked');await writeFile(blocked,'file');assert.doesNotThrow(()=>new DiagnosticLog(blocked).write('must-not-throw'));
});

test('diagnostic rotation keeps a bounded, parseable recent history',async t=>{
 const root=await directory(t),log=new DiagnosticLog(root,1600,2);
 for(let i=0;i<30;i++)log.write('event',{i,padding:'x'.repeat(150)});
 const names=await readdir(root);assert.equal(names.length,3);
 for(const name of names){assert.ok((await stat(join(root,name))).size<=1600);for(const line of (await readFile(join(root,name),'utf8')).trim().split('\n'))JSON.parse(line);}
 assert.ok((await readFile(log.file,'utf8')).includes('"i":29'));
});

test('logs distinguish a device empty response, persistent empty cache hit, forced refresh, and business/JSON errors with request correlation',async t=>{
 const root=await directory(t);initializeDiagnostics(join(root,'logs'),{version:'test'});let populated=false,reads=0;
 const server=createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);const request=JSON.parse(Buffer.concat(chunks).toString());res.setHeader('Content-Type','application/json');if(request.Command==='BadJson'){res.end('{"LocalToken":92736451,broken');return;}if(request.Command==='Reject'){res.end(JSON.stringify({ReturnCode:7,ReturnMessage:'rejected',LocalToken:92736451}));return;}reads++;res.end(JSON.stringify({ReturnCode:0,AlbumList:populated?[{ClockId:100000,ClockName:'All',AlbumType:1}]:[],LocalToken:92736451}));});
 await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));t.after(()=>new Promise<void>(ok=>server.close(()=>ok())));
 const target:Target={DeviceId:300428288,Hardware:530,DeviceName:'Fixture',DevicePrivateIP:'127.0.0.1',port:(server.address() as any).port,apiPath:'/divoom_api',width:480,height:480,maxUploadBytes:104857600,maxVideoSeconds:600,cacheIdentity:'id:300428288',localToken:92736451};
 const cache=new DeviceCache(join(root,'cache')),load=async()=>{const result=await command(target,'Photo/GetLocalAlbumList');return result.AlbumList;};
 await diagnosticContext(10,'albums',async()=>{
  assert.deepEqual(await cache.json(target,'albums',load,true),[]);populated=true;
  assert.deepEqual(await new DeviceCache(join(root,'cache')).json(target,'albums',load,true),[]);assert.equal(reads,1);
  await cache.invalidateLists(target);assert.equal((await cache.json<any[]>(target,'albums',load,true)).length,1);assert.equal(reads,2);
  await assert.rejects(command(target,'Reject'),/rejected/);await assert.rejects(command(target,'BadJson'),/无效 JSON/);
 });
 const raw=await readFile(join(root,'logs/diagnostics.jsonl'),'utf8'),events=raw.trim().split('\n').map(x=>JSON.parse(x));assert.ok(!raw.includes('92736451'));
 assert.ok(events.some(e=>e.event==='command.response'&&e.details.response.AlbumList?.length===0));
 assert.ok(events.some(e=>e.event==='cache.json.hit'&&e.details.count===0&&e.details.target.DeviceId===target.DeviceId));
 assert.ok(events.some(e=>e.event==='cache.json.stored'&&e.details.count===1));assert.equal(events.filter(e=>e.event==='command.error').length,2);
 assert.ok(events.filter(e=>e.event==='command.start').every(e=>e.rpcId===10&&e.method==='albums'));
});
