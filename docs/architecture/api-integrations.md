<!--
职责：记录外部 API 集成边界和配置约定。
边界：不要记录密钥、请求日志或供应商返回的完整私有数据。
-->

# API 集成

## 火山实时语音大模型

主 demo 路线使用火山 realtime dialogue：

- endpoint：`wss://openspeech.bytedance.com/api/v3/realtime/dialogue`
- resource id：`volc.speech.dialog`
- app key：`PlgvMymc7f3tQnJ6`
- 鉴权：`APP_ID + ACCESS_TOKEN`，映射到 `X-Api-App-ID + X-Api-Access-Key`
- 浏览器上行：24kHz mono signed int16 PCM binary frame
- 浏览器下行：JSON 状态/文本事件，以及 24kHz mono signed int16 PCM binary frame

本地后端只做 WebSocket 桥接和协议封包解析，不本地判断 VAD、不本地停止 TTS。全双工、端点检测和打断由 realtime 模型处理。

已验证：

- `npm run smoke:realtime`：直连火山 realtime，通过音频输入得到 transcript、LLM text 和 TTS audio。
- `npm run smoke:bridge`：连本地 `/api/realtime`，经后端桥接完成同样链路。

## 旧 LLM

后端使用 OpenAI-compatible Chat Completions：

- `LLM_BASE_URL` 默认 `https://api.deepseek.com`
- `LLM_MODEL` 默认 `deepseek-chat`
- `LLM_API_KEY` 优先，其次读取 DreamingRAG 已有的 `DEEPSEEK_API_KEY`

## 旧火山 ASR

旧 `/api/turn` 调试路线配置为“豆包流式语音识别模型2.0”：

- endpoint：`wss://openspeech.bytedance.com/api/v3/sauc/bigmodel`
- resource id：小时版 `volc.seedasr.sauc.duration`；并发版 `volc.seedasr.sauc.concurrent`
- 输入：前端生成的 16kHz mono PCM 音频片段
- 鉴权：`APP_ID + ACCESS_TOKEN`，映射为 `X-Api-App-Key + X-Api-Access-Key`

官方文档说明大模型流式语音识别通过 WebSocket 访问，双向流式模式接口地址是 `/api/v3/sauc/bigmodel`，流式语音识别模型2.0 resource id 是 `volc.seedasr.sauc.duration` 或 `volc.seedasr.sauc.concurrent`。

## 旧火山 TTS

使用火山引擎“豆包语音合成 / HTTP SSE 单向流式 V3”：

- endpoint：`https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse`
- resource id：`seed-tts-2.0`
- speaker：默认 `zh_female_xiaohe_uranus_bigtts`，与 `seed-tts-2.0` 匹配。`*_moon_bigtts` 属于 1.0 资源族，会触发 `resource ID is mismatched with speaker related resource`。
- 鉴权：`VOLCENGINE_TTS_API_KEY`，若缺失则尝试 `VOLCENGINE_API_KEY`

官方文档说明 SSE 返回的音频数据是 base64，需要客户端拼接成音频字节；后端已在 `VolcengineSseTtsProvider` 中完成拼接。若火山 TTS 返回鉴权错误且 `LOCAL_TTS_FALLBACK=1`，macOS 上会降级为本地 `say` + `afconvert` 生成 WAV。

## 当前本地配置状态

DreamingRAG `.env` 已提供 `DEEPSEEK_API_KEY` 和 `VOLCENGINE_API_KEY`。用户新建应用后提供了 `APP_ID`、`ACCESS_TOKEN`、`SECRET_KEY`；当前代码自动将前两者映射到 realtime 和旧 ASR/TTS 应用鉴权。

当前验证结果：

- Realtime：`APP_ID + ACCESS_TOKEN + volc.speech.dialog` 已通过真实音频 smoke，并经本地 `/api/realtime` 桥接 smoke 验证。
- TTS：`APP_ID + ACCESS_TOKEN + seed-tts-2.0 + zh_female_xiaohe_uranus_bigtts` 已通过真实 `/api/text-turn` smoke，返回 `audio/mpeg`。
- ASR：之前误接了 `volc.bigasr.auc_turbo` flash 资源，火山返回 `requested resource not granted`。现在路线改为你已授权的豆包流式语音识别模型2.0 resource：`volc.seedasr.sauc.duration`。

主 demo 不再依赖旧 `/api/turn` ASR provider。
