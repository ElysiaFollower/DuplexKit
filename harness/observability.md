<!--
职责：定义本项目 harness 的运行时信号、过程工件和验证证据采集方式。
边界：不要存放完整日志；日志应由工具产生，本文只说明采集与解释规则。
-->

# 可观测性

## 运行时信号

- 应用启动/就绪：`npm run dev` 输出监听地址；`GET /api/health` 返回 realtime 配置和音频格式。
- 关键用户路径：前端状态出现 `connecting-realtime`、`starting-session`、`listening`、`thinking`、`speaking`。
- 输入检查：右下角音量条显示浏览器麦克风 RMS。
- 输出检查：`npm run smoke:bridge` 返回 transcript、assistant text、`audioFormat=pcm_f32le` 和 audioStats。
- 错误上下文：WebSocket JSON error event 返回可读错误；不输出密钥。

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
