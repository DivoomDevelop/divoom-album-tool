import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeviceCache, deviceCacheKey } from '../backend/cache';
import type { Target } from '../src/shared';
const target:Target={DeviceId:11,Hardware:530,DeviceName:'A',DevicePrivateIP:'127.0.0.1',port:9000,apiPath:'/divoom_api',width:480,height:480,maxUploadBytes:536870912,maxVideoSeconds:1800};
test('persistent cache is isolated by device, not IP or photo ID',async()=>{
  const root=await mkdtemp(join(tmpdir(),'divoom-cache-'));
  try{
    const cache=new DeviceCache(root),other={...target,DeviceId:12};let calls=0;
    assert.notEqual(deviceCacheKey(target),deviceCacheKey(other));
    assert.equal(deviceCacheKey({...target,cacheIdentity:'mac:one'}),deviceCacheKey({...target,cacheIdentity:'mac:two'}),'device-list ID is the primary identity');
    assert.equal(await cache.json(target,'thumb:1',async()=>{calls++;return 'A';}),'A');
    assert.equal(await cache.json(other,'thumb:1',async()=>{calls++;return 'B';}),'B');
    const restarted=new DeviceCache(root);
    assert.equal(await restarted.json({...target,DevicePrivateIP:'127.0.0.2'},'thumb:1',async()=>{throw Error('must not use network');}),'A');
    assert.equal(await restarted.json(other,'thumb:1',async()=>{throw Error('must not use network');}),'B');assert.equal(calls,2);
    assert.notEqual(deviceCacheKey({...target,DeviceId:0,cacheIdentity:'session:A'}),deviceCacheKey({...target,DeviceId:0,cacheIdentity:'session:B'}));
    assert.throws(()=>deviceCacheKey({...target,DeviceId:0}));
  }finally{await rm(root,{recursive:true,force:true});}
});
test('list invalidation survives restart and a late stale read cannot overwrite it',async()=>{
  const root=await mkdtemp(join(tmpdir(),'divoom-cache-'));
  try{
    const cache=new DeviceCache(root),other={...target,DeviceId:12};
    await cache.json(other,'list',async()=>['other'],true);await cache.json(target,'thumb',async()=>'image');
    let release!:(value:string[])=>void;const blocked=new Promise<string[]>(resolve=>{release=resolve;});
    const old=cache.json(target,'list',()=>blocked,true);
    // Let the cache miss reach its loader before invalidation.
    await new Promise(resolve=>setTimeout(resolve,20));await cache.invalidateLists(target);
    assert.deepEqual(await cache.json(target,'list',async()=>['new'],true),['new']);
    release(['stale']);assert.deepEqual(await old,['stale']);
    const restarted=new DeviceCache(root);
    assert.deepEqual(await restarted.json(target,'list',async()=>{throw Error('network');},true),['new']);
    assert.deepEqual(await restarted.json(other,'list',async()=>{throw Error('network');},true),['other']);
    assert.equal(await restarted.json(target,'thumb',async()=>{throw Error('network');}),'image');
  }finally{await rm(root,{recursive:true,force:true});}
});
test('failed reads and partial downloads are not cached; duplicate downloads are shared',async()=>{
  const root=await mkdtemp(join(tmpdir(),'divoom-cache-'));
  try{
    const cache=new DeviceCache(root);let calls=0;
    await assert.rejects(cache.json(target,'bad',async()=>{throw Error('offline');}));
    assert.equal(await cache.json(target,'bad',async()=>'recovered'),'recovered');
    await assert.rejects(cache.file(target,'file','.mp4',async file=>{await writeFile(file,'partial');throw Error('reset');}));
    const loader=async(file:string)=>{calls++;await writeFile(file,'complete');};
    const [first,second]=await Promise.all([cache.file(target,'file','.mp4',loader),cache.file(target,'file','.mp4',loader)]);
    assert.equal(first,second);assert.equal(calls,1);assert.equal(await readFile(first,'utf8'),'complete');
    assert.ok(!(await readdir(join(root,deviceCacheKey(target)))).some(name=>name.endsWith('.partial')));
  }finally{await rm(root,{recursive:true,force:true});}
});
