# v0.3.9 Windows feedback and storage validation (2026-10-20)

This Windows release includes the feedback changes developed in v0.3.8 and the storage-full warning in v0.3.9. macOS installers remain at v0.3.6.

- 45 automated tests passed, including real WebP/video/background exports, quality, crop geometry and mirrors, persistent drafts/queue recovery, duplicate handling, strict Full 0/1 interpretation, unsupported firmware, and a device becoming full during a batch.
- TypeScript/Vite/media-service builds and Tauri debug/release/NSIS builds passed.
- Actual Tauri/WebView2 tests passed for all 19 languages, 1100×760 editor layouts, themes, native file-drop events, view zoom, modified markers, drafts, album switching during uploads, automatic last-session restoration, and duplicate skip/keep/replace behavior.
- Storage warnings were checked in all 19 languages. Photo crop settings remain saveable while full; photo/video upload submission is disabled and direct backend enqueue is also rejected. Refreshing Full=0 restores upload. Album-list errors do not discard a known full status.
- The packaged worker was tested against a local HTTP device fixture: Full=1 rejects enqueue with zero uploads; Full=0 restores uploads. An EXIF portrait WebP photo and an HEVC MP4/WebP cover were uploaded, with empty PhotoTitle, correct dimensions, and confirmation in the destination and All Photos albums.
- Windows executable version is 0.3.9. ZIP CRC, all 11 portable files, native executable/worker against the release build, media-service bundle, NSIS installer, and SHA-256 checksums were verified.

Only generated test media and local HTTP fixtures were used for this release's upload checks. No device firmware was flashed and no private chat screenshots or user media are included in the public source archive. Exact free bytes and estimated remaining photo count still require FreeBytes from firmware; Full alone cannot supply them.
