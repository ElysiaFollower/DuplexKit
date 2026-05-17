<!--
职责：记录长期稳定的运行时架构事实。
边界：不要记录临时任务状态、密钥或一次性调试日志。
-->

# 运行时架构

首版采用浏览器 + Node.js 后端的单进程原型。

- 浏览器：使用 Web Audio/VAD 分段采集用户语音，用同一音频流驱动音量条、开口检测、打断检测和 WAV 上传。播放 TTS 时继续监听；检测到用户再次开口就停止当前播放。
- 后端：暴露静态页面、`/api/turn` 和调试用 `/api/text-turn`。主路线只用 `/api/turn`：接收音频片段并编排 ASR、LLM、TTS。
- ASR/TTS：优先使用火山引擎 API；缺火山 TTS 权限时，macOS 本地可用 `say` + `afconvert` 作为 demo fallback。
- LLM：使用模型中转站的 OpenAI-compatible Chat Completions API。

这不是 Moshi/SeedDuplex 式的原生流式全双工模型。首版的“全双工效果”来自单一 Web Audio VAD pipeline：持续监听、噪音校准、分段提交和播放打断。
