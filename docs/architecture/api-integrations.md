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

官方文档说明该接口是一次请求即返回识别结果，支持 WAV / MP3 / OGG OPUS，适合当前分段上传 demo。

## 火山 TTS

使用火山引擎“豆包语音合成 / HTTP SSE 单向流式 V3”：

- endpoint：`https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse`
- resource id：`seed-tts-2.0`
- speaker：默认 `zh_female_shuangkuaisisi_moon_bigtts`
- 鉴权：`VOLCENGINE_TTS_API_KEY`，若缺失则尝试 `VOLCENGINE_API_KEY`

官方文档说明 SSE 返回的音频数据是 base64，需要客户端拼接成音频字节；后端已在 `VolcengineSseTtsProvider` 中完成拼接。

## 当前本地配置状态

DreamingRAG `.env` 已提供 `DEEPSEEK_API_KEY` 和 `VOLCENGINE_API_KEY`。当前本仓库真实模式仍缺 `VOLCENGINE_ASR_APP_KEY`，所以需要补齐火山语音识别 app key 后才能做真实麦克风链路验证。
