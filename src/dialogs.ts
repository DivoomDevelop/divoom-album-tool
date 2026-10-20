import { albumName, localizeError, t } from './i18n';
import type { Album } from './shared';
export function importDialog(){return {multiple:true,title:t('import'),filters:[{name:t('mediaFiles'),extensions:['jpg','jpeg','png','webp','bmp','heic','avif','mp4','mov','mkv','avi','webm','m4v']}]};}
export function manageDialog(album:Album,count:number,removeOnly:boolean){
  return {text:t(removeOnly?'confirmRemove':'confirmDelete',{count,album:albumName(album)}),options:{title:t(removeOnly?'remove':'delete'),kind:'warning' as const,okLabel:t(removeOnly?'remove':'delete'),cancelLabel:t('cancel')}};
}
export function importFailureDialog(failures:{name:string;error:string}[]){
  return {text:failures.map(failure=>`${failure.name}: ${localizeError(failure.error)}`).join('\n').slice(0,3000),options:{title:t('importFailed'),kind:'warning' as const,okLabel:t('close')}};
}
