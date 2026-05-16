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

如果 ASR key 还没配好，可以先用文本入口验证 LLM/TTS 和播放链路：

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
