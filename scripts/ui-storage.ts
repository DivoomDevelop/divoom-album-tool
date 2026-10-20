import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {run} from '../backend/media';
import {lanFixture} from '../tests/lan-fixture';
import {languages,translate} from '../src/i18n';
const {chromium}=createRequire(resolve('package.json'))('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function main(){
 const directory=resolve('artifacts/ui/storage-'+Date.now());await mkdir(directory,{recursive:true});const image=join(directory,'photo.png'),video=join(directory,'clip.mp4');
 await run(resolve('vendor/ffmpeg.exe'),['-v','error','-f','lavfi','-i','testsrc2=s=640x480','-frames:v','1',image]);await run(resolve('vendor/ffmpeg.exe'),['-v','error','-f','lavfi','-i','testsrc2=s=320x480','-t','0.5','-c:v','libx264','-pix_fmt','yuv420p',video]);
 const fixture=await lanFixture();fixture.setFull(1);fixture.setStorageBytes(false);
 const child=spawn(resolve('src-tauri/target/debug/timesframe.exe'),[],{windowsHide:true,env:{...process.env,TIMESFRAME_UI_TEST:'1'},stdio:'ignore'});let browser:any;const errors:string[]=[],checks:string[]=[];
 try{
  for(let i=0;i<100;i++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9224');break;}catch{await new Promise(r=>setTimeout(r,200));}}assert.ok(browser);const page=browser.contexts()[0].pages()[0];page.setDefaultTimeout(15000);page.on('pageerror',(error:Error)=>errors.push(error.message));
  const rpc=(method:string,...args:any[])=>page.evaluate(({method,args}:any)=>(window as any).__TAURI_INTERNALS__.invoke('rpc',{method,args}),{method,args});
  await page.getByTestId('language-select').selectOption('zh-CN');await page.getByRole('button',{name:'手动 IP',exact:true}).click();await page.getByRole('textbox',{name:'设备 IP',exact:true}).fill('127.0.0.1');await page.getByRole('button',{name:'连接设备',exact:true}).click();await page.locator('[data-album-id="100001"]').click();await page.getByTestId('storage-full-alert').waitFor();
  assert.ok(fixture.commands.some(command=>command.Command==='Device/GetStorageStatus'));assert.equal(fixture.uploads.length,0);
  for(const {locale} of languages){await page.getByTestId('language-select').selectOption(locale);await page.getByTestId('storage-full-alert').getByText(translate(locale,'storageFullWarning'),{exact:true}).waitFor();}
  await page.getByTestId('language-select').selectOption('zh-CN');await page.getByTestId('theme-select').selectOption('dark');await page.screenshot({path:join(directory,'storage-full-library.png'),fullPage:true});checks.push('GET_STORAGE_STATUS Full=1 visibly warns in all 19 languages; unknown byte capacity does not suppress warning');
  await page.evaluate(()=>{window.timesframe.importMedia=async paths=>{const media=await (window as any).__TAURI_INTERNALS__.invoke('rpc',{method:'import',args:[paths??[(window as any).__path]]});(window as any).__media=media.media;return media.media;};});
  const choose=async(path:string)=>{await page.evaluate((path:string)=>{(window as any).__path=path;},path);await page.locator('.import-button').click();await page.getByRole('button',{name:'选择文件…',exact:true}).click();await page.getByRole('button',{name:'下一步：裁剪',exact:true}).click();};
  await choose(image);await page.locator('.editor').getByTestId('storage-full-alert').waitFor();await page.getByTestId('encoded-size').getByText(/编码后体积:/).waitFor();await page.getByRole('button',{name:translate('zh-CN','reviewCrops'),exact:true}).click();await page.getByRole('heading',{name:'查看裁剪结果',exact:true}).waitFor();const upload=page.getByRole('button',{name:translate('zh-CN','uploadCount',{count:1}),exact:true});assert.equal(await upload.isDisabled(),true);assert.equal(fixture.uploads.length,0);
  const rejected=await page.evaluate(async()=>{const media=(window as any).__media[0],invoke=(window as any).__TAURI_INTERNALS__.invoke;const target=await invoke('rpc',{method:'connect',args:[{DevicePrivateIP:'127.0.0.1'}]}),album={ClockId:100001,ClockName:'Feedback A',AlbumType:0};try{await invoke('rpc',{method:'enqueueBatch',args:[target,album,[{mediaId:media.id,rotation:0,x:0,y:0,width:media.width,height:media.height,start:0,end:0,coverTime:0}],'ui-full-rejection']});return '';}catch(error){return String(error);}});assert.match(rejected,/DEVICE_STORAGE_FULL/);assert.equal((await rpc('jobs')).length,0);
  fixture.setFull(0);await page.getByTestId('storage-full-alert').getByRole('button',{name:'刷新状态',exact:true}).click();await page.getByTestId('storage-full-alert').waitFor({state:'detached'});await upload.click();await page.waitForFunction(()=>Array.from(document.querySelectorAll('.job-name')).some(e=>e.textContent?.includes('已完成')));assert.equal(fixture.uploads.length,1);checks.push('full storage still allows editing and saving crops; review upload disabled; backend bypass rejected; clearing and refreshing enables upload');
  fixture.setFull(1);await page.getByRole('button',{name:'刷新相簿',exact:true}).click();await page.getByTestId('storage-full-alert').waitFor();await choose(video);await page.locator('.editor').getByTestId('storage-full-alert').waitFor();assert.equal(await page.getByRole('button',{name:translate('zh-CN','save'),exact:true}).isDisabled(),true);await page.screenshot({path:join(directory,'storage-full-video.png'),fullPage:true});checks.push('video upload disabled with the full-storage warning; no photo or video is sent to full storage');
  assert.deepEqual(errors,[]);await writeFile(join(directory,'report.json'),JSON.stringify({result:'PASS',directory,checks,errors,commands:fixture.commands.map(command=>command.Command)},null,2));console.log(JSON.stringify({result:'PASS',directory,checks}));
 }finally{if(browser)await browser.close();child.kill();fixture.close();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
