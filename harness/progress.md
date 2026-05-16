<!--
职责：记录跨会话进度、状态变化、阻塞和验证摘要，让新会话能快速恢复。
边界：不要存放聊天记录、原始日志、密钥，或更适合由代码、测试、ADR、任务计划表达的内容。
-->

# 进度日志

## 当前状态

- 当前功能项：无 active；F003 因缺火山 ASR app key blocked
- 当前任务计划：`plans/active/2026-05-17-duplex-demo.md`
- 上次验证：`npm test`、`npm run build`、`npm run smoke:mock`、Browser 页面加载、真实 LLM + macOS TTS fallback 均通过
- 下一步最佳动作：提交 fallback 收口；补齐火山 ASR/TTS speech key 后做 F003 纯火山语音链路验证。在缺 key 时可用浏览器 ASR + macOS TTS fallback 体验效果。

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
- 验证：`npm test` 通过，5 files / 11 tests；`npm run build` 通过；`npm run smoke:mock` 通过；内置浏览器打开页面显示 ready，文本入口提交后显示 speaking 并播放 mock audio；真实 `/api/text-turn` 走 DeepSeek LLM + macOS TTS fallback 返回 audio/wav。
