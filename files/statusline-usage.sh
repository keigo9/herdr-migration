#!/bin/sh
# Claude Code のステータスライン
# rate_limits を Herdr のステータスバー用に保存し、同じ内容を1行で表示する
DIR="$HOME/.claude/herdr-usage"
input=$(cat)

# rate_limits があるときだけ保存（一時ファイル経由で書き換えて、読み途中の壊れた JSON を防ぐ）
limits=$(printf '%s' "$input" | jq -c '.rate_limits // empty' 2>/dev/null)
if [ -n "$limits" ]; then
  mkdir -p "$DIR"
  printf '%s' "$limits" | jq -c --argjson now "$(date +%s)" '. + {updated_at: $now}' > "$DIR/usage.json.tmp" \
    && mv "$DIR/usage.json.tmp" "$DIR/usage.json"
fi

# Claude Code 側の表示
printf '%s' "$input" | jq -r '
  def pct(w): if w then "\(w.used_percentage | floor)%" else "-" end;
  if .rate_limits then "5h \(pct(.rate_limits.five_hour)) · 週 \(pct(.rate_limits.seven_day))"
  else (.model.display_name // "") end
'
