import React,{useEffect,useState} from 'react';
import type {StorageInfo} from './shared';
import {t,getLocale} from './i18n';
export const formatBytes=(n:number)=>new Intl.NumberFormat(getLocale(),{maximumFractionDigits:1}).format(n/(n>=1073741824?1073741824:n>=1048576?1048576:1024))+' '+(n>=1073741824?'GiB':n>=1048576?'MiB':'KiB');
export function Appearance(){
 const [theme,setTheme]=useState(()=>localStorage.getItem('divoom.theme')??'system');
 useEffect(()=>{const media=matchMedia('(prefers-color-scheme: dark)'),apply=()=>{document.documentElement.dataset.theme=(theme==='dark'||theme==='system'&&media.matches)?'dark':'light';};apply();localStorage.setItem('divoom.theme',theme);media.addEventListener('change',apply);return()=>media.removeEventListener('change',apply);},[theme]);
 return <label className="appearance"><span>{t('theme')}</span><select data-testid="theme-select" aria-label={t('theme')} value={theme} onChange={e=>setTheme(e.target.value)}><option value="system">{t('themeSystem')}</option><option value="light">{t('themeLight')}</option><option value="dark">{t('themeDark')}</option></select></label>;
}
export function StoragePanel({info}:{info?:StorageInfo}){return <div className={'storage-panel '+(info?.full===true?'storage-full':'')} data-testid="storage-panel"><strong>{t('space')}</strong><p>{t('photoCount')}: {info?.photoCount??'—'} · {t('videoCount')}: {info?.videoCount??'—'}</p><p>{t('freeSpace')}: {info?.freeBytes===undefined?t('notReported'):formatBytes(info.freeBytes)}</p>{info?.full!==undefined&&<small role={info.full?'alert':undefined}>{t(info.full?'storageFull':'storageAvailable')}</small>}</div>;}

export function StorageAlert({info,onRefresh,refreshing}:{info?:StorageInfo;onRefresh?:()=>void;refreshing?:boolean}){
 if(info?.full!==true)return null;
 return <div role="alert" className="storage-full-alert" data-testid="storage-full-alert"><strong>{t('storageFull')}</strong><p>{t('storageFullWarning')}</p>{onRefresh&&<button disabled={refreshing} onClick={onRefresh}>{t(refreshing?'checkingStatus':'refreshStatus')}</button>}</div>;
}
