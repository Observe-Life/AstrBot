#!/usr/bin/env bash
# 一键打/撤「MCP 会话失效自动重连」补丁（可重复执行，幂等）
#
# 用法：
#   ./apply.sh                     # 目标默认 /AstrBot（在 AstrBot 容器内执行时用）
#   ./apply.sh /path/to/AstrBot    # 给某个源码目录打
#   ./apply.sh --revert [目标]      # 撤销补丁
#
# 打完必须**重启 AstrBot 进程**才生效（Python 模块已加载，改文件不会热更新）。
#
# 容器场景示例（在飞牛宿主机上）：
#   docker cp patches astrbot:/root/patches
#   docker exec astrbot bash /root/patches/apply.sh /AstrBot
#   docker restart astrbot

set -euo pipefail

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCH_FILE="$PATCH_DIR/mcp-client-reconnect.patch"
TARGET_FILE_REL="astrbot/core/agent/mcp_client.py"
MARKER="fork-patch: mcp-reconnect-on-session-invalid"

REVERT=0
if [ "${1:-}" = "--revert" ]; then
  REVERT=1
  shift
fi
TARGET="${1:-/AstrBot}"

if [ ! -f "$TARGET/$TARGET_FILE_REL" ]; then
  echo "错误：找不到 $TARGET/$TARGET_FILE_REL（请把 AstrBot 目录作为第一个参数传入）" >&2
  exit 1
fi

if [ "$REVERT" = "1" ]; then
  patch -p1 -R -d "$TARGET" < "$PATCH_FILE"
  echo "已撤销补丁；重启 AstrBot 后恢复官方行为。"
  exit 0
fi

if grep -q "$MARKER" "$TARGET/$TARGET_FILE_REL"; then
  echo "补丁已存在，跳过（未做任何改动）。"
  exit 0
fi

BACKUP="$TARGET/$TARGET_FILE_REL.bak.$(date +%Y%m%d_%H%M%S)"
cp "$TARGET/$TARGET_FILE_REL" "$BACKUP"
echo "已备份：$BACKUP"

patch -p1 -d "$TARGET" < "$PATCH_FILE"
echo "补丁已应用。提醒：必须重启 AstrBot 进程才生效。"
