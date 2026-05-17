# ADR: 后端 Planner 作为工具调用主路线

状态：accepted

日期：2026-05-17

## 背景

当前主链路是火山端到端实时语音：

`browser mic -> /api/realtime -> Volcengine realtime speech model -> browser audio`

火山 realtime 文档没有公开通用 tool call 事件，也没有公开官方 `web_agent` 内部如何判断搜索、生成搜索参数、回灌搜索结果。外部 RAG 能力提供了一个官方结果注入通道：客户端发送 `502 ChatRAGText`，实时语音模型把外部知识总结并口语化播报。

我们需要的不是联网搜索本身，而是可复用工具调用：地图、起点、终点、导航、记忆、检索和后续业务服务。

## 决策

工具调用主路线采用后端 Planner + 主动澄清：

```text
用户语音
-> 火山 realtime ASR transcript
-> ASREnded
-> 后端 Planner LLM 判断 tool_call / ask_clarification / no_action
-> 参数足够：Tool Executor 执行真实工具
-> 参数不足：300 ChatTTSText 让语音模型自然追问
-> 工具完成：通过 502 ChatRAGText 注入工具结果和身体反馈；当前 demo 可先用 300 ChatTTSText 稳定播报结果
-> 火山 realtime 语音模型用第一人称播报
```

火山 realtime 继续负责语音 I/O、ASR、打断、音频输出和自然播报。后端 Planner 负责“是否调用工具”和“工具参数”。Tool Executor 负责真实动作。

Planner 输出动作类型：

- `tool_call`：参数足够，执行工具。
- `ask_clarification`：参数不足或置信度低，让语音模型向用户确认。
- `no_action`：没有工具意图。
- `continue_old` / `revise_response` / `new_task`：用户插话打断后的重规划动作，详见 `2026-05-17-interruption-and-replanning.md`。

## 身体反馈

工具结果注入时，不写成“后端调用了工具”，而写成实时语音模型的外部身体反馈：

```text
你刚刚执行了动作 open_map，结果成功。
这是你的外部身体动作结果。
请不要提到工具、后端或系统。
请用第一人称自然回复用户。
```

需要长期记住的工具状态，再通过会话上下文写回，例如 `ConversationCreate` 或下一轮 `dialog_context`。

## 主动澄清

当 Planner 发现身份、地点、目标、权限或关键参数不足时，不猜测、不执行工具，而是生成澄清请求：

```json
{
  "action": "ask_clarification",
  "missing": ["user_identity", "office_location"],
  "question": "您是 Ely 吗？办公室是中关村那间吗？"
}
```

后端把澄清请求通过 `300 ChatTTSText` 播出，并把缺失参数记录在 Planner 日志：

```text
您是 Ely 吗？办公室是中关村那间吗？
```

用户回答后，新的 ASR transcript 再进入 Planner。Planner 用对话上下文补齐参数，然后执行工具。

## 工具调用生命周期

工具调用不是只注入最终结果。每次工具调用必须有生命周期和 ID：

```text
Planner 决定 tool_call
-> 创建 tool_call_id，绑定当前 question_id / turn_id
-> 300 ChatTTSText 播放 tool_started 安抚反馈
-> Tool Executor 执行
-> 工具完成
-> 若 tool_call 仍 active，目标路线用 502 ChatRAGText 注入 tool_result 身体反馈
-> 当前 demo 若 502 时序不稳定，可用 300 ChatTTSText 播报 tool_result
-> 若用户已打断或 Planner 判定过期，丢弃结果或只写后台状态
```

`tool_started` 先用 `300 ChatTTSText` 直接播短句，例如：

```text
我来设置一下。
```

对应的内部身体反馈仍记录在日志中：

```text
你刚刚决定执行外部动作 map.set_destination。
tool_call_id: abc123
动作正在执行中。
请用第一人称简短告诉用户：我来设置一下。
不要提到后端、系统、Planner。
```

`tool_result` 注入示例：

```text
tool_call_id: abc123
外部动作完成：
- action: map.set_destination
- status: success
- destination: 北京南站
请用第一人称简短告诉用户结果。
```

运行态至少记录：

```json
{
  "tool_call_id": "abc123",
  "turn_id": "question_id",
  "tool": "map.set_destination",
  "status": "running",
  "superseded": false
}
```

用户等待工具期间如果插话：

```text
450 ASRInfo
-> 标记当前 running tool_call 可能被 supersede
-> 等用户 ASREnded
-> Planner 判断旧 tool_result 是否仍应投递
```

这保证工具结果不会在用户已经改意图后乱播。

## Planner 介入时机

首版每个用户 turn 都调用一次 Planner：

```text
459 ASREnded
-> Planner
-> tool_call / ask_clarification / no_action / interruption action
```

原因：demo 优先可靠性和可调试性。Planner 可以输出 `no_action`，表示交给火山 realtime 正常闲聊/回复。

后续如果成本或延迟不可接受，再加 cheap filter：

```text
ASREnded
-> 规则/小模型判断是否可能工具意图
-> 可能是工具才调用 Planner
```

## 为什么不是让语音模型直接调用工具

- 火山没有公开稳定的 tool call 事件。
- 语音/自然文本输出不适合承载严格 JSON 参数。
- 用户可能听到工具协议内容，污染体验。
- 工具执行需要 schema 校验、权限、幂等、审计和错误处理，后端更合适。

## 与官方路径的关系

官方 `web_agent` 证明实时语音服务可以在 ASR 后插入搜索/工具类流程，再把结果切句合成音频。但它的判断逻辑、搜索 query 和搜索结果不暴露，不能作为调用我们服务的方案。

官方 `external_rag` 不是工具调用方案，但它是可靠的结果注入通道。我们复用这个通道承载工具结果。

## 咒语方案地位

咒语方案降级为交互层候选：它可以让产品体验更有趣，也可以打开工具窗口。但底层仍依赖后端 Planner 生成参数和执行工具。没有后端 Planner，咒语方案也不可靠。

## 局限

Planner 基于文本 transcript 和上下文工作，不能完整理解用户声色、韵律、身份线索或语气中的隐含信息。这个局限不隐藏。

例如用户说“是我，帮我导航到我的办公室”，如果“是我”的身份识别依赖声纹或声色，纯文本 Planner 不知道是谁。demo 阶段接受这个局限。

缓解方向：

- 把浏览器/session 用户身份作为显式上下文传给 Planner。
- 当身份、地点、目标不确定时，Planner 使用 `ask_clarification` 主动让语音模型确认。
- 后续接入声纹/说话人识别，再把身份结果作为 Planner 输入。
- 高风险或歧义工具动作要求确认。

## 后续验证

- 实现最小工具：`map.open`，无参数。
- 实现参数工具：`map.set_destination({ place })`。
- 每轮记录 `transcript -> tool_call -> tool_result -> injected_text`。
- 验证 `502 ChatRAGText` 的时序：工具结果注入前，火山是否会抢先普通回答。
