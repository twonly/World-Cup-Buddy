#!/usr/bin/env bash
# transparent.sh —— 一键给 characters/ 下所有 PNG 去白底
#
# 用法:
#   ./transparent.sh                              # 处理世界杯 Buddy 自带的 characters 目录
#   ./transparent.sh /path/to/source/flags        # 处理自定义目录(导入前清洗)
#
# 处理前会自动备份到同级 <dir>_backup_YYYYMMDD_HHMMSS 目录

set -euo pipefail

# Clash 代理会拦 pip / onnx 模型下载,先关掉
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY all_proxy ALL_PROXY

# ---------- 1. 定位目录 ----------
DEFAULT_DIR="$HOME/Library/Application Support/World Cup Buddy/characters"
CHAR_DIR="${1:-$DEFAULT_DIR}"

if [[ ! -d "$CHAR_DIR" ]]; then
  echo "❌ 找不到目录: $CHAR_DIR"
  echo ""
  echo "可能原因:"
  echo "  1. 还没启动过世界杯 Buddy(启动一次就会创建)"
  echo "  2. 想处理别的目录: ./transparent.sh /your/folder"
  exit 1
fi

# ---------- 2. 检查 rembg ----------
if ! command -v rembg &>/dev/null; then
  echo "🔧 rembg 没装,正在用清华源安装..."
  if ! command -v pip3 &>/dev/null; then
    echo "❌ 系统没找到 pip3,请先装 Python 3"
    echo "   brew install python"
    exit 1
  fi
  pip3 install --user \
    -i https://pypi.tuna.tsinghua.edu.cn/simple \
    "rembg[cli]" onnxruntime || {
      echo "❌ 安装失败,手动跑一次试试:"
      echo "   pip3 install 'rembg[cli]' onnxruntime"
      exit 1
    }
  # pip --user 装的可执行文件不一定在 PATH 里
  export PATH="$HOME/Library/Python/3.11/bin:$HOME/Library/Python/3.12/bin:$HOME/Library/Python/3.13/bin:$PATH"
  if ! command -v rembg &>/dev/null; then
    echo "⚠️  装好了但 rembg 不在 PATH,试试重开终端,或:"
    echo "   export PATH=\"\$(python3 -m site --user-base)/bin:\$PATH\""
    exit 1
  fi
fi

# ---------- 3. 备份 ----------
TS=$(date +%Y%m%d_%H%M%S)
BACKUP="${CHAR_DIR}_backup_${TS}"
echo "💾 备份原始目录到:"
echo "   $BACKUP"
cp -R "$CHAR_DIR" "$BACKUP"

# ---------- 4. 扫描 + 处理 ----------
echo ""
echo "🔍 扫描 PNG 文件..."
PNG_LIST=()
while IFS= read -r -d '' f; do
  PNG_LIST+=("$f")
done < <(find "$CHAR_DIR" -type f -iname "*.png" -print0)

TOTAL=${#PNG_LIST[@]}
if [[ $TOTAL -eq 0 ]]; then
  echo "🤷 一张 PNG 也没找到,什么都不干"
  rm -rf "$BACKUP"
  exit 0
fi
echo "📦 共 $TOTAL 张 PNG 待处理"
echo "ℹ️  第一次运行会下载 ~100MB 模型,稍等"
echo ""

OK=0
FAIL=0
i=0
for png in "${PNG_LIST[@]}"; do
  i=$((i + 1))
  rel="${png#$CHAR_DIR/}"
  printf "  [%2d/%d] %s ... " "$i" "$TOTAL" "$rel"
  TMP="${png}.rembg.tmp.png"
  if rembg i "$png" "$TMP" 2>/dev/null && [[ -s "$TMP" ]]; then
    mv "$TMP" "$png"
    OK=$((OK + 1))
    echo "✓"
  else
    rm -f "$TMP"
    FAIL=$((FAIL + 1))
    echo "✗"
  fi
done

# ---------- 5. 汇总 ----------
echo ""
echo "================================="
echo "✅ 成功: $OK 张"
[[ $FAIL -gt 0 ]] && echo "⚠️  失败: $FAIL 张 (原文件未动)"
echo "💾 备份在: $BACKUP"
echo ""
echo "⚽ 重启世界杯 Buddy 即可看到透明效果"
echo "   不满意可直接覆盖回备份: cp -R \"$BACKUP\"/* \"$CHAR_DIR\"/"
