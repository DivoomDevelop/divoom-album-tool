import type { Photo, Target } from './shared';

/** One RPC at a time; leaving an album discards thumbnails that have not started. */
export class ThumbnailQueue {
  private tail:Promise<unknown>=Promise.resolve();
  private cache=new Map<string,string>();
  private cacheSize=0;
  constructor(private load:(target:Target,photo:Photo)=>Promise<string>,private limit=16*1024*1024){}
  get(target:Target,photo:Photo,signal:AbortSignal):Promise<string>{
    const key=`${target.Hardware}:${target.DeviceId>0?`id:${target.DeviceId}`:target.cacheIdentity}:${photo.PhotoId}:${photo.Time}:${photo.FileId}`;
    const task=this.tail.then(async()=>{
      signal.throwIfAborted();
      const cached=this.cache.get(key);
      if(cached){this.cache.delete(key);this.cache.set(key,cached);return cached;}
      let value='';
      for(let attempt=0;attempt<3;attempt++){
        signal.throwIfAborted();
        try{value=await this.load(target,photo);break;}
        catch(error){
          // Only transient read failures are retried. Never replay device writes.
          if(attempt===2||!/ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|超时|HTTP 50[234]/i.test(String(error)))throw error;
          await new Promise(resolve=>setTimeout(resolve,400*(attempt+1)));
        }
      }
      if(value.length<=this.limit){
        this.cache.set(key,value);this.cacheSize+=value.length;
        while(this.cacheSize>this.limit){const oldest=this.cache.keys().next().value!;this.cacheSize-=this.cache.get(oldest)!.length;this.cache.delete(oldest);}
      }
      return value;
    });
    this.tail=task.catch(()=>{});return task;
  }
}
