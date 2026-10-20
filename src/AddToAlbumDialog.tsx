import React, { useEffect, useRef, useState } from 'react';
import type { Album, Target } from './shared';
import { albumName, errorText, localizeError, t } from './i18n';
const api=window.timesframe;

export function AddToAlbumDialog({target,source,ids,initialAlbums,onClose,onAdded}:{target:Target;source:Album;ids:number[];initialAlbums:Album[];onClose:()=>void;onAdded:(album:Album)=>void}){
  const dialog=useRef<HTMLDialogElement>(null),active=useRef(true),generation=useRef(0);
  const [albums,setAlbums]=useState(initialAlbums),[destination,setDestination]=useState(''),[reading,setReading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const choices=albums.filter(album=>album.AlbumType===0&&album.ClockId>=100000&&album.ClockId!==source.ClockId);
  const refresh=async(force=false)=>{
    const stamp=++generation.current;setReading(true);setError('');
    try{const list=await api.albums(target,force);if(!active.current||stamp!==generation.current)return;setAlbums(list);setDestination(old=>list.some(album=>String(album.ClockId)===old&&album.AlbumType===0&&album.ClockId!==source.ClockId)?old:'');}
    catch(e){if(active.current&&stamp===generation.current)setError(errorText(e));}
    finally{if(active.current&&stamp===generation.current)setReading(false);}
  };
  useEffect(()=>{dialog.current?.showModal();void refresh();return()=>{active.current=false;generation.current++;};},[]);
  const submit=async()=>{
    const album=choices.find(item=>String(item.ClockId)===destination);if(!album||busy||reading)return;
    setBusy(true);setError('');
    try{await api.addToAlbum(target,source,album.ClockId,ids);if(active.current)onAdded(album);}
    catch(e){if(active.current)setError(errorText(e));}
    finally{if(active.current)setBusy(false);}
  };
  return <dialog ref={dialog} className="add-album-dialog" aria-labelledby="add-album-title" onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
    <form onSubmit={event=>{event.preventDefault();void submit();}}>
      <div className="add-album-header"><h2 id="add-album-title">{t('addToOtherAlbum')}</h2><button type="button" aria-label={t('close')} onClick={onClose} disabled={busy}>×</button></div>
      <p>{t('addAlbumDescription',{count:ids.length})}</p>
      <div className="add-album-destination"><label htmlFor="destination-album">{t('destinationAlbum')}</label><button type="button" className="text-button" disabled={busy||reading} onClick={()=>void refresh(true)}>{t('refreshAlbum')}</button></div>
      {reading?<p role="status">{t('loading')}</p>:choices.length?<select id="destination-album" autoFocus value={destination} disabled={busy} onChange={event=>setDestination(event.target.value)}><option value="">{t('destinationAlbum')}</option>{choices.map(album=><option key={album.ClockId} value={album.ClockId}>{albumName(album)}</option>)}</select>:<div className="add-album-empty">{t('noOtherAlbum')}</div>}
      {error&&<div role="alert" className="error-banner">{localizeError(error)}</div>}
      <div className="add-album-actions"><button type="button" disabled={busy} onClick={onClose}>{t('cancel')}</button><button className="primary" type="submit" disabled={busy||reading||!choices.some(album=>String(album.ClockId)===destination)}>{busy?t('addingToAlbum'):t('addAlbumConfirm')}</button></div>
    </form>
  </dialog>;
}
