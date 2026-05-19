<!--
职责：提供最新的紧凑交接信息，让新 agent 能无歧义恢复当前任务。
边界：只保留当前可恢复状态；历史放 progress.md，稳定事实放 docs 或代码。
-->

# 会话交接

## 仓库状态

- 项目名：DuplexKit
- 本地路径：`/Users/ely/workspace/research/audio/duplex`（用户准备改名；新会话应以实际新路径为准）
- 分支：`main`
- 远端：`origin https://github.com/ElysiaFollower/DuplexKit.git`
- upstream：`origin/main`
- 最近关键提交：`8aa5898 fix: record injected tool speech in dialogue`
- 当前计划：原 active plan 已完成并归档到 `plans/archive/2026-05-17-duplex-demo.md`
- 当前功能项：无 active；F001-F005 均 passing
- 启动路径：`npm run dev` 或 `npm start`，打开 `http://localhost:5177`

## 当前技术路线

- 唯一语音主路线：`browser mic -> /api/realtime -> Volcengine realtime speech model -> browser audio`
- 浏览器上行：24kHz mono `pcm_s16le` binary frame，无 WAV header。
- 火山模型：realtime dialogue，resource id `volc.speech.dialog`。
- 浏览器下行播放：24kHz mono `pcm_f32le`。
- 工具 demo：`ASREnded transcript -> 规则版后端 Planner -> mock map/navigation tools -> 300 ChatTTSText 播报 tool_started/tool_result`。
- 可观测性：`Dialogue` 记录干净对话；`Session flow` 记录结构化调试事件；`Save log` 写 `logs/session/*.json`。
- 已删除并禁止恢复为主路线：ASR -> LLM -> TTS 级联实现、旧 `/api/turn`、旧 `/api/text-turn`。

## 当前已验证状态

- 2026-05-18/19 已运行并通过：`npm run typecheck`、`npm test`、`npm run build`、`npm run smoke:local`、`./scripts/harness-check.sh`。
- session log API 已通过自动测试：`POST /api/session-logs` 写入 JSON，测试读取文件验证 `schemaVersion`、`dialogue`、`flow`。
- 手动/用户验证：原生 realtime 可用；工具调用 demo 可听；修复后工具注入语音会同步进入 `Dialogue`。
- 旧电噪声问题已定位并修复：下行音频必须按 `pcm_f32le` 播放。

## 仍损坏或未验证

- 真实地图/导航服务未接入；当前工具 registry 中地图工具都是 mock，占位返回写死结果。
- Planner 当前是规则版 demo，不是 LLM Planner；不能处理复杂自然语言参数、权限、身份、记忆。
- 火山 `502 ChatRAGText` 作为工具结果注入路线仍未稳定验证；当前默认使用 `300 ChatTTSText`。
- 长回复中用户打断后，火山服务端是否完全停止旧 `reply_id` 仍需专项手测；当前前端会在 `ASRInfo` 立刻清掉本地排队播放。
- 自动化无法替用户授权麦克风；真实说话、插话、噪声误触发仍需浏览器手测并保存 session log。

## 清洁状态

- 构建/静态检查：`npm run typecheck`、`npm run build` 通过。
- 测试/端到端：`npm test`、`npm run smoke:local` 通过；真实模型 smoke 最近一次通过记录在 F002/F003 evidence，但本次归档未重跑真实模型 smoke。
- 进度状态：`harness/feature_list.json` 已同步 F001-F005；active plan 已归档；`harness/progress.md` 已追加归档记录。
- 临时工件：`logs/session/*.json` 被 `.gitignore` 排除；仓库只保留 `logs/session/.gitkeep`。本次收尾不应留下测试 JSON。
- 启动路径：`./init.sh` 和 `./scripts/harness-check.sh` 应可在新路径继续运行；改名后如路径相关脚本失败，先检查当前 cwd 和 `.env`。

## 下一步最佳动作

1. 用户改名工作区后，在新路径运行 `./init.sh`。
2. 运行 `npm run typecheck && npm test && npm run build && ./scripts/harness-check.sh` 确认改名未破坏项目。
3. 打开 `http://localhost:5177`，手测工具句：“打开地图”“导航到北京南站”。
4. 如果复现 bug，先点 `Save log`，再读取最新 `logs/session/*.json` 分析 `Dialogue`、`Session flow` 和 raw Volc events。

## 命令

- 安装/初始化：`./init.sh`
- 开发启动：`npm run dev`
- 生产启动：`npm run build && npm start`
- 类型检查：`npm run typecheck`
- 测试：`npm test`
- 构建：`npm run build`
- 本地 smoke：`npm run smoke:local`
- 真实直连 smoke：`npm run smoke:realtime`
- 本地桥接 smoke：`npm run smoke:bridge`
- Harness 检查：`./scripts/harness-check.sh`
