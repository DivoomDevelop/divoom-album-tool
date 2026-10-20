import {createServer} from 'node:http';
import type {Photo,Album} from '../src/shared';
import assert from 'node:assert/strict';
export async function lanFixture(){
 const albums:Album[]=[{ClockId:100000,ClockName:'All',AlbumType:1},{ClockId:100001,ClockName:'Feedback A',AlbumType:0},{ClockId:100002,ClockName:'Feedback B',AlbumType:0}];
 const records=new Map<number,{photo:Photo;albums:Set<number>}>(),files=new Map<string,Buffer>(),uploads:any[]=[],commands:any[]=[];let next=0,delay=0,storageBytes=true,full:unknown=0,fullAfter=Infinity,albumFailure=false;
 const server=createServer(async(req,res)=>{try{
  if(req.method==='GET'||req.method==='HEAD'){const file=files.get(req.url!);if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Length':file.length,'Content-Type':req.url!.endsWith('.mp4')?'video/mp4':'image/webp'});res.end(req.method==='HEAD'?undefined:file);return;}
  const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const data=Buffer.concat(chunks);let result:any={ReturnCode:0};
  if(req.url==='/upload'){
   const boundary=String(req.headers['content-type']).split('boundary=')[1],parts:{name:string;data:Buffer}[]=[];let cursor=0;
   while(cursor<data.length){if(data.subarray(cursor,cursor+boundary.length+4).toString()==='--'+boundary+'--')break;const end=data.indexOf('\r\n\r\n',cursor);assert.ok(end>=0);const header=data.subarray(cursor,end).toString(),length=Number(header.match(/Content-Length: (\d+)/i)![1]),name=header.match(/name="([^"]+)"/)![1];parts.push({name,data:data.subarray(end+4,end+4+length)});cursor=end+4+length+2;}
   const metadata=JSON.parse(parts[0].data.toString());for(const name of [metadata.FileName,metadata.PreviewFileName].filter(Boolean))files.set('/userdata/app_pic/'+name,parts.find(p=>p.name===name)!.data);
   const id=++next,photo:Photo={PhotoId:id,Time:Date.now()/1000,FileId:'/userdata/app_pic/'+(metadata.PreviewFileName||metadata.FileName),OriginalFileId:'/userdata/app_pic/'+metadata.FileName,MediaType:metadata.PreviewFileName?'video':'photo'};records.set(id,{photo,albums:new Set([100000,metadata.ClockId])});uploads.push({metadata,id});if(next>=fullAfter)full=1;if(delay)await new Promise(r=>setTimeout(r,delay));
  }else{const q=JSON.parse(data.toString());commands.push(q);switch(q.Command){
   case 'Device/GetHardwareVersion':case 'Device/GetLanCapabilities':Object.assign(result,{Hardware:511,DeviceId:770000511,CanvasWidth:800,CanvasHeight:1280,SupportsPhotoLibrary:true,PhotoUploadMaxBytes:104857600,PhotoVideoMaxSeconds:600});break;
   case 'Device/GetStorageStatus':Object.assign(result,{Full:full,...(storageBytes?{FreeBytes:2147483648,TotalBytes:4294967296}:{})});break;
   case 'Photo/GetLocalAlbumList':if(albumFailure)throw Error('Album listing unavailable');result.AlbumList=albums;break;
   case 'Photo/GetPhotoList':result.PhotoList=[...records.values()].filter(row=>row.albums.has(q.ClockId)).map(row=>row.photo).reverse().slice((q.StartNum??1)-1,q.EndNum??50);break;
   case 'Photo/RemovePhotoFromAlbum':for(const id of q.PhotoList)records.get(id)?.albums.delete(q.ClockId);break;
   case 'Photo/DeletePhoto':for(const id of q.PhotoList)records.delete(id);break;
   default:throw Error('Unexpected command '+q.Command);
  }}res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(result));
 }catch(e){res.writeHead(500).end(JSON.stringify({ReturnCode:1,ReturnMessage:String(e)}));}});
 await new Promise<void>((ok,fail)=>{server.once('error',fail);server.listen(9000,'127.0.0.1',ok);});
 return {albums,records,uploads,commands,files,setFull:(value:unknown)=>{full=value;},setFullAfterUpload:(count:number)=>{fullAfter=count;},setAlbumFailure:(value:boolean)=>{albumFailure=value;},setDelay:(ms:number)=>{delay=ms;},setStorageBytes:(value:boolean)=>{storageBytes=value;},close:()=>{server.closeAllConnections();server.close();}};
}
