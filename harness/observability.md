<!--
职责：定义本项目 harness 的运行时信号、过程工件和验证证据采集方式。
边界：不要存放完整日志；日志应由工具产生，本文只说明采集与解释规则。
-->

# 可观测性

## 运行时信号

- 应用启动/就绪：`npm run dev` 输出监听地址；`GET /api/health` 返回配置状态。
- 关键用户路径：前端状态依次出现 listening、uploading、thinking、speaking；打断时出现 interrupted。
- 数据/副作用检查：`/api/turn` 响应包含 `transcript`、`reply` 和可播放的音频数据；不会写入持久化用户音频。
- 错误上下文：后端错误包含失败阶段（config/asr/llm/tts）、可恢复提示和请求 id，不输出密钥。

## 过程工件

- 任务合同：`plans/active/`
- 功能状态：`harness/feature_list.json`
- 验证证据：feature item 的 `evidence`
- 会话交接：`harness/session-handoff.md`
- 质量评估：`harness/evaluator-rubric.md` 和 `harness/quality.md`

## 面向 agent 的错误消息规则

验证失败时，错误消息应说明：

- 哪个命令失败；
- 失败的可观察症状；
- 最可能的检查位置；
- 下一步修复建议。

不要只写 “test failed”。
