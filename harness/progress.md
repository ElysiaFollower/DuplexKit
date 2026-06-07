<!--
职责：记录跨会话进度、状态变化、阻塞和验证摘要，让新会话能快速恢复。
边界：不要存放聊天记录、原始日志、密钥，或更适合由代码、测试、ADR、任务计划表达的内容。
-->

# 进度日志

## 当前状态

- 当前功能项：F001-F007 均 passing；当前无 active 功能项
- 当前任务计划：无 active plan；F007 已归档到 `plans/archive/2026-05-31-assistant-driven-tools.md`
- 上次验证：2026-06-07 `./init.sh`、`./scripts/harness-check.sh`、`npm run typecheck`、`npm test`、`npm run build`、`npm run smoke:local`、`npm run test:realtime-fixtures` 均通过；用户验证 `300 ChatTTSText` 可进入后续语音模型上下文，`502 ChatRAGText` 当前无效
- 下一步最佳动作：给小程序开发者按 `docs/integration/frontend-protocol.md` 联调 `/api/realtime`、`/api/tools`、五个 app 工具和 `message_end` 文本边界；如要压测 pending 中 kill 时序，另开新任务

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
