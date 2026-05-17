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
-> 记录 raw event / reply_id / question_id，观察火山是否自动重规划
-> 继续接收用户 ASR transcript

459 ASREnded
-> 默认先信任火山 realtime 自己基于新输入调整后续输出
-> 若实验显示火山不能自动重规划，再让后端 Planner 介入
```

不恢复旧音频播放。旧音频一旦被用户打断，就丢弃。后续应重新生成自然衔接句。

首版不主动发送 `515 ClientInterrupt`，也不先实现服务端 reply 丢弃策略。先验证火山原生全双工是否已经会停止或修正旧输出。

## Planner 决策

以下决策只在实验显示火山不能自动自然处理插话时启用：

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

## 验证门槛

用长回复场景实测火山原生打断：

```text
用户要求长回答
模型开始说
用户插话：“停，改成一句话”
记录 raw events
```

观察：

- `ASRInfo` 后旧 `reply_id` 是否继续产生 `TTSResponse`。
- 是否出现新的 `question_id/reply_id`。
- 新 `ChatResponse` 是否理解插话。
- `ChatEnded/TTSEnded` 顺序是否干净。

结论规则：

- 旧 `reply_id` 停止，且新回复自然：只保留前端清播放。
- 旧 `reply_id` 继续吐音频：后端按 reply_id 丢弃旧音频。
- 新旧语义混杂：Planner 重规划介入。
- `515 ClientInterrupt` 能稳定停止服务端输出：再考虑启用。

## 工具调用中的打断

如果用户在工具运行中插话：

```text
ASRInfo
-> 停播当前 tool_started 或旧回复
-> running tool_call 标记为 possibly_superseded
ASREnded
-> Planner 根据新 transcript 判断：
   - 保留旧工具结果，稍后播报
   - 取消/忽略旧工具结果
   - 用新意图覆盖旧工具
```

工具真实执行是否取消取决于工具能力；但工具结果是否投递给语音模型，必须由 `tool_call_id + turn_id + Planner` 决定。

## 局限

`ASRInfo` 可能由噪声、咳嗽或背景人声触发，导致误停播。demo 阶段接受优先级：宁可偶尔误停，也不要用户说话时旧音频继续播。

后续可加：

- `ASRInfo + 前端音量阈值`
- `ASRInfo 后短时间内必须有非空 ASRResponse`
- 后端按 `reply_id` 丢弃旧 TTS 音频
- 实测可用后发送 `515 ClientInterrupt`
- 回声消除和播放侧 ducking
- 误触发统计
