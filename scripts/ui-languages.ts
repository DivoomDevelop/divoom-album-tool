import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { languages, translate } from '../src/i18n';
const {chromium}=createRequire(resolve('package.json'))('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function main(){
  const browser=await chromium.connectOverCDP('http://127.0.0.1:9224');
  const page=browser.contexts()[0].pages()[0],errors:string[]=[],checks:string[]=[];
  page.on('pageerror',(error:Error)=>errors.push(error.message));await mkdir('artifacts/ui/i18n-v030',{recursive:true});
  await page.reload();
  const select=page.getByTestId('language-select');await select.waitFor();
  const original=await select.inputValue();
  const checkLayout=async(label:string)=>{
    const overflow=await page.evaluate(()=>[...document.querySelectorAll('.titlebar,.sidebar,.library,.toolbar,.library-top,.editor,.editor-header,.editor-controls,.trim')].filter(element=>element.scrollWidth>element.clientWidth+2).map(element=>`${element.className}:${element.scrollWidth}/${element.clientWidth}`));
    assert.deepEqual(overflow,[],label);
  };
  try{
    assert.equal(await select.locator('option').count(),19);
    for(const {locale} of languages){
      await select.selectOption(locale);await page.waitForFunction((value:string)=>document.documentElement.lang===value,locale);
      await page.getByText(translate(locale,'lanTitle'),{exact:true}).waitFor();
      assert.equal(await page.title(),translate(locale,'appName'));await checkLayout(`library ${locale}`);

    }
    checks.push('19 language choices, LAN hint and window title; native dialog arguments covered by unit tests');
    await select.selectOption('de');await page.reload();await page.getByTestId('language-select').waitFor();
    assert.equal(await page.getByTestId('language-select').inputValue(),'de');checks.push('language survives page reload');
    await page.getByTestId('language-select').selectOption('en');
    await page.evaluate(()=>{
      const api=window.timesframe,ui=window as any,load=api.thumbnail;ui.__thumbStats={active:0,maximum:0,calls:0};
      api.thumbnail=async(...args:Parameters<typeof load>)=>{const stats=ui.__thumbStats;stats.active++;stats.calls++;stats.maximum=Math.max(stats.maximum,stats.active);try{return await load(...args);}finally{stats.active--;}};
    });
    await page.getByRole('button',{name:'Refresh devices',exact:true}).click();await page.getByRole('button',{name:'Refresh devices',exact:true}).isEnabled();
    await page.getByRole('button',{name:'Manual IP',exact:true}).click();await page.getByRole('textbox',{name:'Device IP',exact:true}).fill(process.env.DIVOOM_TEST_IP??'192.168.13.142');
    await page.getByRole('button',{name:'Connect',exact:true}).click();await page.waitForFunction(()=>document.title==='AstroToo');
    await page.locator('.media-tile').first().waitFor({timeout:20000});
    const count=await page.locator('.media-tile').count();
    for(let index=0;index<count;index++){
      const tile=page.locator('.media-tile').nth(index);await tile.scrollIntoViewIfNeeded();
      await tile.locator('.tile-image img').waitFor({timeout:30000});
    }
    await page.waitForFunction(()=>[...document.querySelectorAll('.tile-image img')].every(image=>(image as HTMLImageElement).complete&&(image as HTMLImageElement).naturalWidth>0));
    assert.equal(await page.locator('.tile-image img').count(),count);
    const stats=await page.evaluate(()=>(window as any).__thumbStats);assert.equal(stats.maximum,1);assert.equal(stats.calls,count);
    await page.locator('.library').evaluate((element:Element)=>{element.scrollTop=0;});
    await page.screenshot({path:'artifacts/ui/i18n-v030/real-device-en.png',fullPage:true});checks.push(`real device: ${count}/${count} thumbnails decoded, maximum one thumbnail RPC`);
    // Read-only original preview for the item highlighted by the user.
    const item=page.locator('.media-tile').filter({has:page.locator('.tile-caption strong',{hasText:/^20\.webp$/})});
    if(await item.count()){
      await item.locator('.tile-image').click();await page.locator('.details>img').waitFor();await page.waitForFunction(()=>{const image=document.querySelector('.details>img') as HTMLImageElement;return image?.complete&&image.naturalWidth>0;});
      await page.screenshot({path:'artifacts/ui/i18n-v030/real-device-20-webp.png',fullPage:true});
      await page.locator('.details button').click();checks.push('20.webp list thumbnail and original preview both render');
    }
    await page.evaluate(()=>{window.timesframe.importMedia=async()=>{const result=await (window as any).__TAURI_INTERNALS__.invoke('rpc',{method:'import',args:[['C:/Users/Administrator/Desktop/400000012-1792157474503-0.mp4']]});return result.media;};});
    await page.getByRole('button',{name:'Import photos and videos',exact:true}).click();await page.getByRole('button',{name:'Choose files…',exact:true}).click();await page.getByRole('button',{name:'Next: crop',exact:true}).click();await page.locator('.editor').waitFor();
    await page.waitForFunction(()=>{const video=document.querySelector('.source-video') as HTMLVideoElement;return video?.readyState>=2;});
    for(const {locale} of languages){
      // The header selector remains available behind the editor through its native select API.
      await page.getByTestId('language-select').selectOption(locale,{force:true});await page.getByRole('heading',{name:translate(locale,'cropExport'),exact:true}).waitFor();
      assert.equal(await page.title(),'AstroToo');await checkLayout(`editor ${locale}`);
      if(['en','zh-TW','ja','de','th','ko','ru'].includes(locale))await page.screenshot({path:`artifacts/ui/i18n-v030/editor-${locale}.png`,fullPage:true});
    }
    checks.push('19 editor languages without horizontal overflow; product title stays AstroToo');
    await page.getByTestId('language-select').selectOption('de',{force:true});await page.setViewportSize({width:1100,height:760});await checkLayout('German editor at minimum size');
    await page.screenshot({path:'artifacts/ui/i18n-v030/editor-de-1100.png',fullPage:true});
    await page.getByRole('button',{name:'‹ '+translate('de','backSelection'),exact:true}).click();await page.getByRole('button',{name:'‹ '+translate('de','back'),exact:true}).click();await page.setViewportSize({width:1480,height:920});
    await page.getByTestId('language-select').selectOption('th');await checkLayout('Thai library');await page.locator('.library').evaluate((element:Element)=>{element.scrollTop=0;});await page.screenshot({path:'artifacts/ui/i18n-v030/library-th.png',fullPage:true});
    assert.deepEqual(errors,[]);const report={result:'PASS',runtime:'Tauri/WebView2',languages:19,device:process.env.DIVOOM_TEST_IP??'192.168.13.142',thumbnails:count,thumbnailStats:stats,checks,errors};
    await writeFile('artifacts/ui/i18n-v030/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }finally{await page.getByTestId('language-select').selectOption(original,{force:true}).catch(()=>{});await browser.close();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
