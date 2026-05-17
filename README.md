# Duplex Voice Demo

一个原生实时语音全双工 demo。浏览器负责麦克风采集、音量观测和 PCM 播放；后端负责把浏览器 WebSocket 桥接到火山引擎实时语音大模型。

主路线不再用本地 VAD 判断“说完”或“打断”。用户是否开口、何时结束、是否打断回复，都交给火山 realtime 模型处理。

## Quick Start

```sh
npm install
npm run build
DEMO_MOCK=1 npm start
```

打开 `http://localhost:5177`。mock 模式不调用外部 API，用来验证浏览器页面和旧 HTTP 调试接口。

真实模式只有一条语音路线：Web Audio 采集麦克风，前端持续发送 24kHz mono PCM 到 `/api/realtime`，后端桥接 `wss://openspeech.bytedance.com/api/v3/realtime/dialogue`。默认 resource id 是 `volc.speech.dialog`。

无人值守 smoke：

```sh
npm run smoke:mock
npm run smoke:realtime
npm run smoke:bridge
```

真实 API 模式：

```sh
cp .env.example .env
# 填写 LLM 和火山语音变量后：
npm run dev
```

当前已从 `/Users/ely/workspace/research/agent/DreamingRAG/.env` 复制真实 `.env` 到本仓库本地文件。该文件被 `.gitignore` 排除，不会提交。

## Required API Variables

- `APP_ID` / `ACCESS_TOKEN`：实时语音大模型鉴权；也会兼容映射到旧 HTTP ASR/TTS 调试接口。
- `VOLCENGINE_REALTIME_SPEAKER`：默认 `zh_female_vv_jupiter_bigtts`。
- `DEEPSEEK_API_KEY` 或 `LLM_API_KEY`：仅旧 `/api/turn`、`/api/text-turn` 调试接口需要。
- `VOLCENGINE_TTS_*`：仅旧 `/api/turn`、`/api/text-turn` 调试接口需要。

运行 `GET /api/health` 可以查看缺失项，不会输出密钥。

## Commands

```sh
./scripts/harness-check.sh
npm test
npm run build
npm run dev
```

## HTTP API

主 demo 使用 WebSocket：

`GET /api/realtime`

- 浏览器上行：24kHz mono signed int16 PCM binary frame。
- 后端下行：JSON 状态/转写/回复文本事件，以及 24kHz mono signed int16 PCM binary frame。

旧 HTTP 调试接口仍保留：

`POST /api/turn`

```json
{
  "sessionId": "local",
  "mimeType": "audio/wav",
  "audioBase64": "..."
}
```

内部调试可用文本入口验证 LLM/TTS 和播放链路；前端主 demo 不走这条路线：

`POST /api/text-turn`

```json
{
  "sessionId": "local",
  "text": "你好，测试一下语音回复"
}
```

返回：

```json
{
  "requestId": "...",
  "transcript": "...",
  "reply": "...",
  "audio": {
    "audioBase64": "...",
    "mimeType": "audio/mpeg"
  }
}
```

## API References

- 火山引擎实时语音大模型：`WSS wss://openspeech.bytedance.com/api/v3/realtime/dialogue`，resource id `volc.speech.dialog`。
- 火山引擎 ASR：豆包流式语音识别模型2.0，`WSS wss://openspeech.bytedance.com/api/v3/sauc/bigmodel`。
- 火山引擎 TTS：HTTP SSE 单向流式 V3，`POST https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse`。
