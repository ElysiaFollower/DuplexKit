<!--
职责：记录会影响后续 agent 决策的重要选择及其理由。
边界：不要记录每次小改动、聊天摘要或可从代码直接看出的事实。
-->

# 决策日志

## 记录规则

重要决策必须写明：日期、决策、原因、否决方案、后续约束。

## 决策

### 2026-05-17 - 初始化 harness

- 决策：采用 repo-native harness，仓库保存指令、状态、验证、交接和质量信息。
- 原因：降低冷启动成本、上下文丢失、范围漂移、验证缺口和返工。
- 否决方案：只依赖聊天 prompt 或单个巨型 `AGENTS.md`。
- 后续约束：项目事实必须进入仓库；重复失败优先转成测试、脚本或检查。

### 2026-05-17 - 首版采用“效果上全双工”

- 决策：首版用持续监听、分段上传、播放打断实现效果上的全双工。
- 原因：用户明确接受效果上全双工，且目标是快速获得可运行 demo，不训练或复现 Moshi/SeedDuplex。
- 否决方案：直接实现低延迟流式 codec/模型级全双工或生产 WebRTC 架构。
- 后续约束：后端接口和前端状态机要保留向真正流式会话升级的余地。

### 2026-05-17 - 主路线切换为火山原生实时语音大模型

- 决策：主路线统一为 `browser mic -> /api/realtime -> Volcengine realtime speech model -> browser audio`。
- 原因：用户目标是原生全双工体验，火山端到端实时语音大模型已验证可用。
- 否决方案：继续维护 ASR -> LLM -> TTS 级联路线。
- 后续约束：新增能力默认接入原生 realtime bridge，不恢复级联语音方案。

### 2026-05-17 - 方案B记录为候选工具协议

- 决策：把“语音咒语工具协议”记录为方案B候选，详见 `docs/adr/2026-05-17-spell-tool-protocol.md`。
- 原因：当前火山 realtime 文档未展示通用 function calling/tool schema，但 assistant text 可被后端监听。
- 否决方案：把触发词方案直接拍成唯一主路线。
- 后续约束：先调研官方方案A；若方案A不能覆盖任意外部工具，再实现方案B tracer bullet。

### 2026-05-17 - 方案A优先调查官方原生能力

- 决策：优先调查火山官方内置联网搜索、外部 RAG、上下文管理、文本 query 能否承担工具类能力。
- 原因：这些能力在官方 API 文档中出现，可能比自定义触发协议更稳定。
- 否决方案：不看官方能力，直接做后端规则匹配工具协议。
- 后续约束：调研结论必须沉淀在 `docs/references/volcengine-realtime-api-research.md`，实现前先确认所需字段和事件。

### 2026-05-17 - 工具调用主路线采用后端 Planner

- 决策：工具调用主路线采用 `ASR transcript -> 后端 Planner LLM -> Tool Executor -> 502 ChatRAGText 身体反馈 -> realtime 播报`，详见 `docs/adr/2026-05-17-backend-planner-tool-calls.md`。
- 原因：火山没有公开通用 tool call 事件；官方 web_agent 不能调用我们的服务；external_rag 可作为稳定结果注入通道。
- 否决方案：把官方 web_agent 当作可复用工具调用方案；让语音模型直接用自然文本/咒语承载底层工具参数。
- 后续约束：工具参数由后端 Planner 生成并做 schema 校验；咒语只作为交互层候选；demo 承认纯文本 Planner 不理解声色、韵律和声纹身份。
