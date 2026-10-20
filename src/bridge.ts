import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, confirm, message } from '@tauri-apps/plugin-dialog';
import type { Job, TimesFrameApi } from './shared';
import { importDialog, importFailureDialog, manageDialog } from './dialogs';
const rpc=(method:string,...args:unknown[]):Promise<any>=>invoke('rpc',{method,args});
const api:TimesFrameApi={
  discover:()=>rpc('discover'),recent:()=>rpc('recent'),connect:d=>rpc('connect',d),albums:(t,r)=>rpc('albums',t,r),photos:(t,c,s,r)=>rpc('photos',t,c,s,r),
  importMedia:async()=>{
    const selected=await open(importDialog());
    if(!selected)return [];
    const result=await rpc('import',Array.isArray(selected)?selected:[selected]);
    if(result.failures.length){const dialog=importFailureDialog(result.failures);await message(dialog.text,dialog.options);}
    return result.media;
  },
  importStatus:(t,ids,r)=>rpc('importStatus',t,ids,r),
  addToAlbum:(t,source,toClockId,ids)=>rpc('addToAlbum',t,source,toClockId,ids),
  thumbnail:(t,p)=>rpc('thumbnail',t,p),preview:(t,p)=>rpc('preview',t,p),enqueue:(t,a,e)=>rpc('enqueue',t,a,e),enqueueBatch:(t,a,e,id)=>rpc('enqueueBatch',t,a,e,id),cancel:id=>rpc('cancel',id),
  manage:async(target,a,ids,removeOnly)=>{
    const dialog=manageDialog(a,ids.length,removeOnly);
    if(!await confirm(dialog.text,dialog.options))return;
    await rpc('manage',target,a,ids,removeOnly);
  },
  onJobs:listener=>{let active=true;const unlisten=listen<Job[]>('jobs',event=>{if(active)listener(event.payload);});void rpc('jobs').then(j=>{if(active)listener(j);});return()=>{active=false;void unlisten.then(fn=>fn());};}
};
window.timesframe=api;
export async function setWindowTitle(title:string){document.title=title;await getCurrentWindow().setTitle(title);}
