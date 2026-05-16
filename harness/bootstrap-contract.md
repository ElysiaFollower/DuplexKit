<!--
职责：定义本项目被新 agent 无歧义接手的初始化契约。
边界：不要记录业务实现进度；进度放 progress.md，具体任务放 plans/active/。
-->

# 初始化契约

## 自举条件

- 能启动：`npm run dev`
- 能测试：`npm test`
- 能看进度：`harness/progress.md` 和 `harness/feature_list.json`
- 能接手下一步：`harness/session-handoff.md` 和 `plans/active/`

## 环境

- 技术栈：Node.js + TypeScript + Fastify + 原生浏览器 MediaRecorder/Web Audio。
- 运行时版本：Node.js 20+。
- 依赖安装：`npm install`。
- 本地服务：`npm run dev` 启动 HTTP 服务，默认监听 `http://localhost:5177`。

## 标准命令

```sh
npm install
npm run dev
npm test
npm run build
npm run smoke:mock
```

## 初始化验收清单

- [ ] 从干净 checkout 可安装依赖。
- [ ] 项目能启动或明确说明为什么不能启动。
- [ ] 至少一个可靠验证命令能运行。
- [ ] `./scripts/harness-check.sh` 通过。
- [ ] 新 agent 只看仓库能回答：是什么、怎么跑、怎么测、当前进度、下一步。

## 已知缺口

- 业务代码尚未实现；初始化阶段只建立可恢复 harness。
- API 环境变量需要从 `/Users/ely/workspace/research/agent/DreamingRAG/.env` 复制到本仓库 `.env`，但不得提交密钥。
