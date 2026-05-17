# 火山端到端实时语音 API 调研笔记

来源：

- 官方文档：https://www.volcengine.com/docs/6561/1594356?lang=zh
- 文档结构化接口：https://www.volcengine.com/api/doc/getDocDetail?LibraryID=6561&DocumentID=1594356&lang=zh
- 关联搜索服务文档：https://www.volcengine.com/docs/85508/1650263

版权处理：不在仓库保存官方文档完整原文。这里保存可检索摘要、关键事件表和调研结论；需要原文时用上面的官方链接或结构化接口重新拉取。

## 当前结论

官方文档没有展示通用 function calling / tool schema。它给出的“方案A”更像一组官方原生能力：

- 内置联网搜索：在 `StartSession` 配置中打开。
- 外部 RAG 输入：客户端在用户 query 后发送 `ChatRAGText`。
- 文本 query：客户端发送 `ChatTextQuery`，模型输出文本和音频。
- 上下文管理：客户端可以创建、更新、查询、截断、删除会话上下文。
- 会话内配置更新：客户端发送 `UpdateConfig` 更新 SP 相关配置。

这说明官方路线能解决联网搜索、知识注入、上下文维护，但暂未确认能直接做任意外部工具调用。

## 模型与系统提示词

`StartSession` 的 `dialog.extra.model` 必传：

- `1.2.1.1`：O2.0
- `2.2.0.0`：SC2.0

System Prompt 支持分版本：

- O / O2.0：使用 `bot_name`、`system_role`、`speaking_style`。
- SC / SC2.0：使用 `character_manifest`。

上下文记忆：

- `dialog_id` 可加载同一 dialog 的最近上下文；官方说明服务端只支持最近 20 轮 QA。
- `dialog_context` 可在 `StartSession` 初始化上下文，要求按 user/assistant QA 对传入，数组长度为偶数。
- 如需长期记忆，仍应由本地服务维护摘要、事实、用户偏好，再在会话启动或必要时注入。

## 官方联网搜索

`StartSession` 可配置：

- `enable_volc_websearch`：打开内置联网。
- `volc_websearch_type`：`web`、`web_summary`、`web_agent`；`web_agent` 适用于 2.0 版本。
- `volc_websearch_api_key`：融合信息搜索 API 或搜索 Agent 访问密钥。
- `volc_websearch_bot_id`：搜索 Agent 服务标识，使用 `web_agent` 时需要。
- `volc_websearch_result_count`：搜索结果数，最多 10，默认 10。
- `volc_websearch_no_result_message`：无搜索结果时的话术。
- `location`：可提高联网搜索结果精准度。

服务端 `TTSSentenceStart` 的 `tts_type` 可返回 `network`，表示内置联网音频。

## 外部 RAG 输入

客户端事件：

| Event | 名称 | 用途 |
| --- | --- | --- |
| `502` | `ChatRAGText` | 用户 query 后，客户端输入外部 RAG 知识，模型总结并口语化输出音频。 |

Payload 形态：

```json
{
  "external_rag": "string"
}
```

限制：外部 RAG 输入整体长度不超过 4K 字符。

服务端 `TTSSentenceStart` 的 `tts_type` 可返回 `external_rag`，表示外部 RAG 总结音频。

## 文本输入与语音输出

客户端事件：

| Event | 名称 | 用途 |
| --- | --- | --- |
| `501` | `ChatTextQuery` | 输入文本 query，模型输出闲聊结果。 |
| `300` | `ChatTTSText` | 客户端直接上传文本做语音合成，不要求模型生成闲聊内容。 |

`ChatTextQuery` payload：

```json
{
  "content": "string"
}
```

服务端事件：

| Event | 名称 | 用途 |
| --- | --- | --- |
| `550` | `ChatResponse` | 模型回复文本，包含 `content`、`question_id`、`reply_id`。 |
| `553` | `ChatTextQueryConfirmed` | `ChatTextQuery` ack。 |
| `559` | `ChatEnded` | 模型回复文本结束。 |

## 上下文管理

客户端事件：

| Event | 名称 | 用途 |
| --- | --- | --- |
| `510` | `ConversationCreate` | 追加上下文，每次最多 20 轮 / 40 条，需要完整 QA 对。 |
| `511` | `ConversationUpdate` | 更新指定 `item_id` 的文本，可更新 question 或 reply。 |
| `512` | `ConversationRetrieve` | 查询最近 20 轮完整上下文，或指定 item 所在轮次。 |
| `513` | `ConversationTruncate` | 仅适用于 2.0；按实际已播放音频毫秒数截断上下文。 |
| `514` | `ConversationDelete` | 按对话轮删除上下文。 |

服务端 ack：

| Event | 名称 |
| --- | --- |
| `567` | `ConversationCreated` |
| `568` | `ConversationUpdated` |
| `569` | `ConversationRetrieved` |
| `570` | `ConversationTruncated` |
| `571` | `ConversationDeleted` |

这部分对“模型说了完整文本但用户没听完”的场景很关键。官方在 2026-02-26 的修订中提到可基于客户端实际播报进度做上下文对齐。

## 会话内配置更新

客户端事件：

| Event | 名称 | 用途 |
| --- | --- | --- |
| `201` | `UpdateConfig` | 通话过程中更新 SP 相关配置，例如音色、角色、人设、位置、`dialog_id`。 |

服务端事件：

| Event | 名称 |
| --- | --- |
| `251` | `ConfigUpdated` |

这个能力可能用于动态调整 system role、位置或搜索上下文，但不等价于通用工具调用。

## 音频与全双工事件

当前 demo 已验证：

- 浏览器上行：`pcm_s16le`，24kHz，mono。
- 火山下行：`pcm_f32le`，24kHz，mono。这个格式来自 `tts.audio_config.format = "pcm"`。

服务端关键事件：

| Event | 名称 | 用途 |
| --- | --- | --- |
| `350` | `TTSSentenceStart` | 音频分句开始，含 `tts_type`、`text`、`question_id`、`reply_id`。 |
| `352` | `TTSResponse` | 音频二进制数据。 |
| `359` | `TTSEnded` | 一轮音频合成结束；可携带用户退出意图状态码。 |
| `450` | `ASRInfo` | 识别到用户首字，可用于打断本地播放。 |
| `451` | `ASRResponse` | 用户语音识别文本。 |
| `459` | `ASREnded` | 模型认为用户说话结束。 |

官方交互示例说明当前只支持 `server_vad` 流程：客户端持续发音频，服务端检测说话开始、结束、回复文本和音频。

## 对方案A的判断

可优先验证的官方路线：

1. 开启 `enable_volc_websearch` + `volc_websearch_type=web_agent`，测试官方联网 Agent 是否能覆盖“查资料类工具”。
2. 在用户 query 后发送 `ChatRAGText`，测试外部工具或检索结果能否自然注入模型回复。
3. 用 `ConversationCreate/Update/Retrieve/Truncate` 维护精确上下文，避免只依赖服务端最近 20 轮记忆。
4. 用 `ChatTextQuery` 向会话注入工具执行结果，让模型口语化播报。

暂不把它视作完整工具调用方案，因为文档没有给出：

- 工具 schema 注册。
- 模型返回结构化 tool call。
- tool call id / tool result id 协议。
- 工具参数 JSON 约束。

因此当前排序：

1. 方案A：优先验证官方联网搜索、外部 RAG、上下文管理能覆盖多少真实需求。
2. 方案B：如果需要任意外部工具编排，用“语音咒语工具协议”做可靠触发，再由工具侧 LLM 结构化执行。
