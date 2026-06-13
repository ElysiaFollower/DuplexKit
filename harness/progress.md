<!--
职责：记录跨会话进度、状态变化、阻塞和验证摘要，让新会话能快速恢复。
边界：不要存放聊天记录、原始日志、密钥，或更适合由代码、测试、ADR、任务计划表达的内容。
-->

# 进度日志

## 当前状态

- 当前功能项：F001-F008 均 passing；当前无 active 功能项
- 当前任务计划：无 active plan；F008 已归档到 `plans/archive/2026-06-07-mobile-demo.md`
- 上次验证：2026-06-07 `./scripts/harness-check.sh`、`npm test`、`npm run build`、`cd mobile-demo && npm install && npm run typecheck && npm run build`、`cd mobile-demo && npx tauri info`、Playwright 首屏检查均完成；`npx tauri info` 显示 Tauri 配置可识别但本机未安装 Rust/Cargo，因此未做原生手机打包验证
- 下一步最佳动作：用户在 Mac 上启动后端和 mobile-demo dev server，用手机同局域网访问 demo 或交给手机侧开发者迁移；真机输入 Mac IP `10.196.242.175` 和端口 `5177` 后验证麦克风、播放、文本边界和五个工具

## 状态约定

- `not_started`：尚未开始。
- `active`：当前唯一在制任务。
- `blocked`：缺少输入、环境、依赖或决策。
- `passing`：验证通过且 evidence 已记录。

## 日志

### 2026-05-17 - Harness 初始化

- 创建初始 harness scaffold。
- 写入全双工语音 demo 的项目目标、范围、验证阶梯、active plan 和功能清单。
- 验证：`./scripts/harness-check.sh` 通过，0 警告。
- 下一步：提交初始化检查点并进入 F002。

### 2026-05-17 - Demo 服务骨架与 mock 链路

- 创建 Node/TypeScript/Fastify 后端、OpenAI-compatible LLM 客户端、火山 ASR/TTS 客户端、浏览器 Web Audio VAD/WAV 采集页面、调试文本回合入口和 macOS TTS fallback。
- 从 DreamingRAG `.env` 复制本地 `.env`，不提交密钥。
- 发现真实模式仍缺 `VOLCENGINE_ASR_APP_KEY`；已有 `DEEPSEEK_API_KEY`，TTS 会尝试使用 `VOLCENGINE_API_KEY`。
- 发现 `VOLCENGINE_API_KEY` 调火山 TTS SSE 返回 `Invalid X-Api-Key`，因此补 macOS TTS fallback。
- 用户随后创建火山语音应用并在 `.env` 填入 `APP_ID`、`ACCESS_TOKEN`、`SECRET_KEY`；代码已自动映射旧版 app-token 鉴权。
- TTS 2.0 需要 `zh_female_xiaohe_uranus_bigtts` 这类 `uranus` 音色；原 `moon` 音色会触发资源不匹配。
- 验证：`npm test` 通过，5 files / 12 tests；`npm run build` 通过；`npm run smoke:mock` 通过；`npm run config:check` 通过；真实 `/api/text-turn` 走 DeepSeek LLM + 火山 TTS 返回 audio/mpeg。
- 已纠正 ASR 路线：不再使用 `volc.bigasr.auc_turbo`，改为用户已授权的豆包流式语音识别模型2.0，默认 resource `volc.seedasr.sauc.duration`。
- 后续决策：`/api/turn` 不再是主路线；主 demo 改接实时语音大模型。

### 2026-05-17 - 切换到火山实时语音大模型原生全双工

- 按用户要求测试原生全双工路线，确认 `wss://openspeech.bytedance.com/api/v3/realtime/dialogue` + `volc.speech.dialog` 可用。
- 新增后端 `/api/realtime` WebSocket 桥接：浏览器上行 24kHz mono int16 PCM，后端转火山 realtime；火山下行 ASR/LLM/TTS 事件和 PCM 音频，后端转给浏览器。
- 前端删除本地 VAD/分段/打断状态机，音量条仅作为麦克风采集观测。
- 新增 `scripts/realtime-smoke.mjs` 和 `scripts/realtime-bridge-smoke.mjs`。
- 验证：`npm run smoke:realtime` 返回 transcript/text/audioBytes；`npm run smoke:bridge` 经本地 `/api/realtime` 返回 transcript/text/audioBytes；`npm test`、`npm run build`、`npm run smoke:local`、`npm run config:check`、`./scripts/harness-check.sh` 均通过。

### 2026-05-17 - 修复 realtime 输出电噪声并删除旧级联路线

- 复现并抓取火山 realtime TTS 下行 bytes：首包按 float32 little-endian 解码为正常小幅音频，按 int16 解码会出现异常交替大值。
- 根因：浏览器把 `pcm_f32le` 下行误当 `pcm_s16le` 播放。
- 修复：浏览器下行播放改用 `Float32Array`；smoke 增加 `audioFormat=pcm_f32le` 和 audioStats 校验。
- 重构：删除 ASR -> LLM -> TTS 级联实现、旧 `/api/turn`、旧 `/api/text-turn`、旧 provider 和相关测试；保留唯一主路线 `/api/realtime`。
- 验证：`npm test` 通过；`npm run build` 通过；`npm run smoke:local` 通过；`npm run config:check` 通过；`npm run smoke:realtime` 返回 `audioFormat=pcm_f32le`、peak/rms 正常；`npm run smoke:bridge` 经本地 `/api/realtime` 返回 `audioFormat=pcm_f32le`、peak/rms 正常；`./scripts/harness-check.sh` 通过。

### 2026-05-17 - 后端 Planner 工具 demo 和调试面板

