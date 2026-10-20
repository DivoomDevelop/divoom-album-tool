import { createRequire } from 'node:module';
import { mkdir, copyFile, chmod, access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
await mkdir('vendor',{recursive:true});
for(const [name,source] of [['ffmpeg',require('ffmpeg-static')],['ffprobe',require('@ffprobe-installer/ffprobe').path]]) {
  await copyFile(source,path.join('vendor',name+(process.platform==='win32'?'.exe':'')));
  if(process.platform!=='win32')await chmod(path.join('vendor',name),0o755);
  // Intel FFmpeg downloads are unsigned; sign before Tauri seals bundle resources.
  if(process.platform==='darwin')execFileSync('codesign',['--force','--sign','-',path.join('vendor',name)],{stdio:'inherit'});
}
const rustc=process.env.RUSTC??path.join(process.env.USERPROFILE??process.env.HOME,'.cargo','bin','rustc'+(process.platform==='win32'?'.exe':''));
const triple=process.env.TAURI_ENV_TARGET_TRIPLE??execFileSync(rustc,['--print','host-tuple'],{encoding:'utf8'}).trim();
const expected=process.platform==='win32'?'x86_64-pc-windows-msvc':process.arch==='arm64'?'aarch64-apple-darwin':'x86_64-apple-darwin';
if(triple!==expected)throw new Error('请在目标平台与架构运行打包，避免把错误架构的 Node/FFmpeg 打进安装包');
await mkdir('src-tauri/binaries',{recursive:true});
await copyFile(process.execPath,path.join('src-tauri/binaries',`timesframe-worker-${triple}${process.platform==='win32'?'.exe':''}`));
if(process.platform!=='win32')await chmod(path.join('src-tauri/binaries',`timesframe-worker-${triple}`),0o755);
try{await copyFile(path.join(path.dirname(process.execPath),'LICENSE'),'vendor/NODE-LICENSE.txt');}
catch{try{await access('vendor/NODE-LICENSE.txt');}catch{const license=await fetch(`https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`);if(!license.ok)throw new Error('无法获取当前内置 Node.js 的许可证');await writeFile('vendor/NODE-LICENSE.txt',await license.text());}}
await copyFile('node_modules/ffmpeg-static/LICENSE','vendor/FFMPEG-STATIC-LICENSE.txt');
await copyFile('node_modules/ffmpeg-static/ffmpeg'+(process.platform==='win32'?'.exe':'')+'.LICENSE','vendor/FFMPEG-LICENSE.txt').catch(()=>{});
await copyFile('node_modules/ffmpeg-static/ffmpeg'+(process.platform==='win32'?'.exe':'')+'.README','vendor/FFMPEG-README.txt').catch(()=>{});
console.log(`Prepared Tauri worker + FFmpeg/ffprobe for ${triple}`);
