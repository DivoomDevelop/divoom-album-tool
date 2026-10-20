import { catalogs, type MessageKey } from './catalog';
import type { Album } from '../shared';
export const languages = [
  {id:0,locale:'en',name:'English'}, {id:1,locale:'zh-CN',name:'简体中文'},
  {id:2,locale:'zh-TW',name:'繁體中文'}, {id:3,locale:'ja',name:'日本語'},
  {id:4,locale:'de',name:'Deutsch'}, {id:5,locale:'th',name:'ไทย'},
  {id:6,locale:'ru',name:'Русский'}, {id:7,locale:'ko',name:'한국어'},
  {id:8,locale:'vi',name:'Tiếng Việt'}, {id:9,locale:'fr',name:'Français'},
  {id:10,locale:'tr',name:'Türkçe'}, {id:11,locale:'es',name:'Español'},
  {id:12,locale:'pt',name:'Português'}, {id:13,locale:'id',name:'Bahasa Indonesia'},
  {id:14,locale:'it',name:'Italiano'}, {id:15,locale:'uk',name:'Українська'},
  {id:16,locale:'sv',name:'Svenska'}, {id:17,locale:'da',name:'Dansk'},
  {id:18,locale:'pl',name:'Polski'},
] as const;
export type Locale = typeof languages[number]['locale'];
export const LOCALE_STORAGE_KEY='divoom-album.locale';
export const isLocale=(value:unknown):value is Locale=>languages.some(language=>language.locale===value);
export function resolveLocale(preferred:readonly string[],saved?:string|null):Locale{
  if(isLocale(saved))return saved;
  for(const name of preferred){
    const tag=name.toLowerCase().replaceAll('_','-'),base=tag.split('-')[0];
    if(base==='zh')return /-(?:hant|tw|hk|mo)(?:-|$)/.test(tag)?'zh-TW':'zh-CN';
    if(isLocale(base))return base;
  }
  return 'en';
}
let saved:string|null=null;
try{saved=globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);}catch{}
let locale:Locale=resolveLocale(typeof navigator==='undefined'?[]:navigator.languages,saved);
const subscribers=new Set<()=>void>();
export const getLocale=()=>locale;
export function subscribeLocale(listener:()=>void){subscribers.add(listener);return()=>{subscribers.delete(listener);};}
export function setLocale(value:Locale):void{
  if(!isLocale(value))return;locale=value;
  try{globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY,value);}catch{}
  for(const listener of subscribers)listener();
}
export function translate(language:Locale,key:MessageKey,parameters:Record<string,string|number>={}):string{
  return catalogs[language][key].replace(/\{(\w+)\}/g,(token,key)=>{
    const value=parameters[key];return value===undefined?token:typeof value==='number'?new Intl.NumberFormat(language).format(value):value;
  });
}
export const t=(key:MessageKey,parameters:Record<string,string|number>={})=>translate(locale,key,parameters);
export const errorText=(error:unknown)=>typeof error==='string'?error:error instanceof Error?error.message:String(error??'');
const errors:[RegExp,MessageKey][]=[
  [/DEVICE_STORAGE_FULL/,'storageFullWarning'],
  [/UPLOAD_INTERRUPTED/,'interruptedUpload'],[/INVALID_QUALITY/,'qualityInvalid'],[/INVALID_BACKGROUND/,'backgroundInvalid'],[/PHOTO_TOO_LARGE/,'oversizedPhoto'],[/DUPLICATE_CHOICE_REQUIRED/,'duplicateRequired'],
  [/ALBUM_DESTINATION_UNAVAILABLE/,'albumDestinationUnavailable'],[/ALBUM_SELECTION_STALE/,'albumSelectionStale'],[/ALBUM_ADD_PENDING/,'albumAddPending'],
  [/IMPORT_SELECTION_RULE/,'selectionConflict'],
  [/目前仅支持 TimsFrame|Only TimsFrame/,'errorUnsupported'],[/请输入有效的设备 IPv4/,'errorIp'],
  [/响应超过|响应过大|超过缓存上限/,'errorSize'],[/超时|ETIMEDOUT|TimeoutError/,'errorTimeout'],
  [/无效 JSON|JSON 响应|响应不完整|设备接口无效|分页参数无效/,'errorJson'],
  [/设备未确认|设备拒绝上传/,'errorRejected'],[/发现服务不可用|fetch failed/,'errorDiscover'],
  [/未返回有效屏幕尺寸/,'errorScreen'],[/未提供本地相簿/,'errorAlbums'],[/不支持的媒体路径/,'errorPath'],
  [/超过设备上传大小/,'errorUploadSize'],[/旋转角度无效/,'errorRotation'],[/裁剪区域/,'errorCrop'],
  [/裁剪比例/,'errorRatio'],[/偶数屏幕尺寸/,'errorEven'],[/视频片段必须/,'errorTrim'],
  [/型号的视频编码/,'errorVideoModel'],[/图像轨道/,'errorTrack'],[/尺寸校验失败|预览图校验失败/,'errorOutput'],
  [/仅管理本地相簿/,'errorLocal'],[/源文件已失效|源文件无效|导入文件列表无效|ENOENT/,'errorSource'],
  [/尚未确认入库/,'errorPending'],[/请选择有效媒体/,'errorSelection'],[/系统相簿不支持/,'errorSystem'],
  [/本地媒体服务/,'errorService'],[/不支持的操作/,'errorOperation'],[/已取消|AbortError|aborted/,'canceled'],
  [/暂无可用预览图/,'unavailable'],
];
export function localizeError(error:unknown,language:Locale=locale):string{
  const detail=errorText(error),http=detail.match(/(?:设备 HTTP|上传 HTTP|读取原文件失败)\s*(\d+)/);
  if(http)return translate(language,'errorHttp',{status:http[1]});
  for(const [pattern,key] of errors)if(pattern.test(detail))return translate(language,key);
  return translate(language,'errorUnknown',{detail});
}
const jobKeys:Record<string,MessageKey>={'等待处理':'waitingJob','正在转换':'converting','正在上传':'uploading','确认入库':'confirming','已完成':'complete','需检查':'check','已取消':'canceled'};
export const jobState=(state:string)=>jobKeys[state]?t(jobKeys[state]):state;
const systemAlbums:Record<Locale,readonly [string,string]>={
  en:['All photos','Preloaded'], 'zh-CN':['全部照片','预装相簿'], 'zh-TW':['所有照片','預載相簿'],
  ja:['すべての写真','プリロード'], de:['Alle Fotos','Vorinstalliert'], th:['รูปภาพทั้งหมด','ติดตั้งไว้ล่วงหน้า'],
  ru:['Все фото','Предустановленные'], ko:['모든 사진','기본 제공'], vi:['Tất cả ảnh','Cài sẵn'],
  fr:['Toutes les photos','Préinstallé'], tr:['Tüm fotoğraflar','Ön yüklü'], es:['Todas las fotos','Preinstalado'],
  pt:['Todas as fotos','Pré-instalado'], id:['Semua foto','Bawaan'], it:['Tutte le foto','Preinstallato'],
  uk:['Усі фото','Попередньо встановлені'], sv:['Alla foton','Förinstallerat'], da:['Alle fotos','Forudinstalleret'], pl:['Wszystkie zdjęcia','Fabryczne'],
};
export function albumName(album:Album):string{return album.AlbumType===1?systemAlbums[locale][0]:album.AlbumType===4?systemAlbums[locale][1]:album.ClockName;}