- 确认工具调用主路线：后端 Planner 读取火山 ASR transcript，决定是否调用工具、是否澄清、是否 no-op；语音主链路仍是火山原生 realtime。
- 实现规则版 Planner 和 mock 地图/导航工具：`map.open`、`map.set_origin`、`map.set_destination`、`navigation.start`。
- 工具调用创建 `tool_call_id`，记录 started/result/dropped/clarification 等结构化事件。
- 前端增加 Runtime prompts、Dialogue、Session flow、Tool registry、Protocol notes 面板。
- 当前 tool_started/tool_result 播报使用 `300 ChatTTSText`；`502 ChatRAGText` 保留为后续验证路线。
- 验证：`npm run typecheck`、`npm test`、`npm run build`、`npm run smoke:local`、`./scripts/harness-check.sh` 通过。

### 2026-05-18 - 结构化 session log

- 用户发现真实交互 bug 后需要保存复现证据，增加 `Save log`。
- 后端新增 `POST /api/session-logs`，把前端收集的 `dialogue + flow + runtime settings + tool registry + metadata` 写到 `logs/session/*.json`。
- 服务端生成文件名，不接受前端路径；`.gitignore` 排除 session JSON，仅保留 `logs/session/.gitkeep`。
- 自动测试覆盖保存、读取和清理测试日志。
- 验证：`npm run typecheck`、`npm test`、`npm run build`、`npm run smoke:local`、`./scripts/harness-check.sh` 通过。

### 2026-05-18/19 - 修复 Dialogue 漏记工具语音

- 发现工具调用时浏览器能听到 `ChatTTSText` 语音，但 `Dialogue` 面板不记录对应文本。
- 根因：后端把工具播报文本发给火山合成音频，但没有同步发给浏览器记录；这类文本不一定走火山 `llmText` 回传。
- 修复：`sendChatTtsText` 同步发送 `assistant_text`，前端对 `append` 文本新建 Assistant turn。
- 顺手修复后端普通回复累计文本跨轮串联风险：`ASRInfo` 新 turn 时重置累计文本。
- 验证：`npm run typecheck`、`npm test`、`npm run build`、`npm run smoke:local`、`./scripts/harness-check.sh` 通过。

### 2026-05-19 - 归档交接与项目命名

- 用户确认项目名 `DuplexKit`，远端仓库为 `https://github.com/ElysiaFollower/DuplexKit.git`。
- 页面标题、README 和 docs 更新为 DuplexKit；清理旧 handoff 中已经过期的音频修复描述。
- 补齐 F004/F005 功能清单，更新 runtime/API/overview 文档，明确调试日志不是产品级会话历史。
- 完成计划从 `plans/active` 移到 `plans/archive`。
- 下一会话优先动作：改名后跑 `./init.sh` 和验证阶梯；真实 bug 先保存 session log 再诊断。

### 2026-05-24 - 后端服务化实时音频与工具协议

- 把 `/api/realtime` 明确为外部 app 的主服务通道：binary 上行 `pcm_s16le`，binary 下行 `pcm_f32le`，JSON 下行状态/转写/工具请求。
- 新增结构化 `tool_request` / `tool_result` 协议，覆盖 `map.open`、`map.close`、`map.set_origin`、`map.set_destination`、`navigation.start`。
- `GET /api/tools` 现在返回工具 registry 和 realtime protocol 元数据，方便“金工小子” app 初始化时校验音频格式和工具 schema。
- 浏览器 demo 收到 `tool_request` 后会自动回传模拟 `tool_result`，真实 app 可替换为真实地图/导航执行。
- 工具结果回传超时后仍走后端 fallback demo 结果，避免链路挂死。
- 验证：`./scripts/harness-check.sh`、`npm run typecheck`、`npm test`、`npm run build`、`npm run smoke:local` 均通过。

### 2026-05-31 - F007 assistant response 驱动工具调用启动

- 发现火山 `ASRResponse` transcript 可能比语音模型内部理解差；后端工具触发不再应依赖 ASR transcript。
- 用户验证 `300 ChatTTSText` 注入内容可被后续语音模型记住；`502 ChatRAGText` 当前不作为 MVP 路线。
- 新设计：语音模型用固定自然语言句式声明工具调用；后端在 `ChatEnded` 后解析完整 assistant response；工具结果由后端组织并通过 `300 ChatTTSText` 注入。
- 约束：工具串行；pending 期间不允许新地图/导航工具；只允许控制工具“取消当前工具调用”；不符合固定句式不触发工具，也不用 ASR 兜底。
- Active plan：`plans/active/2026-05-31-assistant-driven-tools.md`。
- 已实现自动验证部分：`./scripts/harness-check.sh`、`npm run typecheck`、`npm test`、`npm run build`、`npm run smoke:local` 均通过；新增 `tests/assets` 音频 fixture 和 `npm run test:realtime-fixtures`，真实模型回归已覆盖 open-map、navigate-beijing-south、smalltalk-no-tool、cancel-no-running-tool。
- 已固化小程序对接协议：`GET /api/realtime` 长连接 WebSocket；`GET /api/tools` 返回 realtime protocol metadata；后端下发 `message_end` 作为文本/播放边界；对前端 app 暴露五个地图/导航工具，`control.kill` 为内部控制工具。
- 2026-06-07 协议固化验证：`npm test` 5 files / 25 tests passing；`npm run test:realtime-fixtures` 四条真实 fixture 通过；`npm run smoke:local` 通过。
- F007 已标记 passing 并归档：`plans/archive/2026-05-31-assistant-driven-tools.md`。浏览器 pending 中 kill 时序压测未纳入本任务完成定义，后续如需要单独开专项。

### 2026-06-07 - F008 移动端后端效果验证 demo 启动

