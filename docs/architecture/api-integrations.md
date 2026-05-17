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
- speaker：默认 `zh_female_xiaohe_uranus_bigtts`，与 `seed-tts-2.0` 匹配。`*_moon_bigtts` 属于 1.0 资源族，会触发 `resource ID is mismatched with speaker related resource`。
- 鉴权：`VOLCENGINE_TTS_API_KEY`，若缺失则尝试 `VOLCENGINE_API_KEY`

官方文档说明 SSE 返回的音频数据是 base64，需要客户端拼接成音频字节；后端已在 `VolcengineSseTtsProvider` 中完成拼接。若火山 TTS 返回鉴权错误且 `LOCAL_TTS_FALLBACK=1`，macOS 上会降级为本地 `say` + `afconvert` 生成 WAV。

## 当前本地配置状态

DreamingRAG `.env` 已提供 `DEEPSEEK_API_KEY` 和 `VOLCENGINE_API_KEY`。用户新建应用后提供了 `APP_ID`、`ACCESS_TOKEN`、`SECRET_KEY`；当前代码自动将前两者映射到 ASR/TTS 旧版应用鉴权。

当前验证结果：

- TTS：`APP_ID + ACCESS_TOKEN + seed-tts-2.0 + zh_female_xiaohe_uranus_bigtts` 已通过真实 `/api/text-turn` smoke，返回 `audio/mpeg`。
- ASR：`APP_ID + ACCESS_TOKEN` 鉴权可达接口，但 `/api/turn` 默认 flash resource `volc.bigasr.auc_turbo` 返回 `requested resource not granted`。已开通的 “Doubao-录音文件识别2.0” 不是该同步 flash resource。

因此浏览器 demo 默认 `PREFER_BROWSER_ASR=1`，优先浏览器 ASR，再调用后端 LLM + 火山 TTS。若要纯后端 ASR，需要开通与 `volc.bigasr.auc_turbo` 匹配的极速/flash 识别资源，或后续实现 “录音文件识别2.0” 的异步 submit/query 流程。
