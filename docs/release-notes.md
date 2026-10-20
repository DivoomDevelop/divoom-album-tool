Divoom Album 最终跨平台发行版，支持 TimsFrame（510/511/512）和 AstroToo（530）。

- Windows x64：安装程序及免安装 ZIP。Windows 10/11，需要 WebView2。
- macOS Apple Silicon：选择 macos-arm64 的 DMG 或 ZIP。
- macOS Intel：选择 macos-x64 的 DMG 或 ZIP。
- macOS 要求 13.5 或更新版本；ad-hoc 签名，尚未通过 Apple 公证，首次运行可能需要在“隐私与安全性”中允许打开。
- 内置媒体服务、FFmpeg 和 ffprobe，无需自行安装 Node.js 或转码工具。
- 照片和视频保持原始宽高比例，按设备实际屏幕上限导出；支持等比裁剪、宽度与高度适配、旋转、视频截取及封面。
- 视频最长 10 分钟；TimsFrame 使用 H.265，AstroToo 使用 H.264；照片及视频封面使用 WebP。
- 支持设备隔离缓存、串行加载、上传确认、添加到其它相簿、移出及删除，以及设备全部 19 种语言。

PC 与设备必须连接同一局域网。固件须包含本地相簿接口。

源码和 SHA-256 校验文件一并提供。本发行仅包含最终平台包，不重复上传历史版本。
