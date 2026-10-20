export const MAX_VIDEO_SECONDS = 10 * 60;
export const SUPPORTED_HARDWARE = [510, 511, 512, 530] as const;
export function isSupportedHardware(hardware: number): boolean {
  return (SUPPORTED_HARDWARE as readonly number[]).includes(hardware);
}
export function deviceTitle(hardware?:number):string {
  if(hardware===530)return 'AstroToo';
  if(hardware!==undefined&&[510,511,512].includes(hardware))return 'TimsFrame';
  return 'Divoom 相簿';
}
export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;
export interface Device { DeviceId: number; Hardware: number; DeviceName: string; DevicePrivateIP: string }
export interface Target extends Device { width: number; height: number; port: number; apiPath: string; maxUploadBytes: number; maxVideoSeconds: number; localToken?: number; cacheIdentity?: string }
export interface Album { ClockId: number; ClockName: string; AlbumType: number }
export interface Photo { PhotoId: number; Time: number; FileId: string; OriginalFileId?: string; MediaType?: 'photo' | 'video' }
export interface Media { id: string; path: string; name: string; width: number; height: number; duration: number; size: number; kind: 'photo' | 'video'; preview: string; sourceKey?: string }
export interface Edit { mediaId: string; x: number; y: number; width: number; height: number; rotation: number; start: number; end: number; coverTime: number }
export interface Job { id: string; name: string; preview: string; state: string; progress: number; error?: string; photoId?: number; clockId: number; deviceIdentity?: string }
export interface TimesFrameApi {
  discover(): Promise<Device[]>;
  recent(): Promise<Device[]>;
  connect(device: Partial<Device> & {DevicePrivateIP:string; localToken?:number}): Promise<Target>;
  albums(target: Target, refresh?: boolean): Promise<Album[]>;
  photos(target: Target, clockId: number, start: number, refresh?: boolean): Promise<Photo[]>;
  importMedia(): Promise<Media[]>;
  importStatus(target: Target, mediaIds: string[], refresh?: boolean): Promise<string[]>;
  thumbnail(target: Target, photo: Photo): Promise<string>;
  preview(target: Target, photo: Photo): Promise<{url:string; size:number; duration:number; width:number; height:number}>;
  enqueue(target: Target, album: Album, edit: Edit): Promise<void>;
  enqueueBatch(target: Target, album: Album, edits: Edit[], requestId: string): Promise<string[]>;
  cancel(id: string): Promise<void>;
  manage(target: Target, album: Album, ids: number[], removeOnly: boolean): Promise<void>;
  addToAlbum(target: Target, source: Album, toClockId: number, ids: number[]): Promise<void>;
  onJobs(listener:(jobs:Job[])=>void): ()=>void;
}
declare global { interface Window { timesframe: TimesFrameApi } }
