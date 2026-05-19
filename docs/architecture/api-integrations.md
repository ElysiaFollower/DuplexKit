<!--
职责：记录外部 API 集成边界和配置约定。
边界：不要记录密钥、请求日志或供应商返回的完整私有数据。
-->

# API 集成

## 火山实时语音大模型

唯一主路线使用火山 realtime dialogue：

- endpoint：`wss://openspeech.bytedance.com/api/v3/realtime/dialogue`
- resource id：`volc.speech.dialog`
- app key：`PlgvMymc7f3tQnJ6`
- 鉴权：`APP_ID + ACCESS_TOKEN`，映射到 `X-Api-App-ID + X-Api-Access-Key`

本地后端只做 WebSocket 桥接和火山二进制协议封包/解析，不本地做 VAD、ASR、LLM、TTS 编排。

工具 demo 例外：后端会在 `ASREnded` 后读取 transcript，运行规则版 Planner，并通过火山 `300 ChatTTSText` 注入短句播报工具开始和工具结果。这不是恢复 ASR -> LLM -> TTS 级联路线；音频输入、端点、合成和播放仍由 realtime dialogue 链路承担。

## 关键链接

- 实时语音大模型 API 文档：https://www.volcengine.com/docs/6561/1594356?lang=zh
- 实时语音大模型 API 调研笔记：[../references/volcengine-realtime-api-research.md](../references/volcengine-realtime-api-research.md)
- 火山语音应用控制台：https://console.volcengine.com/speech/app

## 音频格式

浏览器上行到后端：

- `pcm_s16le`
- 24kHz
- mono
- WebSocket binary frame
- no WAV header

后端上行到火山：

- 火山 event `200`
- payload：`gzip(pcm_s16le bytes)`
- session config：`tts.audio_config = { channel: 1, format: "pcm", sample_rate: 24000 }`

火山下行到后端：

- TTS event `352`
- payload 解压后为 `pcm_f32le`
- 24kHz
- mono
- no WAV header

后端下行到浏览器：

- JSON：状态、转写、回复文本
- binary：`pcm_f32le` 24kHz mono audio
- 后端注入的 `ChatTTSText` 也会同步发送 `assistant_text` JSON，确保 `Dialogue` 和 session log 能记录用户听到的工具播报文本。

## 已验证

- `npm run smoke:realtime`：直连火山 realtime，通过音频输入得到 transcript、assistant text、`pcm_f32le` audio stats。
- `npm run smoke:bridge`：连本地 `/api/realtime`，经后端桥接得到 transcript、assistant text、`pcm_f32le` audio stats。
