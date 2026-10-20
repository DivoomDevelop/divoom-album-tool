import React, { useEffect, useRef, useState } from 'react';
import type { Album, Edit, Media, Target } from './shared';
import { defaultCrop, editFromSettings, mergeImported, settingsFromEdit, toggleImportSelection, validImportSelection, outputDimensions } from './importing';
import { t, localizeError, errorText } from './i18n';

export type WorkflowEditorProps={media:Media;target:Target;remaining:number;initialEdit?:Edit;onChange?:(edit:Edit)=>void;onCancel:()=>void;onSave:(edit:Edit)=>Promise<void>;saveLabel?:string;backLabel?:string;workHeader?:React.ReactNode;workFooter?:React.ReactNode;extraControls?:React.ReactNode};
const api=window.timesframe;
const duration=(seconds:number)=>`${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;

export function CropPreview({media,edit,target,onReady}:{media:Media;edit:Edit;target:Target;onReady?:()=>void}){
  const canvas=useRef<HTMLCanvasElement>(null),ready=useRef(onReady);ready.current=onReady;
  const [failed,setFailed]=useState(false);
  const size=outputDimensions(edit,target),scale=Math.min(240/size.width,320/size.height);
  useEffect(()=>{
    let active=true;setFailed(false);const image=new Image();image.crossOrigin='anonymous';
    image.onload=()=>{
      if(!active||!canvas.current)return;
      const ctx=canvas.current.getContext('2d')!,sw=edit.rotation%180?media.height:media.width,sh=edit.rotation%180?media.width:media.height;
      ctx.clearRect(0,0,canvas.current.width,canvas.current.height);ctx.save();
      ctx.scale(canvas.current.width/edit.width,canvas.current.height/edit.height);ctx.translate(-edit.x,-edit.y);ctx.translate(sw/2,sh/2);ctx.rotate(edit.rotation*Math.PI/180);
      ctx.drawImage(image,-media.width/2,-media.height/2,media.width,media.height);ctx.restore();ready.current?.();
    };
    image.onerror=()=>{if(active)setFailed(true);};image.src=media.path;
    return()=>{active=false;image.onload=null;image.onerror=null;image.src='';};
  },[media.id,media.path,edit.x,edit.y,edit.width,edit.height,edit.rotation,edit.fit,target.width,target.height]);
  return <div className="crop-preview">{failed?<span>{t('unavailable')}</span>:<canvas ref={canvas} width={Math.max(1,Math.round(size.width*scale))} height={Math.max(1,Math.round(size.height*scale))}/>}</div>;
}

export function ImportWorkflow({target,album,onClose,onQueued,renderEditor}:{target:Target;album:Album;onClose:()=>void;onQueued:()=>void;renderEditor:(props:WorkflowEditorProps)=>React.ReactNode}){
  const [stage,setStage]=useState<'select'|'edit'|'review'>('select'),[candidates,setCandidates]=useState<Media[]>([]),[selected,setSelected]=useState<string[]>([]),[uploaded,setUploaded]=useState(new Set<string>()),[filter,setFilter]=useState<'new'|'all'>('new');
  const [busy,setBusy]=useState(false),[checking,setChecking]=useState(false),[error,setError]=useState(''),[chosen,setChosen]=useState<Media[]>([]),[edits,setEdits]=useState<(Edit|undefined)[]>([]),[index,setIndex]=useState(0),[mode,setMode]=useState<'each'|'first'>('each'),[adjusting,setAdjusting]=useState(false),[previewReady,setPreviewReady]=useState(new Set<string>());
  const live=useRef<Edit|undefined>(undefined),requestId=useRef(crypto.randomUUID()),active=useRef(true),statusGeneration=useRef(0);
  useEffect(()=>()=>{active.current=false;statusGeneration.current++;},[]);
  const visible=candidates.filter(item=>filter==='all'||!uploaded.has(item.id)),hasVideo=candidates.some(item=>selected.includes(item.id)&&item.kind==='video');
  const checkStatus=async(list:Media[],refresh=false)=>{
    const stamp=++statusGeneration.current;setChecking(true);
    try{const ids=await api.importStatus(target,list.map(item=>item.id),refresh);if(!active.current||stamp!==statusGeneration.current)return null;const found=new Set<string>(ids);setUploaded(found);return found;}
    finally{if(active.current&&stamp===statusGeneration.current)setChecking(false);}
  };
  const chooseFiles=async()=>{
    setBusy(true);setError('');
    try{
      const incoming=await api.importMedia();if(!active.current||!incoming.length)return;
      const list=mergeImported(candidates,incoming);setCandidates(list);
      const found=await checkStatus(list);if(!active.current||!found)return;
      const eligible=incoming.map(item=>list.find(candidate=>(candidate.sourceKey??candidate.id)===(item.sourceKey??item.id))!).filter(item=>filter==='all'||!found.has(item.id));
      setSelected(validImportSelection(eligible)?[...new Set(eligible.map(item=>item.id))]:[]);
    }catch(e){if(active.current)setError(errorText(e));}finally{if(active.current)setBusy(false);}
  };
  const refreshStatus=async()=>{setError('');try{const found=await checkStatus(candidates,true);if(found&&filter==='new')setSelected(old=>old.filter(id=>!found.has(id)));}catch(e){if(active.current)setError(errorText(e));}};
  const start=()=>{
    const list=candidates.filter(item=>selected.includes(item.id));if(!validImportSelection(list))return;
    const prepared=list.map(item=>edits.find(edit=>edit?.mediaId===item.id));setChosen(list);setEdits(prepared);setIndex(0);setAdjusting(false);live.current=undefined;requestId.current=crypto.randomUUID();setStage('edit');setError('');
  };
  const enqueue=async(allEdits:Edit[])=>{
    setBusy(true);setError('');
    try{await api.enqueueBatch(target,album,allEdits,requestId.current);if(active.current)onQueued();}
    catch(e){if(active.current)setError(errorText(e));throw e;}finally{if(active.current)setBusy(false);}
  };
  const review=(next:(Edit|undefined)[])=>{setEdits(next);setPreviewReady(new Set());setStage('review');setError('');};
  const saveEdit=async(edit:Edit)=>{
    if(chosen[index].kind==='video'){await enqueue([edit]);return;}
    const next=[...edits];next[index]=edit;
    if(adjusting){review(next);return;}
    if(mode==='first'){
      const settings=settingsFromEdit(chosen[0],target,edit);
      review(chosen.map(item=>editFromSettings(item,target,settings)));return;
    }
    setEdits(next);const unfinished=next.findIndex(item=>!item);
    if(unfinished<0)review(next);else{live.current=undefined;setIndex(unfinished);}
  };
  const switchPhoto=(nextIndex:number)=>{
    const current=live.current;if(current)setEdits(old=>old.map((value,i)=>i===index?current:value));
    live.current=undefined;setIndex(nextIndex);
  };
  const stepper=<div className="import-steps"><span className={stage==='select'?'active':'done'}><b>{stage==='select'?'1':'✓'}</b>{t('chooseStep')}</span><i/><span className={stage!=='select'?'active':''}><b>2</b>{t('cropStep')}</span></div>;
  const errorBanner=error&&<div role="alert" className="error-banner">{error==='IMPORT_SELECTION_RULE'?t('selectionConflict'):localizeError(error)}<button onClick={()=>setError('')}>×</button></div>;
  if(stage==='edit'){
    const media=chosen[index],photoBatch=media.kind==='photo'&&chosen.length>1;
    const workHeader=photoBatch&&<div className="crop-mode"><div className="tabs"><button className={mode==='each'?'active':''} aria-pressed={mode==='each'} onClick={()=>setMode('each')}>{t('individualCrop')}</button><button className={mode==='first'?'active':''} aria-pressed={mode==='first'} onClick={()=>{setMode('first');setAdjusting(false);switchPhoto(0);}}>{t('reuseFirst')}</button></div><small>{t('batchHint')}</small></div>;
    const workFooter=photoBatch&&<div className="crop-filmstrip"><p>{t('cropPosition',{index:index+1,count:chosen.length})} · {t('readyCount',{ready:edits.filter(Boolean).length,count:chosen.length})}</p><div>{chosen.map((item,i)=><button key={item.id} className={i===index?'active':''} disabled={mode==='first'&&!adjusting&&i!==0} onClick={()=>switchPhoto(i)}><img src={item.preview} alt=""/><span>{mode==='first'&&i===0?t('template'):i+1}</span></button>)}</div></div>;
    const saveLabel=media.kind==='video'?t('save'):adjusting?t('saveReview'):mode==='first'&&photoBatch?t('applyPreview',{count:chosen.length-1}):edits.every((edit,i)=>i===index||!!edit)?t('reviewCrops'):t('saveNext');
    return <>{renderEditor({media,target,remaining:chosen.length,initialEdit:edits[index],onChange:edit=>{live.current=edit;},onCancel:()=>setStage('select'),onSave:saveEdit,backLabel:t('backSelection'),saveLabel,workHeader,workFooter,extraControls:photoBatch&&mode==='first'&&!adjusting?<div className="batch-option"><strong>✓ {t('firstTemplate')}</strong><small>{t('batchHint')}</small></div>:undefined})}</>;
  }
  return <section className="import-flow" data-testid="import-flow">
    <div className="import-heading"><button className="text-button" onClick={stage==='select'?onClose:()=>setStage('select')}>‹ {stage==='select'?t('back'):t('backSelection')}</button><h1>{stage==='select'?t('import'):t('reviewCrops')}</h1><p>{t('importTo',{name:target.DeviceName,width:target.width,height:target.height})}</p></div>
    {stepper}{errorBanner}
    {stage==='select'?<>
      <div className="import-source"><span className="folder-symbol" aria-hidden="true"><svg width="38" height="32" viewBox="0 0 38 32" fill="none"><path d="M2 27V5a3 3 0 0 1 3-3h10l4 5h14a3 3 0 0 1 3 3v17H2Z" fill="#F1B839"/><path d="M2 12h34l-3 17H5L2 12Z" fill="#FFD169"/></svg></span><div><strong>{t('mediaFiles')}</strong><small>{t('chooseHint')}</small></div><button onClick={()=>void chooseFiles()} disabled={busy||checking}>{busy?t('loading'):t('chooseFiles')}</button></div>
      <div className="import-filters"><span>{t('uploadStatus')}</span><div className="tabs"><button aria-pressed={filter==='new'} className={filter==='new'?'active':''} onClick={()=>{setFilter('new');setSelected(old=>old.filter(id=>!uploaded.has(id)));}}>{t('notUploaded')}</button><button aria-pressed={filter==='all'} className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>{t('all')}</button></div><small>{t('statusHint')}</small><button className="text-button" disabled={!candidates.length||checking||busy} onClick={()=>void refreshStatus()}>{checking?t('checkingStatus'):t('refreshStatus')}</button></div>
      <div className="import-selection"><span>{t('foundFiles',{count:candidates.length,hidden:filter==='new'?uploaded.size:0})}</span><div>{!hasVideo&&visible.some(item=>item.kind==='photo')&&<button disabled={checking||busy} onClick={()=>setSelected(visible.filter(item=>item.kind==='photo').map(item=>item.id))}>{t('selectPhotos')}</button>}<span>{t('selected',{count:selected.length})}</span>{selected.length>0&&<button className="text-button" onClick={()=>setSelected([])}>{t('clearSelection')}</button>}</div></div>
      <div className="import-grid">{visible.map(item=>{
        const checked=selected.includes(item.id),locked=!checked&&selected.length>0&&(hasVideo||item.kind==='video');
        return <label key={item.id} className={'import-tile '+(checked?'selected ':'')+(locked?'locked':'')} title={locked?t('selectionConflict'):item.name}>
          <div className="import-image"><img src={item.preview} alt=""/><input type="checkbox" checked={checked} disabled={locked||busy||checking} aria-label={item.name} onChange={()=>{const next=toggleImportSelection(selected,item,candidates);if(next){setSelected(next);setError('');}else setError('IMPORT_SELECTION_RULE');}}/>{item.kind==='video'&&<span className="import-video-badge">▶ {duration(item.duration)}</span>}{uploaded.has(item.id)&&<span className="import-uploaded">✓ {t('alreadyUploaded')}</span>}</div><strong>{item.name}</strong>
        </label>;
      })}</div>
      {!visible.length&&<div className="import-empty">{checking?t('checkingStatus'):candidates.length?t('foundFiles',{count:candidates.length,hidden:uploaded.size}):t('chooseHint')}</div>}
      <div className="import-rule"><span>ⓘ</span><div><strong>{t('selectionRule')}</strong>{hasVideo&&<small>{t('videoChosen')}</small>}</div></div>
      <div className="import-footer"><span>{t('selected',{count:selected.length})}</span><button onClick={onClose}>{t('cancel')}</button><button className="primary" disabled={busy||checking||!selected.length} onClick={start}>{t('nextCrop')}</button></div>
    </>:<>
      <p className="review-notice">{t('previewNotice')}</p>
      <div className="crop-review-grid">{chosen.map((media,i)=>edits[i]&&<article key={media.id}>
        <CropPreview media={media} edit={edits[i]!} target={target} onReady={()=>setPreviewReady(old=>new Set([...old,media.id]))}/><div><strong>{media.name}</strong><button onClick={()=>{setAdjusting(true);live.current=undefined;setIndex(i);setStage('edit');}}>{t('adjust')}</button></div>
      </article>)}</div>
      <div className="import-footer"><span>{t('readyCount',{ready:previewReady.size,count:chosen.length})}</span><button disabled={busy} onClick={()=>{setAdjusting(false);setIndex(0);setStage('edit');}}>{t('editPhoto')}</button><button className="primary" disabled={busy||previewReady.size!==chosen.length||edits.some(edit=>!edit)} onClick={()=>void enqueue(edits as Edit[]).catch(()=>{})}>{busy?t('adding'):t('uploadCount',{count:chosen.length})}</button></div>
    </>}
  </section>;
}
