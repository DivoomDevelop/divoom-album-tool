import { MAX_VIDEO_SECONDS, type Edit, type Media, type Target, type PhotoFit } from './shared';

export type CropSettings={fit?:PhotoFit;rotation:number;zoom:number;centerX:number;centerY:number};
export const defaultCrop:CropSettings={rotation:0,zoom:1,centerX:.5,centerY:.5};
export function editFromSettings(media:Media,target:Pick<Target,'width'|'height'>,settings:CropSettings=defaultCrop):Edit{
  const sw=settings.rotation%180?media.height:media.width,sh=settings.rotation%180?media.width:media.height;
  const fit=settings.fit??'crop';
  const aspect=media.kind==='photo'?sw/sh:target.width/target.height;
  const width=Math.min(sw,sh*aspect)/settings.zoom,height=width/aspect;
  return {mediaId:media.id,...(media.kind==='photo'?{fit}:{}),rotation:settings.rotation,x:Math.max(0,Math.min(sw-width,settings.centerX*sw-width/2)),y:Math.max(0,Math.min(sh-height,settings.centerY*sh-height/2)),width,height,start:0,end:Math.min(media.duration,MAX_VIDEO_SECONDS),coverTime:0};
}
export function settingsFromEdit(media:Media,target:Pick<Target,'width'|'height'>,edit:Edit):CropSettings{
  const sw=edit.rotation%180?media.height:media.width,sh=edit.rotation%180?media.width:media.height;
  const aspect=media.kind==='photo'?sw/sh:target.width/target.height;
  return {...(media.kind==='photo'?{fit:edit.fit??'crop'}:{}),rotation:edit.rotation,zoom:Math.min(sw,sh*aspect)/edit.width,centerX:(edit.x+edit.width/2)/sw,centerY:(edit.y+edit.height/2)/sh};
}
export function validImportSelection(media:readonly Media[]):boolean{
  return media.length>0&&(!media.some(m=>m.kind==='video')||media.length===1);
}
export function toggleImportSelection(selected:readonly string[],candidate:Media,media:readonly Media[]):string[]|null{
  if(selected.includes(candidate.id))return selected.filter(id=>id!==candidate.id);
  const next=[...selected,candidate.id];
  return validImportSelection(media.filter(item=>next.includes(item.id)))?next:null;
}
export function mergeImported(current:readonly Media[],incoming:readonly Media[]):Media[]{
  const result=[...current],keys=new Set(current.map(item=>item.sourceKey??item.id));
  for(const item of incoming){const key=item.sourceKey??item.id;if(!keys.has(key)){keys.add(key);result.push(item);}}
  return result;
}

/** Photos preserve the original aspect; video keeps the device canvas. */
export function outputDimensions(edit:Edit,target:Pick<Target,'width'|'height'>,kind:Media['kind']='photo'):{width:number;height:number}{
  if(kind==='video')return {width:target.width,height:target.height};
  const scale=Math.min(target.width/edit.width,target.height/edit.height);
  return {width:Math.max(1,Math.floor(edit.width*scale+1e-7)),height:Math.max(1,Math.floor(edit.height*scale+1e-7))};
}
