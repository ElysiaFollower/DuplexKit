<!--
职责：描述本项目的持久目标、受众、边界和主要工作流。
边界：不要存放临时任务状态、实现日志、密钥，或应放在 docs/architecture/ 下的详细架构。
-->

# 项目概览

## 目标

DuplexKit 是原生实时全双工语音后端服务和工具调用原型。应用端负责麦克风采集、音频播放和真实地图界面；后端负责把应用端 WebSocket 桥接到火山实时语音大模型，并在 ASR transcript 后运行工具 Planner。

唯一语音主路线：`input audio -> realtime model -> output audio`。

## 受众

本仓库服务于快速验证端到端实时语音交互形态的研究/原型开发者，以及后续要把能力封装成后端服务的 agent。

## 范围内

- 浏览器 demo：麦克风输入、音量条、实时音频播放、状态展示，用于本地验证服务协议。
- 后端服务：静态页面、`/api/realtime` WebSocket、`/api/tools` 工具/协议元数据、配置检查、结构化 session log 保存。
- API 集成：火山实时语音大模型 `volc.speech.dialog`。
- 工具调用：规则版后端 Planner、地图/导航工具请求、应用端工具结果回传、fallback demo 结果、工具生命周期事件。
- 本地验证：不依赖真实麦克风的 smoke，以及可手动运行的浏览器流程。

## 范围外

- ASR -> LLM -> TTS 级联路线。
- 复现 Moshi 或 SeedDuplex 的模型训练、低延迟 codec/streaming 架构。
- 生产级 WebRTC、鉴权、多租户、计费、用户级长期记忆或产品化会话历史。
- 前端视觉精修。

## 核心工作流

- 开发者复制/填写 `.env`，安装依赖，启动后端服务。
- 用户在应用端开始实时语音会话并授权麦克风。
- 应用端持续发送 24kHz mono `pcm_s16le` 到 `/api/realtime`。
- 后端桥接火山 realtime dialogue。
- 后端在 `ASREnded` 后用规则版 Planner 判断是否触发 demo 工具。
- 命中工具时，后端发送 `tool_request`；应用端执行打开/关闭地图、设置起终点或开启导航后回传 `tool_result`。
- 应用端接收 JSON 状态/文本事件和 24kHz mono `pcm_f32le` 音频并播放。
- 复现 bug 时，开发者点 `Save log` 保存 `dialogue + flow + metadata` 到 `logs/session/*.json`。

## 验证

- 聚焦验证：`npm test`
- 本地服务 smoke：`npm run smoke:local`
- 真实模型 smoke：`npm run smoke:realtime`
- 本地桥接 smoke：`npm run smoke:bridge`
