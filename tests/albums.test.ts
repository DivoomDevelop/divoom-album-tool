import test from 'node:test';
import assert from 'node:assert/strict';
import { addPhotosToAlbum } from '../backend/albums';
import type { Album, Photo, Target } from '../src/shared';
const target:Target={DeviceId:11,Hardware:530,cacheIdentity:'id:11',DeviceName:'Test',DevicePrivateIP:'127.0.0.1',port:9000,apiPath:'/divoom_api',width:480,height:480,maxUploadBytes:536870912,maxVideoSeconds:1800};
const source:Album={ClockId:100001,ClockName:'Source',AlbumType:1},destination:Album={ClockId:100002,ClockName:'Destination',AlbumType:0};
const photo=(id:number):Photo=>({PhotoId:id,Time:id,FileId:`/userdata/${id}.webp`});

test('album copy uses ToClockId, batches at 50, deduplicates IDs and preserves the source',async()=>{
  const originals=Array.from({length:121},(_,i)=>photo(i+1)),copied=[originals[0]],writes:any[]=[];let invalidations=0;
  const transport={albums:async()=>[source,destination],photos:async(_:Target,id:number,start:number)=>(id===source.ClockId?originals:copied).slice(start-1,start+49),command:async(_:Target,name:string,fields:Record<string,unknown>)=>{writes.push({name,...fields});copied.push(...(fields.PhotoList as number[]).map(photo));}};
  await addPhotosToAlbum(target,source.ClockId,destination.ClockId,[...originals.map(p=>p.PhotoId),1],async()=>{invalidations++;},transport);
  assert.deepEqual(writes.map(w=>w.PhotoList.length),[50,50,20]);assert.equal(invalidations,1);assert.equal(originals.length,121);assert.equal(copied.length,121);
  for(const write of writes){assert.equal(write.name,'Photo/DevicePhotoToAlbum');assert.equal(write.ToClockId,destination.ClockId);assert.equal(write.UserId,1);assert.equal(write.ClockId,undefined);}
  await addPhotosToAlbum(target,source.ClockId,destination.ClockId,originals.map(p=>p.PhotoId),async()=>{invalidations++;},transport);
  assert.equal(writes.length,3,'repeating add inserted duplicate album references');
});
test('invalid, same, system, stale or empty destinations/selections cause zero writes',async()=>{
  let writes=0;const transport={albums:async()=>[source,destination],photos:async()=>[photo(1)],command:async()=>{writes++;}};
  for(const [from,to,ids] of [[source.ClockId,source.ClockId,[1]],[source.ClockId,999,[1]],[destination.ClockId,source.ClockId,[1]],[source.ClockId,999999,[1]],[999999,destination.ClockId,[1]],[source.ClockId,destination.ClockId,[2]],[source.ClockId,destination.ClockId,[]],[source.ClockId,destination.ClockId,[NaN]],[source.ClockId,destination.ClockId,[1.5]]] as [number,number,number[]][]){
    await assert.rejects(addPhotosToAlbum(target,from,to,ids,async()=>{},transport));
  }
  assert.equal(writes,0);
});
test('partial command failure invalidates cached lists and never automatically replays a write',async()=>{
  const originals=Array.from({length:51},(_,i)=>photo(i+1));let writes=0,invalidations=0;
  const transport={albums:async()=>[source,destination],photos:async(_:Target,id:number,start:number)=>id===source.ClockId?originals.slice(start-1,start+49):[],command:async()=>{writes++;if(writes===2)throw Error('busy');}};
  await assert.rejects(addPhotosToAlbum(target,source.ClockId,destination.ClockId,originals.map(p=>p.PhotoId),async()=>{invalidations++;},transport),/busy/);
  assert.equal(writes,2);assert.equal(invalidations,1);
});
test('device acknowledgement is followed by read-only destination confirmation',async()=>{
  let destinationReads=0,writes=0;
  const transport={albums:async()=>[source,destination],photos:async(_:Target,id:number)=>id===source.ClockId?[photo(1)]:(++destinationReads>=3?[photo(1)]:[]),command:async()=>{writes++;}};
  await addPhotosToAlbum(target,source.ClockId,destination.ClockId,[1],async()=>{},transport);
  assert.equal(writes,1);assert.equal(destinationReads,3);
});
