const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises');
(async()=>{
  let browser;
  for(let attempt=0;attempt<40;attempt++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9224');break;}catch{await new Promise(r=>setTimeout(r,500));}}
  if(!browser)throw new Error('Tauri WebView2 debug endpoint did not start');
  const page=browser.contexts()[0].pages()[0];const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.getByTestId('language-select').selectOption('zh-CN');
    await page.getByText('仅支持连接与此 PC 处于同一局域网的设备',{exact:true}).waitFor();
    await fs.mkdir('artifacts/ui',{recursive:true});
    await page.screenshot({path:'artifacts/ui/tauri-library.png',fullPage:true});
    await page.getByRole('button',{name:'手动 IP',exact:true}).click();await page.getByRole('textbox',{name:'设备 IP',exact:true}).fill('127.0.0.1');
    await page.getByRole('button',{name:'连接设备',exact:true}).click();
    await page.getByText('480 × 480 · 127.0.0.1',{exact:true}).waitFor({timeout:20000});
    await page.waitForFunction(()=>document.title==='AstroToo');
    await page.locator('.import-button').waitFor();
    await page.evaluate(()=>{window.timesframe.importMedia=async()=>{const result=await window.__TAURI_INTERNALS__.invoke('rpc',{method:'import',args:[['C:/Users/Administrator/Desktop/400000012-1792157474503-0.mp4']]});return result.media;};});
    await page.locator('.import-button').click();
    await page.getByRole('button',{name:'选择文件…',exact:true}).click();
    await page.getByRole('button',{name:'下一步：裁剪',exact:true}).click();
    await page.getByRole('heading',{name:'裁剪与导出',exact:true}).waitFor();
    await page.waitForFunction(()=>{const v=document.querySelector('.source-video');return v&&v.readyState>=2;});
    await page.getByRole('spinbutton',{name:'结束（秒）'}).fill('2');
    await page.getByRole('button',{name:'↻ 旋转 90°',exact:true}).click();
    await page.getByRole('slider',{name:'缩放',exact:true}).focus();await page.keyboard.press('ArrowRight');
    await page.getByRole('button',{name:'选择当前画面',exact:true}).click();
    await page.screenshot({path:'artifacts/ui/tauri-editor.png',fullPage:true});
    const canvas=await page.evaluate(()=>{const c=document.querySelector('.editor-work>canvas');const d=c.getContext('2d').getImageData(500,350,1,1).data;return [...d];});
    if(canvas[3]!==255)throw new Error('Editor canvas is blank');
    await page.getByRole('button',{name:'保存并加入上传队列',exact:true}).click();
    await page.getByText('已完成',{exact:true}).waitFor({timeout:60000});
    await page.screenshot({path:'artifacts/ui/tauri-upload.png',fullPage:true});
    await page.evaluate(async()=>{const invoke=window.__TAURI_INTERNALS__.invoke;const target=await invoke('rpc',{method:'connect',args:[{DevicePrivateIP:'127.0.0.1',DeviceName:'AstroToo'}]});const albums=await invoke('rpc',{method:'albums',args:[target]});const jobs=await invoke('rpc',{method:'jobs',args:[]});const job=jobs[jobs.length-1];if(job?.photoId){await invoke('rpc',{method:'manage',args:[target,albums.find(a=>a.ClockId===job.clockId),[job.photoId],false]});}});
    if(errors.length)throw new Error(errors.join('\n'));
    const report={result:'PASS',runtime:'Tauri/WebView2',checks:['LAN hint visible','native RPC bridge','real simulator connection','local video import','H264 video canvas preview','rotate and zoom controls','2-second clip + cover upload queue'],canvas,errors};
    await fs.writeFile('artifacts/ui/tauri-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
