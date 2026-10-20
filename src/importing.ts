import { MAX_VIDEO_SECONDS, type Edit, type Media, type Target, type PhotoFit } from './shared';

export type CropSettings={fit?:PhotoFit;background?:Edit['background'];quality?:number;flipX?:boolean;flipY?:boolean;rotation:number;zoom:number;centerX:number;centerY:number};
export const defaultCrop:CropSettings={rotation:0,zoom:1,centerX:.5,centerY:.5};
export function editFromSettings(media:Media,target:Pick<Target,'width'|'height'>,settings:CropSettings=defaultCrop):Edit{
  const sw=settings.rotation%180?media.height:media.width,sh=settings.rotation%180?media.width:media.height;
  const fit=settings.fit??'crop';
  const aspect=sw/sh;
  const width=Math.min(sw,sh*aspect)/settings.zoom,height=width/aspect;
  return {mediaId:media.id,fit,background:settings.background??'none',quality:settings.quality??90,flipX:settings.flipX??false,flipY:settings.flipY??false,rotation:settings.rotation,x:Math.max(0,Math.min(sw-width,settings.centerX*sw-width/2)),y:Math.max(0,Math.min(sh-height,settings.centerY*sh-height/2)),width,height,start:0,end:Math.min(media.duration,MAX_VIDEO_SECONDS),coverTime:0};
}
export function settingsFromEdit(media:Media,target:Pick<Target,'width'|'height'>,edit:Edit):CropSettings{
  const sw=edit.rotation%180?media.height:media.width,sh=edit.rotation%180?media.width:media.height;
  return {fit:edit.fit??'crop',background:edit.background??'none',quality:edit.quality??90,flipX:edit.flipX??false,flipY:edit.flipY??false,rotation:edit.rotation,zoom:sw/edit.width,centerX:(edit.x+edit.width/2)/sw,centerY:(edit.y+edit.height/2)/sh};
}
export type CropCorner='nw'|'ne'|'sw'|'se';
/** Resize in displayed source coordinates, keeping the opposite corner fixed. */
export function resizeCrop(sw:number,sh:number,region:Pick<Edit,'x'|'y'|'width'|'height'>,corner:CropCorner,px:number,py:number){
  const sx=corner.endsWith('e')?1:-1,sy=corner.startsWith('s')?1:-1;
  const ax=region.x+(sx<0?region.width:0),ay=region.y+(sy<0?region.height:0),aspect=sw/sh;
  const maxWidth=Math.min(sx>0?sw-ax:ax,(sy>0?sh-ay:ay)*aspect);
  const projected=((px-ax)*sx*aspect+(py-ay)*sy)/(aspect*aspect+1)*aspect;
  const width=Math.max(sw/5,Math.min(maxWidth,projected)),height=width/aspect;
  return {zoom:sw/width,centerX:(ax+sx*width/2)/sw,centerY:(ay+sy*height/2)/sh};
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

/** Preserve the source aspect within device bounds; video needs even pixels. */
export function outputDimensions(edit:Edit,target:Pick<Target,'width'|'height'>,kind:Media['kind']='photo'):{width:number;height:number}{
  const unit=kind==='video'?2:1;
  if(edit.background&&edit.background!=='none')return {width:Math.floor(target.width/unit)*unit,height:Math.floor(target.height/unit)*unit};
  const scale=Math.min(target.width/edit.width,target.height/edit.height);
  return {width:Math.max(unit,Math.floor(edit.width*scale/unit+1e-7)*unit),height:Math.max(unit,Math.floor(edit.height*scale/unit+1e-7)*unit)};
}
