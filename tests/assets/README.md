# Realtime Audio Fixtures

这些 fixture 用来把真实浏览器说话流程变成可复用回归测试：

```sh
npm run fixtures:audio
npm run test:realtime-fixtures
```

`scenarios.json` 是事实来源。`*.wav` 是 24kHz mono `pcm_s16le`，会被测试脚本按 100ms chunk 发送到 `/api/realtime`，模拟应用端麦克风输入。

默认 `npm test` 不调用火山实时模型，只校验 fixture 配置和本地规则。真实模型回归需要显式运行 `npm run test:realtime-fixtures`，因为它依赖 `.env`、网络和外部服务稳定性。
