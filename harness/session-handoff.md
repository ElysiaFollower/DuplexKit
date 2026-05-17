<!--
职责：提供最新的紧凑交接信息，让新 agent 能无歧义恢复当前任务。
边界：只保留当前可恢复状态；历史放 progress.md，稳定事实放 docs 或代码。
-->

# 会话交接

## 仓库状态

- 分支：main
- 提交：`6861bd1 feat: scaffold duplex voice demo service` 后仍有未提交运行路径/README/test 更新
- 脏文件：README、docs、src、tests、tsconfig、harness 状态更新
- 当前计划：`plans/active/2026-05-17-duplex-demo.md`
- 当前功能项：F003 blocked，等待 `volc.bigasr.auc_turbo` flash ASR 资源授权；demo 使用浏览器 ASR + 火山 TTS 可用

## 当前已验证状态

- 上次运行命令：`./scripts/harness-check.sh`; `npm test`; `npm run build`; `npm run smoke:mock`; `npm run config:check`; 真实 `/api/text-turn`; 真实 `/api/turn` smoke
- 结果：harness、测试、构建、mock HTTP smoke、配置检查、真实 DeepSeek LLM + 火山 TTS 均通过；纯后端 ASR 因资源未授权 blocked
- 证据：F002/F003 evidence 已写入 `harness/feature_list.json`；真实 `/api/text-turn` 返回 DeepSeek reply 和 audio/mpeg；`/api/turn` 返回 ASR 403 code 45000030 `requested resource not granted`

## 本会话改动

- 初始化 git 仓库。
- 创建并填写 repo-native harness scaffold。
- 记录全双工语音 demo 的目标、范围、架构方向和 active plan。
- 将 F001 标记为 passing，F002 标记为 active。
- 创建 Fastify 后端、浏览器采集页、浏览器 ASR 降级、文本回合入口、外部 API providers、macOS TTS fallback、mock providers、测试和 smoke 脚本。
- 补 README 和 API 集成文档。

## 仍损坏或未验证

- 真实火山 ASR 后端路径未通过：当前应用没有 `volc.bigasr.auc_turbo` resource grant。已开通的 Doubao-录音文件识别2.0不是该同步 flash resource。
- 真实火山 TTS 已通过：`APP_ID + ACCESS_TOKEN + seed-tts-2.0 + zh_female_xiaohe_uranus_bigtts` 返回 audio/mpeg。
- 自动化未点击浏览器麦克风权限；需要用户本机手动授权后测试真实说话。

## 清洁状态

- 构建/静态检查：`npm run build` 通过
- 测试/端到端：`npm test` 通过；`npm run smoke:mock` 通过；真实 API 待补 key
- 进度文件同步：已同步到 feature_list、progress、handoff
- 临时工件：无
- 启动路径：harness 可检查，业务启动待实现

## 下一步最佳动作

1. 提交 APP_ID/ACCESS_TOKEN 适配、TTS 2.0 音色修复和状态更新。
2. 当前可运行 `npm run dev`，打开 `http://localhost:5177`；默认 `PREFER_BROWSER_ASR=1`，浏览器 ASR + 后端 DeepSeek + 火山 TTS。
3. 若要纯后端 ASR，开通 `volc.bigasr.auc_turbo` 对应极速/flash 识别资源，或新增 Doubao-录音文件识别2.0异步 submit/query provider。

## 命令

- 初始化：`./init.sh`
- Harness 检查：`./scripts/harness-check.sh`
- 聚焦验证：`npm test`
- 完整验证：`npm run build`
- 调试说明：`npm run dev` 后访问 `http://localhost:5177`；健康检查为 `GET /api/health`。
