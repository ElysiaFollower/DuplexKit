<!--
职责：提供最新的紧凑交接信息，让新 agent 能无歧义恢复当前任务。
边界：只保留当前可恢复状态；历史放 progress.md，稳定事实放 docs 或代码。
-->

# 会话交接

## 仓库状态

- 分支：main
- 提交：待提交本轮音频格式修复和级联路线删除
- 当前计划：`plans/active/2026-05-17-duplex-demo.md`
- 当前功能项：F002/F003 passing；主 demo 唯一路线为 Web Audio -> `/api/realtime` -> 火山 realtime dialogue

## 当前技术路线

- 输入：浏览器上行 24kHz mono `pcm_s16le` binary frame。
- 模型：火山实时语音大模型 `volc.speech.dialog`。
- 输出：火山下行 24kHz mono `pcm_f32le`；浏览器用 `Float32Array` 播放。
- 已删除：ASR -> LLM -> TTS 级联实现、旧 `/api/turn`、旧 `/api/text-turn`。

## 当前已验证状态

- 上次运行命令：`npm test`; `npm run build`; `npm run smoke:local`; `npm run config:check`; `npm run smoke:realtime`; `npm run smoke:bridge`; `./scripts/harness-check.sh`
- 结果：全部通过
- 证据：F002/F003 evidence 已写入 `harness/feature_list.json`；smoke 返回 `audioFormat=pcm_f32le` 和 audioStats

## 仍损坏或未验证

- 自动化无法替用户点击浏览器麦克风权限；需要用户本机手动测试真实说话、插话、打断。

## 清洁状态

- 构建/静态检查：`npm run build` 通过
- 测试：`npm test` 通过
- 本地 smoke：`npm run smoke:local` 通过
- 真实模型 smoke：`npm run smoke:realtime` 和 `npm run smoke:bridge` 通过
- 进度文件同步：已同步 feature_list、progress、handoff、docs

## 下一步最佳动作

1. 用户打开 `http://localhost:5177`，点 Start，授权麦克风。
2. 若输入正常但输出异常，先跑 `npm run smoke:bridge` 看 `audioFormat` 和 `audioStats`。
3. 若 smoke 正常但浏览器异常，检查浏览器控制台、AudioContext sampleRate 和二进制 frame 长度。

## 命令

- 启动：`npm run dev`
- 测试：`npm test`
- 构建：`npm run build`
- 本地 smoke：`npm run smoke:local`
- 真实直连 smoke：`npm run smoke:realtime`
- 本地桥接 smoke：`npm run smoke:bridge`
