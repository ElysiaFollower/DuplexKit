# Frontend Integration Protocol

本文档面向小程序或其他前端 app。后端实时语音主服务是长期 WebSocket，不是普通 HTTP 请求。

## Endpoints

- `GET /api/health`：检查服务和火山 realtime 配置。
- `GET /api/tools`：获取协议元数据和五个 app 工具定义。
- `GET /api/realtime`：WebSocket 主通道。
- `POST /api/session-logs`：调试时保存前端会话日志；生产前端可以不接。

## Realtime WebSocket

连接：`ws://host/api/realtime`

前端上行音频：

- WebSocket binary frame
- 24kHz mono `pcm_s16le`
- raw PCM，无 WAV header
- 会话打开期间持续发送 chunk；当前 demo 使用约 100ms chunk

后端下行音频：

- WebSocket binary frame
- 24kHz mono `pcm_f32le`
- raw PCM，无 WAV header
- 前端按到达顺序播放；收到 `asr_start` 时应清掉尚未播放的旧回复队列

前端上行 JSON：

```json
{ "type": "stop" }
```

调试模式下，前端可以回传本地环境或错误。后端只记录日志，不转发给实时模型：

```json
{
  "type": "client_debug",
  "level": "error",
  "event": "microphone_api_missing",
  "message": "getUserMedia not found",
  "data": {
    "secureContext": false,
    "hasGetUserMedia": false
  }
}
```

后端会把这类消息打印到启动 `npm run dev` 的终端，并追加写入 `logs/client-debug/YYYY-MM-DD.jsonl`。该目录中的 `.jsonl` 文件是本地调试工件，不应提交。

后端还会自动追加实时链路 trace 到 `logs/realtime-trace/YYYY-MM-DD.jsonl`。每行是一个 JSON 事件，包含 `sessionId`、`direction`、`event` 和可审计 payload。trace 记录后端能看到的关键边界：上游 ASR 文本、assistant 文本增量、`message_end`、Planner 决策、`tool_request`、应用端 `tool_result`、后端注入的 `ChatTTSText`、TTS 播放边界和错误。trace 不记录原始音频内容，只记录必要的音频块大小或边界事件。

排查真机问题时，先用 `sessionId` 过滤最新 trace。起终点错误通常看 `asr.transcript`、`planner.decision`、`tool_request` 和 `tool_result`；语音被打断则看 `assistant.delta`、`tts_start/tts_end`、`chat_tts_text` 的时间顺序。

```json
{
  "type": "tool_result",
  "toolCallId": "uuid-from-tool-request",
  "tool": "navigation.start",
  "status": "success",
  "summary": "导航已启动，目的地是北京南站",
  "visibleResult": "地图已显示路线",
  "debugNote": "optional"
}
```

`tool_result` 必填：`toolCallId`、`summary`。`tool`、`status`、`visibleResult`、`debugNote` 可选。

## Text And End Boundaries

后端会下发用户转写和 assistant 文本：

```json
{
  "type": "transcript",
  "text": "打开地图。",
  "questionId": "..."
}
```

```json
{
  "type": "assistant_text",
  "text": "我来调用地图工具：打开地图。"
}
```

一句话或一个播放片段结束时，后端会额外下发统一边界事件：

```json
{
  "type": "message_end",
  "role": "user",
  "reason": "asr_end",
  "questionId": "..."
}
```

```json
{
  "type": "message_end",
  "role": "assistant",
  "reason": "llm_end"
}
```

前端显示文字时，以 `message_end` 作为换行/收束当前段落的稳定信号。兼容原因，后端仍会同时发送旧事件：`asr_end`、`llm_end`、`tts_sentence_end`、`tts_end`。

## Tool Requests

当前对前端暴露五个最小工具：

- `map.open`
- `map.close`
- `map.set_origin`
- `map.set_destination`
- `navigation.start`

后端请求前端执行工具：

```json
{
  "type": "tool_request",
  "request": {
    "toolCallId": "uuid",
    "turnId": "question-id",
    "tool": "navigation.start",
    "args": { "place": "北京南站" },
    "spoken": "我来调用导航工具：导航到北京南站。",
    "prompt": ""
  }
}
```

前端完成真实动作后，回传 `tool_result`。后端随后会把结果转成语音和文本注入给用户。

`control.kill` 是后端内部控制工具，不是小程序地图工具。当前小程序只需要实现上面的五个 app 工具。