- 用户希望在仓库子目录快速做一个手机可展示的 Tauri + React demo，用于和手机侧开发者对齐后端服务能力。
- 已确认当前形态是长期 WebSocket 会话中持续发送音频 chunk，不是录一段再发一段：`docs/overview.md`、`docs/architecture/runtime.md`、`docs/integration/frontend-protocol.md` 和 `src/protocol.ts` 均要求连接期间持续发送 24kHz mono `pcm_s16le` raw PCM。
- Active plan：`plans/active/2026-06-07-mobile-demo.md`。
- 目标范围：新增 `mobile-demo/`，首屏输入 Mac IP + port、连接、一个语音按钮、文本流、极简正方形工具区；五个工具由后端 `tool_request` 驱动并回传 `tool_result`。
- 非目标：不做真实地图/导航 SDK、不做生产级 app、不改后端协议、不要求本次自动安装到 USB 手机。

### 2026-06-07 - F008 移动端后端效果验证 demo 完成

- 新增 `mobile-demo/` Tauri + React 最小客户端。
- 首屏包含 Mac IP、port、连接按钮、一个语音按钮、文本区和正方形地图工具区。
- 连接逻辑直接使用 `ws://<mac-ip>:<port>/api/realtime`，避免 Tauri/WebView origin 下 `/api/health` 或 `/api/tools` HTTP CORS 预检阻塞；后端协议和工具名不变。
- 语音按钮开启/停止连续麦克风推流：Web Audio `getUserMedia` -> 24kHz mono `pcm_s16le` raw PCM chunk -> WebSocket binary frame。
- 下行音频按 24kHz mono `pcm_f32le` 播放；`asr_start` 时清空旧播放队列。
- 文本 UI 处理 `transcript`、`assistant_text`、`message_end`、`asr_end`、`llm_end`/`tts_end`。
- 工具 UI 处理 `map.open`、`map.close`、`map.set_origin`、`map.set_destination`、`navigation.start`，更新正方形可见状态、角点、导航高亮，并回传 `tool_result`。
- 验证：`cd mobile-demo && npm install` 成功，0 vulnerabilities；`npm run typecheck` 通过；`npm run build` 通过；`npx tauri info` 可识别 Tauri 配置但本机缺 Rust/Cargo；根仓库 `./scripts/harness-check.sh`、`npm test`、`npm run build` 通过；Playwright 首屏检查通过。
- 计划已归档：`plans/archive/2026-06-07-mobile-demo.md`。

### 2026-06-07 - F008 mobile debug follow-up

- 用户手机浏览器测试语音按钮时出现 `getUserMedia not found`；判断大概率是通过 `http://10.x.x.x:1420` 访问 mobile demo 时，移动浏览器因非 secure context 不暴露 `navigator.mediaDevices.getUserMedia`。
- 新增 `client_debug` 客户端 WebSocket 消息：后端只打印 `[client_debug] ...` 到控制台，不转发给火山 realtime，不触发工具。
- `mobile-demo` 新增 `npm run dev:debug` 和 `?debug=1`：显示手机端 debug banner/log panel，记录 secure context、mediaDevices、getUserMedia、WebSocket、麦克风和未捕获错误，并在 WebSocket 已连接时回传后端。
- 后续补强：`client_debug` 现在也会追加写入 `logs/client-debug/YYYY-MM-DD.jsonl`；当前已运行的旧后端进程需重启后才具备该落盘能力。
- 更新 `docs/integration/frontend-protocol.md` 和 `mobile-demo/README.md` 说明 debug 消息和麦克风 secure-context 限制。
- 验证：root `npm test` 5 files / 26 tests passing；root `npm run build` 通过；`./scripts/harness-check.sh` 通过；`cd mobile-demo && npm run typecheck` 通过；`cd mobile-demo && npm run build` 通过；Playwright 打开 `http://127.0.0.1:1420/?debug=1` 可见 debug banner/log panel。

### 2026-06-07 - F008 Android APK follow-up

- 将 `mobile-demo/` 从 WebView 开发预览推进到可安装 Android APK：安装 Rust/Android toolchain，初始化 Tauri Android 工程。
- 初始 Android manifest 增加 `RECORD_AUDIO`，保留 `INTERNET`；初始 debug/default manifest 允许 LAN `ws://10.x.x.x` cleartext 连接，后续已按金工小子仓库校准为 default/release cleartext=false、debug=true。
- 修复打包前质量问题：补 Tauri icon、移除未使用的 opener plugin、修复 WebSocket JSON 解析错误会导致崩溃的路径、用静音 gain node 避免 mic ScriptProcessor 自监听。
- 初始产物：`mobile-demo/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`，debug universal APK，418M，sha256 `63e6573190944e537506b4b814d2577e3778d1de9e1a668e4ff14ff6c37c1289`；当前产物见后续 jingongxiaozi calibration 记录。
- 初始 APK 权限审计：`aapt dump permissions` 确认 package `dev.duplexkit.mobile.demo` 包含 `android.permission.INTERNET` 和 `android.permission.RECORD_AUDIO`；当前权限已补 `MODIFY_AUDIO_SETTINGS`。
- 验证：`cd mobile-demo && npm run typecheck` 通过；`cd mobile-demo && npm run build` 通过；`cd mobile-demo/src-tauri && cargo check` 通过；`cd mobile-demo && npm run tauri -- android build --apk --debug -v` 通过；根 `./scripts/harness-check.sh`、`npm test`、`npm run build` 均通过。

### 2026-06-07 - F008 jingongxiaozi app calibration

