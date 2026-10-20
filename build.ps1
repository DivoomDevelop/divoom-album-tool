param([switch]$Debug, [switch]$NoBundle)
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
$taskCargo=Join-Path $env:USERPROFILE '.cargo\bin'
if(Test-Path -LiteralPath $taskCargo){$env:PATH=$taskCargo+';'+$env:PATH}
$env:CARGO_BUILD_JOBS='4'
& npm run prepare:tauri
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
$taskArgs=@('tauri','build')
if($Debug){$taskArgs+='--debug'}
if($NoBundle){$taskArgs+='--no-bundle'}else{$taskArgs+=@('--bundles','nsis')}
& npx @taskArgs
exit $LASTEXITCODE
