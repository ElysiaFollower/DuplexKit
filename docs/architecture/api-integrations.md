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

## 已验证

- `npm run smoke:realtime`：直连火山 realtime，通过音频输入得到 transcript、assistant text、`pcm_f32le` audio stats。
- `npm run smoke:bridge`：连本地 `/api/realtime`，经后端桥接得到 transcript、assistant text、`pcm_f32le` audio stats。