- 按用户要求拉取 public 仓库 `https://github.com/zzw4257/jingongxiaozi.git` 到 `/tmp/jingongxiaozi` 并审阅源码；fetch 结果 success，无网络阻塞。
- 对方 app 当前技术栈：Tauri 2 + React 18 + Vite 6 + TypeScript 5.7 + Three.js；Android 工程已生成，主 Activity 横屏和 kiosk fullscreen；manifest 只有 `INTERNET`，debug build `usesCleartextTraffic=true`，default/release `false`。
- 对方 app 目前是 `BackendDirective` / `MapDirectRequest` 的后端指令模拟结构，未发现真实 `WebSocket`、`getUserMedia`、`AudioContext` 实时语音客户端；迁移重点应是把 DuplexKit realtime client 接到现有 directive/state model。
- 校准 `mobile-demo`：依赖版本降到 React 18 / Vite 6 / TypeScript 5.7，Tauri JS/CLI 对齐到 2.11.x；Android compile/target SDK 改 36；default cleartext 改 `false`，debug cleartext 保持 `true`；补 `MODIFY_AUDIO_SETTINGS`，因为 Tauri/Wry `RustWebChromeClient.onPermissionRequest` 会和 `RECORD_AUDIO` 一起请求它来授权 WebView audio capture。
- 重建 APK：`mobile-demo/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`，418M，sha256 `22c057118f2691824f1df3bbff6cf51878273e4f75acc3b49937b222f836853d`。
- APK 审计：`aapt dump permissions` 确认 `INTERNET`、`MODIFY_AUDIO_SETTINGS`、`RECORD_AUDIO`；`aapt dump badging` 确认 `compileSdkVersion=36`、`targetSdkVersion=36`、`minSdk=24`。
- 验证：`mobile-demo npm install` 0 vulnerabilities；`mobile-demo npm run typecheck` 通过；`mobile-demo npm run build` 通过；`mobile-demo/src-tauri cargo check` 通过；`mobile-demo npm run tauri -- android build --apk --debug -v` 成功；根 `./scripts/harness-check.sh`、`npm test`、`npm run build` 通过。

### 2026-06-09 - F009 金工小子 app 直接对接启动

- 用户决定不再以 `mobile-demo` 作为主要验证对象，改为把 public 金工小子 app 仓库作为 submodule 引入并直接适配 DuplexKit 后端。
- Active plan：`plans/active/2026-06-09-jingongxiaozi-full-stack.md`。
- 目标：`apps/jingongxiaozi` 子仓库本地 `full-stack` 分支接入 `/api/realtime`，完成语音上行、音频下行、文本展示、五个工具请求映射和 Android debug APK 构建。
- 非目标：不改 DuplexKit 后端主协议、不做真实地图服务、不做 release 签名包、不回滚已有 `mobile-demo` / debug logging 未提交改动。
- 下一步：添加 submodule、研究金工小子已有 `BackendDirective` / `MapDirectRequest` 接口和 DuplexKit 协议差异。

### 2026-06-09 - F009 金工小子 app 直接对接完成

- 新增 `.gitmodules` 和 `apps/jingongxiaozi` submodule；子仓库来自 `https://github.com/zzw4257/jingongxiaozi.git`，本地分支为 `full-stack`，baseline `df6d205`。
- 在金工小子 app 内新增 `src/duplexkit/` bridge：连接 `ws://<Mac IP>:<port>/api/realtime`，采集麦克风并持续发送 24kHz mono `pcm_s16le`，播放后端 24kHz mono `pcm_f32le` 下行音频。
- 将 `transcript`、`assistant_text`、`message_end`、`asr_start` 等事件映射到现有展示状态；将 `map.open`、`map.close`、`map.set_origin`、`map.set_destination`、`navigation.start` 映射到已有 `BackendDirective` / `MapDirectRequest`，并回传 `tool_result`。
- Android manifest 补 `RECORD_AUDIO` 和 `MODIFY_AUDIO_SETTINGS`；debug build 沿用 cleartext 以支持局域网 `ws://10.x`。
- 修复上游构建环境绑定：移除 `android.aapt2FromMavenOverride=/Users/zzw4257/.../aapt2`，改回 Android Gradle Plugin 自行解析 AAPT2。
- 困难审计写入 `docs/integration/jingongxiaozi-full-stack-audit.md`。
- 验证：根 `./scripts/harness-check.sh` 通过，0 warnings；根 `npm test` 5 files / 26 tests passing；根 `npm run build` 通过；`apps/jingongxiaozi npm install` 成功；`npm run build` 通过；`src-tauri cargo check` 通过；`npm run tauri -- android build --apk --debug -v` 成功；`npm run tauri -- android build --apk --debug --target aarch64` 成功。
- APK：`apps/jingongxiaozi/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`，126M，sha256 `0a474ea5f860728012e1e36efebe7942b0db2a6c0cc2d590a8b2539a20e5e53c`。
- APK 审计：package `cn.edu.zju.jingongxiaozi`，label `金工小子`，minSdk 24，targetSdk 36，compileSdk 36，native-code `arm64-v8a`；权限包含 `INTERNET`、`MODIFY_AUDIO_SETTINGS`、`RECORD_AUDIO`。
- F009 已标记 passing；真机安装、麦克风授权和同局域网端到端语音仍需用户手测。

### 2026-06-13 - F010 金工小子真机验收启动

- 用户已通过数据线连接手机并开启开发者模式，要求 agent 在用户离开期间完成可自动化的真机验收前置工作并记录过程。
- ADB 已识别设备：`5EF0218201019278 device`，型号 `HUAWEI BLA-AL00`，Android 10 / SDK 29，ABI `arm64-v8a,armeabi-v7a,armeabi`。
- 当前 Mac 局域网 IP：`10.162.230.154`。
- Active plan：`plans/active/2026-06-13-jingongxiaozi-device-acceptance.md`。
- 目标：安装 `apps/jingongxiaozi/.../app-universal-debug.apk`，授予麦克风权限，启动 DuplexKit 后端，留下用户回饭后可直接人工验收的状态。

