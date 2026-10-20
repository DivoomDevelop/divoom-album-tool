/** Actual Tauri/WebView2 + worker, using generated media and a loopback device fixture. */
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {run} from '../backend/media';
import {languages,translate} from '../src/i18n';
import type {Job} from '../src/shared';
const {chromium}=createRequire(resolve('package.json'))('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function main(){
 const directory=resolve('artifacts/ui/photo-fit-'+Date.now());await mkdir(directory,{recursive:true});const ffmpeg=resolve('vendor/ffmpeg.exe'),paths=[join(directory,'wide.png'),join(directory,'portrait.JPG'),join(directory,'clip.mp4')];
 await run(ffmpeg,['-v','error','-f','lavfi','-i','testsrc2=s=1600x1200','-frames:v','1',paths[0]]);
 await run(ffmpeg,['-v','error','-f','lavfi','-i','testsrc2=s=1440x1080','-frames:v','1',paths[1]]);
 const jpeg=await readFile(paths[1]);await writeFile(paths[1],Buffer.concat([jpeg.subarray(0,2),Buffer.from('ffe1002245786966000049492a0008000000010012010300010000000600000000000000','hex'),jpeg.subarray(2)]));
 if(process.env.DIVOOM_TEST_PHOTOS){const originals=process.env.DIVOOM_TEST_PHOTOS.split(';');assert.equal(originals.length,2);paths.splice(0,2,...originals);}
 await run(ffmpeg,['-v','error','-f','lavfi','-i','testsrc2=s=480x480:r=30','-t','1','-c:v','libx264','-pix_fmt','yuv420p',paths[2]]);
 let hardware=511;const uploads:any[]=[],mediaFiles=new Map<string,Buffer>(),records=new Map<number,any[]>();const errors:string[]=[],checks:string[]=[];
 const server=createServer(async(req,res)=>{try{
  if(req.method==='GET'||req.method==='HEAD'){const data=mediaFiles.get(req.url!);if(!data){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Length':data.length,'Content-Type':req.url!.endsWith('.webp')?'image/webp':'video/mp4'});res.end(req.method==='HEAD'?undefined:data);return;}
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const body=Buffer.concat(chunks);let result:any={ReturnCode:0};
  if(req.url==='/upload'){
   assert.equal(Number(req.headers['content-length']),body.length);const parts:{name:string;data:Buffer}[]=[];let cursor=0;const boundary=String(req.headers['content-type']).split('boundary=')[1];
   while(cursor<body.length){if(body.subarray(cursor,cursor+boundary.length+4).toString()==='--'+boundary+'--')break;const end=body.indexOf('\r\n\r\n',cursor);assert.ok(end>=0);const head=body.subarray(cursor,end).toString(),length=Number(head.match(/Content-Length: (\d+)/i)![1]),name=head.match(/name="([^"]+)"/)![1];parts.push({name,data:body.subarray(end+4,end+4+length)});cursor=end+4+length+2;}
   const metadata=JSON.parse(parts[0].data.toString());assert.equal(metadata.PhotoTitle,'');const file=parts.find(p=>p.name===metadata.FileName);assert.ok(file);mediaFiles.set('/userdata/app_pic/'+metadata.FileName,file.data);uploads.push({hardware,metadata});await writeFile(join(directory,metadata.FileName),file.data);
   const list=records.get(hardware)??[];list.unshift({PhotoId:uploads.length,Time:Date.now()/1000,FileId:'/userdata/app_pic/'+metadata.FileName,OriginalFileId:'/userdata/app_pic/'+metadata.FileName,MediaType:'photo'});records.set(hardware,list);
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
  await choose(paths.slice(0,2));await page.getByRole('button',{name:'沿用第一张',exact:true}).click();await page.locator('[data-fit=width]').click();await page.getByTestId('output-size').getByText('实际导出: 800 × 600',{exact:true}).waitFor();assert.ok(await page.getByRole('slider',{name:'缩放',exact:true}).isEnabled());
  const viewSize=()=>page.locator('.photo-canvas-stage>canvas').evaluate((c:any)=>[c.width,c.height]);const widthView=await viewSize();await page.locator('[data-fit=height]').click();const heightView=await viewSize();assert.notDeepEqual(widthView,heightView);await page.locator('[data-fit=width]').click();
  await page.getByRole('button',{name:'↻ 旋转 90°',exact:true}).click();await page.getByTestId('output-size').getByText('实际导出: 800 × 1066',{exact:true}).waitFor();await page.getByRole('button',{name:'重置',exact:true}).click();await page.locator('[data-fit=width]').click();
  for(const {locale} of languages){await page.getByTestId('language-select').selectOption(locale,{force:true});await page.locator('[data-fit=width]').getByText(translate(locale,'fitWidth'),{exact:true}).waitFor();await layout(locale);}
  await page.getByTestId('language-select').selectOption('de',{force:true});await page.setViewportSize({width:1100,height:760});await layout('German minimum window');await page.screenshot({path:join(directory,'fit-de-1100.png'),fullPage:true});
  await page.setViewportSize({width:1480,height:960});await page.getByTestId('language-select').selectOption('zh-CN',{force:true});await page.screenshot({path:join(directory,'fit-width-800x600.png'),fullPage:true});checks.push('19 languages, German minimum layout, live size, rotate/reset, fit view visibly changes, proportional crop zoom enabled');
  await page.getByRole('button',{name:'应用并预览 1 张',exact:true}).click();await page.getByRole('heading',{name:'查看裁剪结果',exact:true}).waitFor();await page.locator('.crop-review-grid article').nth(1).getByRole('button',{name:translate('zh-CN','adjust'),exact:true}).click();await page.locator('[data-fit=height]').click();await page.getByTestId('output-size').getByText('实际导出: 800 × 1066',{exact:true}).waitFor();await page.getByRole('button',{name:'保存并返回预览',exact:true}).click();await page.getByRole('heading',{name:'查看裁剪结果',exact:true}).waitFor();await page.screenshot({path:join(directory,'batch-full-photo-review.png'),fullPage:true});
  await page.getByRole('button',{name:translate('zh-CN','uploadCount',{count:2}),exact:true}).click();let jobs:Job[]=[];for(let i=0;i<100;i++){jobs=await rpc('jobs');if(jobs.length===2&&jobs.every(j=>['已完成','需检查'].includes(j.state)))break;await page.waitForTimeout(200);}assert.ok(jobs.length===2&&jobs.every(j=>j.state==='已完成'),JSON.stringify(jobs));assert.deepEqual(uploads.map(x=>[x.metadata.PhotoWidth,x.metadata.PhotoHeight]),[[800,600],[800,1066]]);const submitted=await page.evaluate(()=>(window as any).__submitted);assert.equal(submitted[0][2][0].fit,'width');assert.equal(submitted[0][2][1].fit,'height');checks.push('first-photo fit template, per-photo height override, actual worker conversions and matching multipart dimensions');
  await page.locator('.job-name small').filter({hasText:'已完成'}).nth(1).waitFor();await page.locator('.toolbar-right button:not([disabled])').waitFor();
  hardware=530;await connect();await choose([paths[0]]);await page.locator('[data-fit=width]').click();await page.getByTestId('output-size').getByText('实际导出: 480 × 360',{exact:true}).waitFor();await page.screenshot({path:join(directory,'astrotoo-fit-480x360.png'),fullPage:true});await page.locator('[data-fit=crop]').click();await page.getByTestId('output-size').getByText('实际导出: 480 × 360',{exact:true}).waitFor();checks.push('switch to actual 480x480 device bounds, original photo proportions in all modes');
  await page.getByRole('button',{name:'‹ 返回选择',exact:true}).click();await page.getByRole('button',{name:'‹ 返回相簿',exact:true}).click();await choose([paths[2]]);assert.equal(await page.locator('.photo-framing').count(),0);checks.push('video retains crop-only workflow');assert.deepEqual(errors,[]);
  await writeFile(join(directory,'report.json'),JSON.stringify({result:'PASS',runtime:'Tauri/WebView2 + actual worker + loopback fixture',checks,uploads,submitted,errors},null,2));console.log(JSON.stringify({result:'PASS',directory,checks}));
 }finally{if(browser)await browser.close();child.kill();server.closeAllConnections();server.close();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
