import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogs, english } from '../src/i18n/catalog';
import { languages, resolveLocale, translate, localizeError, setLocale, getLocale, albumName } from '../src/i18n';
import { importDialog, importFailureDialog, manageDialog } from '../src/dialogs';
const placeholders=(text:string)=>[...text.matchAll(/\{\w+\}/g)].map(match=>match[0]).sort();
test('all 19 firmware languages have complete catalogs and matching placeholders',()=>{
  assert.equal(languages.length,19);assert.equal(Object.keys(catalogs).length,19);
  assert.deepEqual(languages.map(language=>language.id),Array.from({length:19},(_,id)=>id));
  assert.deepEqual(languages.map(language=>language.locale),['en','zh-CN','zh-TW','ja','de','th','ru','ko','vi','fr','tr','es','pt','id','it','uk','sv','da','pl']);
  for(const {locale} of languages){
    assert.deepEqual(Object.keys(catalogs[locale]),Object.keys(english));
    for(const [key,source] of Object.entries(english)){
      const text=catalogs[locale][key as keyof typeof english];
      assert.ok(text.trim(),`${locale}.${key}`);assert.deepEqual(placeholders(text),placeholders(source),`${locale}.${key}`);
      assert.ok(!/[\u4e00-\u9fff]/.test(text)||['zh-CN','zh-TW','ja'].includes(locale),`${locale}.${key}: untranslated Chinese`);
    }
    assert.ok(translate(locale,'confirmDelete',{count:2}).includes(new Intl.NumberFormat(locale).format(2)));
    assert.ok(!/\{\w+\}/.test(translate(locale,'loaded',{count:51,width:480,height:480})));
    for(const key of ['videoLimit','trimLimit','errorTrim','selectionRule'] as const){assert.match(catalogs[locale][key],/10/);assert.doesNotMatch(catalogs[locale][key],/30/);}
    assert.equal(localizeError('视频片段必须在源视频范围内且不超过 10 分钟，预览图必须在片段内',locale),catalogs[locale].errorTrim);
    assert.equal(localizeError('设备 HTTP 404',locale),translate(locale,'errorHttp',{status:'404'}));
  }
});
test('saved language takes priority, Chinese script and regional languages resolve correctly',()=>{
  for(const tag of ['zh-TW','zh-HK','zh-MO','zh-Hant','zh-Hant-CN'])assert.equal(resolveLocale([tag]),'zh-TW');
  for(const tag of ['zh-CN','zh-SG','zh-Hans','zh'])assert.equal(resolveLocale([tag]),'zh-CN');
  assert.equal(resolveLocale(['de-DE']),'de');assert.equal(resolveLocale(['pt-BR']),'pt');
  assert.equal(resolveLocale(['xx','uk-UA']),'uk');assert.equal(resolveLocale(['xx']),'en');
  assert.equal(resolveLocale(['ja-JP'],'pl'),'pl');assert.equal(resolveLocale(['ja-JP'],'bad'),'ja');
  setLocale('fr');assert.equal(getLocale(),'fr');
  assert.equal(albumName({ClockId:123,ClockName:'My photos 你好',AlbumType:0}),'My photos 你好');
  assert.equal(albumName({ClockId:123,ClockName:'All Photos',AlbumType:1}),'Toutes les photos');
});
test('native dialog titles, buttons, confirmation and import failures follow each selected language',()=>{
  for(const {locale} of languages){
    setLocale(locale);const album={ClockId:100001,ClockName:'Custom 你好',AlbumType:0};
    assert.equal(importDialog().filters[0].name,translate(locale,'mediaFiles'));
    const removal=manageDialog(album,2,true),deletion=manageDialog(album,2,false);
    assert.equal(removal.text,translate(locale,'confirmRemove',{count:2,album:album.ClockName}));
    assert.equal(deletion.text,translate(locale,'confirmDelete',{count:2}));
    assert.equal(deletion.options.cancelLabel,translate(locale,'cancel'));assert.equal(deletion.options.okLabel,translate(locale,'delete'));
    const failure=importFailureDialog([{name:'视频.mp4',error:'文件没有可读取的图像轨道'}]);
    assert.equal(failure.text,`视频.mp4: ${translate(locale,'errorTrack')}`);assert.equal(failure.options.title,translate(locale,'importFailed'));
  }
});
