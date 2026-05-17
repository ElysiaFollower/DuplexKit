<!--
职责：记录跨会话进度、状态变化、阻塞和验证摘要，让新会话能快速恢复。
边界：不要存放聊天记录、原始日志、密钥，或更适合由代码、测试、ADR、任务计划表达的内容。
-->

# 进度日志

## 当前状态

- 当前功能项：无 active；F002/F003 均 passing
- 当前任务计划：`plans/active/2026-05-17-duplex-demo.md`
- 上次验证：`npm test`、`npm run build`、`npm run smoke:local`、`npm run config:check`、`npm run smoke:realtime`、`npm run smoke:bridge` 均通过
- 下一步最佳动作：用户在浏览器授权麦克风后，人工测试真实说话、插话、打断体验。

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
