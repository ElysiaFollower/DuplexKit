<!--
职责：定义金工小子 app 直接对接 DuplexKit 后端的 active task 合同。
边界：不要在这里记录实现流水账；进度写入 harness/progress.md，稳定协议写入 docs。
-->

# 金工小子 App 全栈对接 DuplexKit

## 目标

在仓库子目录以 git submodule 引入 `https://github.com/zzw4257/jingongxiaozi` 最新源码，在子仓库本地 `full-stack` 分支中接入 DuplexKit `/api/realtime` WebSocket：应用端采集麦克风、播放后端下行音频、展示后端文本状态，并把后端 `tool_request` 映射到金工小子已有 `BackendDirective` / `MapDirectRequest` 状态模型，最终产出可安装 Android debug APK。

## 非目标

- 不改 DuplexKit 后端主协议，不恢复 ASR -> LLM -> TTS 级联路线。
- 不实现真实地图服务、真实路径规划或生产级导航 SDK。
- 不做 release 签名包、应用上架、长期配置中心或鉴权。
- 不清理或回滚已有 `mobile-demo` / debug logging 未提交改动。

## 当前仓库事实

- 入口规则：`AGENTS.md`
- 初始化契约：`harness/bootstrap-contract.md`
- 当前功能项：F009
- 相关文件/模块：`docs/integration/frontend-protocol.md`、`src/protocol.ts`、`src/volcRealtime.ts`、`apps/jingongxiaozi/`
- 已知约束：应用端必须持续发送 24kHz mono `pcm_s16le` binary frame；下行音频为 24kHz mono `pcm_f32le`；后端下发五个 app 工具 `map.open`、`map.close`、`map.set_origin`、`map.set_destination`、`navigation.start`。

## 允许改动

- 新增 `.gitmodules` 和 `apps/jingongxiaozi` submodule。
- 修改 submodule 内 React/Tauri/Android 代码以接入 DuplexKit realtime 协议。
- 增加 submodule 内对接说明、调试说明和必要 npm script。
- 更新 harness 文件、active plan、困难审计文档。

## 禁止改动

- 不破坏根仓库现有后端协议和测试。
- 不删除已有 `mobile-demo`，不回滚用户或前序任务未提交改动。
- 不提交密钥、真实运行日志、node_modules、Gradle build cache 或 APK 构建缓存。

## 验收标准

- `apps/jingongxiaozi` 是 git submodule，子仓库当前分支为 `full-stack`。
- 金工小子 app 内有可配置 Mac IP + port 的 DuplexKit 连接入口或调试面板。
- 点击语音按钮后，app 通过 WebView 麦克风持续推送 24kHz `pcm_s16le` 到 `/api/realtime`，并播放 24kHz `pcm_f32le` 下行音频。
- app 处理 `transcript`、`assistant_text`、`message_end`、`tool_request`，把工具请求映射到已有地图/对话状态，并回传 `tool_result`。
- 生成 Android debug APK，并记录路径、大小、sha256、权限审计结果。
- 困难和取舍写入一份精炼通俗文档，便于用户审计。

## 验证命令

```sh
./scripts/harness-check.sh
npm test
npm run build
cd apps/jingongxiaozi && npm install && npm run build
cd apps/jingongxiaozi/src-tauri && cargo check
cd apps/jingongxiaozi && npm run tauri -- android build --apk --debug -v
```

## Evidence 记录要求

验证通过后，将命令、结果、关键输出摘要、APK 路径、sha256 和权限审计写入 `harness/feature_list.json` 的 `evidence`。

## 完成定义

- 请求行为已实现。
- 非目标没有被触碰。
- 上方验证命令已运行；未运行的命令必须说明原因。
- `harness/feature_list.json` 状态和 evidence 已更新。
- 职责、接口、setup 或边界改变时，docs、注释、测试或 harness 文件已更新。
- `harness/session-handoff.md` 写明当前状态、风险和下一步。
- 清洁状态检查已说明。

## 阻塞条件

- GitHub submodule 拉取失败且无法从已缓存 `/tmp/jingongxiaozi` 恢复。
- 金工小子仓库当前 Android/Tauri 工程无法在本机工具链构建，且失败不是可局部修复的配置问题。
- 真机麦克风授权、后端网络可达性或火山实时服务要求用户手动操作才能继续验证。

## 下一步最佳动作

1. 添加 `apps/jingongxiaozi` submodule 并切换子仓库 `full-stack` 分支。