### 2026-06-13 - F010 真机验收前置完成但安装受阻

- 用户补充说明：本次功能测试不需要依赖麦克风权限，主路径应使用已录制音频或 TTS 生成音频发送给后端。
- 已把金工小子适配改为支持内置测试音频：`open-map.wav`、`navigate-beijing-south.wav`、`smalltalk-no-tool.wav` 放入 `apps/jingongxiaozi/public/duplexkit-fixtures/`；后端调试面板新增三个“测试音频”按钮，读取 WAV data chunk 后按 100ms 发送 24kHz mono `pcm_s16le` binary frame。
- 已验证旧 APK 可安装和启动：包名 `cn.edu.zju.jingongxiaozi`，手机可进入金工小子界面；截图保存在 `logs/device-acceptance/2026-06-13-jingongxiaozi-screen.png`。
- 已验证网络前置条件：手机能 ping 通 Mac IP `10.162.230.154`；`adb reverse tcp:5177 tcp:5177` 已设置，方便 app 用 `127.0.0.1:5177` 访问 Mac 后端。
- 已完成新代码构建：`cd apps/jingongxiaozi && npm run build` 通过；`npm run tauri -- android build --apk --debug --target aarch64` 通过。
- 新 APK：`apps/jingongxiaozi/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`，大小 246M，sha256 `500e45e3f4f241f584f2cc0f36a0555ba102c26c82a037f0e231222f0896b329`。
- DuplexKit 后端已用前台 PTY 执行 `node dist/server.js` 验证可持续运行，PID `20165`，监听 `0.0.0.0:5177`；`curl http://127.0.0.1:5177/api/health` 返回 `status=ok` 且 realtime configured=true。后台 `nohup node dist/server.js` 在当前 agent 执行环境中出现无错误退出，用户验收时应在独立终端保持 `node dist/server.js` 或 `npm run dev` 运行。
- 阻塞点：重新安装新 APK 时 Huawei AppMarket 拦截未知来源安装，最终提示“需先登录才可以安装”。证据 XML/截图位于 `logs/device-acceptance/2026-06-13-install-window-5.xml`、`logs/device-acceptance/current-window.xml` 等。已取消卡住的 `adb install` 进程，手机回到 launcher。
- F010 标记为 `blocked`，因为新 APK 尚未安装到手机，不能声称真机端到端验收完成。用户回来后需要在手机上登录/解除 Huawei 安装保护，再重新执行安装并点击测试音频按钮验收。

### 2026-06-13 - F010 新 APK 已安装

- 用户登录 Huawei 安装器后，重新执行 `adb install --no-streaming -r -g -t apps/jingongxiaozi/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk` 成功，返回 `Success`。
- 包信息确认：`cn.edu.zju.jingongxiaozi`，`lastUpdateTime=2026-06-13 10:23:23`，`INTERNET`、`MODIFY_AUDIO_SETTINGS`、`RECORD_AUDIO` 均为 granted。
- `adb reverse tcp:5177 tcp:5177` 已设置；安装后前台 activity 为 `cn.edu.zju.jingongxiaozi/.MainActivity`。
- 截图证据：`logs/device-acceptance/2026-06-13-new-apk-installed.png`。
- F010 从 `blocked` 改回 `active`；下一步是启动 DuplexKit 后端，在 app 的后端调试面板连接 `127.0.0.1:5177`，点击预录测试音频按钮完成端到端验收。

### 2026-06-13 - F010 真机预录音频端到端验收完成

- 启动 `node dist/server.js`，通过 `adb reverse tcp:5177 tcp:5177` 让手机 WebView 连接 `ws://127.0.0.1:5177/api/realtime`。
- 通过 WebView DevTools 自动操作金工小子 app：切到桌面布局，打开后端调试面板，连接 DuplexKit，点击预录测试音频按钮。
- 第一轮 `open-map` 暴露适配 bug：`map.open` 工具执行成功后，后续 `assistant_text` 会映射成 `chat` directive，把地图页覆盖回常态对话。
- 已修复：`apps/jingongxiaozi/src/duplexkit/useDuplexKitRealtime.ts` 在工具请求后 12 秒内保留工具 UI，assistant 播报文本只写入调试 transcript，不覆盖地图/导航/关闭地图状态；普通闲聊仍进入常态对话。
- 修复后重新构建并安装 APK：最终 APK sha256 `a717e56d7d013d9d66eccd62b03e8db97b5cf7dff8cca9b9f7f9ec18455f12be`，大小 246M；手机包 `lastUpdateTime=2026-06-13 10:33:56`。
- 最终真机验收：
  - `测试音频：打开地图` -> transcript “打开地图。”，后端工具声明 `map.open`，app 回传 tool_result，最终保持 `地图导航`，地图 rail active。
  - `测试音频：开始导航` -> transcript “导航到北京南站。”，后端工具声明 `navigation.start`，app 回传 tool_result，最终保持 `地图导航` 并显示路线步骤。
  - `测试音频：普通对话` -> transcript “你好，今天我们随便聊两句。”，不触发工具，最终进入 `常态对话` 并显示“好呀，想聊点什么？”。

### 2026-06-13 - F010 正式 UI 修正版安装确认

