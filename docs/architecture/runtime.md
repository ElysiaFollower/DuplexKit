<!--
职责：记录长期稳定的运行时架构事实。
边界：不要记录临时任务状态、密钥或一次性调试日志。
-->

# 运行时架构

唯一语音主路线：

`Browser Web Audio -> /api/realtime -> Volcengine realtime dialogue -> Browser Web Audio`

- 浏览器：持续采集麦克风，显示音量条，上行 24kHz mono `pcm_s16le`，播放下行 24kHz mono `pcm_f32le`。
- 后端：暴露静态页面、`GET /api/health`、`GET /api/realtime` WebSocket、`POST /api/session-logs`。
- 模型：火山实时语音大模型 `volc.speech.dialog`。

本项目不再保留 ASR -> LLM -> TTS 级联实现。全双工、用户开口检测、端点检测、打断和回复生成均以实时语音大模型为准。

## 工具调用原型

工具调用不是语音级联路线。当前实现是在原生 realtime 旁边增加后端 Planner：

```text
ASREnded transcript
-> 规则版后端 Planner
-> mock Tool Executor
-> 300 ChatTTSText 播放 tool_started/tool_result
-> 浏览器同步记录 assistant_text 到 Dialogue
```

当前 Planner 是规则版 demo，用于验证生命周期和可观测性；ADR 中保留了未来替换为 LLM Planner 的方向。

## 可观测性

- `Dialogue`：干净对话列表，包含用户 transcript、模型原生文本，以及后端通过 `ChatTTSText` 注入的工具播报文本。
- `Session flow`：开发调试流水，包含 ASR、planner、tool、Volc raw event、保存日志事件。
- `POST /api/session-logs`：保存前端收集的 `dialogue + flow + runtime settings + tool registry + metadata` 到 `logs/session/*.json`。这是调试持久化，不是产品级用户会话历史。
