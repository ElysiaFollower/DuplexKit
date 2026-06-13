<!--
职责：提供最新的紧凑交接信息，让新 agent 能无歧义恢复当前任务。
边界：只保留当前可恢复状态；历史放 progress.md，稳定事实放 docs 或代码。
-->

# 会话交接

## 仓库状态

- 项目名：DuplexKit
- 本地路径：`/Users/ely/workspace/research/audio/DuplexKit`
- 分支：`main`
- 当前计划：`plans/active/2026-06-13-jingongxiaozi-device-acceptance.md`
- 当前功能项：F010 `active`
- 当前状态：正式 UI 与后端测试后门已按用户反馈修正；最新版 APK 已安装到真机；后端命令行 debug fixture 注入已在真机 app 上跑通；用户真实语音测试确认后端核心 MVP 基本可用；已修复 app 外层地图保持问题；已补后端 realtime trace 日志；已修复 assistant 工具声明带补充句时 Planner 不触发工具的问题；已收紧系统提示词，下一步等待用户复测打开地图和起终点。

## 当前已验证状态

- 旧一轮真机验证曾证明后端到金工小子 app 的 realtime 链路可用：聊天、打开地图、开始导航均成功。
- 本轮纠偏已完成代码层修复：
  - 正式 app 删除测试音频按钮和 `public/duplexkit-fixtures`。
  - app 新增独立浮动控制条，地图/kiosk 模式也可见。
  - 状态文案明确为 `未连接 / 已连接，未开麦 / 开麦中`。
  - 主按钮明确为 `连接后端 / 开始聆听 / 停止聆听`，连接后出现 `断开`。
  - 后端新增命令行测试后门：`POST /api/debug/realtime-fixture` 和 `npm run debug:realtime-fixture -- <fixture>`。
- 已通过验证：
  - `npm run build`
  - `npm test`，5 files / 26 tests passing
  - `cd apps/jingongxiaozi && npm run build`
  - Android debug APK 构建
  - `npm run debug:realtime-fixture -- open-map` 在无 app session 时返回 409 `No active realtime app session`
- 当前已安装 APK：
  - 路径：`apps/jingongxiaozi/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`
  - sha256：`d9f8359439aebd23808f549d301430b7ddf91bb845a7a5dc977ee9ef5a84fccf`
  - 大小：246M
- 真机安装确认：
  - `adb install --no-streaming -r -g -t .../app-universal-debug.apk` -> `Success`
  - 包 `cn.edu.zju.jingongxiaozi` `lastUpdateTime=2026-06-13 11:40:08`
  - `INTERNET`、`MODIFY_AUDIO_SETTINGS`、`RECORD_AUDIO` 均为 `granted=true`
  - WebView DOM：`.duplex-control-dock` 为 `未连接\n连接后端`，按钮包含 `连接后端`、`聆听展示`、`地图`、`对话`、`专家`，不包含 `测试音频`
- 命令行 debug fixture 真机复验：
  - `open-map` -> HTTP 200，app 进入地图页，显示地图楼层/图层控件
  - `navigate-beijing-south` -> HTTP 200，app 保持地图导航页，显示当前位置、终点和路线步骤
  - `smalltalk-no-tool` -> HTTP 200，app 进入常态对话，显示后端实时回复
  - `cancel-no-running-tool` -> HTTP 200，app 进入常态对话，显示“当前没有正在执行的工具调用。”
  - 截图：`logs/device-acceptance/2026-06-13-debug-fixture-final.png`
  - 观察：每条 fixture 后控制条会变成 `连接失败 / 重新连接`，因为没有持续麦克风输入，上游 realtime session 会在静默后关闭；测试脚本逐条重连后继续注入。真实麦克风测试时应连接后立刻点击 `开始聆听` 并说话。
- 地图保持修复：
  - 用户真实语音测试发现：地图打开后，新的语音通知会把页面切回金工小子对话/聆听界面。
  - 根因：接入层把普通 realtime 事件映射为全局 `listening/processing/chat` directive，触发金工小子 app state 切页。
  - 修复：`App.tsx` 在当前 mode 为 `map` 时忽略 `wake/listening/processing/chat/expert` 的切页效果；只有地图工具或显式 `map.close` 改变地图页面。
  - 3D 地图失败根因：真机 WebView 对 `/map-models/jingong.glb` 和 fallback `.glb` 返回 `text/html` Tauri shell，不是 GLB；未修改 3D 核心，`MapShell.tsx` 在 Android+Tauri 默认使用 legacy 地图。
  - 新 APK sha256：`aed5bd4f8b5daf222ce86fb73adb56a6d567b1842b58e71de41780f98deb929f`，包 `lastUpdateTime=2026-06-13 12:11:36`。
  - 真机 WebView 验证：Android 默认 `isLegacy=true`、`hasLegacyMap=true`、`has3dMap=false`；地图打开后直接 chat directive 不切走；`open-map` fixture 保持 legacy 地图；地图打开后 `smalltalk-no-tool` fixture 仍保持 legacy 地图。
  - 截图：`logs/device-acceptance/2026-06-13-map-shell-preserve-after-smalltalk.png`
