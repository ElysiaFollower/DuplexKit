<!--
职责：记录长期稳定的运行时架构事实。
边界：不要记录临时任务状态、密钥或一次性调试日志。
-->

# 运行时架构

唯一语音主路线：

`App realtime audio -> /api/realtime -> Volcengine realtime dialogue -> App playback audio`

- 应用端：持续采集麦克风，上行 24kHz mono `pcm_s16le`，播放下行 24kHz mono `pcm_f32le`。
- 后端：暴露静态页面、`GET /api/health`、`GET /api/realtime` WebSocket、`GET /api/tools`、`POST /api/session-logs`。
- 模型：火山实时语音大模型 `volc.speech.dialog`。

本项目不再保留 ASR -> LLM -> TTS 级联实现。全双工、用户开口检测、端点检测、打断和回复生成均以实时语音大模型为准。

## 后端服务协议

`GET /api/realtime` 是外部 app 接入的主通道：

- app -> backend binary：24kHz mono `pcm_s16le`，无 WAV header。
- backend -> app binary：24kHz mono `pcm_f32le`，无 WAV header，可直接排队播放。
- backend -> app JSON：`status`、`asr_start`、`transcript`、`asr_end`、`assistant_text`、`tts_start`、`tts_end`、`tool_request`、`tool`、`raw_event`、`error`。
- app -> backend JSON：`tool_result`、`stop`。

`GET /api/tools` 返回工具 registry 和 realtime protocol 元数据，供外部 app 初始化时校验音频格式和工具 schema。

## 工具调用

工具调用不是语音级联路线。当前实现是在原生 realtime 旁边增加后端 Planner：

```text
ASREnded transcript
-> 规则版后端 Planner
-> tool_request 发给应用端执行真实地图/导航动作
-> 应用端回传 tool_result；若超时未回传，后端 fallback 执行 demo 结果
-> 300 ChatTTSText 播放 tool_started/tool_result
-> 浏览器同步记录 assistant_text 到 Dialogue
```

当前 Planner 是规则版，用于稳定输出地图/导航动作；ADR 中保留了未来替换为 LLM Planner 的方向。

当前支持工具：

- `map.open`
- `map.close`
- `map.set_origin`
- `map.set_destination`
- `navigation.start`

`tool_request` payload：

```json
{
  "type": "tool_request",
  "request": {
    "toolCallId": "uuid",
    "turnId": "question_id",
    "tool": "navigation.start",
    "args": { "place": "北京南站" },
    "spoken": "我来导航到北京南站。",
    "prompt": "internal debug prompt"
  }
}
```

应用端完成真实动作后回传：

```json
{
  "type": "tool_result",
  "toolCallId": "uuid",
  "tool": "navigation.start",
  "status": "success",
  "summary": "导航已启动，目的地是北京南站",
  "visibleResult": "金工小子地图已显示路线",
  "debugNote": "optional"
}
```

## 可观测性

- `Dialogue`：干净对话列表，包含用户 transcript、模型原生文本，以及后端通过 `ChatTTSText` 注入的工具播报文本。
- `Session flow`：开发调试流水，包含 ASR、planner、tool、Volc raw event、保存日志事件。
- `POST /api/session-logs`：保存前端收集的 `dialogue + flow + runtime settings + tool registry + metadata` 到 `logs/session/*.json`。这是调试持久化，不是产品级用户会话历史。
