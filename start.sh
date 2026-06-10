#!/bin/bash
# 球迷虾仔 一键启动脚本
# 用法: ./start.sh

set -e
cd "$(dirname "$0")"

# 关键：本地资源走直连，绕开系统代理
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY

# 编译 Electron 主进程
echo "→ 编译 Electron TypeScript..."
npx tsc -p electron

# 后台启 Vite 渲染层
echo "→ 启动 Vite 渲染层 (localhost:5173)..."
npx vite > /tmp/fanshrimp-vite.log 2>&1 &
VITE_PID=$!

# 等 Vite 起来
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf --noproxy '*' -m 1 http://localhost:5173/ > /dev/null 2>&1; then
    echo "  ✓ Vite ready"
    break
  fi
  sleep 0.5
done

# 启 Electron
echo "→ 启动 Electron 主进程..."
NODE_ENV=development ./node_modules/.bin/electron .

# 收尾：关掉 vite
echo "→ 退出，清理 Vite..."
kill $VITE_PID 2>/dev/null || true
