<!--
职责：为移动端后端效果验证 demo 定义一个窄范围 active task 合同。
边界：不要记录长期架构事实、原始日志、密钥或手机侧产品化需求。
-->

# 移动端后端效果验证 Demo

## 目标

在仓库子目录中实现一个最小 Tauri + React mobile demo：用户输入 Mac 的 IP 和 port 后连接现有后端 `/api/realtime`，按一个语音按钮开启/停止连续麦克风推流，显示用户/assistant 文本流，并用极简正方形 UI 响应五个后端工具请求。

## 非目标

- 不做生产级移动 app 架构、账号、鉴权、地图 SDK、导航 SDK、离线缓存或发布签名。
- 不重写现有后端协议，不恢复 ASR -> LLM -> TTS 级联路线。
- 不实现真实手机文件系统访问、自动安装到手机或 USB 真机调试流程。
- 不引入复杂 UI、长会话管理或完整 session log 面板。

## 当前仓库事实

- 入口规则：`AGENTS.md`
- 初始化契约：`harness/bootstrap-contract.md`
- 当前功能项：F008
- 相关文件/模块：`docs/integration/frontend-protocol.md`、`docs/architecture/runtime.md`、`src/protocol.ts`、`public/app.js`、新增 `mobile-demo/`
- 已知约束：现有实时协议要求 WebSocket 会话打开期间持续发送 24kHz mono `pcm_s16le` raw PCM chunk；后端下行 24kHz mono `pcm_f32le` raw PCM；工具请求必须由后端 `tool_request` 驱动并回传 `tool_result`。

## 允许改动

- 新增 `mobile-demo/` 下的 Tauri + React demo 代码、配置、README。
- 如需要，新增面向移动 demo 的轻量文档。
- 更新 harness 状态、进度、交接和必要验证记录。

## 禁止改动

- 不改变 `/api/realtime`、`/api/tools`、工具名称、音频格式或后端工具触发规则。
- 不修改火山实时语音主链路。
- 不提交密钥、构建产物、手机日志或运行时缓存。

## 验收标准

- `mobile-demo/` 能安装依赖、类型检查并构建前端静态资源。
- 打开 demo 后首屏只有后端地址输入、连接按钮、一个语音按钮、文本区和极简正方形工具区。
- 连接后，语音按钮开启/停止连续上行音频；不是录一段再发一段。
- 收到 `transcript`、`assistant_text`、`message_end` 时能展示逐字/替换式文本效果，并用边界收束段落。
- 收到五个 app 工具的 `tool_request` 时，正方形 UI 完成对应可见动作并回传 `tool_result`。
- 文档说明真机连接方式：同局域网使用 Mac IP + port，Android 可选 `adb reverse`，但本任务不要求真机安装验证。

## 验证命令

```sh
./scripts/harness-check.sh
npm test
npm run build
cd mobile-demo && npm install && npm run typecheck && npm run build
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

- 无法安装移动 demo 依赖且没有可离线替代的最小实现。
- Tauri mobile 模板或依赖下载失败，且无法在本仓库内保留一个可构建的 React/WebView 前端验证 demo。

## 下一步最佳动作

1. 创建 `mobile-demo/`，实现最小 React/Tauri 壳、实时音频 WebSocket 客户端和正方形工具 UI。
