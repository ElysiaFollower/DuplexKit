<!--
职责：记录长期稳定的运行时架构事实。
边界：不要记录临时任务状态、密钥或一次性调试日志。
-->

# 运行时架构

首版采用浏览器 + Node.js 后端的单进程原型。

- 浏览器：使用 Web Audio 持续采集用户语音，显示音量条，只做 24kHz mono PCM 上行和 24kHz mono PCM 下行播放。
- 后端：暴露静态页面和 `/api/realtime` WebSocket。主路线只桥接火山实时语音大模型，不在本地做 VAD、ASR、LLM、TTS 编排。
- 旧调试接口：`/api/turn` 和 `/api/text-turn` 仍保留，用于验证旧 ASR/LLM/TTS 组件，不是主 demo 路线。
- 实时模型：使用火山引擎 realtime dialogue endpoint `wss://openspeech.bytedance.com/api/v3/realtime/dialogue`，resource id `volc.speech.dialog`。

当前 demo 已切到原生实时全双工路线：用户开口检测、说完判定、打断和回复生成都由火山 realtime 模型处理。音量条只用于调试麦克风采集强度。
