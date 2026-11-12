# Herdr 環境の再現手順（エージェント向け）

別の PC の Herdr デスクトップアプリに、元の PC と同じカスタマイズを入れてほしい。
このリポジトリの `files/` に、GitHub にないファイルが入っている。

## ゴール

- レイアウト **glass** を使い、色は **glass-onedark** テーマ（One Dark 系の不透明な色）
- タブバーに **Graph** ボタン（git-graph）
- サイドバーは **pixel-spaces**（スペースごとのドット絵スプライト、ヘッダーのベル、`cmd-p` で pixel 版ピッカー、Codex だけピクセルアイコン。Claude Code のアイコンは Herdr 標準のまま）
- ステータスバー右側に **Claude の usage**（5h 枠・週枠・コンテキストの使用率。マウスを乗せるとリセットまでの時間とセッションの情報）

## 前提

- Herdr のホームは `~/.config/herdr-app`（環境変数 `HERDR_APP_HOME` があればそちら）
- `herdr-app` CLI、`git`、`jq` が使えること。`jq` がなければ `brew install jq`
- `~/.config/herdr-app/AGENTS.md` が Herdr 公式の説明書。迷ったらまず読むこと
- 元の PC の Herdr は 0.1.12。バージョンが違う場合は差分に注意する

## 守ること

- GitHub から取ってきたコードは、コピーする前に中身を読んで、何をするか（`exec`、`fetch`、ファイル書き込み）をユーザーに伝える
- **mod を新しく作るときは `mod.json` を先に置く**か `herdr-app do mod.clone` を使う。`main.js` だけ先に置くと、Herdr がそのとき開いているレイアウトに mod を自動で追加してしまう
- `layouts/.state/` は Herdr が管理するファイルなので編集しない
- `keys.json`、`programs.json`、`~/.claude/settings.json` は**丸ごと上書きせずマージ**する
- Herdr 本体の mod（`spaces`、`tabs`、`workspace-status` など）は直接編集しない

## 手順

### 1. glass レイアウト

```sh
git clone https://github.com/MarcozVD/herdr-layout-glass
cp -R herdr-layout-glass/{layouts,themes,backgrounds,mods} ~/.config/herdr-app/
```

`mods/spaces-icons` と `mods/tabs-graph` が入る。`spaces-icons` は手順 6 で使わなくなるが、入れておいてよい。

### 2. git-graph（Graph ボタン）

```sh
git clone https://github.com/rabeeh-ta/herdr-git-graph
cp -R herdr-git-graph/mods/git-graph ~/.config/herdr-app/mods/
```

`mods/git-graph/update.js` が GitHub の API に新しいリリースがないか見に行くことを、ユーザーに伝える。

### 3. pixel-spaces

```sh
git clone https://github.com/pilmokim/herdr-pixel-spaces
cd herdr-pixel-spaces
cp -R mods/pixel-spaces mods/pixel-picker mods/pixel-chrome ~/.config/herdr-app/mods/
cp -R pixel-icons ~/.config/herdr-app/
```

`layouts/main-pixel.json` は使わない（glass に組み込むため）。

- `~/.config/herdr-app/programs.json` に **codex の行だけ**マージする（claude の行は入れない）:
  ```json
  { "programs": { "codex": { "icon": "pixel-icons/codex.svg", "tint": false } } }
  ```
- `~/.config/herdr-app/keys.json` の `global` で `cmd-p` を `mod.open:pixel-picker` にする（ほかのキーはそのまま）

### 4. glass-onedark テーマ

`files/glass-onedark.json` を `~/.config/herdr-app/themes/glass-onedark.json` にコピーする。
glass テーマの色を One Dark の不透明な色（サイドバー・タブバー `#21252b`、ペイン `#282c34`）に変えたもの。

### 5. usage-status mod

Herdr 本体の `workspace-status` をコピーしてから、`main.js` を差し替える:

