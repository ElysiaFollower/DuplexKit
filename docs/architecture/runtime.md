<!--
职责：记录长期稳定的运行时架构事实。
边界：不要记录临时任务状态、密钥或一次性调试日志。
-->

# 运行时架构

唯一主路线：

`Browser Web Audio -> /api/realtime -> Volcengine realtime dialogue -> Browser Web Audio`

- 浏览器：持续采集麦克风，显示音量条，上行 24kHz mono `pcm_s16le`，播放下行 24kHz mono `pcm_f32le`。
- 后端：暴露静态页面、`GET /api/health`、`GET /api/realtime` WebSocket。
- 模型：火山实时语音大模型 `volc.speech.dialog`。

本项目不再保留 ASR -> LLM -> TTS 级联实现。全双工、用户开口检测、端点检测、打断和回复生成均以实时语音大模型为准。
