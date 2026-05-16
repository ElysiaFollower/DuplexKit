#!/usr/bin/env sh
# 职责：初始化本地项目 harness，并运行最便宜且可靠的 sanity checks。
# 边界：不要安装全局工具、写入密钥、启动长运行服务，或意外修改项目源码。

set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$repo_root"

echo "项目：效果上全双工的语音交互 demo"
echo "技术栈：Node.js + TypeScript + Fastify + 浏览器 MediaRecorder/Web Audio"

if [ -x "./scripts/harness-check.sh" ]; then
  ./scripts/harness-check.sh
else
  echo "缺少可执行文件 scripts/harness-check.sh"
fi

cat <<'EOF'

启动命令：
npm run dev

聚焦验证：
npm test

完整验证：
npm run build
EOF