- 用户反馈正式 app 找不到后端连接入口、无法明确停止聆听，且测试音频按钮不应出现在正式 UI。
- 已修正正式 UI：新增独立浮动控制条，显示 `连接后端 / 开始聆听 / 停止聆听 / 断开`；删除 app 内测试音频按钮；后端改用命令行 debug fixture 注入测试音频。
- 重新安装 APK 成功：`adb install --no-streaming -r -g -t apps/jingongxiaozi/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk` -> `Success`。
- 包确认：`cn.edu.zju.jingongxiaozi`，`lastUpdateTime=2026-06-13 11:40:08`，`INTERNET`、`MODIFY_AUDIO_SETTINGS`、`RECORD_AUDIO` 均 granted。
- WebView DOM 确认：`.duplex-control-dock` 文案为 `未连接 / 连接后端`，按钮包含 `连接后端`、`聆听展示`、`地图`、`对话`、`专家`，不包含 `测试音频`。
- F010 状态改为 `active`：新版 UI 已真机安装并确认可见；命令行 debug fixture 注入仍需在该版上继续复验后才能标记 passing。
- 证据：`logs/client-debug/2026-06-13.jsonl` 有 socket_open 和三条 fixture_audio_start/end；截图 `logs/device-acceptance/2026-06-13-open-map-fixture-result.png`、`logs/device-acceptance/2026-06-13-smalltalk-fixture-result.png`。
- 观察到一次火山 `DialogAudioIdleTimeoutError`，发生在导航测试后的空闲期；重连后普通对话成功，判断为空闲会话上游关闭，不影响本次工具链路验收。
- F010 标记为 `passing`。麦克风仍是可选人工路径，不作为本次验收前置。

### 2026-06-13 - F010 聆听开关 UI 可见性修复

- 用户反馈 app 里只看到“正在聆听”，没有看到 `连接 DuplexKit` 按钮，也无法判断是否正在开麦。
- 根因：原连接按钮藏在后端调试面板；顶部“实时语音”按钮在未连接时禁用；header 裸显示 realtime `listening`，容易被误解为麦克风持续开启。
- 已改为顶部主控状态机：未连接显示 `连接后端`；连接成功显示 `已连接，未开麦`、按钮 `开始聆听` 和独立 `断开`；开麦后显示 `停止聆听`；测试音频期间显示 `发送测试音频：...`。
- 验证：`cd apps/jingongxiaozi && npm run build` 通过；Android debug APK 构建通过；`adb install --no-streaming ...` 成功，包 `lastUpdateTime=2026-06-13 11:12:24`；WebView DevTools 验证点击 `连接后端` 后变为 `已连接，未开麦 / 开始聆听 / 断开`，点击 `断开` 后回到 `未连接`。

### 2026-06-13 - F010 正式 UI 与后端测试后门纠偏

- 用户指出：测试音频不应作为 app 正式功能；它应该是命令行/后端后门，用于模拟语音输入和验证界面切换。
- 已从金工小子 app 删除测试音频按钮和 `public/duplexkit-fixtures`，正式 app 只保留后端连接、麦克风开始/停止、断开、文本/音频/工具 UI。
- 已新增后端测试后门：
  - `GET /api/debug/realtime-sessions` 查看当前 app realtime 会话。
  - `POST /api/debug/realtime-fixture` 向当前 app realtime 会话注入 `tests/assets/*.wav` 的 PCM，按 100ms 节奏模拟真实麦克风输入。
  - `npm run debug:realtime-fixture -- open-map` 作为命令行入口。
- 已修正 app 连接入口：独立浮动控制条不依赖 header，地图/kiosk 模式也可见；状态为 `未连接 / 已连接，未开麦 / 开麦中`，按钮为 `连接后端 / 开始聆听 / 停止聆听 / 断开`。
- 验证：`npm run build` 通过；`npm test` 5 files / 26 tests passing；`cd apps/jingongxiaozi && npm run build` 通过；Android debug APK 构建通过。
- 新 APK：`apps/jingongxiaozi/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`，sha256 `d9f8359439aebd23808f549d301430b7ddf91bb845a7a5dc977ee9ef5a84fccf`。
- 后端 debug endpoint 验证：无 app session 时 `npm run debug:realtime-fixture -- open-map` 返回 `{"ok":false,"error":"No active realtime app session"}`，HTTP 409。
- 阻塞：安装新 APK 时 `adb` 报 `no devices/emulators found`；当前 `adb devices -l` 为空。最新版 APK 尚未安装和真机复验，F010 改为 `blocked` 等待手机重新连接。

### 2026-06-13 - F010 正式 UI 修正版真机 debug fixture 通过

- 重新安装当前 APK 成功：`adb install --no-streaming -r -g -t apps/jingongxiaozi/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk` -> `Success`。
- 包确认：`cn.edu.zju.jingongxiaozi`，`lastUpdateTime=2026-06-13 11:40:08`，`INTERNET`、`MODIFY_AUDIO_SETTINGS`、`RECORD_AUDIO` 均 granted。
- WebView DOM 确认正式 UI：`.duplex-control-dock` 为 `未连接 / 连接后端`，按钮包含 `连接后端`、`聆听展示`、`地图`、`对话`、`专家`，不包含 `测试音频`。
- 通过 WebView DevTools 自动点击 app 浮动控制条连接后端，并用后端命令行 debug fixture 注入预录音频到当前 app realtime session：
  - `open-map` -> HTTP 200，app 进入地图页，显示地图楼层/图层控件。
  - `navigate-beijing-south` -> HTTP 200，app 保持地图导航页，显示当前位置、终点和路线步骤。
  - `smalltalk-no-tool` -> HTTP 200，app 进入常态对话，显示后端实时回复。
  - `cancel-no-running-tool` -> HTTP 200，app 进入常态对话，显示“当前没有正在执行的工具调用。”。
