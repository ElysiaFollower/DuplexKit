<!--
职责：描述本项目的持久目标、受众、边界和主要工作流。
边界：不要存放临时任务状态、实现日志、密钥，或应放在 docs/architecture/ 下的详细架构。
-->

# 项目概览

## 目标

实现原生实时全双工语音交互 demo。浏览器负责麦克风采集、音量观测和音频播放；后端负责把浏览器 WebSocket 桥接到火山实时语音大模型。

唯一技术路线：`input audio -> realtime model -> output audio`。

## 受众

本仓库服务于快速验证端到端实时语音交互形态的研究/原型开发者，以及后续要把能力封装成后端服务的 agent。

## 范围内

- 浏览器 demo：麦克风输入、音量条、实时音频播放、状态展示。
- 后端服务：静态页面、`/api/realtime` WebSocket、配置检查。
- API 集成：火山实时语音大模型 `volc.speech.dialog`。
- 本地验证：不依赖真实麦克风的 smoke，以及可手动运行的浏览器流程。

## 范围外

- ASR -> LLM -> TTS 级联路线。
- 复现 Moshi 或 SeedDuplex 的模型训练、低延迟 codec/streaming 架构。
- 生产级 WebRTC、鉴权、多租户、计费、持久化会话历史。
- 前端视觉精修。

## 核心工作流

- 开发者复制/填写 `.env`，安装依赖，启动后端服务。
- 用户在浏览器点击开始，授权麦克风。
- 浏览器持续发送 24kHz mono `pcm_s16le` 到 `/api/realtime`。
- 后端桥接火山 realtime dialogue。
- 浏览器接收 JSON 状态/文本事件和 24kHz mono `pcm_f32le` 音频并播放。

## 验证

- 聚焦验证：`npm test`
- 本地服务 smoke：`npm run smoke:local`
- 真实模型 smoke：`npm run smoke:realtime`
- 本地桥接 smoke：`npm run smoke:bridge`
