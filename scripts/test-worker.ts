/** Exercise the exact bundled Tauri sidecar with a full 10-minute queue job. */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { command } from '../backend/transport';

async function main(){
  const child=spawn(process.execPath,['dist-backend/worker.cjs',resolve('artifacts/worker-test-data'),resolve('vendor')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const replies=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();let sequence=0,events=0;let stderr='';
  child.stderr.on('data',data=>stderr+=data);
  createInterface({input:child.stdout}).on('line',line=>{const value=JSON.parse(line);if(value.event==='jobs')events++;if(value.id){const reply=replies.get(value.id);if(reply){replies.delete(value.id);value.error?reply.reject(new Error(value.error)):reply.resolve(value.result);}}});
  const rpc=(method:string,...args:unknown[])=>new Promise<any>((resolve,reject)=>{const id=++sequence;replies.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,method,args})+'\n');});
  const timeout=setTimeout(()=>{child.kill();throw new Error('Worker integration timed out');},15*60*1000);
  let target:any,album:any,job:any;
  try{
    target=await rpc('connect',{DevicePrivateIP:'127.0.0.1',DeviceName:'AstroToo'});
    album={ClockId:920000000+Date.now()%1000000,ClockName:'Tauri Worker 10min '+Date.now(),AlbumType:0};
    await command(target,'Photo/NewAlbum',album);
    const {media,failures}=await rpc('import',[resolve('artifacts/simulator/source-10min.mp4')]);assert.equal(failures.length,0);assert.equal(media.length,1);
    // Also verify the authenticated local URL supports exact Range reads.
    const response=await fetch(media[0].path,{headers:{Range:'bytes=0-31'}});assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,32);
    await rpc('enqueue',target,album,{mediaId:media[0].id,x:0,y:0,width:480,height:480,rotation:0,start:0,end:600,coverTime:1});
    for(let attempt=0;attempt<420;attempt++){const jobs=await rpc('jobs');job=jobs[0];if(['已完成','需检查','已取消'].includes(job.state))break;if(attempt%10===0)console.log(`Worker ${job.state} ${Math.floor(job.progress)}%`);await new Promise(r=>setTimeout(r,1000));}
    assert.equal(job.state,'已完成',job.error);assert.ok(job.photoId>0);assert.equal(job.progress,100);assert.equal(stderr,'');
    const report={result:'PASS',runtime:'bundled Tauri worker',duration:600,photoId:job.photoId,progressEvents:events,checks:['stdio RPC','local media Range support','10-minute encode + mandatory cover','real simulator upload','confirmed photo ID','queue completion']};
    await mkdir('artifacts/simulator',{recursive:true});await writeFile('artifacts/simulator/worker-10min-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }finally{
    if(job?.photoId)await rpc('manage',target,album,[job.photoId],false).catch(()=>{});
    if(album)await command(target,'Photo/DeleteAlbum',{ClockId:album.ClockId}).catch(()=>{});
    child.stdin.end();clearTimeout(timeout);
  }
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
