<!--
职责：提供最新的紧凑交接信息，让新 agent 能无歧义恢复当前任务。
边界：只保留当前可恢复状态；历史放 progress.md，稳定事实放 docs 或代码。
-->

# 会话交接

## 仓库状态

- 分支：main
- 提交：尚无提交
- 脏文件：harness scaffold 初始化中
- 当前计划：`plans/active/2026-05-17-duplex-demo.md`
- 当前功能项：F002 浏览器到后端的全双工语音 demo

## 当前已验证状态

- 上次运行命令：`./scripts/harness-check.sh`
- 结果：通过，0 警告
- 证据：F001 evidence 已写入 `harness/feature_list.json`

## 本会话改动

- 初始化 git 仓库。
- 创建并填写 repo-native harness scaffold。
- 记录全双工语音 demo 的目标、范围、架构方向和 active plan。
- 将 F001 标记为 passing，F002 标记为 active。

## 仍损坏或未验证

- 业务 demo 尚未实现。
- npm 项目骨架尚未创建。
- API 密钥尚未复制到本仓库 `.env`。

## 清洁状态

- 构建/静态检查：待 Node 项目创建后验证
- 测试/端到端：待 F002 实现
- 进度文件同步：已同步到 feature_list、progress、handoff
- 临时工件：无
- 启动路径：harness 可检查，业务启动待实现

## 下一步最佳动作

1. 提交 F001 初始化检查点。
2. 从 DreamingRAG `.env` 复制必要 API 变量到本仓库 `.env`，同时生成 `.env.example`。
3. 创建后端服务、API 客户端、浏览器 demo 和测试。

## 命令

- 初始化：`./init.sh`
- Harness 检查：`./scripts/harness-check.sh`
- 聚焦验证：`npm test`
- 完整验证：`npm run build`
- 调试说明：`npm run dev` 后访问 `http://localhost:5177`；健康检查为 `GET /api/health`。
