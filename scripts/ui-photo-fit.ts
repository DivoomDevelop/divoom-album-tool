/** Actual Tauri/WebView2 + worker, using generated media and a loopback device fixture. */
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {run,probe} from '../backend/media';
import {languages,translate} from '../src/i18n';
import type {Job} from '../src/shared';
const {chromium}=createRequire(resolve('package.json'))('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function main(){
 const directory=resolve('artifacts/ui/photo-fit-'+Date.now());await mkdir(directory,{recursive:true});const ffmpeg=resolve('vendor/ffmpeg.exe'),paths=[join(directory,'wide.png'),join(directory,'portrait.JPG'),join(directory,'clip.mp4')];
 await run(ffmpeg,['-v','error','-f','lavfi','-i','testsrc2=s=1600x1200','-frames:v','1',paths[0]]);
 await run(ffmpeg,['-v','error','-f','lavfi','-i','testsrc2=s=1440x1080','-frames:v','1',paths[1]]);
 const jpeg=await readFile(paths[1]);await writeFile(paths[1],Buffer.concat([jpeg.subarray(0,2),Buffer.from('ffe1002245786966000049492a0008000000010012010300010000000600000000000000','hex'),jpeg.subarray(2)]));
 if(process.env.DIVOOM_TEST_PHOTOS){const originals=process.env.DIVOOM_TEST_PHOTOS.split(';');assert.equal(originals.length,2);paths.splice(0,2,...originals);}
 await run(ffmpeg,['-v','error','-f','lavfi','-i','testsrc2=s=360x640:r=30','-t','2','-c:v','libx264','-pix_fmt','yuv420p',paths[2]]);
 let hardware=511;const uploads:any[]=[],mediaFiles=new Map<string,Buffer>(),records=new Map<number,any[]>();const errors:string[]=[],checks:string[]=[];
 const server=createServer(async(req,res)=>{try{
  if(req.method==='GET'||req.method==='HEAD'){const data=mediaFiles.get(req.url!);if(!data){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Length':data.length,'Content-Type':req.url!.endsWith('.webp')?'image/webp':'video/mp4'});res.end(req.method==='HEAD'?undefined:data);return;}
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const body=Buffer.concat(chunks);let result:any={ReturnCode:0};
  if(req.url==='/upload'){
   assert.equal(Number(req.headers['content-length']),body.length);const parts:{name:string;data:Buffer}[]=[];let cursor=0;const boundary=String(req.headers['content-type']).split('boundary=')[1];
   while(cursor<body.length){if(body.subarray(cursor,cursor+boundary.length+4).toString()==='--'+boundary+'--')break;const end=body.indexOf('\r\n\r\n',cursor);assert.ok(end>=0);const head=body.subarray(cursor,end).toString(),length=Number(head.match(/Content-Length: (\d+)/i)![1]),name=head.match(/name="([^"]+)"/)![1];parts.push({name,data:body.subarray(end+4,end+4+length)});cursor=end+4+length+2;}
   const metadata=JSON.parse(parts[0].data.toString());assert.equal(metadata.PhotoTitle,'');const file=parts.find(p=>p.name===metadata.FileName);assert.ok(file);mediaFiles.set('/userdata/app_pic/'+metadata.FileName,file.data);uploads.push({hardware,metadata});await writeFile(join(directory,metadata.FileName),file.data);
   if(metadata.PreviewFileName){const cover=parts.find(p=>p.name===metadata.PreviewFileName);assert.ok(cover);mediaFiles.set('/userdata/app_pic/'+metadata.PreviewFileName,cover.data);await writeFile(join(directory,metadata.PreviewFileName),cover.data);}
   const list=records.get(hardware)??[];list.unshift({PhotoId:uploads.length,Time:Date.now()/1000,FileId:'/userdata/app_pic/'+(metadata.PreviewFileName||metadata.FileName),OriginalFileId:'/userdata/app_pic/'+metadata.FileName,MediaType:metadata.PreviewFileName?'video':'photo'});records.set(hardware,list);
  }else{const data=JSON.parse(body.toString());switch(data.Command){
   case 'Device/GetHardwareVersion':case 'Device/GetLanCapabilities':result={...result,Hardware:hardware,DeviceId:770000000+hardware,CanvasWidth:hardware===530?480:800,CanvasHeight:hardware===530?480:1280,SupportsPhotoLibrary:true,PhotoUploadMaxBytes:104857600,PhotoVideoMaxSeconds:600};break;
   case 'Photo/GetLocalAlbumList':result.AlbumList=[{ClockId:100000,ClockName:'All',AlbumType:1},{ClockId:100001,ClockName:'Fit test',AlbumType:0}];break;
   case 'Photo/GetPhotoList':result.PhotoList=records.get(hardware)??[];break;
   default:throw Error('Unexpected '+data.Command);
  }}res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(result));
 }catch(e){res.writeHead(500).end(JSON.stringify({ReturnCode:1,ReturnMessage:String(e)}));}});
 await new Promise<void>((ok,fail)=>{server.once('error',fail);server.listen(9000,'127.0.0.1',ok);});
 const child=spawn(resolve('src-tauri/target/debug/timesframe.exe'),[],{windowsHide:true,env:{...process.env,TIMESFRAME_UI_TEST:'1'},stdio:'ignore'});let browser:any;
 try{
  for(let i=0;i<100;i++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9224');break;}catch{await new Promise(r=>setTimeout(r,300));}}assert.ok(browser,'Debug WebView not ready');
  const page=browser.contexts()[0].pages()[0];page.on('pageerror',(e:Error)=>errors.push(e.message));page.setDefaultTimeout(20000);await page.getByTestId('language-select').selectOption('zh-CN');
  const rpc=(method:string,...args:any[])=>page.evaluate(({method,args}:any)=>(window as any).__TAURI_INTERNALS__.invoke('rpc',{method,args}),{method,args});
  const connect=async()=>{await page.getByRole('button',{name:'手动 IP',exact:true}).click();await page.getByRole('textbox',{name:'设备 IP',exact:true}).fill('127.0.0.1');await page.getByRole('button',{name:'连接设备',exact:true}).click();await page.getByText(hardware===530?'480 × 480 · 127.0.0.1':'800 × 1280 · 127.0.0.1',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Fit test',exact:true}).click();};
  await connect();await page.evaluate(()=>{const ui=window as any;ui.__submitted=[];window.timesframe.importMedia=async()=>{const value=await ui.__TAURI_INTERNALS__.invoke('rpc',{method:'import',args:[ui.__paths]});if(value.failures.length)throw Error(JSON.stringify(value.failures));return value.media;};const enqueue=window.timesframe.enqueueBatch;window.timesframe.enqueueBatch=async(...args)=>{ui.__submitted.push(args);return enqueue(...args);};});
  const choose=async(files:string[])=>{await page.evaluate((files:string[])=>{(window as any).__paths=files;},files);await page.locator('.import-button').click();await page.getByRole('button',{name:'选择文件…',exact:true}).click();await page.getByRole('button',{name:'下一步：裁剪',exact:true}).click();};
  const layout=async(label:string)=>{assert.deepEqual(await page.evaluate(()=>Array.from(document.querySelectorAll('.editor,.editor-controls,.photo-framing,.photo-fit-modes')).filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>e.className)),[],label);};
  await choose(paths.slice(0,2));
  const film=page.locator('.crop-filmstrip button'),status=()=>film.locator('[data-modified]').evaluateAll((items:Element[])=>items.map(e=>e.getAttribute('data-modified')));
  assert.deepEqual(await status(),['false','false']);await film.nth(1).click();await film.nth(0).click();assert.deepEqual(await status(),['false','false'],'visiting alone is not editing');
  const cropCanvas=page.locator('.photo-canvas-stage>canvas');
  const geometry=()=>cropCanvas.evaluate((c:any)=>{const r=c.getBoundingClientRect(),d=c.dataset,sw=Number(d.sourceWidth),sh=Number(d.sourceHeight),scale=Math.min(r.width/sw,r.height/sh);return {left:r.left+(r.width-sw*scale)/2,top:r.top+(r.height-sh*scale)/2,scale,x:Number(d.cropX),y:Number(d.cropY),width:Number(d.cropWidth),height:Number(d.cropHeight),canvas:[c.width,c.height]};});
  let g=await geometry();await page.mouse.move(g.left+(g.x+g.width)*g.scale-2,g.top+(g.y+g.height)*g.scale-2);await page.mouse.down();await page.mouse.move(g.left+g.width*g.scale*.7,g.top+g.height*g.scale*.7,{steps:8});await page.mouse.up();
  let shrunk=await geometry();assert.ok(shrunk.width<g.width*.8&&shrunk.width>g.width*.6);assert.deepEqual(shrunk.canvas,g.canvas);assert.deepEqual(await status(),['true','false']);
  await page.mouse.move(shrunk.left+(shrunk.x+shrunk.width/2)*shrunk.scale,shrunk.top+(shrunk.y+shrunk.height/2)*shrunk.scale);await page.mouse.down();await page.mouse.move(shrunk.left+(shrunk.x+shrunk.width/2)*shrunk.scale+30,shrunk.top+(shrunk.y+shrunk.height/2)*shrunk.scale+20,{steps:6});await page.mouse.up();const moved=await geometry();assert.ok(moved.x>shrunk.x&&moved.y>shrunk.y);assert.equal(moved.width,shrunk.width);
  await film.nth(1).click();await film.nth(0).click();assert.deepEqual(await status(),['true','false']);assert.equal((await geometry()).width,moved.width);
  await page.getByRole('button',{name:'‹ 返回选择',exact:true}).click();await page.getByRole('button',{name:'下一步：裁剪',exact:true}).click();assert.deepEqual(await status(),['true','false']);assert.equal((await geometry()).width,moved.width);
  // Grab from 18 px inside each corner, outside the former 12 px hit area.
  for(const corner of ['nw','ne','sw','se']){
    await page.getByRole('button',{name:'重置',exact:true}).click();const before=await geometry(),sx=corner.endsWith('e')?-1:1,sy=corner.startsWith('s')?-1:1;
    const hx=before.left+(before.x+(sx<0?before.width:0))*before.scale,hy=before.top+(before.y+(sy<0?before.height:0))*before.scale;
    await page.mouse.move(hx+sx*18,hy+sy*18);assert.equal(await cropCanvas.evaluate((c:HTMLElement)=>c.style.cursor),corner==='nw'||corner==='se'?'nwse-resize':'nesw-resize');
    await page.mouse.down();await page.mouse.move(hx+sx*before.width*before.scale*.25,hy+sy*before.height*before.scale*.25,{steps:8});await page.mouse.up();
    const smaller=await geometry();assert.ok(smaller.width<before.width*.85,corner+' shrinks');assert.ok(Math.abs(smaller.width/smaller.height-before.width/before.height)<1e-10);assert.deepEqual(smaller.canvas,before.canvas);
    const cx=smaller.left+(smaller.x+(sx<0?smaller.width:0))*smaller.scale,cy=smaller.top+(smaller.y+(sy<0?smaller.height:0))*smaller.scale;
    await page.mouse.move(cx+sx*4,cy+sy*4);await page.mouse.down();await page.mouse.move(hx+sx*4,hy+sy*4,{steps:8});await page.mouse.up();
    assert.ok((await geometry()).width>smaller.width*1.15,corner+' expands');
  }
  await page.screenshot({path:join(directory,'corner-drag-controls.png'),fullPage:true});
  await page.getByRole('button',{name:'重置',exact:true}).click();
  const preview=()=>page.locator('.preview-pair canvas').first().evaluate((c:any)=>Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data));
  const original=await preview();await page.locator('[data-transform=flip-x]').click();await page.waitForTimeout(80);const mirrored=await preview();assert.notDeepEqual(original,mirrored);await page.locator('[data-transform=flip-x]').click();await page.waitForTimeout(80);assert.deepEqual(await preview(),original,'mirror toggle must restore the preview');
  await page.screenshot({path:join(directory,'crop-modified-filmstrip.png'),fullPage:true});
  await page.getByRole('button',{name:'沿用第一张',exact:true}).click();
  await page.locator('[data-fit=width]').click();await page.getByTestId('output-size').getByText('实际导出: 800 × 600',{exact:true}).waitFor();assert.equal(await page.getByRole('slider',{name:'缩放',exact:true}).count(),0,'crop resizing uses corners, not a slider');
  const viewSize=()=>page.locator('.photo-canvas-stage>canvas').evaluate((c:any)=>[c.width,c.height]);const widthView=await viewSize();await page.locator('[data-fit=height]').click();const heightView=await viewSize();assert.deepEqual(widthView,heightView,'fit buttons must keep the source view fixed');await page.locator('[data-fit=width]').click();
  await page.getByRole('button',{name:'↻ 旋转 90°',exact:true}).click();await page.getByTestId('output-size').getByText('实际导出: 800 × 1066',{exact:true}).waitFor();await page.getByRole('button',{name:'重置',exact:true}).click();await page.locator('[data-fit=width]').click();
  for(const {locale} of languages){await page.getByTestId('language-select').selectOption(locale,{force:true});await page.locator('[data-fit=width]').getByText(translate(locale,'fitWidth'),{exact:true}).waitFor();await layout(locale);}
  await page.getByTestId('language-select').selectOption('de',{force:true});await page.setViewportSize({width:1100,height:760});await layout('German minimum window');assert.ok(await page.locator('.crop-filmstrip [data-modified]').evaluateAll((items:Element[])=>items.every(e=>e.getBoundingClientRect().bottom<=innerHeight-22)),'filmstrip status must stay visible at minimum window size');await page.screenshot({path:join(directory,'fit-de-1100.png'),fullPage:true});
  await page.setViewportSize({width:1480,height:960});await page.getByTestId('language-select').selectOption('zh-CN',{force:true});await page.screenshot({path:join(directory,'fit-width-800x600.png'),fullPage:true});checks.push('19 languages, German minimum layout, live size, rotate/reset, fixed source view, corner resize and frame drag, per-photo modified markers and draft restore, all four enlarged corner grips resize in both directions, no crop slider');
  await page.locator('[data-transform=flip-x]').click();await page.locator('[data-transform=flip-y]').click();
  await page.getByRole('button',{name:'应用并预览 1 张',exact:true}).click();await page.getByRole('heading',{name:'查看裁剪结果',exact:true}).waitFor();assert.equal(await page.locator('.crop-review-grid .crop-edit-status.modified').count(),2,'batch apply marks all photos');await page.locator('.crop-review-grid article').nth(1).getByRole('button',{name:translate('zh-CN','adjust'),exact:true}).click();await page.locator('[data-fit=height]').click();await page.getByTestId('output-size').getByText('实际导出: 800 × 1066',{exact:true}).waitFor();await page.getByRole('button',{name:'保存并返回预览',exact:true}).click();await page.getByRole('heading',{name:'查看裁剪结果',exact:true}).waitFor();await page.screenshot({path:join(directory,'batch-full-photo-review.png'),fullPage:true});
  await page.getByRole('button',{name:translate('zh-CN','uploadCount',{count:2}),exact:true}).click();let jobs:Job[]=[];for(let i=0;i<100;i++){jobs=await rpc('jobs');if(jobs.length===2&&jobs.every(j=>['已完成','需检查'].includes(j.state)))break;await page.waitForTimeout(200);}assert.ok(jobs.length===2&&jobs.every(j=>j.state==='已完成'),JSON.stringify(jobs));assert.deepEqual(uploads.map(x=>[x.metadata.PhotoWidth,x.metadata.PhotoHeight]),[[800,600],[800,1066]]);const submitted=await page.evaluate(()=>(window as any).__submitted);assert.equal(submitted[0][2][0].fit,'width');assert.equal(submitted[0][2][1].fit,'height');for(const edit of submitted[0][2]){assert.equal(edit.flipX,true);assert.equal(edit.flipY,true);}checks.push('first-photo fit template, per-photo height override, actual worker conversions and matching multipart dimensions');
  await page.locator('.job-name small').filter({hasText:'已完成'}).nth(1).waitFor();await page.locator('.toolbar-right button:not([disabled])').waitFor();
  hardware=530;await connect();await choose([paths[0]]);await page.locator('[data-fit=width]').click();await page.getByTestId('output-size').getByText('实际导出: 480 × 360',{exact:true}).waitFor();await page.screenshot({path:join(directory,'astrotoo-fit-480x360.png'),fullPage:true});await page.locator('[data-fit=crop]').click();await page.getByTestId('output-size').getByText('实际导出: 480 × 360',{exact:true}).waitFor();checks.push('switch to actual 480x480 device bounds, original photo proportions in all modes');
  await page.getByRole('button',{name:'‹ 返回选择',exact:true}).click();await page.getByRole('button',{name:'‹ 返回相簿',exact:true}).click();for(const model of [530,511]){
   if(hardware!==model){hardware=model;await connect();}
   await choose([paths[2]]);assert.equal(await page.locator('[data-fit]').count(),3);const expected=model===530?'270 × 480':'720 × 1280';
   await page.getByTestId('output-size').getByText('实际导出: '+expected,{exact:true}).waitFor();
   for(const {locale} of languages){await page.getByTestId('language-select').selectOption(locale,{force:true});await page.locator('.photo-framing label').getByText(translate(locale,'videoFraming'),{exact:true}).waitFor();await layout('video '+locale);}
   await page.getByTestId('language-select').selectOption('zh-CN',{force:true});
   await page.locator('[data-fit=width]').click();const wide=await viewSize();await page.locator('[data-fit=height]').click();assert.deepEqual(await viewSize(),wide,'video fit buttons must also keep the source fixed');
   await page.getByRole('button',{name:'↻ 旋转 90°',exact:true}).click();await page.getByTestId('output-size').getByText('实际导出: '+(model===530?'480 × 270':'800 × 450'),{exact:true}).waitFor();await page.getByRole('button',{name:'重置',exact:true}).click();
   await page.getByRole('spinbutton',{name:translate('zh-CN','start'),exact:true}).fill('0.2');await page.getByRole('spinbutton',{name:translate('zh-CN','end'),exact:true}).fill('0.8');
   await page.getByRole('slider',{name:translate('zh-CN','seek'),exact:true}).press('Home');for(let step=0;step<10;step++)await page.getByRole('slider',{name:translate('zh-CN','seek'),exact:true}).press('ArrowRight');
   await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&v.readyState>=2&&!v.seeking;});await page.getByRole('button',{name:translate('zh-CN','chooseFrame'),exact:true}).click();
   await page.locator('[data-transform=flip-x]').click();await page.locator('[data-transform=flip-y]').click();
   const frames=await page.locator('.preview-pair canvas').evaluateAll((items:any[])=>items.map(c=>[c.width,c.height]));assert.deepEqual(frames[0],frames[1]);await page.screenshot({path:join(directory,`video-fit-${model}.png`),fullPage:true});
   const count=uploads.length+1;await page.getByRole('button',{name:translate('zh-CN','save'),exact:true}).click();let videoJobs:Job[]=[];for(let i=0;i<100;i++){videoJobs=await rpc('jobs');if(videoJobs.length===count&&videoJobs.every(j=>['已完成','需检查'].includes(j.state)))break;await page.waitForTimeout(200);}assert.ok(videoJobs.length===count&&videoJobs.every(j=>j.state==='已完成'),JSON.stringify(videoJobs));
   const metadata=uploads.at(-1).metadata;assert.deepEqual([metadata.PhotoWidth,metadata.PhotoHeight],model===530?[270,480]:[720,1280]);for(const name of [metadata.FileName,metadata.PreviewFileName]){assert.ok(name);const info=await probe(resolve('vendor/ffprobe.exe'),join(directory,name));assert.deepEqual([info.width,info.height],[metadata.PhotoWidth,metadata.PhotoHeight]);}
   await page.locator('.job-name small').filter({hasText:'已完成'}).nth(count-1).waitFor();await page.locator('.toolbar-right button:not([disabled])').waitFor();
  }
  await page.locator('.media-tile:has(.video-badge) .tile-image img').first().waitFor();const videoFits:string[]=await page.locator('.media-tile:has(.video-badge) .tile-image img').evaluateAll((items:Element[])=>items.map(image=>getComputedStyle(image).objectFit));assert.ok(videoFits.length>0&&videoFits.every(fit=>fit==='contain'));
  checks.push('video original aspect, three fixed fit views, 19 languages, rotate/reset, trim and cover selection; H.264 270x480 and H.265 720x1280 with matching WebP covers and multipart dimensions');assert.deepEqual(errors,[]);
  await writeFile(join(directory,'report.json'),JSON.stringify({result:'PASS',runtime:'Tauri/WebView2 + actual worker + loopback fixture',checks,uploads,submitted:await page.evaluate(()=>(window as any).__submitted),errors},null,2));console.log(JSON.stringify({result:'PASS',directory,checks}));
 }finally{if(browser)await browser.close();child.kill();server.closeAllConnections();server.close();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
