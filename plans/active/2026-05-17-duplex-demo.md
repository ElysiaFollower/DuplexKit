<!--
职责：当前 WIP=1 任务合同。
边界：不要记录长期架构事实；完成后归档到 plans/archive/。
-->

# 2026-05-17 全双工语音 demo

## 目标

交付一个可运行浏览器 demo：用户通过麦克风输入语音，浏览器持续发送 PCM 到后端，后端桥接火山实时语音大模型并返回可播放 PCM 音频。用户再次说话时由 realtime 模型处理打断和端点检测。

## 非目标

- 不训练或复现 Moshi/SeedDuplex 模型。
- 不做生产级鉴权、持久化、多租户或 WebRTC。
- 不追求前端视觉质量。

## 验收

- `./scripts/harness-check.sh` 通过。
- `npm test` 通过。
- `npm run build` 通过。
- `npm run smoke:realtime` 通过，且校验输出为 `pcm_f32le`。
- `npm run smoke:bridge` 通过，且校验输出为 `pcm_f32le`。
- `.env.example` 明确列出需要的变量，真实 `.env` 不进入 git。
- `npm run dev` 可启动服务，浏览器页面可采集麦克风、显示音量条、经 `/api/realtime` 收发音频。

## 分片提交

1. Harness 初始化。
2. 项目骨架、配置和测试框架。
3. API 客户端与编排服务。
4. 浏览器 demo 与验证收尾。
5. 火山 realtime 原生全双工切换。
6. 修复输出格式并删除旧级联路线。
