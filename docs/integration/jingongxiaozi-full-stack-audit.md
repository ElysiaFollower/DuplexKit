<!--
职责：记录金工小子 app 直接适配 DuplexKit 后端时遇到的困难、取舍和审计点。
边界：不记录原始日志、不替代代码和协议文档。
-->

# 金工小子全栈适配审计

## 当前结论

金工小子 app 可以按前后端分离方式直接接入 DuplexKit。它已有 Tauri + React Android 壳、横屏 kiosk UI、`BackendDirective` 状态入口和 `MapDirectRequest` 地图导航入口；缺的是实时语音 WebSocket 客户端。

本次适配没有改 DuplexKit 后端主协议。后端继续负责语音模型、文本生成和工具调度；金工小子 app 只负责采集麦克风、播放音频、展示文本状态、执行地图/导航 UI 动作并回传 `tool_result`。

## 主要困难

1. 金工小子没有真实后端客户端，只有 mock 指令。

   处理方式：新增 `src/duplexkit/` bridge，把 `/api/realtime` 的事件转换为现有 `BackendDirective`，不重写页面架构。

2. 后端工具参数是自然语言 `place`，金工小子地图需要 `roomId`。

   处理方式：新增轻量 room resolver，按房间 id、门牌号、名称、tag、描述做模糊匹配；找不到时落到常用房间，保证链路不断。

3. Android WebView 麦克风授权不只需要 `RECORD_AUDIO`。

   处理方式：manifest 同时声明 `RECORD_AUDIO` 和 `MODIFY_AUDIO_SETTINGS`。Tauri/Wry 的 Android WebView media permission handler 会同时请求这两个权限。

4. 手机局域网调试需要明文 WebSocket。

   处理方式：沿用金工小子已有策略，debug build `usesCleartextTraffic=true`，default/release 仍为 `false`。

5. 音频协议不是浏览器默认格式。

   处理方式：app 用 Web Audio 采集 float PCM，降采样到 24kHz，转 `pcm_s16le` binary frame；后端下行按 24kHz `pcm_f32le` 排队播放。

6. 上游 Android 构建配置写死了作者本机 AAPT2 路径。

   处理方式：移除 `android.aapt2FromMavenOverride=/Users/zzw4257/.../aapt2`，改回 Android Gradle Plugin 自行解析 AAPT2，避免 APK 构建绑定某一台机器。

## 当前取舍

- 没做生产配置中心；Mac IP + port 放在调试面板。
- 没做 release 签名包；当前目标是 debug APK 验证。
- 没把工具结果和地图真实导航状态深度绑定；当前以打开地图、设置起终点、启动路线展示为准。
- 没做真机自动化麦克风验证；Android 权限和 APK manifest 已审计，真机授权仍需人工操作。

## 审计入口

- DuplexKit bridge：`apps/jingongxiaozi/src/duplexkit/`
- App 接入点：`apps/jingongxiaozi/src/App.tsx`
- Android 权限：`apps/jingongxiaozi/src-tauri/gen/android/app/src/main/AndroidManifest.xml`
- 后端协议：`docs/integration/frontend-protocol.md`