```sh
herdr-app do mod.clone '{"name":"workspace-status","as":"usage-status"}'
cp files/usage-status/main.js ~/.config/herdr-app/mods/usage-status/main.js
```

`main.js` は `~/.claude/herdr-usage/` の `usage.json` と `sessions/*.json`（手順 7 のスクリプトが書く）を 10 秒ごとに読み、ステータスバーの右に表示する（見た目は [VladTemp27/herdr-mods の usage-limits](https://github.com/VladTemp27/herdr-mods/tree/main/usage-limits) に寄せた。コードはコピーしていない）:

- **バー**: `Used ▬ 5h 38% · wk 54% · ctx 17%`。70% から黄（`ansi3`）、90% から赤（`ansi1`）。リセット時刻を過ぎた枠は `—`
- **ホバーパネル**: `5-hour` / `Weekly` の行（バー・使用率・リセットまでの時間）と **This session**（プロジェクト・セッション名、コンテキストのバー、`169k of 1M tokens · 22 calls · 0 compactions`、モデル・effort・コスト・経過時間・増減行数）
- セッションは、フォーカス中のターミナルのもの（ステータスラインが保存した `HC_TERMINAL_ID` で突き合わせる）。エージェントでないペインなら、同じフォルダで最新、それもなければ全体で最新

元になった `workspace-status` は Herdr 0.1.12 のもの。バージョンが違うなら、クローンした新しい `main.js` と見比べて、usage の部分だけ移植する。追加したのは、`import` の `v_flex, HoverCard`・`home, readTextFile, focused`・`fs/promises`、定数とヘルパー関数（`USAGE_DIR` 〜 `windowPct`）、`init` / `load` / `parse` / `session` / `usageBar` / `panel` メソッド、`render` 内の `session` / `usage` と `HoverCard` の部分。

### 6. glass レイアウトに組み込む

`~/.config/herdr-app/layouts/glass.json` の 3 つのブロックの `content.mod` を変える:

| ブロックの `id` | 変更前 | 変更後 |
|---|---|---|
| `brand` | `workspace-chrome` | `pixel-chrome` |
| `spaces` | `spaces-icons` | `pixel-spaces` |
| `status` | `workspace-status` | `usage-status` |

`sidebar-footer` の `workspace-chrome` はそのまま。

### 7. Claude Code のステータスライン

```sh
cp files/statusline-usage.sh ~/.claude/statusline-usage.sh
```

`~/.claude/settings.json` に次をマージする（既存の設定は残す）:

```json
"statusLine": { "type": "command", "command": "sh ~/.claude/statusline-usage.sh" }
```

このスクリプトは、Claude Code から渡される JSON から次を保存し、Claude Code の画面下に `5h 12% · wk 2% · ctx 17% · Opus 5.5` を表示する（`jq` を使う）:

- `~/.claude/herdr-usage/usage.json`: `rate_limits`（5h 枠と週枠）
- `~/.claude/herdr-usage/sessions/<セッション id>.json`: Herdr のターミナル id（`HC_TERMINAL_ID`）・モデル・effort・コンテキスト・コスト・経過時間・増減行数と、会話ログ（`transcript_path`）から数えたメッセージ数・圧縮回数（数だけ取り出す）。1 週間更新のないファイルは消す

`rate_limits` は claude.ai の Pro / Max / Ultra プランで、セッションの最初の返事のあとにだけ届く。
ステータスラインを設定すると、Claude Code の画面下の `esc to interrupt` などのヒントは表示されなくなる。

### 8. 切り替えとテーマ

```sh
herdr-app do layout.switch '{"name":"glass"}'
herdr-app do app.theme '{"name":"glass-onedark"}'
```

`app.theme` は、今開いているレイアウトにテーマを設定する。だから必ず glass に切り替えてから実行する。

## 確認

- `~/.config/herdr-app` で `herdr-app check mods/<名前>` を実行し、`spaces-icons` `tabs-graph` `git-graph` `pixel-spaces` `pixel-picker` `pixel-chrome` `usage-status` がすべて通る
- `herdr-app status` で `"layout": "glass"`、`"errors": []`
- `herdr-app shot <パス>.png` でスクショを撮り、次を確認する:
  - サイドバー・タブバーの色が `#21252b`、ペインが `#282c34`
  - タブバー右に Files / Changes / **Graph**
  - スペースの左にドット絵のスプライト、ヘッダーに Herdr のロゴがない
  - Claude Code を一度動かしたあと、ステータスバー右に `Used ▬ 5h ◯% · wk ◯% · ctx ◯%`。マウスを乗せるとパネルが開く
- 終わったら、変えたファイルと確認結果をユーザーに報告する

## 別テーマ: moonlit（夜空）

glass と同じ構成のまま、背景をドット絵の夜空（紺のグラデーション、三日月、星、角ばった雲）に、色を紺の半透明にした別レイアウト。
ペインが半透明なので、ターミナルの後ろに夜空が透けて見える。背景は止まった絵（Herdr は背景の GIF を動かさない）。
上の手順 1〜8 を終えてから行う。

### 1. ファイルを置く

```sh
cp files/moonlit/moonlit.json ~/.config/herdr-app/themes/moonlit.json
cp files/moonlit/moonlit.png ~/.config/herdr-app/backgrounds/moonlit.png
cp files/moonlit/moonlit-preview.png ~/.config/herdr-app/layouts/moonlit.png
```

- `themes/moonlit.json`: glass テーマを元に、`background` を `#0d1433`、`colors` を紺の半透明（ペイン `#0d143370`、サイドバー・バー `#0d143399` など）にしたもの
- `backgrounds/moonlit.png`: 1600×1000 の背景。`files/moonlit/make-background.py` で作り直せる（`python3 -I make-background.py <出力パス> [拡大率]`、標準ライブラリだけで動く）
- `layouts/moonlit.png`: 設定画面に出る見本の画像

### 2. レイアウトを作る

手順 6 を終えた `layouts/glass.json` をコピーして `layouts/moonlit.json` にし、トップレベルの 3 つの値だけ変える:

| キー | glass | moonlit |
|---|---|---|
| `theme` | `glass` | `moonlit` |
| `background.image` | `backgrounds/glass-ambient.png` | `backgrounds/moonlit.png` |
| `preview` | `layouts/glass.png` | `layouts/moonlit.png` |

ほかは glass と同じにする（mod の差し替えもそのまま引き継がれる）。

### 3. 切り替える

```sh
herdr-app do layout.switch '{"name":"moonlit"}'
herdr-app do app.theme '{"name":"moonlit"}'
```

`cmd-shift-l` で glass と行き来できる。

### 確認

- `herdr-app status` で `"layout": "moonlit"`、`"errors": []`
- スクショで、カードのすき間に紺の夜空と月が見え、ペインの後ろにも夜空がうっすら透けている

## 別テーマ: pokemon-plus（ポケモン）

エージェント 1 体ごとにポケモンが 1 匹付き、画面下の帯を歩き回るレイアウト。Herdr 標準の main をもとにしている（glass・moonlit とは別系統なので、上の手順 1〜8 をしていなくても入れられる）。
[mathieucroset/herdr-pokemon-agents](https://github.com/mathieucroset/herdr-pokemon-agents) を元に、[SaifHarding/herdr-pokemon-agents-plus](https://github.com/SaifHarding/herdr-pokemon-agents-plus) の顔と鳴き声を取り入れ、ポケモンを増やしたもの。

- **画面下の帯**: 作業中は歩き、待機中はぶらついて 3 分で眠り、入力待ちは止まって `!`、完了は `✓`。クリックでそのエージェントへ、右クリック（または `alt-shift-p`）でポケモンを選ぶ画面
- **ポケモン**: PMD SpriteCollab に歩くアニメがある 974 匹（第 1〜9 世代）。名前は日本語。選ぶ画面は世代ごとのタブと、日本語名・英語名・番号の検索
- **上のタブ**: そのタブのエージェントのポケモンのアイコン（第 7 世代までは PokeAPI のメニューアイコン、第 8 世代以降は正面の絵を縮めたもの）
- **エージェント一覧**: ポケモンの顔。作業中は真剣、入力待ちは困り顔、完了はニコニコ
- **Spaces**: スペースごとにランダムなボール（26 種類、一巡するまで重ならない）
- **読み込み中**: ポケモンの絵ができるまで、ランダムなボールが点滅して待つ
- **配色**: `pokedex`（クリーム色の地にモンスターボールの赤。OS がダークモードのときは Herdr 標準の graphite）
- **2 つのレイアウト**: `pokemon-plus` は鳴き声あり（入力待ちで鳴く。完了でも鳴く）、`pokemon-plus-quiet` は鳴き声なし。それ以外は同じ

### 前提

- ImageMagick（`magick`）が必要。なければ `brew install imagemagick`。ないとポケモンがボールのまま
- 鳴き声には ffmpeg を使う（`brew install ffmpeg`）。鳴き声は元の 25%、完了時の高く短い声はその半分の音量で鳴る。ffmpeg がないと、どちらも元の音量の普通の鳴き声で鳴ってうるさい
  - 音量は `mods/pokemon-plus/sprites.js` の `CRY_VOLUME`（0.25）で変えられる。ファイル名に音量が入るので（`<番号>-quiet-0.25.mp3`）、変えると次に鳴くときに作り直される
- pokedex は明るい配色なので、Claude Code の `/theme` を `auto`（または Light 系）にする。ダーク用のテーマのままだと、確認画面などの白い文字が見えない
- 元の PC の Herdr は 0.1.15

### 通信すること（入れる前にユーザーに伝える）

ポケモンやボールの絵・鳴き声はこのリポジトリに入っていない（任天堂などの著作物のため）。使うときにダウンロードして `~/.config/herdr-app/data/pokemon-plus/` に保存する。送るデータはない。

- raw.githubusercontent.com: PMDCollab/SpriteCollab（歩く絵と顔）、PokeAPI/sprites（アイコンとボール）
- play.pokemonshowdown.com: 鳴き声（`pokemon-plus` レイアウトのときだけ）
- 実行するプログラム: `curl`、ImageMagick、ffmpeg、`mv`、`rm`

### 1. 配色と mod を置く

```sh
H=~/.config/herdr-app
cp files/pokemon-plus/pokedex.json $H/themes/pokedex.json

mkdir -p $H/mods/pokemon-plus
cp files/pokemon-plus/pokemon-plus/mod.json $H/mods/pokemon-plus/   # mod.json を先に置く
cp files/pokemon-plus/pokemon-plus/{main.js,sprites.js,dex.js} $H/mods/pokemon-plus/

herdr-app do mod.clone '{"name":"tabs","as":"pokemon-tabs"}'
herdr-app do mod.clone '{"name":"agents","as":"pokemon-agents-list"}'
herdr-app do mod.clone '{"name":"spaces","as":"pokemon-spaces"}'
cp files/pokemon-plus/pokemon-tabs/main.js $H/mods/pokemon-tabs/main.js
cp files/pokemon-plus/pokemon-agents-list/main.js $H/mods/pokemon-agents-list/main.js
cp files/pokemon-plus/pokemon-spaces/main.js $H/mods/pokemon-spaces/main.js

sh files/pokemon-plus/get-balls.sh
```

- 配色の名前をレイアウト名（`pokemon-plus`）と同じにしないこと。Herdr はレイアウトと同じ名前の配色を「そのレイアウト専用」として扱い、ほかのレイアウトの設定画面に出さない
- `get-balls.sh` は 26 種類のボールの絵を取ってきて、`mods/pokemon-plus/balls/` と `mods/pokemon-spaces/balls/` に置く
- `pokemon-plus` は自作なので、そのまま置けばよい（元は herdr-pokemon-agents の `main.js` / `sprites.js`）

### 2. 3 つの複製 mod（Herdr のバージョンが違うとき）

`pokemon-tabs` / `pokemon-agents-list` / `pokemon-spaces` は Herdr 0.1.15 の `tabs` / `agents` / `spaces` を複製して少しだけ足したもの。バージョンが違うなら、`files/` の `main.js` で上書きせず、クローンした新しい `main.js` に次の部分だけ移植する。どれも、画面下の帯（`pokemon-plus`）が共有する状態を読むだけ:

- 共有状態 `pokemon-plus`: `{ panes: { <ペインの id>: <図鑑番号> } }`（どのエージェントがどのポケモンか）
- 共有状態 `pokemon-plus.assets`: `{ <図鑑番号>: { icon: true/false, faces: ["Normal", ...] } }`（アイコンと顔をダウンロード済みか）

| mod | 足したもの |
|---|---|
| `pokemon-tabs` | 関数 `monIcon(pane)`。`render` の `item` で、タブのエージェントのペイン（`agentPane`）からアイコンの画像（`data/pokemon-plus/icons/<番号>.png`、24×18）を出し、なければ元のプログラムのアイコン。右上の Files / Changes の隣に Resume ボタン（`init` で `mods/claude-resume/mod.json` があるか読み、あるときだけ出す。押すと `mod.open` で claude-resume） |
| `pokemon-agents-list` | 定数 `FACE` と関数 `face(a, size)`。`row` の `pic` を `face(a, 22) ?? icon(...)` にする（顔は `data/pokemon-plus/portraits/<4 桁の番号>/<表情>.png`） |
| `pokemon-spaces` | `import` に `image`、定数 `BALLS` と `ballOf`。`render` で共有状態 `pokemon-spaces.balls` にスペースごとのボールを決め（使われていない中からランダム）、行の頭文字のアイコンの代わりに `mods/pokemon-spaces/balls/<ボール>.png`（22px）を出す |

### 3. レイアウトを作る

```sh
python3 -I files/pokemon-plus/make-layouts.py
```

`layouts/main.json` をもとに `layouts/pokemon-plus.json`（鳴き声あり）と `layouts/pokemon-plus-quiet.json`（鳴き声なし）を作る。main からの違いは:

- `theme` を `{ "light": "pokedex", "dark": "graphite" }`
- `tabs` → `pokemon-tabs`、`agents` → `pokemon-agents-list`、`spaces` → `pokemon-spaces`
- `mods/usage-status` があれば（上の手順 5・7 を済ませていれば）、ステータスバーの `workspace-status` → `usage-status`
- `work` 列のステータスバー（`status`）の上に帯を追加: `{ "id": "pokemon-plus", "type": "block", "content": { "mod": "pokemon-plus", "props": { "cries": true } }, "size": { "px": 112 }, "min": 72, "max": 240 }`（quiet は `"cries": false`）

同じ名前のレイアウトが既にあれば、上書きせずに止まる。

### 4. キーと切り替え

`~/.config/herdr-app/keys.json` の `global` に `"alt-shift-p": "pokemon-plus.pick"` をマージする（ほかのキーはそのまま。`alt-shift-p` が既に使われていたらユーザーに聞く）。

```sh
herdr-app do layout.switch '{"name":"pokemon-plus-quiet"}'
```

`cmd-shift-l` で `pokemon-plus`（鳴き声あり）やほかのレイアウトと行き来できる。

- 鳴き声ありでは、Herdr の通知音も一緒に鳴る。通知音は `settings.json` の `sounds` で決まる全体の設定なので、レイアウトごとには変えられない
- 完了の音（Herdr の通知音も鳴き声も）は、見ていないペインのエージェントが終わったときだけ鳴る。入力待ちの音は見ているペインでも鳴る
- 前に別のポケモンの mod（`pokemon-agents`）を使っていたら、その割り当ては最初の 1 回だけ引き継ぐ

### 確認

- `~/.config/herdr-app` で `herdr-app check mods/<名前>` を実行し、`pokemon-plus` `pokemon-tabs` `pokemon-agents-list` `pokemon-spaces` がすべて通る
- `herdr-app status` で `"layout": "pokemon-plus-quiet"`、`"errors": []`
- エージェントを動かしてから `herdr-app shot <パス>.png` でスクショを撮り、次を確認する（初回は絵のダウンロードで数秒〜十数秒かかる）:
  - 画面下の帯にポケモンが立ち、名前の札が付いている
  - 上のタブとエージェント一覧に、帯と同じポケモンのアイコン・顔が出ている
  - Spaces の名前の左にボールの絵
  - 地の色がクリーム、強調色が赤（`#e3350d`）
- `herdr-app do pokemon-plus.pick` でポケモンを選ぶ画面が開き、アイコンが並ぶ

## 単体の mod: claude-resume（Claude Code の会話を中身を見て再開）

`claude -r` の代わり。会話の一覧（タイトル・経過時間・ブランチ・依頼の回数）と、選んだ会話の中身（離席中の要約・最初の依頼・最近の依頼・最後の返答）を並べて出し、Enter で新しいタブに `claude -r <会話 ID>` を会話のフォルダで開く。テーマやレイアウトに関係なく単体で使える。

- `index.py` が `~/.claude/projects/*/*.jsonl`（Claude Code の会話ログ）を読み、一覧を JSON で返す。外部への通信はない
- 2 回目以降を速くするため、`~/.cache/herdr-claude-resume/index.json` に結果を保存する（ファイルの大きさと更新時刻が同じ会話は読み直さない）
- 前提: `python3`（`exec` でユーザーの PATH から呼ぶ）、`claude`

### 1. ファイルを置く

**`mod.json` を先に置く**（`main.js` だけ先に置くと、開いているレイアウトの右端に mod が自動で追加される）:

```sh
mkdir -p ~/.config/herdr-app/mods/claude-resume
cp files/claude-resume/mod.json ~/.config/herdr-app/mods/claude-resume/
cp files/claude-resume/index.py files/claude-resume/main.js ~/.config/herdr-app/mods/claude-resume/
```

### 2. キー

`~/.config/herdr-app/keys.json` の `global` に `"cmd-shift-r": "mod.open:claude-resume"` をマージする（`cmd-shift-r` が既に使われていたらユーザーに聞く）。

pokemon-plus を入れていれば、右上の Files / Changes の隣に **Resume** ボタンも出る（`pokemon-tabs` が `mods/claude-resume/mod.json` の有無を見て出し分ける）。

### 操作

- 文字を打つと、タイトル・依頼の文面・ブランチ・フォルダで絞り込む
- ↑/↓ で選び、Enter（または選択中の行をもう一度クリック）で新しいタブに再開
- Tab で「開いたときのペインのフォルダの会話だけ」と「すべて」を切り替える（そのフォルダに会話がなければ最初から「すべて」）
- タイトルは Claude Code が自動で付けたもの。`/rename` で付けた名前があればそちらを使う

### 確認

- `~/.config/herdr-app` で `herdr-app check mods/claude-resume` が通る
- `herdr-app do mod.open '{"name":"claude-resume"}'` で真ん中にダイアログが開き、`herdr-app status` の `overlays` に `claude-resume`、`"errors": []`
- `layouts/*.json` に `claude-resume` のブロックが入っていない（入っていたら手順 1 の順番を間違えたので、そのブロックを消す）