- 截图证据：`logs/device-acceptance/2026-06-13-reinstalled-floating-control.png`、`logs/device-acceptance/2026-06-13-debug-fixture-final.png`。
- 观察：每条 fixture 跑完后控制条显示 `连接失败 / 重新连接`，因为没有持续麦克风输入，上游 realtime session 在静默后关闭；测试脚本逐条重连后继续注入。真实麦克风测试时应在连接后立刻点 `开始聆听` 并说话。
- F010 保持 `active`：内部录音/fixture 测试已通过，下一步等待用户做真实手机声音采集测试。

### 2026-06-13 - F010 地图保持和 Android legacy 地图外层修复

- 用户真实语音测试确认：后端核心能力基本对齐，全双工语音输入和工具调用可用；剩余问题主要在 mobile app 前端体验。
- 排查结论：
  - 地图 3D 渲染失败不是后端问题。真机 WebView `fetch('/map-models/jingong.glb')` 和 `fetch('/map-models/jingong-fallback.glb')` 都返回 `200 text/html`，内容是 Tauri HTML shell，不是 GLB 文件；PNG/JS 资源正常。
  - 语音通知关地图来自接入层把 `asr_start`、`transcript`、`asr_end`、`assistant_text` 映射为全局 `listening/processing/chat` directive，触发金工小子现有 app state 切页。
- 用户确认方案：不插手大佬的 3D 地图核心代码，只在外层适配。已实施：
  - `App.tsx`：当当前页面是 `map` 时，`wake/listening/processing/chat/expert` 这类普通语音状态不再切走地图；只有地图工具指令或显式关闭地图改变页面。
  - `MapShell.tsx`：Android + Tauri 环境默认进入已有 legacy 地图，保留手动切回 `3D 精确模型` 的入口。
- 验证：
  - `cd apps/jingongxiaozi && npm run build` -> pass。
  - Android build 首次被系统 `signal 9` 杀掉；停止 Gradle daemon 并限制 `GRADLE_OPTS='-Dorg.gradle.jvmargs=-Xmx1024m -Dorg.gradle.workers.max=1'` 后 `npm run tauri -- android build --apk --debug --target aarch64` -> pass。
  - 新 APK：`apps/jingongxiaozi/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`，sha256 `aed5bd4f8b5daf222ce86fb73adb56a6d567b1842b58e71de41780f98deb929f`。
  - 真机安装成功，包 `cn.edu.zju.jingongxiaozi` `lastUpdateTime=2026-06-13 12:11:36`。
  - WebView DevTools 验证：直接打开 map 后 `isLegacy=true`、`hasLegacyMap=true`、`has3dMap=false`；发送 chat directive 后仍保持地图；`open-map` fixture 后保持 legacy 地图；地图打开后再发 `smalltalk-no-tool` fixture 仍保持 legacy 地图，不弹回对话页。
  - 截图：`logs/device-acceptance/2026-06-13-map-shell-preserve-after-smalltalk.png`。
- F010 保持 `active`：自动化验收通过；等待用户对新 APK 做真实声音采集体验确认。

### 2026-06-13 - F010 后端 realtime trace 日志补强

- 用户真实语音测试后发现：现有后端日志只能看到 HTTP/WebSocket 和 `client_debug`，无法完整复盘 ASR、assistant response、Planner 决策、工具参数、工具结果和播放边界。
- 已新增 `logs/realtime-trace/YYYY-MM-DD.jsonl`：按 `sessionId` 记录 `asr.transcript`、`assistant.delta`、`planner.decision`、`tool_request`、客户端 `tool_result`、`chat_tts_text`、TTS/audio 边界、上游错误和 bridge 生命周期。
- trace 不记录原始音频内容，只记录音频块大小和事件边界，避免日志体积和敏感内容失控。
- 更新 `docs/integration/frontend-protocol.md` 和 `harness/observability.md`，说明 trace 位置和排查起终点/语音打断问题的读取顺序。
- 验证：`npm test` -> 5 files / 27 tests passed；`npm run build` -> pass；`./scripts/harness-check.sh` -> pass。

### 2026-06-13 - F010 修复工具声明带补充句时不触发

- 用户复测发现“打开地图”后 APP 未切到地图。新的 realtime trace 证明：ASR 正确识别为“现在请你打开地图”，模型回复为“我来调用地图工具：打开地图。地图打开后...”，但 Planner 因为要求整轮回复完全等于固定句式而判成 `no_action`，因此没有下发 `tool_request`。
- 已修复 `parseAssistantToolDeclaration`：允许规范工具声明句出现在 assistant response 开头并带后续补充句；地点参数只截取声明句内部，避免“设置终点为西门。你稍等一下”把补充句吃进参数。
- 回归测试覆盖本次真实失败形态和参数截断。
- 验证：`npm test -- tests/toolPlanner.test.ts` -> 12 tests passed；`npm run build` -> pass；`npm test` -> 5 files / 29 tests passed；`./scripts/harness-check.sh` -> pass。

### 2026-06-13 - F010 收紧工具调用系统提示词

- 用户指出：既然后端 Planner 是规则解析，就必须在提示词里把工具调用输出契约写清楚，不能期待语音模型自然稳定命中。
- 已收紧 `DEFAULT_SYSTEM_ROLE`：工具调用模式整轮回复只能包含一个固定声明句本身；句式前后不能添加解释、道歉、寒暄、等待提示或补充说明；声明后立即停止本轮回复等待后端执行。
- 删除旧提示词里“工具结果出来前可以简短闲聊”的模糊许可。
- 回归测试锁住提示词契约，防止后续又引入“可以补充说明”的冲突规则。
- 验证：`npm test -- tests/toolPlanner.test.ts` -> 13 tests passed；`npm run build` -> pass；`npm test` -> 5 files / 30 tests passed；`./scripts/harness-check.sh` -> pass。

