<!--
职责：定义金工小子适配版 APK 的真机端到端验收任务。
边界：不记录原始日志；稳定协议写 docs，过程结果写 progress 和 feature_list evidence。
-->

# 金工小子真机端到端验收

## 目标

在已通过 USB/ADB 连接的 Android 手机上安装金工小子适配版 APK，启动 DuplexKit 后端，验证手机端能打开 app、能连接本机 `/api/realtime`，并优先使用后端命令行 debug fixture 注入预录音频完成文本、音频和工具调用链路验收。麦克风权限只作为后续人工语音路径，不作为自动化功能测试前置条件。

## 非目标

- 不改 DuplexKit 后端协议。
- 不重构金工小子 app 或重新设计 UI。
- 不做 release 签名包、上架或长期部署。
- 不把真机人工语音验收伪装成自动化已完成。

## 当前仓库事实

- 入口规则：`AGENTS.md`
- 初始化契约：`harness/bootstrap-contract.md`
- 当前功能项：F010
- 相关文件/模块：`apps/jingongxiaozi/`、`src/server.ts`、`docs/integration/frontend-protocol.md`、`harness/session-handoff.md`
- 已知约束：手机端连接 `ws://<Mac IP>:5177/api/realtime`；上行 24kHz mono `pcm_s16le`；下行 24kHz mono `pcm_f32le`；预录测试音频由后端 `POST /api/debug/realtime-fixture` 从 `tests/assets/*.wav` 读取 WAV data chunk 后按 100ms PCM 帧注入当前 app realtime session。

## 允许改动

- 更新 harness 记录、过程日志、验收文档。
- 如发现只影响真机启动/安装的轻量配置问题，可做最小修复并验证。

## 禁止改动

- 不覆盖或回滚既有未提交改动。
- 不删除 `mobile-demo/` 或金工小子 submodule 本地适配。
- 不提交密钥、真实运行日志、APK 缓存或 node_modules。

## 验收标准

- ADB 识别手机且设备状态为 `device`。
- 金工小子适配版 APK 成功安装到手机。
- app 可不依赖麦克风权限，通过后端命令行 debug fixture 把预录音频注入当前 `/api/realtime` session。
- DuplexKit 后端在本机启动并监听 `0.0.0.0:5177` 或等效可被手机访问的地址。
- app 可启动到前台；若无法自动完成语音交互，记录明确阻塞点和用户下一步操作。

## 关键锚点

配套检查文件：`plans/checks/2026-06-13-jingongxiaozi-device-acceptance.check.json`

- ADB 设备信息：证明真机可操作。
- APK 安装/权限检查：证明手机上运行的是金工小子适配版。
- 后端启动日志和端口检查：证明服务端验收条件已建立。
- 过程记录：证明用户回饭后能继续验收，不需要重新侦探式排查。

## 验证命令

```sh
./scripts/harness-check.sh
adb devices -l
adb install -r apps/jingongxiaozi/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
adb shell pm list packages | rg cn.edu.zju.jingongxiaozi
adb reverse tcp:5177 tcp:5177
nohup node dist/server.js > logs/device-acceptance/2026-06-13-backend-node.log 2>&1 &
curl http://127.0.0.1:5177/api/health
```

## Evidence 记录要求

验证通过后，将命令、结果、关键输出摘要、设备型号、APK 路径、后端 PID/日志路径和未自动完成的人工步骤写入 `harness/feature_list.json` 的 `evidence`。

## 完成定义

- 请求行为已执行到可自动验证的最大程度。
- 非目标没有被触碰。
- 关键锚点已满足，或阻塞点有明确证据。
- 上方验证命令已运行；未运行的命令说明原因。
- `harness/feature_list.json` 状态和 evidence 已更新。
- `harness/session-handoff.md` 写明当前状态、风险和下一步。
- 清洁状态检查已说明。

## 阻塞条件

- ADB 设备丢失或变为 `unauthorized`。
- APK 安装失败且错误不是可局部修复的签名/ABI/权限问题。
- 手机厂商安装器要求用户登录、解锁或手动确认，自动化无法继续。
- 后端缺少必需环境变量或火山实时服务不可用。
- 手机端需要用户手动授权、点击或说话才能继续。

## 下一步最佳动作

1. 启动后端并保持 `node dist/server.js` 监听 `5177`。
2. 设置 `adb reverse tcp:5177 tcp:5177`，打开 app，点击浮动控制条 `连接后端`。
3. 通过命令行运行 `npm run debug:realtime-fixture -- open-map`、`navigate-beijing-south`、`smalltalk-no-tool`、`cancel-no-running-tool`。
4. 自动化 fixture 通过后，通知用户进行真实手机麦克风采集测试。
