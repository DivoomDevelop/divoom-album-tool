/** Actual Tauri/WebView2 + full-thread simulator acceptance. Deletes only this run's media. */
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import * as lan from '../backend/transport';
import { run } from '../backend/media';
import { languages, translate } from '../src/i18n';
import type { Album, Job, Target } from '../src/shared';
const {chromium}=createRequire(resolve('package.json'))('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function main(){
  const directory=resolve(`artifacts/ui/import-${Date.now()}`);await mkdir(directory,{recursive:true});
  const ffmpeg=resolve('vendor/ffmpeg.exe'),source='C:/Users/Administrator/Desktop/400000012-1792157474503-0.mp4';
  const landscape=join(directory,'landscape.jpg'),portrait=join(directory,'portrait.jpg'),video=join(directory,'clip.mp4');
  await run(ffmpeg,['-y','-v','error','-ss','0','-i',source,'-vf','scale=960:640','-frames:v','1',landscape]);
  await run(ffmpeg,['-y','-v','error','-ss','1','-i',source,'-vf','crop=320:480,scale=640:960','-frames:v','1',portrait]);
  await run(ffmpeg,['-y','-v','error','-i',source,'-t','2','-vf','scale=480:480','-c:v','libx264','-pix_fmt','yuv420p','-an',video]);
  const target=await lan.connect({DevicePrivateIP:'127.0.0.1',DeviceName:'AstroToo simulator'}),album:Album={ClockId:930000000+Date.now()%1000000,ClockName:'Unified Import '+Date.now(),AlbumType:0};
  await lan.command(target,'Photo/NewAlbum',{...album});
  const browser=await chromium.connectOverCDP('http://127.0.0.1:9224'),page=browser.contexts()[0].pages()[0];
  const errors:string[]=[],checks:string[]=[];page.on('pageerror',(e:Error)=>errors.push(e.message));
  const rpc=(method:string,...args:unknown[])=>page.evaluate(async({method,args}:any)=>(window as any).__TAURI_INTERNALS__.invoke('rpc',{method,args}),{method,args});
  const jobs=async():Promise<Job[]>=>rpc('jobs');
  const waitJobs=async(count:number)=>{
    for(let i=0;i<160;i++){const list=await jobs();if(list.length>=count&&list.slice(0,count).every(job=>['已完成','需检查','已取消'].includes(job.state))){assert.ok(list.slice(0,count).every(job=>job.state==='已完成'),JSON.stringify(list));return list;}await page.waitForTimeout(300);}
    throw Error('Upload queue did not finish');
  };
  const setFiles=async(paths:string[])=>page.evaluate((paths:string[])=>{(window as any).__importPaths=paths;},paths);
  const choose=()=>page.getByRole('button',{name:'选择文件…',exact:true}).click();
  const layout=async(label:string)=>{
    const overflow=await page.evaluate(()=>[...document.querySelectorAll('.import-flow,.import-filters,.import-selection,.import-footer,.import-rule,.editor,.editor-controls,.crop-mode')].filter(el=>el.scrollWidth>el.clientWidth+2).map(el=>el.className));assert.deepEqual(overflow,[],label);
  };
  try{
    await page.reload();await page.getByTestId('language-select').selectOption('zh-CN');
    await page.getByRole('button',{name:'手动 IP',exact:true}).click();await page.getByRole('textbox',{name:'设备 IP',exact:true}).fill('127.0.0.1');await page.getByRole('button',{name:'连接设备',exact:true}).click();
    await page.getByRole('button',{name:album.ClockName,exact:true}).click();
    await page.evaluate(()=>{
      const ui=window as any,api=window.timesframe;ui.__submitted=[];
      api.importMedia=async()=>{const result=await ui.__TAURI_INTERNALS__.invoke('rpc',{method:'import',args:[ui.__importPaths]});if(result.failures.length)throw Error(JSON.stringify(result.failures));return result.media;};
      const enqueue=api.enqueueBatch;api.enqueueBatch=async(...args)=>{ui.__submitted.push(args);return enqueue(...args);};
    });
    await setFiles([landscape,portrait,video]);await page.locator('.import-button').click();await choose();
    await page.waitForFunction(()=>document.querySelectorAll('.import-tile').length===3&&document.querySelectorAll('.import-tile input:checked').length===0);
    assert.equal(await page.locator('.import-filters .tabs button').count(),2);
    await page.getByRole('checkbox',{name:'clip.mp4',exact:true}).check();
    assert.equal(await page.locator('.import-tile input:checked').count(),1);assert.equal(await page.getByRole('checkbox',{name:'landscape.jpg',exact:true}).isDisabled(),true);
    const positions=await page.evaluate(()=>({grid:document.querySelector('.import-grid')!.getBoundingClientRect().bottom,hint:document.querySelector('.import-rule')!.getBoundingClientRect().top}));assert.ok(positions.hint>=positions.grid);
    await page.screenshot({path:join(directory,'unified-video-selection.png'),fullPage:true});checks.push('one unified gallery; selected video restricts import to one file; hint below gallery');
    for(const {locale} of languages){await page.getByTestId('language-select').selectOption(locale);await page.getByText(translate(locale,'selectionRule'),{exact:true}).waitFor();await layout('picker '+locale);}
    await page.getByTestId('language-select').selectOption('de');await page.setViewportSize({width:1100,height:760});await layout('German picker minimum size');await page.screenshot({path:join(directory,'picker-de-1100.png'),fullPage:true});
    await page.setViewportSize({width:1480,height:920});await page.getByTestId('language-select').selectOption('zh-CN');
    await page.locator('.import-selection').getByRole('button',{name:'取消选择',exact:true}).click();
    await page.getByRole('checkbox',{name:'landscape.jpg',exact:true}).check();await page.getByRole('checkbox',{name:'portrait.jpg',exact:true}).check();assert.equal(await page.getByRole('checkbox',{name:'clip.mp4',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'下一步：裁剪',exact:true}).click();
    await page.getByRole('button',{name:'沿用第一张',exact:true}).click();
    await page.getByRole('button',{name:'↻ 旋转 90°',exact:true}).click();const zoom=page.getByRole('slider',{name:'缩放',exact:true});await zoom.focus();for(let i=0;i<20;i++)await page.keyboard.press('ArrowRight');
    const templateZoom=Number(await zoom.inputValue());
    const actionBounds=await page.locator('.editor-actions .save-button').boundingBox();assert.ok(actionBounds&&actionBounds.y+actionBounds.height<=920,'primary crop action is outside the window');
    await page.screenshot({path:join(directory,'batch-first-crop.png'),fullPage:true});
    for(const {locale} of languages){await page.getByTestId('language-select').selectOption(locale,{force:true});await layout('crop '+locale);}
    await page.getByTestId('language-select').selectOption('zh-CN',{force:true});await page.getByRole('button',{name:'应用并预览 1 张',exact:true}).click();
    await page.getByRole('heading',{name:'查看裁剪结果',exact:true}).waitFor();await page.getByRole('button',{name:'加入上传队列（2 项）',exact:true}).waitFor();
    await page.waitForFunction(()=>!(document.querySelector('.import-footer .primary') as HTMLButtonElement).disabled);
    await page.screenshot({path:join(directory,'batch-review.png'),fullPage:true});
    await page.locator('.crop-review-grid article').nth(1).getByRole('button',{name:'调整',exact:true}).click();
    assert.ok(Math.abs(Number(await zoom.inputValue())-templateZoom)<.001,'portrait did not inherit first relative zoom');await zoom.focus();await page.keyboard.press('ArrowRight');
    await page.getByRole('button',{name:'保存并返回预览',exact:true}).click();
    await page.getByRole('button',{name:'加入上传队列（2 项）',exact:true}).click();
    let completed=await waitJobs(2);checks.push('first crop applied to landscape and portrait; each result previewed; individual override; two actual WebP uploads');
    const submitted=await page.evaluate(()=>(window as any).__submitted[0][2]);assert.equal(submitted.length,2);assert.equal(submitted[0].rotation,90);assert.equal(submitted[1].rotation,90);assert.ok(submitted[0].width!==submitted[1].width);
    await page.locator('.import-button').click();await choose();await page.waitForFunction(()=>document.querySelectorAll('.import-tile').length===1);
    await page.screenshot({path:join(directory,'filter-confirmed-uploads.png'),fullPage:true});
    await page.locator('.import-filters').getByRole('button',{name:'全部',exact:true}).click();assert.equal(await page.locator('.import-tile').count(),3);assert.equal(await page.locator('.import-uploaded').count(),2);
    checks.push('confirmed files hidden by default; All restores them with upload badges');
    // Delete only our first photo and verify it is offered again after explicit status refresh.
    const nativeTarget:Target=await rpc('connect',{DevicePrivateIP:'127.0.0.1'});
    await rpc('manage',nativeTarget,album,[completed[0].photoId],false);
    await page.locator('.import-filters').getByRole('button',{name:'仅未上传',exact:true}).click();await page.getByRole('button',{name:'刷新状态',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.import-tile').length===2);checks.push('deleted frame photo is selectable again after refresh');
    // Exercise individual photo editing without duplicating existing uploads.
    await page.locator('.import-filters').getByRole('button',{name:'全部',exact:true}).click();await page.locator('.import-selection').getByRole('button',{name:'取消选择',exact:true}).click();
    await page.getByRole('button',{name:'全选照片',exact:true}).click();await page.getByRole('button',{name:'下一步：裁剪',exact:true}).click();
    await page.getByRole('button',{name:'保存并下一张',exact:true}).click();await page.getByRole('button',{name:'查看裁剪结果',exact:true}).click();
    assert.equal(await page.locator('.crop-review-grid article').count(),2);checks.push('individual photo crop walks through both images before review');
    await page.getByRole('button',{name:'‹ 返回选择',exact:true}).click();await page.getByRole('button',{name:'‹ 返回相簿',exact:true}).click();
    await page.locator('.import-button').click();await setFiles([video]);await choose();await page.getByRole('button',{name:'下一步：裁剪',exact:true}).click();
    await page.waitForFunction(()=>{const v=document.querySelector('.source-video') as HTMLVideoElement;return v?.readyState>=2;});
    await page.getByRole('button',{name:'保存并加入上传队列',exact:true}).click();completed=await waitJobs(3);checks.push('one video queued with mandatory WebP cover');
    const all=(await lan.albums(target)).find(a=>a.AlbumType===1)!;
    const records=await lan.photos(target,all.ClockId);assert.ok(records.some(p=>p.PhotoId===completed[2].photoId));
    assert.deepEqual(errors,[]);
    await writeFile(join(directory,'report.json'),JSON.stringify({result:'PASS',runtime:'Tauri/WebView2 + simulator',languages:19,checks,jobs:completed,submitted,errors,directory},null,2));
    console.log(JSON.stringify({result:'PASS',checks,languages:19,jobs:completed.map(job=>({id:job.photoId,state:job.state})),directory}));
  }finally{
    for(const job of await jobs().catch(()=>[]))if(job.clockId===album.ClockId&&job.photoId)await lan.command(target,'Photo/DeletePhoto',{ClockId:album.ClockId,PhotoList:[job.photoId],ParentClockId:0,ParentItemId:'0'}).catch(()=>{});
    await lan.command(target,'Photo/DeleteAlbum',{ClockId:album.ClockId}).catch(()=>{});await browser.close();
  }
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
