import test from 'node:test';
import assert from 'node:assert/strict';
import {storageStatus,requireStorageSpace} from '../backend/storage';
import type {Target} from '../src/shared';
const target:Target={DeviceId:1,Hardware:511,DeviceName:'Fixture',DevicePrivateIP:'127.0.0.1',port:9000,apiPath:'/divoom_api',width:800,height:1280,maxUploadBytes:104857600,maxVideoSeconds:600};
test('GET_STORAGE_STATUS uses Device/GetStorageStatus and Full 0/1 exclusively',async()=>{
 for(const [Full,expected] of [[0,false],[1,true],[undefined,undefined],[-1,undefined],[2,undefined],['1',undefined],[null,undefined],[true,undefined]] as const){
  let calls=0;const send=async(t:unknown,command:string,fields?:unknown)=>{calls++;assert.equal(t,target);assert.equal(command,'Device/GetStorageStatus');assert.deepEqual(fields,{});return {ReturnCode:0,Full};};
  assert.equal((await storageStatus(target,send)).full,expected);assert.equal(calls,1);
  if(expected===true)await assert.rejects(requireStorageSpace(target,send),/DEVICE_STORAGE_FULL/);else await assert.doesNotReject(requireStorageSpace(target,send));
 }
});
test('unsupported storage command stays unknown and never masquerades as full or zero free space',async()=>{
 const send=async()=>{throw Error('Unsupported');};assert.deepEqual(await storageStatus(target,send),{});await assert.doesNotReject(requireStorageSpace(target,send));
 const status=await storageStatus(target,async()=>({Full:0,FreeBytes:-1,TotalBytes:'unknown'}));assert.equal(status.full,false);assert.equal(status.freeBytes,undefined);assert.equal(status.totalBytes,undefined);
});
