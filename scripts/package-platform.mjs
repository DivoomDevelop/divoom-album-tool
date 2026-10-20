import {cp, mkdir, readdir, readFile, writeFile, stat} from 'node:fs/promises';
import {resolve, join, basename} from 'node:path';
import {execFileSync, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const version=JSON.parse(await readFile('package.json','utf8')).version;
const root=resolve('release'), build=resolve('src-tauri/target/release');
await mkdir(root,{recursive:true});
const windows=process.platform==='win32', arch=windows?'win-x64':`macos-${process.arch}`;
const name=`DivoomAlbum-${arch}-v${version}`, files=[];
let executable, resources, app;
if(windows){
 const folder=join(root,name);await mkdir(folder);
 await cp(join(build,'timesframe.exe'),join(folder,'DivoomAlbum.exe'));
 for(const item of ['timesframe-worker.exe','worker.cjs','bin','THIRD_PARTY_NOTICES.md'])await cp(join(build,item),join(folder,item),{recursive:true});
 await cp('README.md',join(folder,'README.md'));
 const zip=join(root,name+'.zip');
 execFileSync('pwsh',['-NoProfile','-Command',`Compress-Archive -LiteralPath '${folder.replaceAll("'","''")}' -DestinationPath '${zip.replaceAll("'","''")}'`]);files.push(zip);
 const setup=join(root,`DivoomAlbum-${version}-x64-setup.exe`);
 await cp(join(build,'bundle/nsis',`Divoom Album_${version}_x64-setup.exe`),setup);files.push(setup);
 executable=folder;resources=folder;
}else{
 assert.equal(process.platform,'darwin');
 app=join(build,'bundle/macos/Divoom Album.app');
 const zip=join(root,name+'.zip');execFileSync('ditto',['-c','-k','--sequesterRsrc','--keepParent',app,zip]);files.push(zip);
 const dmgs=(await readdir(join(build,'bundle/dmg'))).filter(x=>x.endsWith('.dmg'));assert.equal(dmgs.length,1);
 const dmg=join(root,name+'.dmg');await cp(join(build,'bundle/dmg',dmgs[0]),dmg);files.push(dmg);
 executable=join(app,'Contents/MacOS');resources=join(app,'Contents/Resources');
 for(const file of [app,join(executable,'timesframe-worker'),join(resources,'bin/ffmpeg'),join(resources,'bin/ffprobe')]){
  execFileSync('codesign',['--verify','--deep','--strict','--verbose=2',file],{stdio:'inherit'});
 }
 for(const file of [join(executable,'timesframe'),join(executable,'timesframe-worker'),join(resources,'bin/ffmpeg'),join(resources,'bin/ffprobe')]){
  const info=execFileSync('file',[file],{encoding:'utf8'});console.log(info);assert.ok(info.includes(process.arch==='arm64'?'arm64':'x86_64'));
 }
 execFileSync('plutil',['-lint',join(app,'Contents/Info.plist')],{stdio:'inherit'});
 // Launch the actual bundled native app, and check that its media sidecar starts.
 const child=spawn(join(executable,'timesframe'),[],{stdio:['ignore','pipe','pipe']});let output='';child.stderr.on('data',x=>output+=x);
 try{
  await new Promise(r=>setTimeout(r,8000));assert.equal(child.exitCode,null,output);
  const children=execFileSync('pgrep',['-P',String(child.pid)],{encoding:'utf8'}).trim();assert.ok(children,'Native app must start media worker');
  console.log('Native macOS application and worker started:',children);
 }finally{
  child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));
 }
}
execFileSync(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/test-packaged-worker.ts'],{stdio:'inherit',env:{...process.env,DIVOOM_PACK_DIRECTORY:executable,DIVOOM_PACK_RESOURCES:resources}});
const hashes=[];
for(const file of files){assert.ok((await stat(file)).size>1000000);hashes.push(`${createHash('sha256').update(await readFile(file)).digest('hex')}  ${basename(file)}`);}
await writeFile(join(root,`SHA256SUMS-${arch}.txt`),hashes.join('\n')+'\n');
console.log(hashes.join('\n'));
