<!--
职责：记录跨会话进度、状态变化、阻塞和验证摘要，让新会话能快速恢复。
边界：不要存放聊天记录、原始日志、密钥，或更适合由代码、测试、ADR、任务计划表达的内容。
-->

# 进度日志

## 当前状态

- 当前功能项：无 active；F003 因缺火山 ASR app key blocked
- 当前任务计划：`plans/active/2026-05-17-duplex-demo.md`
- 上次验证：`npm test`、`npm run build`、`npm run smoke:mock`、`npm run config:check`、真实 DeepSeek LLM + 火山 TTS 均通过
- 下一步最佳动作：提交 APP_ID/ACCESS_TOKEN 适配与 TTS 2.0 收口；若要纯后端 ASR，开通与 `volc.bigasr.auc_turbo` 匹配的极速/flash 资源，或实现录音文件识别2.0异步 submit/query。

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

- 创建 Node/TypeScript/Fastify 后端、OpenAI-compatible LLM 客户端、火山 ASR/TTS 客户端、浏览器 Web Audio VAD/WAV 采集页面、浏览器 ASR 降级、文本回合降级入口和 macOS TTS fallback。
- 从 DreamingRAG `.env` 复制本地 `.env`，不提交密钥。
- 发现真实模式仍缺 `VOLCENGINE_ASR_APP_KEY`；已有 `DEEPSEEK_API_KEY`，TTS 会尝试使用 `VOLCENGINE_API_KEY`。
- 发现 `VOLCENGINE_API_KEY` 调火山 TTS SSE 返回 `Invalid X-Api-Key`，因此补 macOS TTS fallback。
- 用户随后创建火山语音应用并在 `.env` 填入 `APP_ID`、`ACCESS_TOKEN`、`SECRET_KEY`；代码已自动映射旧版 app-token 鉴权。
- TTS 2.0 需要 `zh_female_xiaohe_uranus_bigtts` 这类 `uranus` 音色；原 `moon` 音色会触发资源不匹配。
- 验证：`npm test` 通过，5 files / 12 tests；`npm run build` 通过；`npm run smoke:mock` 通过；`npm run config:check` 通过；真实 `/api/text-turn` 走 DeepSeek LLM + 火山 TTS 返回 audio/mpeg。
- 纯后端 ASR 仍 blocked：`/api/turn` 返回 ASR 403 code 45000030，`volc.bigasr.auc_turbo` 未授权。当前浏览器 demo 默认 `PREFER_BROWSER_ASR=1`，用浏览器 ASR + 后端 LLM/TTS 跑效果全双工。
