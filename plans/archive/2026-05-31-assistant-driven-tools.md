# 2026-05-31 Assistant Response 驱动工具调用

## 目标

把工具调用触发源从 `ASREnded transcript -> Planner` 切换为 `ChatEnded assistant response -> 固定工具声明解析 -> Planner/工具执行`。

核心行为：

- 用户语音仍然走火山 realtime 原生链路。
- 语音模型负责理解用户意图，并在需要工具时用固定自然语言句式单独占一轮 Assistant response。
- 后端只在完整 `ChatEnded` 后解析 assistant response；不再用用户 ASR transcript 直接触发工具。
- 工具结果由后端组织自然语言，并通过 `300 ChatTTSText` 注入；已验证该通道可进入后续语音模型上下文。
- 后端工具状态仍是唯一严格事实来源。

## 固定句式

MVP 只接受以下白名单句式：

```text
我来调用地图工具：打开地图。
我来调用地图工具：关闭地图。
我来调用地图工具：设置起点为{地点}。
我来调用地图工具：设置终点为{地点}。
我来调用导航工具：导航到{地点}。
我来调用导航工具：开始导航。
我来调用控制工具：取消当前工具调用。
```

不符合白名单的 assistant response 不触发工具，不使用 ASR transcript 兜底，不注入纠错提示。

## Pending 规则

- 工具串行执行；pending 期间不允许发起新的地图/导航工具。
- pending 期间唯一允许的工具声明是控制工具：`取消当前工具调用`。
- 如果 pending 期间模型声明新的非 kill 工具，后端不执行，只通过 `300 ChatTTSText` 反馈：`上个工具调用尚未结束，请稍后。`
- kill 工具结果分支：
  - 有 pending 且尚未完成：`刚才的工具调用已取消。`
  - pending 已完成或不存在：`当前没有正在执行的工具调用。`

## 当前仓库事实

- 实时链路入口：`src/volcRealtime.ts`
- 工具状态和规则：`src/toolPlanner.ts`
- 工具协议校验：`src/protocol.ts`
- 浏览器 demo：`public/app.js`
- 小程序对接协议：`docs/integration/frontend-protocol.md`
- 真实 fixture 回归：`tests/assets/scenarios.json`、`tests/assets/*.wav`、`scripts/realtime-fixture-test.mjs`
- 用户已验证：`300 ChatTTSText` 可作为工具结果上下文注入；`502 ChatRAGText` 当前不采用。
- 当前未提交用户改动：`src/runtimeSettings.ts` 的 system prompt 草案，必须保留并在其基础上收敛。

## 非目标

- 不引入真正文本 LLM Planner。
- 不恢复 ASR -> LLM -> TTS 级联路线。
- 不依赖 `ASREnded` 携带 final transcript。
- 不用 ASR transcript 作为工具触发兜底。
- 不支持 pending 工具覆盖或排队。
- 不接真实地图/导航 app，只保留现有 `tool_request/tool_result` 协议和 demo auto-ack。
- 不启用 `502 ChatRAGText` 作为工具结果注入路线。

## 允许改动

- `src/volcRealtime.ts`
- `src/toolPlanner.ts`
- `src/runtimeSettings.ts`
- `public/app.js`
- `tests/*`
- `docs/*`
- `harness/*`

## 禁止改动

- 不提交密钥、token、日志、下载缓存或 `logs/session/*.json`。
- 不覆盖用户已有本地改动；尤其保留并整理 `src/runtimeSettings.ts` 的 prompt 意图。
- 不改动 committed raw memory probe，除非验证失败需要最小修复。

## 验收标准

- `ASREnded` 后不再运行工具 Planner；ASR transcript 仅用于显示和日志。
- `ChatEnded` 后对完整 assistant response 运行固定句式解析。
- 合法工具声明会触发 `tool_request`，浏览器 demo 自动回传 `tool_result`，后端通过 `300 ChatTTSText` 播报结果。
- 非固定句式不触发工具。
- pending 期间非 kill 工具被拒绝并播报 `上个工具调用尚未结束，请稍后。`
- pending 期间 kill 工具可取消当前 pending 工具并播报取消结果。
- 工具声明和工具结果都进入 `Dialogue`；结构化生命周期进入 `Session flow`。
- `/api/tools` 暴露稳定 realtime protocol 元数据，app 工具只包含五个地图/导航动作；`control.kill` 标记为内部控制工具。
- 后端下发 `message_end` 作为文本/播放边界，前端可据此换行显示。
- 单元测试覆盖固定句式解析、非句式 no-op、pending 拒绝、kill 分支。
- 真实 fixture 回归覆盖“打开地图”“导航到北京南站”“普通闲聊不触发工具”，检查 transcript、assistant 文本、`tool_request` 和 `tool_result`。

## 验证命令

```sh
./scripts/harness-check.sh
npm test
npm run fixtures:audio
npm run build
NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost npm run smoke:local
NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost npm run test:realtime-fixtures
```

## 手动验证

1. `npm run dev` 后打开 `http://localhost:5177`。
2. 说“打开地图”，确认语音模型输出固定工具声明后，Session flow 出现工具请求和结果。
3. 说普通闲聊，确认不会触发工具。
4. 人工制造 pending 场景或用测试覆盖 pending：非 kill 工具被拒绝，kill 可取消。

## 完成定义

- 代码、测试、文档和 harness 状态一致。
- F007 状态与 evidence 同步。
- `harness/session-handoff.md` 记录新工具触发路线、风险和下一步。
- 验证命令完成并记录结果；未运行的命令要说明原因。

## 阻塞条件

- 如果火山不稳定输出固定句式，先停在 prompt/体验问题，不引入 ASR 兜底。
- 如果 `300 ChatTTSText` 注入上下文在新场景复现失败，记录 evidence 后重新评估工具结果注入路线。
