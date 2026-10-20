# TimesFrame 局域网相簿接口

适用于 TimesFrame 510/511/512 的 Tina 应用源码。PC 工具需要设备固件提供下述本地接口；仅能读取硬件信息的旧固件尚不足以使用相簿功能。

## 请求入口

控制命令发送 JSON 到 `POST http://设备IP:9000/divoom_api`，文件上传使用 `POST /upload`。PC 与设备处于同一局域网；按设备串行执行读取和上传，并使用设备 ID 隔离缓存。

### 设备识别与能力

首先调用 `Device/GetHardwareVersion`。`Device/GetLanCapabilities` 返回相同的识别信息及相簿能力，例如：

```json
{
  "Command": "Device/GetLanCapabilities",
  "ReturnCode": 0,
  "DeviceId": 123456789,
  "Hardware": 511,
  "CanvasWidth": 800,
  "CanvasHeight": 1280,
  "SupportsPhotoLibrary": true,
  "PhotoUploadMaxBytes": 104857600,
  "PhotoVideoMaxSeconds": 600,
  "PhotoVideoCodec": "hevc"
}
```

使用设备实际返回的尺寸、硬件型号与 ID。TimesFrame 当前上传入口限制整个 multipart 请求为 100 MiB，包含视频、封面、JSON 与各段头。PC 输出视频片段最长 10 分钟，并按文件容量限制降低长片码率。

### 相簿列表

`Photo/GetLocalAlbumList` 沿用现有命令架构：在 `divoom_net_command_json.c` 的字符串表、PACK 表和 UNPACK 表注册，由 `divoom_net_app.c` 查询本机数据库，再通过现有打包及回包流程返回。HTTP 层不新增相簿业务分支，不调用云端相簿更新命令；云端 MQTT 断开时也允许本地回包。

```json
{
  "Command": "Photo/GetLocalAlbumList",
  "ReturnCode": 0,
  "DeviceId": 123456789,
  "AlbumList": [
    {"ClockId": 100001, "ClockName": "全部照片", "AlbumType": 1},
    {"ClockId": 100002, "ClockName": "旅行", "AlbumType": 0}
  ]
}
```

`AlbumType`：0 普通、1 全部、2 收藏、3 隐藏、4 预装。空列表返回 `[]`；数据库未就绪或查询失败返回非零 `ReturnCode`。

### 照片与视频列表

请求 `Photo/GetPhotoList`，携带 `ClockId`、`StartNum`、`EndNum`。起止位置从 1 开始并包含末项，每页最多 100 项；PC 每页使用 50 项。普通本地相簿 ID 从 100000 开始。

```json
{
  "Command": "Photo/GetPhotoList",
  "ReturnCode": 0,
  "DeviceId": 123456789,
  "PhotoList": [
    {
      "PhotoId": 123,
      "Time": 1792400000,
      "FileId": "/userdata/app_pic/preview.webp",
      "OriginalFileId": "/userdata/app_pic/example.mp4",
      "MediaType": "video"
    }
  ]
}
```

`Time` 为秒。`FileId` 用于缩略图，`OriginalFileId` 用于原文件和上传结果核对，`MediaType` 为 `photo` 或 `video`。本地相簿仍使用既有 `Photo/GetPhotoList` 的 UNPACK、`divoom_net_app.c` 分发和 PACK 流程，按保存时间降序、照片 ID 降序稳定分页；切换相簿不会改变其他相簿的分页位置。非本地相簿的原有处理和打包保留。空页仍返回 `PhotoList:[]`。

文件通过设备 HTTP 文件服务读取。缩略图不存在时，照片回退原文件；视频回退与 MP4 同目录同名的 WebP 封面。

## 上传及管理

| 操作 | 协议 |
| --- | --- |
| 上传 | `/upload` 的 multipart：JSON 段在前，`Command:Photo/LocalAddToAlbum`；之后是媒体文件，视频还必须包含 `PreviewFileName` 指定的 WebP 文件。请求及各段提供准确 Content-Length。 |
| 添加到其他相簿 | `Photo/DevicePhotoToAlbum`，携带 `UserId`、`ToClockId`、`PhotoList`。增加引用，保留原相簿及文件；PC 先检查目标已有记录。 |
| 移出当前相簿 | `Photo/RemovePhotoFromAlbum`，携带 `ClockId`、`PhotoList`、父相簿字段；保留原文件。 |
| 删除 | `Photo/DeletePhoto`，携带 `ClockId`、`PhotoList`、父相簿字段；通过现有媒体管理流程清理文件与引用。 |

照片导出 WebP，PC 上传的 `PhotoTitle` 固定为 `""`。TimesFrame 视频采用 HEVC Main Level 4、hvc1、yuv420p、30 fps、BT.709 limited range；源音轨存在时转 AAC-LC 44.1 kHz 双声道。AstroToo 使用独立的 H.264 配置。

本地相簿命令的回包可在云端 MQTT 断开时发送。HTTP 资源分配失败、等待超时或缺少回包时返回错误；PC 不自动重发写操作，应先刷新核对实际结果。

## 构建与验证

在已配置的 Tina SDK 根目录使用正常的 OpenWrt 应用构建入口：

```sh
. ./.buildconfig
make -C openwrt/openwrt package/subpackage/thirdparty/gui/lvgl-8/divoom_app/compile -j4 V=s
```

主程序位于配置对应的 `build_dir/target/divoom_app/src/divoom_app`。硬件型号由该工程现有产品配置决定；更新设备前需核对目标型号。

Windows 可使用 MSVC、Python 和产品自身的 cJSON 源码执行实际 C 代码测试：

```powershell
python scripts/test-timesframe-firmware.py --source-root "Tina工程/divoom_app/src"
```

测试编译产品实际的命令表条目、PACK/UNPACK 函数、`divoom_net_app.c` 相簿分发、数据库和 HTTP 函数，覆盖相簿类型、51 张同时间照片、交错分页、重复引用、原文件/媒体类型、封面回退、空结果、错误参数、非本地相簿原有打包、MQTT 离线回包，以及超时、空回包、内存和信号量失败。该测试与完整 ARM 构建分别记录；设备更新后的上传、播放和管理仍需真机验收。

旧 TimesFrame 固件遇到未知命令时可能返回 `Only accept JSON parameters`。PC 0.3.2 将此相簿请求错误显示为“固件未提供本地相簿列表接口”，不会把它当成空相簿。
