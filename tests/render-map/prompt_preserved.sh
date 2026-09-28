#!/usr/bin/env bash
# BM_KEEP_PROMPT_RUN: a headless prompt still builds the map before the model step.
set -euo pipefail
bin=$1; tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/home/.soulforge" "$tmp/repo/src"
printf '{"defaultModel":"openai/gpt-4o-mini","telemetry":false,"onboardingComplete":true,"semanticSummaries":"synthetic"}\n' > "$tmp/home/.soulforge/config.json"
cd "$tmp/repo" && git init -q && printf 'def a():\n    return 1\n' > src/a.py && git add -A && git -c user.email=t@e -c user.name=t commit -qm init
HOME=$tmp/home OPENAI_API_KEY=x OPENAI_BASE_URL=http://127.0.0.1:9 "$bin" --headless --quiet --no-render --timeout 1 "Reply exactly: OK" >/dev/null 2>&1 || { echo "PROMPT_RUN_CHANGED: exit $?"; exit 1; }
rows=$(python3 -c "import sqlite3;print(sqlite3.connect('file:.soulforge/repomap.db?mode=ro',uri=True).execute('select count(*) from files').fetchone()[0])")
[ "$rows" -ge 1 ] || { echo "PROMPT_RUN_CHANGED: files rows $rows"; exit 1; }
echo OK
