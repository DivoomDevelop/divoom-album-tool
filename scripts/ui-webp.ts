/** Real Tauri UI: corrected JPEG preview and cross-album completion refresh. Device reads only. */
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(resolve('package.json'))('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function main(){
  const directory=resolve(`artifacts/ui/webp-${Date.now()}`);await mkdir(directory,{recursive:true});
  const browser=await chromium.connectOverCDP('http://127.0.0.1:9224');
  const page=browser.contexts()[0].pages()[0],errors:string[]=[];page.on('pageerror',(e:Error)=>errors.push(e.message));
  try{
    await page.reload();await page.getByTestId('language-select').waitFor();
    await page.getByTestId('language-select').selectOption('zh-CN');
    await page.getByRole('button',{name:'刷新设备',exact:true}).click();
    await page.getByRole('button',{name:'手动 IP',exact:true}).click();
    await page.getByRole('textbox',{name:'设备 IP',exact:true}).fill(process.env.DIVOOM_TEST_IP??'192.168.13.142');
    await page.getByRole('button',{name:'连接设备',exact:true}).click();
    await page.locator('.media-tile').first().waitFor({timeout:20000});
    const count=await page.locator('.media-tile').count();
    for(let i=0;i<count;i++){const item=page.locator('.media-tile').nth(i);await item.scrollIntoViewIfNeeded();await item.locator('.tile-image img').waitFor({timeout:30000});}
    const tile=page.locator('.media-tile').filter({has:page.locator('.tile-caption strong',{hasText:'300426474-1792388534004.jpg'})});
    assert.equal(await tile.count(),1);
    assert.match(await tile.locator('img').getAttribute('src'),/^data:image\/jpeg;base64,/);
    await tile.locator('.tile-image').click();await page.locator('.details>img').waitFor();
    await page.waitForFunction(()=>{const image=document.querySelector('.details>img') as HTMLImageElement;return image?.complete&&image.naturalWidth===480;});
    await page.screenshot({path:directory+'/corrected-jpeg-list-and-details.png',fullPage:true});
    await page.locator('.details button').click();
    const identity=await page.evaluate(async()=>{
      const ui=window as any,api=window.timesframe;
      const target=await api.connect({DevicePrivateIP:'192.168.13.142'});
      ui.__refreshCalls=[];const albums=api.albums,photos=api.photos;
      api.albums=async(t,r)=>{ui.__refreshCalls.push(['albums',r]);return albums(t,r);};
      api.photos=async(...args)=>{ui.__refreshCalls.push(['photos',args[1]]);return photos(...args);};
      return target.cacheIdentity;
    });
    // Dispatch an actual native jobs event for another album. No frame data is written.
    const job={id:'ui-cross-album-'+Date.now(),name:'Cross-album refresh acceptance',state:'已完成',progress:100,clockId:919999999,deviceIdentity:identity,preview:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='};
    await page.evaluate(async(payload:any)=>{await (window as any).__TAURI_INTERNALS__.invoke('plugin:event|emit',{event:'jobs',payload:[payload]});},job);
    await page.waitForFunction(()=>(window as any).__refreshCalls.some((call:any[])=>call[0]==='photos'));
    const calls=await page.evaluate(()=>(window as any).__refreshCalls);assert.deepEqual(calls[0],['albums',true]);
    const baseline=calls.length;
    await page.evaluate(async(payload:any)=>{await (window as any).__TAURI_INTERNALS__.invoke('plugin:event|emit',{event:'jobs',payload:[payload]});},{...job,id:job.id+'other-device',deviceIdentity:'id:999999999'});
    await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>(window as any).__refreshCalls.length),baseline);
    assert.deepEqual(errors,[]);
    const report={result:'PASS',runtime:'Tauri/WebView2',thumbnails:count,checks:['old JPEG tile regenerated from original','tile and details decode correctly','native completed job for another album refreshes All Photos','other-device completion does not refresh selected device'],calls,errors,directory};
    await writeFile(directory+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }finally{await browser.close();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
