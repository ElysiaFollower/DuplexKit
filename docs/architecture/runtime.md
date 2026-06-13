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

面向小程序/外部前端的稳定协议文档：[../integration/frontend-protocol.md](../integration/frontend-protocol.md)。

## 工具调用

工具调用不是语音级联路线。当前实现是在原生 realtime 旁边增加后端 Planner：

```text
ChatEnded assistant response
-> 固定工具声明解析
-> tool_request 发给应用端执行真实地图/导航动作
-> 应用端回传 tool_result；若超时未回传，后端 fallback 执行 demo 结果
-> 后端下发结构化 tool result 给前端状态/调试面板
-> 300 ChatTTSText 把工具结果注入给实时模型作为后续上下文
-> 后端抑制这段 ChatTTSText 产生的 assistant_text 和音频下行，默认不播放工具结果语音
```

当前 Planner 是规则版，把语音模型完整回复里的“我来调用{地图/导航/控制}工具...”固定声明句当作低碰撞保留字扫描；ASR transcript 只用于显示和日志，不直接触发工具。

当前支持工具：

- `map.open`
- `map.close`
- `map.set_origin`
- `map.set_destination`
- `navigation.start`
- `control.kill`

其中对前端 app 暴露并要求实现的是前五个地图/导航工具；`control.kill` 是后端内部控制工具，不要求小程序实现地图动作。

固定声明白名单：

```text
我来调用地图工具：打开地图。
我来调用地图工具：关闭地图。
我来调用地图工具：设置起点为{地点}。
我来调用地图工具：设置终点为{地点}。
我来调用导航工具：导航到{地点}。
我来调用导航工具：开始导航。
我来调用控制工具：取消当前工具调用。
```

工具串行执行。pending 期间非 `control.kill` 工具会被拒绝，并通过结构化 `tool` 事件反馈给前端调试/状态面板。

`tool_request` payload：

```json
{
  "type": "tool_request",
  "request": {
    "toolCallId": "uuid",
    "turnId": "question_id",
    "tool": "navigation.start",
    "args": { "place": "北京南站" },
    "spoken": "我来调用导航工具：导航到北京南站。",
    "prompt": ""
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

- `Dialogue`：干净对话列表，包含用户 transcript 和模型原生文本。工具执行结果默认进入结构化 `tool` 流和 realtime trace；虽然后端仍用 `ChatTTSText` 注入给模型，但这段注入产生的文本和音频默认不转发给前端。
- `Session flow`：开发调试流水，包含 ASR、planner、tool、Volc raw event、保存日志事件。
- `POST /api/session-logs`：保存前端收集的 `dialogue + flow + runtime settings + tool registry + metadata` 到 `logs/session/*.json`。这是调试持久化，不是产品级用户会话历史。

## Realtime Fixture 回归

`tests/assets/scenarios.json` 描述真实模型回归用例；`tests/assets/*.wav` 是 24kHz mono `pcm_s16le` 音频 fixture。

```sh
npm run fixtures:audio
npm run test:realtime-fixtures
```

fixture 测试会启动本地服务，把音频按 100ms chunk 发送到 `/api/realtime`，收集 transcript、assistant 文本、`tool_request`、`tool_result` 和下行音频字节，并按 scenario 断言工具调用是否发生。它依赖 `.env`、网络和火山实时服务，因此不放进默认 `npm test`。
