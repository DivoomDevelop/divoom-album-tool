import type {StorageInfo,Target} from '../src/shared';
import {command} from './transport';
import {diagnostic} from './diagnostics';
/** DIVOOM_NET_COMM_DEVICE_GET_STORAGE_STATUS maps to this LAN command. Full is 0/1. */
export async function storageStatus(target:Target,send=command):Promise<Omit<StorageInfo,'photoCount'|'videoCount'>>{
 try{
  const response=await send(target,'Device/GetStorageStatus',{},AbortSignal.timeout(3000));
  const bytes=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:undefined;
  return {full:response.Full===1?true:response.Full===0?false:undefined,freeBytes:bytes(response.FreeBytes),totalBytes:bytes(response.TotalBytes)};
 }catch(error){diagnostic('storage.unavailable',{error},'warn');return {};}
}
export async function requireStorageSpace(target:Target,send=command):Promise<void>{
 if((await storageStatus(target,send)).full===true)throw Error('DEVICE_STORAGE_FULL');
}
