# Divoom 相簿 PC 工具

## 下载安装 / Downloads

**按电脑系统点击下载，无需登录 GitHub。** 安装包已内置媒体服务、Node.js、FFmpeg 和 ffprobe，下载安装即可使用。

| 电脑系统 | 安装包下载 | 版本与系统要求 |
| --- | --- | --- |
| Windows | **[下载 Windows 安装包（EXE）](https://github.com/DivoomDevelop/divoom-album-tool/releases/download/v0.3.7/DivoomAlbum-0.3.7-x64-setup.exe)** | v0.3.7 · Windows 10/11，64 位（x64），需要 WebView2 |
| Mac Apple 芯片 | **[下载 Mac Apple 芯片版（DMG）](https://github.com/DivoomDevelop/divoom-album-tool/releases/download/v0.3.6/DivoomAlbum-macos-arm64-v0.3.6.dmg)** | v0.3.6 · M 系列芯片，macOS 13.5 或更新版本 |
| Mac Intel | **[下载 Mac Intel 版（DMG）](https://github.com/DivoomDevelop/divoom-album-tool/releases/download/v0.3.6/DivoomAlbum-macos-x64-v0.3.6.dmg)** | v0.3.6 · Intel 处理器，macOS 13.5 或更新版本 |

Windows：下载后双击 EXE，按提示安装。Mac：点击左上角苹果菜单 →“关于本机”查看芯片类型；下载对应 DMG，打开后将应用拖入“应用程序”。Mac 包尚未通过 Apple 公证，首次打开可能需要在“系统设置 → 隐私与安全性”中允许打开。

使用时，请将电脑与设备连接到同一个局域网。支持 TimsFrame（510/511/512）和 AstroToo（530）。

[Windows 免安装 ZIP](https://github.com/DivoomDevelop/divoom-album-tool/releases/download/v0.3.7/DivoomAlbum-win-x64-v0.3.7.zip)（完整解压后运行 `DivoomAlbum.exe`） · [全部版本、更新说明及 SHA-256 校验文件](https://github.com/DivoomDevelop/divoom-album-tool/releases)

使用 **Tauri 2 + React + TypeScript**。媒体服务作为随应用打包的独立进程运行，内置 Node.js、FFmpeg 和 ffprobe，目标电脑无需安装这些依赖。

## 诊断日志

v0.3.7 起，Windows 日志优先保存在 `DivoomAlbum.exe` 同级的 `logs/` 文件夹。安装目录无法写入时自动使用 `%APPDATA%\com.divoom.timesframe\logs\`，日志首条记录包含实际目录。缓存与最近设备信息仍按用户保存在原来的 AppData 目录。

- `diagnostics.jsonl`：应用版本、进程/会话与请求编号、连接硬件/能力查询、完整控制命令和 JSON 响应、HTTP 状态与耗时、相簿/照片数量、缓存命中/失效、转换/上传及异常堆栈。`jobs` 高频轮询不重复记录。
- `worker.log`：原生启动位置、日志目录回退原因及媒体进程标准错误。
- 重启后追加保留；诊断日志单文件 5 MiB，保留 3 份轮转备份。标准错误日志在下次启动时超过 5 MiB 也进行轮转。
- 连接令牌、密码、鉴权字段、图片/视频内容和本地媒体访问令牌不写入。单条异常超大响应会标记截断。

出现“已连接但相簿为空”时，可直接点击“刷新相簿”重新请求设备，即使当前没有相簿也可用。复现一次后，将整个 `logs` 文件夹压缩发回分析；`cache.json.hit` 且 `count:0` 表示命中空缓存，`command.response` 可核对设备实际返回，接口异常在 `command.error`/`rpc.error` 中。

## 使用

1. 将 PC 和设备连接到同一个局域网。点击“刷新设备”选择设备，或通过“手动 IP”连接。
2. 程序首先调用 `Device/GetHardwareVersion`，读取实际屏幕尺寸，再读取本地相簿。
3. 选中相簿，进入统一导入界面，点击“选择文件…”。照片和视频一起展示，照片可多选；选中视频时本次仅允许该一个文件，规则显示在列表下方。默认“仅未上传”，也可切换“全部”。
4. 照片支持“等比裁剪”“宽度适配”“高度适配”，均保持原照片的宽高比例，允许不同导出尺寸。JPG 拍摄方向在读取尺寸时自动识别，竖拍照片保持竖向。宽度/高度适配分别改变编辑视图的查看缩放，超出部分可滚动查看；导出按原比例缩放到所选设备的实际宽高范围，完整照片在相同上限下可能得到相同尺寸。例如 800×1280 设备上的 4:3 横图输出 800×600、3:4 竖图输出 800×1066，480×480 设备上的横图输出 480×360。缩放裁剪框也始终锁定原图比例，可拖动取景；预览显示实际导出尺寸。支持逐张处理、首张模板批量应用及单张调整。视频使用相同的原比例裁剪和宽度/高度适配，允许不同导出尺寸；视频与 WebP 封面保持相同尺寸，并对齐为编码要求的偶数像素。例如 1080×1920 视频在 800×1280 设备上输出 720×1280，横向旋转后输出 800×450。可选起止时间与封面帧，最长 **10 分钟**。
5. 保存后进入转换/上传队列。照片导出 WebP；视频及 WebP 预览图作为同一个 multipart 请求上传，`PhotoTitle` 固定为空字符串。目标相簿及“全部照片”均确认后显示“已完成”，并刷新当前设备的列表；本地导出目录保存 `upload-receipt.json` 供核对文件名和入库 ID。同一批次重复提交不会重复加入队列。
6. 选择媒体后可“添加到相簿”（保留原相簿及文件、跳过目标中已有记录）、“移出相簿”或“彻底删除”；后者会删除设备上的文件及引用。原始 PC 文件不会被修改。

仅支持 `Hardware 510/511/512 → TimsFrame` 和 `530 → AstroToo`。刷新结果、最近设备列表均隐藏其他产品，手动 IP 连接也会校验型号。标题随所选设备变化，未连接时显示当前语言的“Divoom 相簿”。窗口标题与界面名称同步变化。

## 语言与设备缓存

右上角支持设备枚举的全部 19 种语言：英语、简体中文、繁体中文、日语、德语、泰语、俄语、韩语、越南语、法语、土耳其语、西班牙语、葡萄牙语、印尼语、意大利语、乌克兰语、瑞典语、丹麦语、波兰语。顺序和固件语言 ID 0–18 一致。首次按系统语言选择，之后记住手动选择；相簿、裁剪、队列、确认弹窗、错误提示和日期/数字格式随语言切换，用户自己的名称保持原文。

缓存按设备列表返回的 **DeviceId** 隔离，同一设备换 IP 仍能复用，不同设备即使照片 ID 或路径相同也不会混用。手动 IP 优先匹配发现/最近设备 ID；缺少 ID 时用 MAC 地址兜底，两者都不可得则只用本次连接的独立缓存，避免共用 IP 缓存。

相簿列表、分页列表、缩略图和已打开的原文件优先读取本地，仅缺失时向设备读取。缩略图逐张请求，设备控制、文件下载和上传共用每台设备的串行连接队列。成功结果持久保存，失败和未完成的下载不作为缓存；缺失缩略图可在 PC 上从原文件重新生成。

点击“刷新相簿”主动更新设备列表数据；本工具上传、移出或删除后会使对应设备的列表缓存失效。其他客户端的改动通过手动刷新同步。Windows 缓存位于 `%APPDATA%\com.divoom.timesframe\devices-cache\`，退出应用后可删除此目录释放空间，下一次按需重建。

“仅未上传”依据本版成功上传后的源文件 SHA-256 及设备入库记录判断，不按文件名猜测；文件改名仍能识别，同名不同内容不会混淆。记录按 DeviceId 存放在 `%APPDATA%\com.divoom.timesframe\upload-history\`，重启后保留。仅当记录对应的照片仍存在于设备列表时才隐藏；设备上已删除的文件在“刷新状态”后可重新选择。旧版或手机 APP 上传且没有本工具源文件记录的项目不会被误标为已上传。

TimesFrame 510/511/512 需要包含本地相簿接口的固件；旧固件即使能读取硬件信息，也可能缺少相簿列表。TimesFrame 使用 H.265，AstroToo/530 使用 H.264，图片与视频输出尺寸来自设备。TimesFrame 固件实现、容量限制、协议与编译/测试方式见 [局域网相簿接口](docs/timesframe-lan-albums.md)。

## 开发与打包

需要 Node.js 24、Rust stable、Windows MSVC Build Tools 或 macOS Xcode Command Line Tools。Windows 使用 WebView2，安装包采用 Tauri NSIS；macOS 生成 app/DMG。

```powershell
npm ci
.\build.ps1
```

开发启动：`npm start`。仅生成未打包程序：`npm run pack`。Windows 安装包：`npm run dist:win`；macOS：`npm run dist:mac`。在对应平台/架构运行构建，确保内置 Node 和 FFmpeg 的架构一致；macOS Intel 与 Apple Silicon 分别构建。

Windows 安装包输出位于 `src-tauri/target/release/bundle/nsis/`。双击未打包程序时，必须保留同目录中的 worker、worker.cjs 和 bin 文件夹，不能只拷贝主程序 EXE。

## 协议

- 发现：参考 `pc_hardwareware/Transport.cs` 的云端 `Device/ReturnSameLANDevice` 接口；发现依赖互联网，手动 IP 和已保存设备可离线连接。媒体直接传到设备内网 IP。
- 控制：`POST http://IP:9000/divoom_api`。旧型号 90/92/400 的入口为 `:80/post`，是否支持相簿功能取决于固件响应。
- 新增：`Photo/GetLocalAlbumList`，返回 `AlbumList:[{ClockId,ClockName,AlbumType}]`。
- 媒体列表：`Photo/GetPhotoList`，`StartNum/EndNum` 从 1 开始且包含结束位置；HTTP 顶层相簿采用独立位置分页。保留 `Time/FileId/PhotoId`，新增 `OriginalFileId/MediaType`。
- 上传：`POST /upload`，JSON 在前，媒体及视频预览图在后；请求和各 part 都有 `Content-Length`。照片转 WebP（质量 90）：所有照片模式保持原图比例，输出尺寸不超过设备宽高；先识别 EXIF 拍摄方向，预览、裁剪与编码使用同一显示坐标；`PhotoWidth/PhotoHeight` 使用实际文件尺寸，`PhotoTitle` 为 `""`。AstroToo 视频 MP4/H.264 Baseline Level 2.1、保持原比例且不超过设备实际宽高、yuv420p、30000/1001 fps、约 1 Mbps、无音轨，封面 WebP。历史 JPG 的列表缩略图由 PC 从原图生成，绕过设备已有的错误缩略图与旧缓存。
- TimesFrame（510/511/512）视频参考用户提供的 `Ai1.mp4`：MP4/H.265 Main Level 4、hvc1、yuv420p、30 fps、BT.709 limited range；保持原视频比例并限制在设备实际宽高内，源音轨存在时转 AAC-LC 44.1 kHz 双声道。目标约 10 Mbps、峰值最多 12 Mbps；长片段按设备上传容量降低码率，预留音轨、封面及容器空间。仍随视频上传 WebP 预览图。
- 能力：`SupportsPhotoLibrary`、`PhotoUploadMaxBytes`、`PhotoVideoMaxSeconds`。PC 视频上限固定为 600 秒，与设备返回的时长上限取较小值；旧固件即使返回 1800 也不会放宽 PC 限制。上传大小与设备限额和 512 MiB 取较小值，针对整个 multipart 请求。
- 添加到其它相簿：`Photo/DevicePhotoToAlbum`，发送 `UserId:1`、`ToClockId`、`PhotoList`，每批最多 50 项。只增加已有媒体引用，原相簿保留；目标仅允许普通本地相簿，提交前核对源记录、目标及重复项，写入后读取确认并失效列表缓存。
- 管理：`Photo/RemovePhotoFromAlbum` 保留文件；`Photo/DeletePhoto` 删除媒体及引用，物理文件由固件后台清理。写请求超时后不要盲目重发，应先刷新核对。

固件业务修改同时落在用户指定的 `Z:/allwinner/AstroToo/lichee/rtos/projects/f101s3/astrotoo/src/` 和仿真对应文件；未进行整树同步。`artifacts/firmware-diffs/` 保存本轮初始补丁，最终源文件以当前工作区为准。

## 测试

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

仿真使用 `LvglAstroTooSimulator`，按工程 README 的 **Debug/x86** 和 F5 全线程环境运行。测试创建独立验收相簿，并在结束时清理测试媒体，不删除已有用户媒体。

验收记录位于 `artifacts/simulator/`：当前版本完整 10 分钟转换/上传见 `10min-report.json` 与 `worker-10min-report.json`；旧版 30 分钟记录作为历史结果保留。另有短视频与 51 张同时间照片分页测试。实际 Tauri 界面截图和测试记录位于 `artifacts/ui/`。

`test-device-cache.ts` 默认只读验证用户指定的 `192.168.13.142`，可通过 `DIVOOM_TEST_IP` 修改。第二阶段重启媒体进程并禁止 HTTP/fetch，验证磁盘缓存复用。`ui-languages.ts` 需先以 `TIMESFRAME_UI_TEST=1` 启动 debug Tauri；检查全部语言、真机缩略图和裁剪布局。该模式使用独立 WebView/媒体服务测试数据，release 不启用调试端口。

本次 v0.3.7 仅构建 Windows x64，运行媒体转换、诊断日志与打包后服务验证；v0.3.6 的 macOS Apple Silicon/Intel 包已分别通过原生构建与媒体测试。macOS 要求 13.5 或更新版本，安装包使用 ad-hoc 签名，尚未通过 Apple 公证。首次打开可能需要在系统“隐私与安全性”中允许打开。x64 仿真曾在原有 MQTT 遗嘱主题代码中发生指针异常，因此使用项目规定的 x86 仿真进行验收；没有修改或跳过该 MQTT 模块。

## 设计资源

内置 imagegen 生成的原始主界面、裁剪界面和局域网提示修订图保存在 `design/`，对应提示词见 `prompts.json` 与 `lan-hint-prompt.txt`。设计图中的固定 TimesFrame 名称先于动态标题需求，实际程序按上述硬件映射显示。
