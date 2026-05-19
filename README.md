# DuplexKit

原生实时语音全双工 demo 和工具调用原型。唯一语音主路线：

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

## Tool Demo

当前 demo 带一个规则版后端 Planner 和 mock 地图工具，用于验证工具调用生命周期。地图/导航工具还没有接真实服务，执行时返回写死的模拟结果，让语音模型按“身体动作已完成”来反馈：

- “打开地图”
- “设置终点北京南站”
- “导航到北京南站”
- “导航到我的办公室”

命中工具后，后端会记录 `planner -> tool_started -> tool_result`，并用实时语音链路播出“我来...”和“好了...”反馈。用户开口时，前端收到 `ASRInfo` 会立即清掉排队播放。

当前 demo 为保证可听效果，`tool_started` 和 `tool_result` 播报使用 `300 ChatTTSText`。`502 ChatRAGText` 是后续可继续验证的结果注入路线，不是当前默认实现。

## Debug Panels

浏览器页面有两类记录：

- `Dialogue`：给体验测试人员看的干净对话历史。
- `Session flow`：给开发调试看的结构化事件流水，包含 ASR、planner、tool、Volc raw event 和保存日志事件。

`Session flow` 的 `Save log` 会把当前对话、结构化事件、runtime prompt 编辑内容和工具 registry 快照写入：

```text
logs/session/*.json
```

日志文件默认不进入 git，用于复现 bug 后交给后续 agent 分析。

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

`POST /api/session-logs`

把前端收集的 `dialogue + flow + metadata` 保存为仓库内 JSON 调试日志。服务端生成文件名，不接受前端传入路径。

## API Reference

- 火山引擎实时语音大模型：`WSS wss://openspeech.bytedance.com/api/v3/realtime/dialogue`，resource id `volc.speech.dialog`。
- 实时语音大模型 API 文档：https://www.volcengine.com/docs/6561/1594356?lang=zh
- 实时语音大模型 API 调研笔记：[docs/references/volcengine-realtime-api-research.md](docs/references/volcengine-realtime-api-research.md)
- 方案B候选 ADR：[docs/adr/2026-05-17-spell-tool-protocol.md](docs/adr/2026-05-17-spell-tool-protocol.md)
- 火山语音应用控制台：https://console.volcengine.com/speech/app
