# 2026-05-24 后端服务封装与工具接口

## 目标

把现有实时语音 demo 的核心能力整理成一个可对外接入的后端服务：客户端通过单一实时会话通道上传音频、接收可播放音频与状态事件，并通过结构化工具请求/结果消息驱动地图相关动作。

## 非目标

- 不重做前端 UI，也不接管“金工小子” app 的地图实现。
- 不恢复 ASR -> LLM -> TTS 级联路线。

## 当前仓库事实

- 入口规则：`AGENTS.md`
- 初始化契约：`harness/bootstrap-contract.md`
- 当前功能项：`F006`
- 相关文件/模块：`src/server.ts`、`src/volcRealtime.ts`、`src/toolPlanner.ts`、`public/app.js`、`docs/architecture/*`、`tests/*`
- 已知约束：当前唯一实时主路线仍是 `browser/app audio -> /api/realtime -> volc.speech.dialog -> output audio`；工具结果必须有结构化生命周期和可观测性

## 允许改动

- `src/*`
- `public/*`
- `tests/*`
- `docs/*`
- `harness/*`
- `scripts/*`

## 禁止改动

- 不提交密钥、token、日志、下载缓存或生成的运行时文件。

## 验收标准

- 客户端可以通过实时会话通道持续发送音频，后端返回状态、转写、文本和可播放音频。
- 后端可以发出结构化工具请求，覆盖打开地图、关闭地图、设置起点、设置终点和开启导航；客户端可以回传工具结果，或在未回传时由后端 demo 路径兜底。

## 验证命令

```sh
./scripts/harness-check.sh
npm test
npm run build
npm run smoke:local
```

## Evidence 记录要求

验证通过后，将命令、结果、关键输出摘要或 artifact 路径写入 `harness/feature_list.json` 的 `evidence`。

## 完成定义

- 请求行为已实现。
- 非目标没有被触碰。
- 上方验证命令已运行；未运行的命令必须说明原因。
- `harness/feature_list.json` 状态和 evidence 已更新。
- 职责、接口、setup 或边界改变时，docs、注释、测试或 harness 文件已更新。
- `harness/session-handoff.md` 写明当前状态、风险和下一步。
- 清洁状态检查已说明。

## 阻塞条件

- 如果客户端工具回传协议无法确定，则先保留后端 fallback，避免把 demo 链路打断。

## 下一步最佳动作

1. 抽出稳定的后端服务消息协议与工具回传处理。
