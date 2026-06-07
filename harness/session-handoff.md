<!--
职责：提供最新的紧凑交接信息，让新 agent 能无歧义恢复当前任务。
边界：只保留当前可恢复状态；历史放 progress.md，稳定事实放 docs 或代码。
-->

# 会话交接

## 仓库状态

- 项目名：DuplexKit
- 本地路径：`/Users/ely/workspace/research/audio/DuplexKit`
- 分支：`main`
- 远端：`origin https://github.com/ElysiaFollower/DuplexKit.git`
- upstream：`origin/main`
- 最近关键提交：本次收尾提交 `feat: finalize assistant tool protocol`
- 当前计划：无 active plan；F007 已归档到 `plans/archive/2026-05-31-assistant-driven-tools.md`
- 当前功能项：F001-F007 均 passing
- 启动路径：`npm run dev` 或 `npm start`，打开 `http://localhost:5177`

## 当前技术路线

- 唯一语音主路线：`app realtime audio -> /api/realtime -> Volcengine realtime speech model -> app playback audio`
- 应用端上行：24kHz mono `pcm_s16le` binary frame，无 WAV header。
- 火山模型：realtime dialogue，resource id `volc.speech.dialog`。
- 应用端下行播放：24kHz mono `pcm_f32le`。
- 服务协议：`GET /api/tools` 返回 realtime protocol 与五个 app 工具 registry；`GET /api/realtime` 下行 `message_end`、`tool_request` 等 JSON 事件，应用端回传 `tool_result`。
- 工具链路：`ChatEnded assistant response -> 固定工具声明解析 -> tool_request -> app tool_result 或后端 fallback -> 300 ChatTTSText 播报 tool_result`。
- ASR transcript 只用于显示和日志，不直接触发工具。
- app 需要实现的工具：`map.open`、`map.close`、`map.set_origin`、`map.set_destination`、`navigation.start`。
- 内部控制工具：`control.kill`；不要求小程序实现地图动作。
- 工具约束：工具串行；pending 期间只允许 `control.kill`，其他工具被拒绝并播报“上个工具调用尚未结束，请稍后。”。
- 可观测性：`Dialogue` 记录干净对话；`Session flow` 记录结构化调试事件；`Save log` 写 `logs/session/*.json`。
- 已删除并禁止恢复为主路线：ASR -> LLM -> TTS 级联实现、旧 `/api/turn`、旧 `/api/text-turn`。

## 当前已验证状态

- 2026-05-31 已运行并通过：`./scripts/harness-check.sh`、`npm run typecheck`、`npm test`、`npm run build`、`npm run smoke:local`、`node --check scripts/raw-realtime-demo.mjs`。
- `npm test` 当前 5 files / 25 tests passing。
- `npm run test:realtime-fixtures` 当前 4 scenarios passing：open-map、navigate-beijing-south、smalltalk-no-tool、cancel-no-running-tool。
- session log API 已通过自动测试：`POST /api/session-logs` 写入 JSON，测试读取文件验证 `schemaVersion`、`dialogue`、`flow`。
- 手动/用户验证：原生 realtime 可用；工具调用 demo 可听；修复后工具注入语音会同步进入 `Dialogue`；用户验证 `300 ChatTTSText` 可进入后续语音模型上下文，`502 ChatRAGText` 当前无效。
- 旧电噪声问题已定位并修复：下行音频必须按 `pcm_f32le` 播放。

## 仍损坏或未验证

- 真实地图/导航服务由“金工小子” app 执行；本仓库已提供 `docs/integration/frontend-protocol.md`、`tool_request` / `tool_result` 协议和 demo auto-ack fallback，但尚未和真实 app 联调。
- Planner 当前是规则版固定句式解析，不是 LLM Planner；不能处理非白名单 assistant 工具声明。
- 火山 `502 ChatRAGText` 作为工具结果注入路线验证无效；当前默认使用 `300 ChatTTSText`。
- 长回复中用户打断后，火山服务端是否完全停止旧 `reply_id` 仍需专项手测；当前前端会在 `ASRInfo` 立刻清掉本地排队播放。
- 自动化无法替用户授权麦克风；真实说话、插话、噪声误触发仍需浏览器手测并保存 session log。
- pending 中 kill 的浏览器时序压测未纳入 F007 完成定义；如要验证取消时序，后续另开专项。

## 清洁状态

- 构建/静态检查：`npm run typecheck`、`npm run build` 通过。
- 测试/端到端：2026-06-07 `./scripts/harness-check.sh`、`npm run typecheck`、`npm test`、`npm run build`、`npm run smoke:local`、`npm run test:realtime-fixtures` 通过；浏览器手动 pending 拒绝和 pending 中 kill 取消仍待用户验证。
- 进度状态：`harness/feature_list.json` 已同步 F007 passing；`harness/progress.md` 已记录协议固化和归档；当前无 active plan。
- 临时工件：`logs/session/*.json` 被 `.gitignore` 排除；仓库只保留 `logs/session/.gitkeep`。本次收尾不应留下测试 JSON。
- 启动路径：`./init.sh` 和 `./scripts/harness-check.sh` 应可在新路径继续运行；改名后如路径相关脚本失败，先检查当前 cwd 和 `.env`。

## 下一步最佳动作

1. 把 [frontend-protocol.md](../docs/integration/frontend-protocol.md) 给小程序开发者，联调 WebSocket 音频、`message_end`、五个 app 工具和 `tool_result`。
2. 小程序端完成基础接入后，用 `npm run test:realtime-fixtures` 和真实小程序各跑一遍打开地图/导航/闲聊 no-op。
3. 如要验证 pending 中 kill 时序，新增 active plan，不要混入已归档 F007。

## 命令

- 安装/初始化：`./init.sh`
- 开发启动：`npm run dev`
- 生产启动：`npm run build && npm start`
- 类型检查：`npm run typecheck`
- 测试：`npm test`
- 生成音频 fixture：`npm run fixtures:audio`
- 真实 fixture 回归：`npm run test:realtime-fixtures`
- 构建：`npm run build`
- 本地 smoke：`npm run smoke:local`
- 真实直连 smoke：`npm run smoke:realtime`
- 本地桥接 smoke：`npm run smoke:bridge`
- Harness 检查：`./scripts/harness-check.sh`
