#!/bin/sh
# ボールの画像（PokeAPI の道具のドット絵）を取ってきて、pokemon-plus と pokemon-spaces の balls/ に置く。
# 余白を切って 24x24 の中央に置き、ドットのまま 2 倍（48x48）にする。curl と ImageMagick（magick）が必要。
# 使い方: sh get-balls.sh [Herdr のホーム]（省略時は ~/.config/herdr-app）
set -e
HOME_DIR=${1:-$HOME/.config/herdr-app}
BASE=https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items
BALLS="poke-ball great-ball ultra-ball master-ball premier-ball safari-ball dive-ball net-ball nest-ball
repeat-ball timer-ball luxury-ball dusk-ball heal-ball quick-ball cherish-ball friend-ball love-ball
moon-ball level-ball lure-ball heavy-ball fast-ball sport-ball dream-ball beast-ball"

for mod in pokemon-plus pokemon-spaces; do
  dir="$HOME_DIR/mods/$mod/balls"
  mkdir -p "$dir"
  for b in $BALLS; do
    curl -sfL --retry 2 -o "$dir/$b.png" "$BASE/$b.png"
    magick "$dir/$b.png" -trim +repage -background none -gravity center -extent 24x24 -scale 200% "$dir/$b.png"
  done
  echo "$dir: $(ls "$dir" | wc -l | tr -d ' ') 個"
done
