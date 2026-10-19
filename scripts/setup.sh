#!/usr/bin/env bash
# 開発の準備を1コマンドで行う。人も、どの AI も同じ手順で動かせるようにするためのもの。何度実行してもよい。
#   使い方: bash scripts/setup.sh   （Windows は Git Bash で）
# Claude Code のクラウドセッションでは .claude/settings.json の SessionStart フックが自動で呼ぶ。
# CI の Setup check（共通部品 satou-aaaaa/shared-workflows）が、まっさらな環境でこれが通るかを確かめる。
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "✗ $*" >&2; exit 1; }
# 環境変数をクラウドセッションの以後のコマンドに渡す（ほかの環境では何もしない）
session_env() { if [ -n "${CLAUDE_ENV_FILE:-}" ]; then echo "export $1" >> "$CLAUDE_ENV_FILE"; fi; }

# Node.js（版は .nvmrc。nvm・fnm・mise・Volta などはこのファイルを読む）
want=$(tr -dc '0-9' < .nvmrc)
command -v node >/dev/null || fail "Node.js $want が要る（https://nodejs.org/ か、nvm・fnm で .nvmrc の版を入れる）"
have=$(node -p 'process.versions.node.split(".")[0]')
[ "$have" -ge "$want" ] || fail "Node.js $want 以上が要る（今は $have）"

# npm の依存。node_modules が lock より新しければ飛ばす
if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  (npm ci --no-audit --no-fund)
fi

# Playwright のブラウザ。PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 の環境（Claude Code のクラウドなど）は入っているものを使う
if [ "${PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:-}" = 1 ]; then
  if [ -x /opt/pw-browsers/chromium ]; then session_env "CHROMIUM_PATH=/opt/pw-browsers/chromium"; fi
else
  (npx playwright install chromium)
fi

echo "✓ 準備できた。次は: node tools/check.mjs --browser --rebuild"
