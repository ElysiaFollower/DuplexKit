# ADR: 用户插话打断与重规划

状态：accepted

日期：2026-05-17

## 背景

目标体验是接近真人对话：用户主动插话时，系统不要继续播放旧回复，也不要等 Planner 才停播。火山 realtime 已返回 `450 ASRInfo`，语义是模型识别到用户语音流中的首字。该事件只有 `question_id`，不包含完整语义，但足够作为快速物理打断信号。

## 决策

用户打断分两层处理：

```text
450 ASRInfo
-> 前端立即停止当前播放
-> 丢弃未播放音频队列
-> 后端标记 interrupted=true
-> 继续接收用户 ASR transcript

459 ASREnded
-> 后端 Planner 基于新 transcript、旧 assistant 文本、已播放进度重规划
-> 生成 continue_old / revise_response / new_task
-> 通过 502 ChatRAGText 或后续注入让 realtime 模型重新生成自然衔接语音
```

不恢复旧音频播放。旧音频一旦被用户打断，就丢弃。后续应重新生成自然衔接句。

## Planner 决策

- `continue_old`：用户只是确认、催促或轻微插话，不改变目标。生成“好，我接着说……”这类自然接续。
- `revise_response`：用户纠正或补充旧任务。旧回复废弃，按新信息重说。
- `new_task`：用户切换话题或发新命令。旧回复废弃，处理新任务。

## 为什么 ASRInfo 直接停播

- `ASRInfo` 是最快信号。
- 等 `ASRResponse` 会慢。
- 等 `ASREnded` 或 Planner 会更慢。
- 用户说话时系统继续播报，会破坏真人感。

`ASRInfo` 不足以做语义判断，只做物理停播。语义判断放到用户说完后的 Planner。

## 成本

打断本身不调用 LLM：

```text
ASRInfo -> stop playback -> 0 LLM cost
ASRResponse -> 累积 transcript -> 0 LLM cost
ASREnded -> 每个用户 turn 调一次 Planner
```

不会因为流式识别出每个词就调用 LLM。

## 局限

`ASRInfo` 可能由噪声、咳嗽或背景人声触发，导致误停播。demo 阶段接受优先级：宁可偶尔误停，也不要用户说话时旧音频继续播。

后续可加：

- `ASRInfo + 前端音量阈值`
- `ASRInfo 后短时间内必须有非空 ASRResponse`
- 回声消除和播放侧 ducking
- 误触发统计
