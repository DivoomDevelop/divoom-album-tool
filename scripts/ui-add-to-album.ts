/** Actual Tauri + simulator album-reference copy. All writes target isolated test albums/media. */
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import * as lan from '../backend/transport';
import { run } from '../backend/media';
import { editFromSettings } from '../src/importing';
import { languages, translate } from '../src/i18n';
import type { Album, Job, Media, Photo, Target } from '../src/shared';
const {chromium}=createRequire(resolve('package.json'))('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

async function main(){
  const directory=resolve(`artifacts/ui/add-album-${Date.now()}`);await mkdir(directory,{recursive:true});
  const input='C:/Users/Administrator/Desktop/400000012-1792157474503-0.mp4',ffmpeg=resolve('vendor/ffmpeg.exe'),photo=join(directory,'photo.jpg'),video=join(directory,'video.mp4');
  await run(ffmpeg,['-y','-v','error','-i',input,'-frames:v','1',photo]);
  await run(ffmpeg,['-y','-v','error','-i',input,'-t','2','-c:v','libx264','-pix_fmt','yuv420p','-an',video]);
  const target=await lan.connect({DevicePrivateIP:'127.0.0.1'}),base=950000000+Date.now()%1000000;
  const albums:Album[]=['Source','Destination','Other'].map((name,i)=>({ClockId:base+i,ClockName:`Album Copy ${name} ${base}`,AlbumType:0}));
  for(const album of albums)await lan.command(target,'Photo/NewAlbum',{...album});
  const [source,destination,other]=albums;
  const browser=await chromium.connectOverCDP('http://127.0.0.1:9224'),page=browser.contexts()[0].pages()[0],errors:string[]=[],checks:string[]=[];
  page.on('pageerror',(e:Error)=>errors.push(e.message));
  const rpc=(method:string,...args:unknown[])=>page.evaluate(async({method,args}:any)=>(window as any).__TAURI_INTERNALS__.invoke('rpc',{method,args}),{method,args});
  const dialog=()=>page.getByRole('dialog',{name:'添加到其它相簿',exact:true});
  let nativeTarget:Target|undefined,ids:number[]=[];
  try{
    await page.reload();await page.getByTestId('language-select').selectOption('zh-CN');
    await page.evaluate(()=>{
      const api=window.timesframe,ui=window as any,connect=api.connect,add=api.addToAlbum;ui.__albumAdds=[];
      api.connect=async(...args)=>{const target=await connect(...args);ui.__target=target;return target;};
      api.addToAlbum=async(...args)=>{ui.__albumAdds.push(args);return add(...args);};
    });
    await page.getByRole('button',{name:'手动 IP',exact:true}).click();await page.getByRole('textbox',{name:'设备 IP',exact:true}).fill('127.0.0.1');await page.getByRole('button',{name:'连接设备',exact:true}).click();
    await page.getByRole('button',{name:'刷新相簿',exact:true}).click();
    await page.getByRole('button',{name:source.ClockName,exact:true}).click();nativeTarget=await page.evaluate(()=>(window as any).__target);
    const imported:{media:Media[];failures:any[]}=await rpc('import',[photo,video]);assert.equal(imported.failures.length,0);
    for(const media of imported.media)await rpc('enqueue',nativeTarget,source,editFromSettings(media,nativeTarget!));
    let jobs:Job[]=[];
    for(let attempt=0;attempt<120;attempt++){jobs=(await rpc('jobs') as Job[]).filter(job=>job.clockId===source.ClockId);if(jobs.length===2&&jobs.every(job=>['已完成','需检查'].includes(job.state)))break;await page.waitForTimeout(200);}
    assert.equal(jobs.length,2);assert.ok(jobs.every(job=>job.state==='已完成'),JSON.stringify(jobs));ids=jobs.map(job=>job.photoId!);
    await page.waitForFunction(()=>[...document.querySelectorAll('.job-name')].filter(el=>/photo.jpg|video.mp4/.test(el.textContent??'')).every(el=>el.querySelector('small')?.textContent==='已完成'));
    const records:Photo[]=await lan.photos(target,source.ClockId),originals=await Promise.all(records.map(record=>lan.request(target,lan.filePath(record.OriginalFileId!),'GET')));
    assert.equal(records.length,2);
    // Cache the empty destination through the native worker; later navigation must invalidate it.
    assert.deepEqual(await rpc('photos',nativeTarget,destination.ClockId,1),[]);
    await page.getByRole('button',{name:'刷新相簿',exact:true}).click();
    await page.waitForFunction(()=>{const button=document.querySelector('.toolbar-right>button') as HTMLButtonElement;return button&&!button.disabled;});
    for(const id of ids)await page.getByRole('button',{name:`选择媒体 ${id}`,exact:true}).click();
    await page.getByRole('button',{name:'添加到相簿',exact:true}).click();await dialog().getByRole('combobox').waitFor();
    const values=await dialog().locator('option').evaluateAll((options:HTMLOptionElement[])=>options.map(option=>Number(option.value)));
    assert.ok(values.includes(destination.ClockId)&&values.includes(other.ClockId));assert.ok(!values.includes(source.ClockId));
    for(const album of await lan.albums(target))if(album.AlbumType!==0)assert.ok(!values.includes(album.ClockId),'system album offered as destination');
    for(const {locale} of languages){
      await page.getByTestId('language-select').selectOption(locale,{force:true});await page.getByRole('heading',{name:translate(locale,'addToOtherAlbum'),exact:true}).waitFor();
      const overflow=await page.locator('.add-album-dialog').evaluate((el:Element)=>el.scrollWidth>el.clientWidth+2);assert.equal(overflow,false,locale);
    }
    await page.getByTestId('language-select').selectOption('de',{force:true});await page.setViewportSize({width:1100,height:760});await page.screenshot({path:join(directory,'dialog-de-1100.png'),fullPage:true});
    await page.setViewportSize({width:1480,height:920});await page.getByTestId('language-select').selectOption('zh-CN',{force:true});
    await dialog().getByRole('combobox').selectOption(String(destination.ClockId));await page.screenshot({path:join(directory,'choose-destination.png'),fullPage:true});
    await dialog().getByRole('button',{name:'添加',exact:true}).click();await dialog().waitFor({state:'detached',timeout:15000});
    await page.waitForFunction((message:string)=>document.querySelector('.success-banner')?.textContent?.includes(message),`已将 2 项添加到“${destination.ClockName}”`);
    assert.deepEqual((await lan.photos(target,source.ClockId)).map(p=>p.PhotoId).sort(),ids.slice().sort());
    await page.getByRole('button',{name:destination.ClockName,exact:true}).click();
    await page.waitForFunction((ids:number[])=>ids.every(id=>!!document.querySelector(`button[aria-label="选择媒体 ${id}"]`)),ids);
    assert.equal(await page.locator('.media-tile').count(),2);
    checks.push('actual photo and video references added through native UI; source kept; destination cache refreshed; all 19 dialog languages');
    for(let i=0;i<records.length;i++)assert.deepEqual((await lan.request(target,lan.filePath(records[i].OriginalFileId!),'GET')).data,originals[i].data);
    checks.push('original photo/video file bytes unchanged');
    // Repeating the same add must not duplicate references or allocate new photo IDs.
    await page.getByRole('button',{name:source.ClockName,exact:true}).click();for(const id of ids)await page.getByRole('button',{name:`选择媒体 ${id}`,exact:true}).click();
    await page.getByRole('button',{name:'添加到相簿',exact:true}).click();await dialog().getByRole('combobox').selectOption(String(destination.ClockId));await dialog().getByRole('button',{name:'添加',exact:true}).click();await dialog().waitFor({state:'detached'});
    assert.equal((await lan.photos(target,destination.ClockId)).length,2);checks.push('repeat add produces no duplicate destination entries');
    // Create a new target while the chooser is open and verify explicit refresh exposes it.
    await page.getByRole('button',{name:`选择媒体 ${ids[0]}`,exact:true}).click();await page.getByRole('button',{name:'添加到相簿',exact:true}).click();
    const fresh:Album={ClockId:base+3,ClockName:'Album Copy New '+base,AlbumType:0};await lan.command(target,'Photo/NewAlbum',{...fresh});albums.push(fresh);
    await dialog().getByRole('button',{name:'刷新相簿',exact:true}).click();await dialog().getByRole('combobox').locator(`option[value="${fresh.ClockId}"]`).waitFor({state:'attached'});
    await dialog().getByRole('button',{name:'取消',exact:true}).click();assert.equal((await lan.photos(target,fresh.ClockId)).length,0);checks.push('refresh discovers new target; cancel performs no add');
    // A destination removed after selection is rejected before any write.
    await page.getByRole('button',{name:'添加到相簿',exact:true}).click();await dialog().getByRole('combobox').selectOption(String(destination.ClockId));await lan.command(target,'Photo/DeleteAlbum',{ClockId:destination.ClockId});
    await dialog().getByRole('button',{name:'添加',exact:true}).click();await dialog().getByRole('alert').getByText(translate('zh-CN','albumDestinationUnavailable'),{exact:true}).waitFor();await dialog().getByRole('button',{name:'取消',exact:true}).click();checks.push('deleted destination rejected with localized error');
    // Copy from the system All Photos album into a regular album.
    await page.locator('nav .album-item').filter({has:page.getByText('全部照片',{exact:true})}).click();for(const id of ids)await page.getByRole('button',{name:`选择媒体 ${id}`,exact:true}).click();
    await page.getByRole('button',{name:'添加到相簿',exact:true}).click();await dialog().getByRole('combobox').selectOption(String(other.ClockId));await dialog().getByRole('button',{name:'添加',exact:true}).click();await dialog().waitFor({state:'detached'});
    assert.deepEqual((await lan.photos(target,other.ClockId)).map(p=>p.PhotoId).sort(),ids.slice().sort());checks.push('All Photos can be the source');
    assert.deepEqual(errors,[]);const report={result:'PASS',runtime:'Tauri/WebView2 + Debug/x86 simulator',photoIds:ids,checks,languages:19,errors,directory};await writeFile(join(directory,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }finally{
    if(nativeTarget)for(const job of await rpc('jobs').catch(()=>[]) as Job[])if(job.clockId===source.ClockId&&job.photoId&&!ids.includes(job.photoId))ids.push(job.photoId);
    for(const id of ids)await lan.command(target,'Photo/DeletePhoto',{ClockId:source.ClockId,PhotoList:[id],ParentClockId:0,ParentItemId:'0'}).catch(()=>{});
    for(const album of albums)await lan.command(target,'Photo/DeleteAlbum',{ClockId:album.ClockId}).catch(()=>{});await browser.close();
  }
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
