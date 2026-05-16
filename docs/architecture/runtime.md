<!--
职责：记录长期稳定的运行时架构事实。
边界：不要记录临时任务状态、密钥或一次性调试日志。
-->

# 运行时架构

首版采用浏览器 + Node.js 后端的单进程原型。

- 浏览器：使用 MediaRecorder/VAD 分段采集用户语音，用 `<audio>` 或 Web Audio 播放 TTS；检测到用户再次开口时停止当前播放。
- 后端：暴露静态页面和 `/api/turn` 接口，接收音频片段，顺序编排 ASR、LLM、TTS，返回识别文本、回复文本和音频。
- ASR/TTS：优先使用火山引擎 API。
- LLM：使用模型中转站的 OpenAI-compatible Chat Completions API。

这不是 Moshi/SeedDuplex 式的原生流式全双工模型。首版的“全双工效果”来自持续监听、分段提交、并发任务取消和播放打断。
