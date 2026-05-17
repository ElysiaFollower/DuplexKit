# Duplex Voice Demo

一个“效果上全双工”的语音交互 demo。浏览器负责麦克风采集、VAD 分段、播放和打断；后端负责 ASR -> LLM -> TTS 编排。

首版不是 Moshi/SeedDuplex 式原生全双工模型，而是用持续监听、分段上传和播放中断实现可感知的全双工效果。

## Quick Start

```sh
npm install
npm run build
DEMO_MOCK=1 npm start
```

打开 `http://localhost:5177`。mock 模式不调用外部 API，用来验证浏览器页面、后端接口和打断状态机。

真实模式只有一条语音路线：Web Audio 采集麦克风，前端 VAD 分段，上传 `/api/turn`，后端执行 ASR -> LLM -> TTS。当前已开通的 “Doubao-录音文件识别2.0” 不是 `/api/turn` 使用的同步 flash 资源 `volc.bigasr.auc_turbo`，所以语音链路会在 ASR 阶段 blocked。先调这个点。

无人值守 smoke：

```sh
npm run smoke:mock
```

真实 API 模式：

```sh
cp .env.example .env
# 填写 LLM 和火山语音变量后：
npm run dev
```

当前已从 `/Users/ely/workspace/research/agent/DreamingRAG/.env` 复制真实 `.env` 到本仓库本地文件。该文件被 `.gitignore` 排除，不会提交。

## Required API Variables

- `DEEPSEEK_API_KEY` 或 `LLM_API_KEY`：OpenAI-compatible Chat Completions。
- `VOLCENGINE_ASR_APP_KEY`：火山引擎大模型录音文件极速版识别 API。新版控制台只需要 app key；旧版还需要 `VOLCENGINE_ASR_ACCESS_KEY`。
- `VOLCENGINE_TTS_API_KEY` 或 `VOLCENGINE_API_KEY`：火山引擎豆包语音合成 SSE API。
- `APP_ID` / `ACCESS_TOKEN`：火山旧版应用字段，当前代码会自动映射到 ASR/TTS 鉴权。
- `VOLCENGINE_TTS_SPEAKER`：默认 `zh_female_xiaohe_uranus_bigtts`，用于 `seed-tts-2.0`。

运行 `GET /api/health` 可以查看缺失项，不会输出密钥。

## Commands

```sh
./scripts/harness-check.sh
npm test
npm run build
npm run dev
```

## HTTP API

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

- 火山引擎 ASR：大模型录音文件极速版识别 API，`POST https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash`。
- 火山引擎 TTS：HTTP SSE 单向流式 V3，`POST https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse`。
