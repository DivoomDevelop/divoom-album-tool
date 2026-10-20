import type { Album, Photo, Target } from '../src/shared';
import * as lan from './transport';

type AlbumTransport={albums:(target:Target)=>Promise<Album[]>;photos:(target:Target,id:number,start:number)=>Promise<Photo[]>;command:(target:Target,name:string,fields:Record<string,unknown>)=>Promise<unknown>};
async function presentIds(transport:AlbumTransport,target:Target,albumId:number,wanted:Set<number>):Promise<Set<number>>{
  const found=new Set<number>();
  for(let start=1;start<=50000;start+=50){
    const page=await transport.photos(target,albumId,start);for(const photo of page)if(wanted.has(photo.PhotoId))found.add(photo.PhotoId);
    if(found.size===wanted.size||page.length<50)return found;
  }
  throw Error('照片列表响应不完整');
}
/** Only album references are added. Never re-upload, move, or automatically replay a write. */
export async function addPhotosToAlbum(target:Target,sourceId:number,toId:number,ids:number[],invalidate:()=>Promise<void>,transport:AlbumTransport=lan):Promise<void>{
  if(!Number.isSafeInteger(sourceId)||sourceId<100000||!Number.isSafeInteger(toId)||toId<100000||toId===sourceId)throw Error('ALBUM_DESTINATION_UNAVAILABLE');
  if(!Array.isArray(ids)||!ids.length||ids.some(id=>!Number.isSafeInteger(id)||id<1))throw Error('请选择有效媒体');
  const wanted=new Set(ids),albums=await transport.albums(target);
  if(!albums.some(album=>album.ClockId===toId&&album.AlbumType===0))throw Error('ALBUM_DESTINATION_UNAVAILABLE');
  if(!albums.some(album=>album.ClockId===sourceId))throw Error('ALBUM_SELECTION_STALE');
  if((await presentIds(transport,target,sourceId,wanted)).size!==wanted.size)throw Error('ALBUM_SELECTION_STALE');
  try{
    const existing=await presentIds(transport,target,toId,wanted),missing=[...wanted].filter(id=>!existing.has(id));
    for(let offset=0;offset<missing.length;offset+=50){
      await transport.command(target,'Photo/DevicePhotoToAlbum',{UserId:1,ToClockId:toId,PhotoList:missing.slice(offset,offset+50)});
    }
    for(let attempt=0;attempt<8;attempt++){
      if((await presentIds(transport,target,toId,wanted)).size===wanted.size)return;
      if(attempt<7)await new Promise(resolve=>setTimeout(resolve,400));
    }
    throw Error('ALBUM_ADD_PENDING');
  }finally{await invalidate();}
}
