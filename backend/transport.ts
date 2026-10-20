import http from 'node:http';
import { isIPv4 } from 'node:net';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MAX_UPLOAD_BYTES, MAX_VIDEO_SECONDS, isSupportedHardware, deviceTitle, type Album, type Device, type Photo, type Target } from '../src/shared';

const connections=new Map<string,Promise<void>>();
async function cacheIdentity(ip:string,hardware:number,id:number,mac?:string):Promise<string>{
  if(id>0)return `id:${id}`;
  if(mac&&/^(?:[0-9a-f]{2}[:-]?){6}$/i.test(mac))return 'mac:'+mac.replace(/[:-]/g,'').toLowerCase();
  try{
    const {stdout}=await promisify(execFile)('arp',process.platform==='win32'?['-a',ip]:['-n',ip],{windowsHide:true,timeout:3000,maxBuffer:32768});
    const line=stdout.split(/\r?\n/).find(line=>line.includes(ip)),address=line?.match(/(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i)?.[0];
    if(address&&!/^00[:-]00[:-]00[:-]00[:-]00[:-]00$|^ff[:-]ff[:-]ff[:-]ff[:-]ff[:-]ff$/i.test(address))return 'mac:'+address.replace(/[:-]/g,'').toLowerCase();
  }catch{}
  // Never share a persistent IP-only cache if an address is reassigned to another frame.
  return id>0?`id:${id}`:`session:${hardware}:${randomUUID()}`;
}
// The embedded HTTP file server accepts one connection at a time, including control/upload.
export async function withDeviceConnection<T>(target:Pick<Target,'DevicePrivateIP'>,work:()=>Promise<T>):Promise<T>{
  const key=target.DevicePrivateIP,previous=connections.get(key)??Promise.resolve();
  let release!:()=>void;const slot=new Promise<void>(resolve=>{release=resolve;});
  connections.set(key,slot);await previous;
  try{return await work();}finally{
    await new Promise(resolve=>setTimeout(resolve,50));
    if(connections.get(key)===slot)connections.delete(key);release();
  }
}

export function endpoint(device: Partial<Device> & {DevicePrivateIP:string}): Pick<Target,'port'|'apiPath'> {
  if(!isIPv4(device.DevicePrivateIP) || ['0.0.0.0','255.255.255.255'].includes(device.DevicePrivateIP) || Number(device.DevicePrivateIP.split('.')[0])>=224) throw new Error('请输入有效的设备 IPv4 地址');
  return [90,92,400].includes(device.Hardware ?? 0) ? {port:80,apiPath:'/post'} : {port:9000,apiPath:'/divoom_api'};
}
export function request(target: Pick<Target,'DevicePrivateIP'|'port'>, path:string, method:string, body?:Buffer, signal?:AbortSignal, timeout=20000):Promise<{data:Buffer; headers:http.IncomingHttpHeaders}> {
  return withDeviceConnection(target,()=>new Promise((resolve,reject)=>{
    const req=http.request({host:target.DevicePrivateIP,port:target.port,path,method,signal,agent:false,headers:body?{'Content-Type':'application/json; charset=utf-8','Content-Length':body.length}:{}},res=>{
      const chunks:Buffer[]=[]; let size=0;
      res.on('data',(data:Buffer)=>{size+=data.length;if(size>64*1024*1024){req.destroy(new Error('文件响应超过缓存上限'));return;} chunks.push(data);});
      res.on('error',reject);
      res.on('end',()=>{if((res.statusCode??500)<200||(res.statusCode??500)>=300) reject(new Error(`设备 HTTP ${res.statusCode}`));else resolve({data:Buffer.concat(chunks),headers:res.headers});});
    });
    req.setTimeout(timeout,()=>req.destroy(new Error('设备请求超时，写操作请刷新后核对结果')));
    req.on('error',reject);req.end(body);
  }));
}
export async function command(target:Pick<Target,'DevicePrivateIP'|'port'|'apiPath'|'DeviceId'|'localToken'>, Command:string, fields:Record<string,unknown>={},signal?:AbortSignal):Promise<any> {
  const body=Buffer.from(JSON.stringify({Command,DeviceId:target.DeviceId,...(target.localToken===undefined?{}:{LocalToken:target.localToken}),...fields}));
  const {data}=await request(target,target.apiPath,'POST',body,signal);
  if(data.length>65536) throw new Error('设备 JSON 响应超过 64 KiB');
  let result; try {result=JSON.parse(data.toString('utf8'));}catch{throw new Error('设备返回了无效 JSON');}
  if(result.ReturnCode!==0) throw new Error(result.ReturnMessage || '设备未确认操作成功');
  return result;
}
export async function discover():Promise<Device[]> {
  const response=await fetch('http://app.divoom-gz.com/Device/ReturnSameLANDevice',{signal:AbortSignal.timeout(8000)});
  if(!response.ok) throw new Error('设备发现服务不可用，可手动输入 IP');
  const result=await response.json() as {DeviceList?:Device[]};
  return (result.DeviceList??[]).filter(d=>isIPv4(d.DevicePrivateIP)&&isSupportedHardware(Number(d.Hardware)));
}
export async function connect(device:Partial<Device>&{DevicePrivateIP:string;localToken?:number},send=command):Promise<Target> {
  const route=endpoint(device);
  const base={DeviceId:0,Hardware:0,DeviceName:'Divoom',...device,...route};
  // 首个本机请求只读硬件信息，实际尺寸优先于发现服务里的型号。
  const hw=await send(base,'Device/GetHardwareVersion');
  if(!isSupportedHardware(Number(hw.Hardware??base.Hardware)))throw new Error('目前仅支持 TimsFrame（510/511/512）和 AstroToo（530）');
  let caps:any={};
  try {caps=await send(base,'Device/GetLanCapabilities');}catch{ /* 老固件仍允许展示硬件信息。 */ }
  const width=Number(hw.CanvasWidth??caps.CanvasWidth),height=Number(hw.CanvasHeight??caps.CanvasHeight);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||width>4096||height>4096) throw new Error('设备未返回有效屏幕尺寸，请升级支持本地相簿的固件');
  const Hardware=Number(hw.Hardware??base.Hardware),DeviceId=Number(hw.DeviceId??caps.DeviceId??base.DeviceId)||0;
  return {...base,DeviceId,DeviceName:device.DeviceName??deviceTitle(Hardware),Hardware,cacheIdentity:await cacheIdentity(base.DevicePrivateIP,Hardware,DeviceId,hw.DeviceMacAddr??hw.MacAddress),width,height,maxUploadBytes:Number(caps.PhotoUploadMaxBytes??hw.PhotoUploadMaxBytes??100*1024*1024),maxVideoSeconds:Math.min(MAX_VIDEO_SECONDS,Number(caps.PhotoVideoMaxSeconds??MAX_VIDEO_SECONDS))};
}
export async function albums(target:Target):Promise<Album[]> {
  let result;
  try{result=await command(target,'Photo/GetLocalAlbumList');}
  catch(error){
    // Older TimesFrame firmware reports an unknown command as invalid JSON.
    if(error instanceof Error&&/^Only accept JSON parameters$/i.test(error.message.trim()))throw new Error('固件尚未提供本地相簿列表接口');
    throw error;
  }
  if(!Array.isArray(result.AlbumList)) throw new Error('固件尚未提供本地相簿列表接口');
  return result.AlbumList;
}
export async function photos(target:Target,clockId:number,start=1):Promise<Photo[]> {
  const result=await command(target,'Photo/GetPhotoList',{ClockId:clockId,ParentClockId:0,ParentItemId:'0',StartNum:start,EndNum:start+49});
  if(!Array.isArray(result.PhotoList)) throw new Error('照片列表响应不完整');
  return result.PhotoList;
}
export function filePath(value:string):string {
  if(!value.startsWith('/userdata/')||value.split('/').some(p=>p==='..'||p==='.')||/[\\%?#\x00-\x1f]/.test(value)) throw new Error('设备返回了不支持的媒体路径');
  return value;
}
export async function upload(target:Target,metadata:Record<string,unknown>,files:string[],signal:AbortSignal,onProgress:(n:number)=>void):Promise<void> {
  const boundary='TimesFrame'+randomUUID().replaceAll('-','');
  const json=Buffer.from(JSON.stringify({...metadata,...(target.localToken===undefined?{}:{LocalToken:target.localToken})}));
  const parts:{header:Buffer;path?:string;data?:Buffer;length:number}[]=[{header:Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="json"\r\nContent-Type: application/json\r\nContent-Length: ${json.length}\r\n\r\n`),data:json,length:json.length}];
  for(const path of files){const size=(await stat(path)).size;parts.push({header:Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${basename(path)}"; filename="${basename(path)}"\r\nContent-Type: application/octet-stream\r\nContent-Length: ${size}\r\n\r\n`),path,length:size});}
  const tail=Buffer.from(`--${boundary}--\r\n`);
  const total=parts.reduce((n,p)=>n+p.header.length+p.length+2,tail.length);
  if(total>Math.min(target.maxUploadBytes,MAX_UPLOAD_BYTES)) throw new Error('视频和预览图超过设备上传大小上限，请缩短片段或升级固件');
  await withDeviceConnection(target,()=>new Promise<void>((resolve,reject)=>{
    let sent=0;const req=http.request({host:target.DevicePrivateIP,port:target.port,path:'/upload',method:'POST',signal,agent:false,headers:{'Content-Type':`multipart/form-data; boundary=${boundary}`,'Content-Length':total}},res=>{
      let response='';res.setEncoding('utf8');res.on('data',chunk=>{response+=chunk;if(response.length>65536)req.destroy(new Error('上传响应过大'));});res.on('error',reject);
      res.on('end',()=>{try{if(res.statusCode!==200)throw new Error(`上传 HTTP ${res.statusCode}`);const result=JSON.parse(response);if(result.ReturnCode!==0)throw new Error(result.ReturnMessage||'设备拒绝上传');resolve();}catch(e){reject(e);}});
    });
    req.setTimeout(120000,()=>req.destroy(new Error('上传连接超时，结果待确认')));req.on('error',reject);
    const write=async(chunk:Buffer)=>{if(signal.aborted)throw new Error('已取消');if(!req.write(chunk))await new Promise<void>((ok,fail)=>{const done=()=>{req.off('error',error);ok();};const error=(e:Error)=>{req.off('drain',done);fail(e);};req.once('drain',done);req.once('error',error);});sent+=chunk.length;onProgress(Math.min(99,sent/total*100));};
    void (async()=>{try{for(const part of parts){await write(part.header);if(part.data)await write(part.data);else{for await(const chunk of createReadStream(part.path!,{highWaterMark:64*1024,signal}))await write(chunk as Buffer);}await write(Buffer.from('\r\n'));}await write(tail);req.end();}catch(e){req.destroy(e as Error);reject(e);}})();
  }));
}
