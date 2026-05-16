<!--
职责：记录外部 API 集成边界和配置约定。
边界：不要记录密钥、请求日志或供应商返回的完整私有数据。
-->

# API 集成

## LLM

后端使用 OpenAI-compatible Chat Completions：

- `LLM_BASE_URL` 默认 `https://api.deepseek.com`
- `LLM_MODEL` 默认 `deepseek-chat`
- `LLM_API_KEY` 优先，其次读取 DreamingRAG 已有的 `DEEPSEEK_API_KEY`

## 火山 ASR

使用火山引擎“语音识别大模型 / 大模型录音文件极速版识别 API”：

- endpoint：`https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash`
- resource id：`volc.bigasr.auc_turbo`
- 输入：前端生成的 16kHz mono PCM WAV，base64 放入请求体
- 鉴权：`VOLCENGINE_ASR_APP_KEY`；旧控制台额外需要 `VOLCENGINE_ASR_ACCESS_KEY`

官方文档说明该接口是一次请求即返回识别结果，支持 WAV / MP3 / OGG OPUS，适合当前分段上传 demo。当前本地 `.env` 缺该 key，所以浏览器 demo 会在支持 Web Speech API 时降级为浏览器 ASR，再走 `/api/text-turn`。

## 火山 TTS

使用火山引擎“豆包语音合成 / HTTP SSE 单向流式 V3”：

- endpoint：`https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse`
- resource id：`seed-tts-2.0`
- speaker：默认 `zh_female_shuangkuaisisi_moon_bigtts`
- 鉴权：`VOLCENGINE_TTS_API_KEY`，若缺失则尝试 `VOLCENGINE_API_KEY`

官方文档说明 SSE 返回的音频数据是 base64，需要客户端拼接成音频字节；后端已在 `VolcengineSseTtsProvider` 中完成拼接。若火山 TTS 返回鉴权错误且 `LOCAL_TTS_FALLBACK=1`，macOS 上会降级为本地 `say` + `afconvert` 生成 WAV。

## 当前本地配置状态

DreamingRAG `.env` 已提供 `DEEPSEEK_API_KEY` 和 `VOLCENGINE_API_KEY`。当前本仓库真实模式仍缺 `VOLCENGINE_ASR_APP_KEY`；`VOLCENGINE_API_KEY` 对火山 TTS SSE 返回 `Invalid X-Api-Key`，因此火山真实语音链路需要补齐 ASR/TTS speech key。当前 LLM + macOS 本地 TTS fallback 已通过真实 `/api/text-turn` smoke。
