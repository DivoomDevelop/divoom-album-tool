import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { editFromSettings, settingsFromEdit, mergeImported, toggleImportSelection, validImportSelection } from '../src/importing';
import { validateEdit } from '../backend/media';
import { sourceFingerprint, UploadHistory } from '../backend/history';
import type { Media, Target, Photo } from '../src/shared';
const target:Target={DeviceId:11,Hardware:530,cacheIdentity:'id:11',DeviceName:'Test',DevicePrivateIP:'127.0.0.1',port:9000,apiPath:'/divoom_api',width:480,height:480,maxUploadBytes:536870912,maxVideoSeconds:1800};
const photo:Media={id:'p1',name:'same.jpg',path:'same.jpg',width:1920,height:1080,duration:0,size:1,kind:'photo',preview:'',sourceKey:'one'};
const other={...photo,id:'p2',width:1080,height:1920,sourceKey:'two'},video:Media={...photo,id:'v1',kind:'video',duration:35};

test('long sources default to a 10-minute crop without modifying source duration',()=>{
  const source={...video,duration:1801},edit=editFromSettings(source,target);
  assert.equal(edit.end,600);assert.equal(source.duration,1801);validateEdit(source,edit,target);
});
test('unified selection permits multiple photos or exactly one video and clearing restores choices',()=>{
  const all=[photo,other,video,{...video,id:'v2'}];
  assert.equal(validImportSelection([]),false);assert.equal(validImportSelection([photo,other]),true);assert.equal(validImportSelection([video]),true);
  assert.equal(validImportSelection([photo,video]),false);assert.equal(validImportSelection([video,all[3]]),false);
  assert.deepEqual(toggleImportSelection(['p1'],other,all),['p1','p2']);assert.equal(toggleImportSelection(['p1'],video,all),null);
  assert.equal(toggleImportSelection(['v1'],photo,all),null);assert.deepEqual(toggleImportSelection(['v1'],video,all),[]);
  assert.deepEqual(toggleImportSelection([],photo,all),['p1']);
});
test('source-content identity handles renames without merging different same-name files',()=>{
  const merged=mergeImported([photo],[{...photo,id:'renamed',name:'renamed.jpg'},other]);
  assert.deepEqual(merged.map(m=>m.id),['p1','p2']);assert.equal(merged[0].name,merged[1].name);
});
test('first-photo crop adapts to portrait, landscape and device aspect ratio without copying pixel coordinates',()=>{
  for(const screen of [target,{...target,width:640,height:360}])for(const rotation of [0,90,180,270]){
    const settings={rotation,zoom:1.8,centerX:.4,centerY:.6},first=editFromSettings(photo,screen,settings),template=settingsFromEdit(photo,screen,first);
    const applied=editFromSettings(other,screen,template);validateEdit(photo,first,screen);validateEdit(other,applied,screen);
    assert.equal(applied.mediaId,'p2');assert.equal(applied.rotation,rotation);assert.ok(Math.abs(applied.width/applied.height-(rotation%180?other.height/other.width:other.width/other.height))<1e-10);
    const actual=settingsFromEdit(other,screen,applied);assert.ok(Math.abs(actual.zoom-settings.zoom)<1e-10);assert.ok(applied.x>=0&&applied.y>=0);
  }
});
test('upload history survives restart, isolates device IDs, and un-hides deleted or reused photo IDs',async()=>{
  const root=await mkdtemp(join(tmpdir(),'divoom-history-'));
  try{
    const file=join(root,'original.jpg'),renamed=join(root,'renamed.jpg');await writeFile(file,'same bytes');await writeFile(renamed,'same bytes');
    const key=await sourceFingerprint(file);assert.equal(await sourceFingerprint(renamed),key);await writeFile(renamed,'different bytes');assert.notEqual(await sourceFingerprint(renamed),key);
    const record:Photo={PhotoId:5,Time:100,FileId:'/userdata/thumb.webp',OriginalFileId:'/userdata/photo.webp',MediaType:'photo'};
    const history=new UploadHistory(join(root,'history'));await history.confirm(target,key,record);
    const restarted=new UploadHistory(join(root,'history'));
    assert.deepEqual([...(await restarted.uploaded({...target,DevicePrivateIP:'127.0.0.2'},[key],[record]))],[key]);
    assert.equal((await restarted.uploaded({...target,DeviceId:12},[key],[record])).size,0);
    assert.equal((await restarted.uploaded(target,[key],[])).size,0);
    assert.equal((await restarted.uploaded(target,[key],[{...record,Time:101}])).size,0);
    assert.equal((await restarted.uploaded(target,[key],[{...record,OriginalFileId:'/userdata/another.webp'}])).size,0);
    await Promise.all([restarted.confirm(target,'second',record),restarted.confirm(target,'third',record)]);
    assert.equal((await restarted.uploaded(target,[key,'second','third'],[record])).size,3);
  }finally{await rm(root,{recursive:true,force:true});}
});