- Realtime trace 补强：
  - 新增 `logs/realtime-trace/YYYY-MM-DD.jsonl`，按 `sessionId` 自动记录 ASR transcript、assistant 文本增量、Planner 决策、工具请求/结果、ChatTTSText 注入、TTS/audio 边界和错误。
  - 不记录原始音频内容，只记录事件边界和音频块大小。
  - 验证：`npm test` -> 5 files / 27 tests passed；`npm run build` -> pass；`./scripts/harness-check.sh` -> pass。
- 工具声明解析修复：
  - 真实 trace 里 `asr.transcript` 为“现在请你打开地图”，assistant response 为“我来调用地图工具：打开地图。地图打开后...”，但旧 Planner 判成 `no_action`，没有发送 `tool_request`。
  - 已允许规范工具声明句在回复开头后接补充句；地点参数只截取声明句内部。
  - 验证：`npm test -- tests/toolPlanner.test.ts` -> 12 tests passed；`npm run build` -> pass；`npm test` -> 5 files / 29 tests passed；`./scripts/harness-check.sh` -> pass。
- 工具调用系统提示词收紧：
  - `DEFAULT_SYSTEM_ROLE` 明确工具调用模式整轮回复只能包含一个固定声明句本身；句式前后不能添加解释、道歉、寒暄、等待提示或补充说明；声明后立即停止本轮回复。
  - 删除旧提示词中“工具结果出来前可以简短闲聊”的模糊许可。
  - 验证：`npm test -- tests/toolPlanner.test.ts` -> 13 tests passed；`npm run build` -> pass；`npm test` -> 5 files / 30 tests passed；`./scripts/harness-check.sh` -> pass。

## 仍损坏或未验证

- 新的浮动控制条已真机复验；用户若仍看到“正在聆听”，大概率是旧界面残留/未刷新，需要重启 app 或确认包更新时间。
- 麦克风真实连续语音仍需用户继续人工路径。
- 地图保持修复和工具声明解析修复后的真实声音体验仍待用户确认；下一轮如复现工具参数或语音打断问题，先读取最新 `logs/realtime-trace/YYYY-MM-DD.jsonl`。
- fixture 跑完后的 `连接失败 / 重新连接` 是无持续音频输入时的上游 idle close 表现，后续可优化为更温和的 `未连接` 文案，但不阻塞真实语音测试。

## 清洁状态

- 后端已用新构建产物启动：`node dist/server.js`，监听 `127.0.0.1:5177` / `10.162.230.154:5177`。
- `logs/device-acceptance/`、`logs/client-debug/`、`logs/realtime-trace/` 为本地证据目录并已 gitignore。
- 当前工作树包含本轮 realtime trace 日志补强改动；不要回滚用户或既有改动。

## 下一步最佳动作

1. 启动后端和 app：

```sh
node dist/server.js
adb reverse tcp:5177 tcp:5177
adb shell am start -n cn.edu.zju.jingongxiaozi/.MainActivity
```

2. 真实声音采集测试：
   - 在 app 浮动控制条点 `连接后端`。
   - 状态变成 `已连接，未开麦` 后立刻点 `开始聆听`。
   - 用户对手机说“打开地图”“导航到北京南站”“随便聊两句”等。
   - 验收：app 能收到文本/音频回复，并按工具请求切到地图或导航。

## 命令

- 初始化：`./init.sh`
- Harness 检查：`./scripts/harness-check.sh`
- 后端构建：`npm run build`
- 后端测试：`npm test`
- 后端启动：`node dist/server.js`
- Debug sessions：`curl http://127.0.0.1:5177/api/debug/realtime-sessions`
- Debug fixture：`npm run debug:realtime-fixture -- open-map`
- ADB reverse：`adb reverse tcp:5177 tcp:5177`
- APK 安装：`adb install --no-streaming -r -g -t apps/jingongxiaozi/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`
- 金工小子 Web 构建：`cd apps/jingongxiaozi && npm run build`
- 金工小子 APK 构建：

```sh
cd apps/jingongxiaozi
JAVA_HOME=/opt/homebrew/Cellar/openjdk@21/21.0.11/libexec/openjdk.jdk/Contents/Home \
PATH="/Users/ely/.rustup/toolchains/stable-aarch64-apple-darwin/bin:/opt/homebrew/Cellar/rustup/1.29.0_1/bin:/opt/homebrew/Cellar/openjdk@21/21.0.11/libexec/openjdk.jdk/Contents/Home/bin:$PATH" \
npm run tauri -- android build --apk --debug --target aarch64
```