### 2026-06-13 - F010 真实对话日志复盘后的工具和地点解析修复

- 用户完成真实语音测试后，要求直接读取 realtime trace 复盘问题。
- 最新真实 session `b8f5bede-165d-49c0-afc4-a432ada58ab8` 证明：
  - `208多媒体教室` 已被后端 Planner 正确解析成 `map.set_origin { place: "208多媒体教室" }`，但金工小子 app 回传 `起点已设置为110 教室`。根因是 `roomResolver` 对 `110 教室` 的泛化字段 `教室` 和 `208 多媒体教室` 的具体字段打分并列，前者因数据顺序先出现而胜出。
  - 模型把固定工具声明放在普通句后面时，旧后端 Planner 不触发；例如“有这个可能...。我来调用地图工具：设置起点为208多媒体教室。”
  - 用户要求“设置终点并启动导航”时，模型可能一轮输出设置终点和导航两条声明；后端现优先选择 `navigation.start`，因为该工具可以携带目的地并一次完成用户意图。
  - 模型曾在无真实 `tool_request/tool_result` 的情况下口头声称“工具结果返回”。提示词已补充“不要声称工具结果已经返回；只有听到后端注入的工具结果才能告知外部动作结果”。
- 已修复：
  - `parseAssistantToolDeclaration` 允许固定声明出现在句子边界后，跳过被引号包住的历史命令复述；多声明时优先导航声明。
  - `apps/jingongxiaozi/src/duplexkit/roomResolver.ts` 提高“房号 + 房间名”和房号前缀匹配分，避免 `208多媒体教室` 被通用“教室”错配到 `110`。
  - 新增 `tests/jingongRoomResolver.test.ts`，锁定 `208多媒体教室 -> 208` 和 `114教室 -> 114`。
- 验证：
  - `npm test -- tests/toolPlanner.test.ts tests/jingongRoomResolver.test.ts` -> 2 files / 18 tests passed。
  - `npm test` -> 6 files / 35 tests passed。
  - `npm run build` -> pass。
  - `cd apps/jingongxiaozi && npm run build` -> pass。
  - `./scripts/harness-check.sh` -> pass。
  - Android APK 构建成功，路径 `apps/jingongxiaozi/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`，大小 246M，sha256 `f14798ebfb0ce6f15b25f6a583ee5e15e096fbcc57133dbc0bf5e7058a772c80`。
  - 真机安装成功，包 `cn.edu.zju.jingongxiaozi` `lastUpdateTime=2026-06-13 16:48:28`，`INTERNET`、`MODIFY_AUDIO_SETTINGS`、`RECORD_AUDIO` 均 granted。
  - 新 APK + 后端命令行 fixture 复验：
    - session `da3c7f48-7690-46a0-85b2-8c2a10f73f27`：`open-map` -> ASR “打开地图。”，Planner `map.open`，app 回传 `tool_result success 地图已打开`。
    - session `218cbf1e-1316-49cf-ab81-7e89e4ea4ff6`：`navigate-beijing-south` -> ASR “导航到北京南站。”，Planner `navigation.start { place: "北京南站" }`，app 回传 `tool_result success 导航已启动...`。
  - 截图证据：`logs/device-acceptance/2026-06-13-after-connect-new-apk.png`、`logs/device-acceptance/2026-06-13-after-nav-fixture-new-apk.png`。
- 仍需注意：`北京南站` 这类非金工小子室内地点目前会走 app 的既有 fallback 目的地，trace 中表现为 `108-2F04 钳工`；这不是本次 208/114 修复范围，后续若要支持外部地点需要单独定义产品行为。

### 2026-06-13 - F010 工具结果注入保留 ChatTTSText 但抑制前端播放

- 用户明确纠偏：不要把“工具结果不打断播放”理解成切换到 `ChatRAGText` 或静默丢弃上下文；应保留已验证的 `ChatTTSText` 后端注入路径，只是不把这段额外生成的文本/音频转发给前端播放。
- 已修复：
  - `sendChatTtsText` 增加 `forwardToClient` 选项；`tool_result` 调用使用 `forwardToClient: false`。
  - 后端仍发送 `300 ChatTTSText` 给上游模型，让模型知道地图/导航动作结果。
  - 后端向前端保留结构化 `tool` result，但不发送这段工具结果的 `assistant_text`，并在上游真正进入 `tts_type=chat_tts_text` 时才抑制音频块，避免误截断上一句正常回复尾音。
  - Planner 提示词改成“我来调用{地图/导航/控制}工具”保留字扫描契约；Parser 允许保留字出现在整句任意非引号位置。
- 决策约束已写入 `harness/decisions.md`：关键协议路径未经验证和用户确认不得从 `ChatTTSText` 切到 `ChatRAGText`。
- 验证：
  - `npm test -- tests/toolPlanner.test.ts tests/server.test.ts` -> 2 files / 25 tests passed。
  - `npm test` -> 6 files / 36 tests passed。
  - `npm run build` -> pass。
  - `./scripts/harness-check.sh` -> pass。
  - 真机 app 已通过 WebView DevTools 连接新后端，session `9b2dc984-7db5-4050-9b3e-6e07d553d832`；`npm run debug:realtime-fixture -- open-map` -> HTTP 200，48130 bytes。
  - trace 证明链路为 `planner.decision map.open -> tool.started -> client tool_result 地图已打开 -> server_to_upstream chat_tts_text forwardToClient=false -> chat_tts_client_output_suppressed_start -> audio.output_chunk_suppressed -> chat_tts_client_output_suppressed_end`。
  - 断言 `suppressed_before_suppressed_start=false`，即没有在工具结果注入 TTS 开始前抑制正常音频块。
