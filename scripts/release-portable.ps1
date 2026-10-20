$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$taskVersion=(Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw | ConvertFrom-Json).version
$taskSource=Join-Path $taskRoot 'src-tauri\target\release'
$taskInstaller=Join-Path $taskSource "bundle\nsis\Divoom Album_${taskVersion}_x64-setup.exe"
# Wait for NSIS to finish; the complete installer must allow an exclusive read.
$taskRead=[IO.File]::Open($taskInstaller,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
$taskRead.Dispose()
$taskDestination=Join-Path $taskRoot "release\DivoomAlbum-win-x64-v${taskVersion}"
if(Test-Path -LiteralPath $taskDestination){throw 'Portable output already exists; preserve it and choose a new version.'}
New-Item -ItemType Directory -Path $taskDestination -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $taskSource 'timesframe.exe') -Destination (Join-Path $taskDestination 'DivoomAlbum.exe')
foreach($taskName in @('timesframe-worker.exe','worker.cjs','THIRD_PARTY_NOTICES.md')){Copy-Item -LiteralPath (Join-Path $taskSource $taskName) -Destination $taskDestination}
Copy-Item -LiteralPath (Join-Path $taskSource 'bin') -Destination $taskDestination -Recurse
Copy-Item -LiteralPath (Join-Path $taskRoot 'README.md') -Destination $taskDestination
$taskZip=Join-Path $taskRoot "release\DivoomAlbum-win-x64-v${taskVersion}.zip"
$taskSetup=Join-Path $taskRoot "release\DivoomAlbum-${taskVersion}-x64-setup.exe"
Compress-Archive -LiteralPath $taskDestination -DestinationPath $taskZip
Copy-Item -LiteralPath $taskInstaller -Destination $taskSetup
$taskHashes=Get-FileHash -LiteralPath $taskZip,$taskSetup
$taskHashes | ForEach-Object {"$($_.Hash.ToLower())  $(Split-Path -Leaf $_.Path)"} | Set-Content -LiteralPath (Join-Path $taskRoot "release\SHA256SUMS-v${taskVersion}.txt") -Encoding ascii
$taskHashes | Format-Table -AutoSize
