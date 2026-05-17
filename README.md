# Duplex Voice Demo

原生实时语音全双工 demo。唯一主路线：

`browser mic -> /api/realtime -> Volcengine realtime speech model -> browser audio`

本地不再实现 ASR -> LLM -> TTS 级联路线。用户开口检测、端点检测、回复生成、打断由火山实时语音大模型处理。浏览器音量条只用于观察麦克风采集强度。

## Quick Start

```sh
npm install
npm run build
npm start
```

打开 `http://localhost:5177`，点 `Start`，授权麦克风。

开发模式：

```sh
npm run dev
```

## Required API Variables

- `APP_ID` / `ACCESS_TOKEN`：火山实时语音大模型鉴权。
- `VOLCENGINE_REALTIME_SPEAKER`：默认 `zh_female_vv_jupiter_bigtts`。

当前已从 `/Users/ely/workspace/research/agent/DreamingRAG/.env` 复制真实 `.env` 到本仓库本地文件。该文件被 `.gitignore` 排除，不会提交。

`GET /api/health` 可查看缺失项，不输出密钥。

## Wire Format

Browser -> `/api/realtime`：

- WebSocket binary frame
- 24kHz mono signed int16 little-endian PCM
- no WAV header

`/api/realtime` -> browser：

- JSON status/transcript/assistant text events
- WebSocket binary frame for audio
- 24kHz mono float32 little-endian PCM
- no WAV header

音频输出曾被误按 int16 播放，会产生强电噪声；正确播放格式是 `pcm_f32le`。

## Commands

```sh
./scripts/harness-check.sh
npm test
npm run build
npm run smoke:local
npm run config:check
npm run smoke:realtime
npm run smoke:bridge
```

## API

`GET /api/realtime`

- 必须 WebSocket upgrade；普通 HTTP 请求返回 `426`。
- 浏览器上行音频 binary。
- 后端下行 JSON 事件和音频 binary。

`GET /api/health`

返回 realtime 配置状态和音频格式。

## API Reference

- 火山引擎实时语音大模型：`WSS wss://openspeech.bytedance.com/api/v3/realtime/dialogue`，resource id `volc.speech.dialog`。
