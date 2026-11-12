#!/bin/sh
# Claude Code のステータスライン
# rate_limits とセッションの情報を Herdr のステータスバー用に保存し、要約を1行で表示する
DIR="$HOME/.claude/herdr-usage"
input=$(cat)
now=$(date +%s)
mkdir -p "$DIR/sessions"

# 一時ファイル経由で書き換えて、読み途中の壊れた JSON を防ぐ
save() { cat > "$1.tmp" && mv "$1.tmp" "$1"; }

# rate_limits があるときだけ保存
limits=$(printf '%s' "$input" | jq -c '.rate_limits // empty' 2>/dev/null)
if [ -n "$limits" ]; then
  printf '%s' "$limits" | jq -c --argjson now "$now" '. + {updated_at: $now}' | save "$DIR/usage.json"
fi

# セッションごとの情報。メッセージ数と圧縮回数は会話ログから数える（数だけ取り出す）
id=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)
case "$id" in '' | *[!0-9a-zA-Z-]*) id= ;; esac
if [ -n "$id" ]; then
  transcript=$(printf '%s' "$input" | jq -r '.transcript_path // empty')
  counts="0 0"
  if [ -f "$transcript" ]; then
    counts=$(awk '
      /"type":"user"/ && /"isSidechain":false/ && !/"isMeta":true/ && !/"isCompactSummary":true/ && !/"type":"tool_result"/ { calls++ }
      /"subtype":"compact_boundary"/ { compactions++ }
      END { print calls + 0, compactions + 0 }' "$transcript")
  fi
  set -- $counts
  # HC_TERMINAL_ID: Herdr がターミナルごとに付ける id（Herdr の外では空）。フォーカス中のペインとの突き合わせに使う
  printf '%s' "$input" | jq -c --argjson now "$now" --argjson calls "$1" --argjson compactions "$2" --arg terminal "${HC_TERMINAL_ID:-}" '{
    session_id, name: .session_name, cwd, terminal: ($terminal | if . == "" then null else . end),
    project: ((.workspace.project_dir // .cwd // "") | split("/") | last),
    model: .model.display_name, effort: .effort.level,
    ctx: (.context_window | if . then {
      used: ((.current_usage // {}) | (.input_tokens // 0) + (.cache_creation_input_tokens // 0) + (.cache_read_input_tokens // 0)),
      size: .context_window_size, percent: .used_percentage
    } else null end),
    cost_usd: .cost.total_cost_usd, duration_ms: .cost.total_duration_ms,
    lines_added: .cost.total_lines_added, lines_removed: .cost.total_lines_removed,
    calls: $calls, compactions: $compactions, updated_at: $now
  }' | save "$DIR/sessions/$id.json"
  # 1週間触っていないセッションは消す
  find "$DIR/sessions" -name '*.json' -mtime +7 -delete 2>/dev/null
fi

# Claude Code 側の表示
printf '%s' "$input" | jq -r '
  def pct(w): if w then "\(w.used_percentage | floor)%" else "-" end;
  [ (if .rate_limits then "5h \(pct(.rate_limits.five_hour)) · wk \(pct(.rate_limits.seven_day))" else empty end),
    (if .context_window.used_percentage != null then "ctx \(.context_window.used_percentage | floor)%" else empty end),
    (.model.display_name // empty)
  ] | join(" · ")
'
