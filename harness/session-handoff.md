<!--
职责：提供最新的紧凑交接信息，让新 agent 能无歧义恢复当前任务。
边界：只保留当前可恢复状态；历史放 progress.md，稳定事实放 docs 或代码。
-->

# 会话交接

## 仓库状态

- 分支：main
- 提交：待提交本轮 realtime 切换
- 脏文件：README、docs、src、public、scripts、tests、package、harness 状态更新
- 当前计划：`plans/active/2026-05-17-duplex-demo.md`
- 当前功能项：F002/F003 passing；主 demo 已统一为 Web Audio PCM -> /api/realtime -> 火山 realtime dialogue

## 当前已验证状态

- 上次运行命令：`./scripts/harness-check.sh`; `npm test`; `npm run build`; `npm run smoke:mock`; `npm run config:check`; `npm run smoke:realtime`; `npm run smoke:bridge`
- 结果：harness、测试、构建、mock smoke、配置检查、直连火山 realtime smoke、本地桥接 smoke 均通过
- 证据：F002/F003 evidence 已写入 `harness/feature_list.json`；`npm run smoke:bridge` 返回 transcript、assistant text 和 audioBytes

## 本会话改动

- 新增火山 realtime dialogue 协议 smoke。
- 新增 `/api/realtime` WebSocket 后端桥接。
- 前端切为持续 PCM 上行和 PCM 下行播放；音量条只做观测。
- 新增本地桥接 smoke，验证浏览器同路径后端链路。
- 更新 README、架构文档、配置状态、harness 功能清单。

## 仍损坏或未验证

- 自动化无法替用户点击浏览器麦克风权限；需要用户本机手动授权后测试真实说话、插话、打断。
- 旧 `/api/turn` ASR provider 仍不是主路线，不作为当前 demo 阻塞。

## 清洁状态

- 构建/静态检查：`npm run build` 通过
- 测试/端到端：`npm test` 通过；`npm run smoke:mock` 通过；`npm run smoke:realtime` 通过；`npm run smoke:bridge` 通过
- 进度文件同步：已同步到 feature_list、progress、handoff
- 临时工件：无
- 启动路径：`npm run dev` 或 `npm start` 后访问 `http://localhost:5177`

## 下一步最佳动作

1. 提交本轮 realtime 切换。
2. 用户打开 `http://localhost:5177`，点 Start，授权麦克风。
3. 若页面无反应，先看右下角音量条；若音量有变化但无转写，跑 `npm run smoke:bridge` 区分浏览器采集问题和后端/火山问题。

## 命令

- 初始化：`./init.sh`
- Harness 检查：`./scripts/harness-check.sh`
- 聚焦验证：`npm test`
- 完整验证：`npm run build`
- 调试说明：`npm run dev` 后访问 `http://localhost:5177`；健康检查为 `GET /api/health`。
