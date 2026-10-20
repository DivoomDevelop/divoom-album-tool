# Divoom Album Desktop Tool

## Downloads

**Choose your computer's operating system below to download. No GitHub sign-in is required.** Each installer includes the media service, Node.js, FFmpeg, and ffprobe, so you can install and start using the app immediately.

| Operating system | Installer | Version and requirements |
| --- | --- | --- |
| Windows | **[Download Windows installer (EXE)](https://github.com/DivoomDevelop/divoom-album-tool/releases/download/v0.3.9/DivoomAlbum-0.3.9-x64-setup.exe)** | v0.3.9 · Windows 10/11, 64-bit (x64), WebView2 required |
| Mac with Apple silicon | **[Download Mac Apple silicon installer (DMG)](https://github.com/DivoomDevelop/divoom-album-tool/releases/download/v0.3.6/DivoomAlbum-macos-arm64-v0.3.6.dmg)** | v0.3.6 · M-series chip, macOS 13.5 or later |
| Mac with Intel processor | **[Download Mac Intel installer (DMG)](https://github.com/DivoomDevelop/divoom-album-tool/releases/download/v0.3.6/DivoomAlbum-macos-x64-v0.3.6.dmg)** | v0.3.6 · Intel processor, macOS 13.5 or later |

Windows: download the EXE, double-click it, and follow the installation prompts. Mac: open the Apple menu → About This Mac to check your chip or processor, download the matching DMG, open it, and drag the app into Applications. The Mac packages have not been notarized by Apple; on first launch, you may need to allow the app in System Settings → Privacy & Security.

Connect your computer and device to the same local network. Supported devices: TimsFrame (510/511/512) and AstroToo (530).

[Windows portable ZIP](https://github.com/DivoomDevelop/divoom-album-tool/releases/download/v0.3.9/DivoomAlbum-win-x64-v0.3.9.zip) (extract the entire archive, then run `DivoomAlbum.exe`) · [All releases, release notes, and SHA-256 checksums](https://github.com/DivoomDevelop/divoom-album-tool/releases)

Built with **Tauri 2 + React + TypeScript**. The media service runs as a separate process bundled with the app. Node.js, FFmpeg, and ffprobe are included; users do not need to install these dependencies separately.

## Diagnostic logs

Starting with v0.3.7, Windows logs are written to the `logs/` folder next to `DivoomAlbum.exe` when possible. If the installation directory is not writable, the app falls back to `%APPDATA%\com.divoom.timesframe\logs\`. The first log entry records the actual directory. Cache and recent-device data remain in their existing per-user AppData locations.

- `diagnostics.jsonl`: app version, process/session and request IDs, device hardware/capability queries, complete control commands and JSON responses, HTTP status and duration, album/photo counts, cache hits/invalidation, conversion/upload operations, and exception stacks. Frequent `jobs` polling is not logged repeatedly.
- `worker.log`: native startup location, reasons for falling back to another log directory, and media-process standard error output.
- Logs are appended across restarts. Each diagnostic log file is limited to 5 MiB, with three rotated backups. Standard error logs exceeding 5 MiB are also rotated on the next startup.
- Connection tokens, passwords, authentication fields, image/video contents, and local media access tokens are excluded. Unusually large responses are marked as truncated.

If the device is connected but no albums appear, click "Refresh albums" to query it again; the button remains available even when the album list is empty. Reproduce the issue once, then compress the entire `logs` folder for analysis. `cache.json.hit` with `count:0` indicates an empty cached result; `command.response` shows the device's actual response, while `command.error`/`rpc.error` records API errors.

## v0.3.9 storage full warning

The app queries `Device/GetStorageStatus`, mapped by firmware to `DIVOOM_NET_COMM_DEVICE_GET_STORAGE_STATUS`. `Full:1` displays a clear storage warning in the library and import/editor screens. Upload submission and each queued file recheck the device; no new file is sent while storage is reported full. Crop edits can still be saved. Delete unwanted media on the device, then choose Refresh status to resume after `Full:0`. Unsupported or invalid responses remain unknown.

Windows v0.3.9 includes the feedback improvements below. Download the installer or portable ZIP above; macOS downloads remain at v0.3.6.

## v0.3.8 feedback improvements

Windows v0.3.8 local builds add editing drafts and upload history that survive restarts, automatic recovery of the last device/album/editor, and an upload queue that remains visible while switching albums. Waiting/converting jobs resume; interrupted uploads require checking the device before another upload to avoid duplicates.

- Crop by dragging any of the four corner grips. Separate view-zoom buttons magnify the editing view without changing the crop. Rotation, horizontal/vertical mirrors, and edited-photo markers remain available.
- Choose WebP quality (80 is recommended), see the actual encoded file size and the device upload limit, and use the original proportions or a blurred-photo, black, or white background filling the device canvas.
- Choose automatic, light, or dark appearance. The editor adapts to available window height; all 19 languages were checked at 1100 × 760.
- Drop local files onto an album to import. Confirmed source-content duplicates offer skip, keep both, or replace. Replacement confirms the new copy first. A normal album removes only old references; replacement in All Photos permanently deletes old copies and their album references.
- The sidebar shows photo/video counts and firmware storage status. Exact free space and estimated remaining photo count require `FreeBytes` from firmware. Firmware returning only `Full` shows the space value as unavailable.

These improvements are included in the Windows v0.3.9 release. Updated macOS packages have not been built; the existing macOS v0.3.6 downloads remain available.

## Usage

1. Connect your computer and device to the same local network. Click "Refresh devices" to select a device, or connect using "Manual IP".
2. The app first calls `Device/GetHardwareVersion` to read the actual screen dimensions, then loads the local albums.
3. Select an album, open the import screen, and click "Choose files…". Photos and videos appear together. You can select multiple photos; selecting a video limits that import to a single video. The selection rules are shown below the list. The default filter is "Not uploaded only"; you can switch to "All".
4. Photos support proportional cropping, fit to width, and fit to height. All modes preserve the original aspect ratio and may produce different export dimensions. JPG capture orientation is detected when reading dimensions, so portrait photos remain upright. The full underlying image stays visible; switching among the three fit buttons does not enlarge it. Drag the crop frame to move it, or drag any of its four clearly marked corner handles to resize it while preserving the original aspect ratio; the zoom slider has been removed. Rotation and horizontal/vertical mirroring apply consistently to the preview, the first-photo batch template, and the exported file. Thumbnails show modified/unmodified status, updated after editing, saving, or applying batch settings. Simply viewing a photo does not mark it as modified; returning to file selection and reopening the editor preserves the current settings and markers. Exports preserve the original aspect ratio within the selected device's actual width and height limits; an uncropped photo may produce the same dimensions in different modes. For example, an 800×1280 device exports a 4:3 landscape photo at 800×600 and a 3:4 portrait photo at 800×1066; a 480×480 device exports the landscape photo at 480×360. The crop frame always locks to the original aspect ratio and can be dragged to adjust framing; the preview shows the actual export dimensions. Edit photos individually, apply the first photo's template to a batch, or make individual adjustments afterward. Videos use the same proportional cropping and width/height fit modes and may also produce different dimensions. Each video and its WebP cover share the same dimensions, rounded to even pixel counts for encoding. For example, a 1080×1920 video exports at 720×1280 on an 800×1280 device, or at 800×450 after rotating to landscape. Choose start/end times and a cover frame; the maximum duration is **10 minutes**.
5. Saving adds the media to the conversion/upload queue. Photos are exported as WebP. Each video and its WebP preview image are uploaded in one multipart request, with `PhotoTitle` fixed to an empty string. An item is marked complete only after it is confirmed in both the target album and "All photos"; the current device's list is then refreshed. The local export directory contains `upload-receipt.json` with filenames and stored IDs for verification. Submitting the same batch repeatedly does not add duplicate queue entries.
6. Select media to add it to another album (keeping the original album and files, and skipping existing target entries), remove it from an album, or delete it permanently. Permanent deletion removes the device files and their references. Original files on your computer are never modified.

Only `Hardware 510/511/512 → TimsFrame` and `530 → AstroToo` are supported. Other products are hidden from discovery results and recent-device lists; manual IP connections also validate the model. The app title follows the selected device. When disconnected, it displays the localized name "Divoom Album". The window title and in-app name update together.

## Languages and device cache

The language selector in the upper-right corner supports all 19 languages in the device enumeration: English, Simplified Chinese, Traditional Chinese, Japanese, German, Thai, Russian, Korean, Vietnamese, French, Turkish, Spanish, Portuguese, Indonesian, Italian, Ukrainian, Swedish, Danish, and Polish. Their order matches firmware language IDs 0–18. The initial selection follows the system language; subsequent manual choices are remembered. Albums, cropping, queues, confirmation dialogs, errors, and date/number formatting follow the selected language. User-defined names remain unchanged.

Caches are isolated by the **DeviceId** returned in the device list. The same device can reuse its cache after changing IP address, while different devices never share cached entries even if photo IDs or paths match. Manual IP connections first try to match a discovered or recent device ID, then fall back to a MAC address. If neither is available, the connection uses its own temporary cache identity rather than sharing an IP-based cache.

Album lists, paginated lists, thumbnails, and previously opened original files are read locally first; only missing data is fetched from the device. Thumbnails are requested individually. Device control, downloads, and uploads share a serial connection queue for each device. Successful results are persisted; failures and incomplete downloads are not cached. Missing thumbnails can be regenerated on the computer from the original files.

Click "Refresh albums" to actively reload device data. Uploading, removing, or deleting media through this tool invalidates the relevant device-list cache. Changes made by other clients appear after a manual refresh. On Windows, the cache is stored at `%APPDATA%\com.divoom.timesframe\devices-cache\`. You can delete this directory after exiting the app to free disk space; it is rebuilt as needed.

"Not uploaded only" uses the source file's SHA-256 and confirmed device records from successful uploads made with this version, rather than guessing from filenames. Renamed files are still recognized, and different files with the same name remain distinct. Records are stored by DeviceId at `%APPDATA%\com.divoom.timesframe\upload-history\` and survive restarts. A file is hidden only while its corresponding photo still exists in the device list; files deleted from the device become selectable again after refreshing status. Media uploaded by older versions or the mobile app without a source-file record from this tool is not incorrectly marked as uploaded.

TimesFrame 510/511/512 requires firmware with the local-album APIs. Older firmware may return hardware information without supporting album lists. TimesFrame uses H.265; AstroToo/530 uses H.264. Photo and video output dimensions come from the device. See [LAN album APIs](docs/timesframe-lan-albums.md) for TimesFrame firmware implementation, capacity limits, protocol details, and build/test instructions.

## Development and packaging

Requires Node.js 24, Rust stable, and either Windows MSVC Build Tools or macOS Xcode Command Line Tools. Windows uses WebView2 and a Tauri NSIS installer; macOS builds an app/DMG.

```powershell
npm ci
.\build.ps1
```

Start development with `npm start`. Build the unpackaged app with `npm run pack`, the Windows installer with `npm run dist:win`, or macOS packages with `npm run dist:mac`. Build on the matching platform and architecture so the bundled Node.js and FFmpeg architectures agree. Build macOS Intel and Apple silicon packages separately.

Windows installers are generated in `src-tauri/target/release/bundle/nsis/`. To run an unpackaged app, keep the worker executable, `worker.cjs`, and `bin` folder alongside the main executable. Copying only the main EXE is insufficient.

## Protocol

- Discovery: uses the cloud `Device/ReturnSameLANDevice` API, as referenced in `pc_hardwareware/Transport.cs`. Discovery requires internet access; manual IP and saved-device connections work offline. Media is sent directly to the device's LAN IP.
- Control: `POST http://IP:9000/divoom_api`. Older models 90/92/400 use `:80/post`; album support depends on the firmware response.
- Album list: `Photo/GetLocalAlbumList`, returning `AlbumList:[{ClockId,ClockName,AlbumType}]`.
- Media list: `Photo/GetPhotoList`; `StartNum/EndNum` are 1-based and include the end position. HTTP top-level albums use independent positional pagination. Existing `Time/FileId/PhotoId` fields are retained, with `OriginalFileId/MediaType` added.
- Upload: `POST /upload`, with JSON first, followed by media and video preview images. The request and every part include `Content-Length`. Photos are converted to WebP at quality 90. All photo modes preserve the original aspect ratio within the device's width/height limits. EXIF capture orientation is applied first, and preview, cropping, and encoding use the same display coordinates. `PhotoWidth/PhotoHeight` reflect actual file dimensions; `PhotoTitle` is `""`. AstroToo video uses MP4/H.264 Baseline Level 2.1, preserves the original aspect ratio within the device's actual width/height, and uses yuv420p, 30000/1001 fps, approximately 1 Mbps, no audio, and a WebP cover. Thumbnails for older JPG files are generated on the computer from the originals, bypassing incorrect device thumbnails and stale caches.
- TimesFrame (510/511/512) video follows the supplied `Ai1.mp4` reference: MP4/H.265 Main Level 4, hvc1, yuv420p, 30 fps, and BT.709 limited range. Original aspect ratio is preserved within the device's actual dimensions. Source audio, when present, is converted to AAC-LC, 44.1 kHz, stereo. The target video bitrate is approximately 10 Mbps, with a maximum peak of 12 Mbps. Longer clips use lower bitrates to fit the device's upload capacity, reserving space for audio, the cover, and container overhead. A WebP preview image is uploaded with the video.
- Capabilities: `SupportsPhotoLibrary`, `PhotoUploadMaxBytes`, and `PhotoVideoMaxSeconds`. The desktop video limit is fixed at 600 seconds and capped further by any lower limit returned by the device. Older firmware returning 1800 does not increase the desktop limit. Upload size is limited to the smaller of the device limit and 512 MiB, measured across the entire multipart request.
- Add to another album: `Photo/DevicePhotoToAlbum`, sending `UserId:1`, `ToClockId`, and `PhotoList`, with at most 50 items per batch. This adds references to existing media and preserves the source album. Only regular local albums are valid targets. Source records, target album, and duplicates are checked before submission; results are read back for confirmation and the relevant list cache is invalidated afterward.
- Management: `Photo/RemovePhotoFromAlbum` preserves the file; `Photo/DeletePhoto` removes media and references, with physical files cleaned up by the firmware in the background. Do not blindly retry a timed-out write request; refresh and verify the device state first.

Firmware changes were applied to both the specified `Z:/allwinner/AstroToo/lichee/rtos/projects/f101s3/astrotoo/src/` directory and the corresponding simulator files, without synchronizing the entire source tree. `artifacts/firmware-diffs/` contains the initial patches from that work; the current workspace contains the final source files.

## Tests

```powershell
npm test
npm run test:sim
npm run test:sim -- --long
npx tsx scripts/test-photo-pagination.ts
npx tsx scripts/test-worker.ts
npx tsx scripts/test-device-cache.ts
npx tsx scripts/ui-languages.ts
npx tsx scripts/test-webp-device.ts
npx tsx scripts/ui-webp.ts
npx tsx scripts/ui-import-workflow.ts
npx tsx scripts/test-import-queue.ts
npx tsx scripts/ui-add-to-album.ts
npx tsx scripts/test-video-profiles.ts
```

Simulator tests use `LvglAstroTooSimulator` in the project's required **Debug/x86** configuration, running all threads under F5 as described in its README. Tests create a dedicated acceptance-test album and clean up their test media afterward without deleting existing user media.

Acceptance records are stored in `artifacts/simulator/`. The current version's full 10-minute conversion/upload results are in `10min-report.json` and `worker-10min-report.json`; older 30-minute records are retained as historical results. Short-video tests and pagination tests with 51 photos sharing the same timestamp are also included. Actual Tauri UI screenshots and test records are in `artifacts/ui/`.

`test-device-cache.ts` defaults to read-only validation against the specified device at `192.168.13.142`; override it with `DIVOOM_TEST_IP`. Its second stage restarts the media process and blocks HTTP/fetch to verify reuse of the disk cache. Before running `ui-languages.ts`, start debug Tauri with `TIMESFRAME_UI_TEST=1`; it checks all languages, real-device thumbnails, and crop layouts. This mode uses separate WebView/media-service test data. Release builds do not enable the debugging port.

v0.3.7 was built for Windows x64 only, with media conversion, diagnostic logging, and packaged-service validation. The v0.3.6 macOS Apple silicon and Intel packages each passed native builds and media tests. macOS 13.5 or later is required. The Mac packages use ad-hoc signing and have not been notarized by Apple; on first launch, you may need to allow the app in Privacy & Security. An earlier x64 simulator run encountered a pointer exception in existing MQTT last-will topic code, so acceptance testing used the project's required x86 simulator. That MQTT module was neither modified nor bypassed.

## Design resources

Original imagegen-generated designs for the main screen, crop screen, and revised LAN hint are stored in `design/`. Their prompts are in `prompts.json` and `lan-hint-prompt.txt`. The fixed TimesFrame name in the designs predates the dynamic-title requirement; the actual app displays the name according to the hardware mapping above.
