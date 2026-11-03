# Herdr 環境の再現手順（エージェント向け）

別の PC の Herdr デスクトップアプリに、元の PC と同じカスタマイズを入れてほしい。
このリポジトリの `files/` に、GitHub にないファイルが入っている。

## ゴール

- レイアウト **glass** を使い、色は **glass-onedark** テーマ（One Dark 系の不透明な色）
- タブバーに **Graph** ボタン（git-graph）
- サイドバーは **pixel-spaces**（スペースごとのドット絵スプライト、ヘッダーのベル、`cmd-p` で pixel 版ピッカー、Codex だけピクセルアイコン。Claude Code のアイコンは Herdr 標準のまま）
- ステータスバー右側に **Claude の usage**（5h 枠・週枠の使用率とリセット時刻）

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

`main.js` は `~/.claude/herdr-usage/usage.json` を 10 秒ごとに読み、5h 枠と週枠の使用率・リセット時刻をステータスバーの右に表示する。
元になった `workspace-status` は Herdr 0.1.12 のもの。バージョンが違うなら、クローンした新しい `main.js` と見比べて、usage の部分だけ移植する。追加したのは、`import` の `home, readTextFile`、定数とヘルパー関数（`USAGE_FILE` 〜 `usageColor`）、`init` / `loadUsage` / `usageWindow` / `usageSection` メソッド、`render` 内の `usage` の 2 行。

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

このスクリプトは、Claude Code から渡される `rate_limits` を `~/.claude/herdr-usage/usage.json` に保存し、Claude Code の画面下に `5h 12% · 週 2%` を表示する。
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
  - Claude Code を一度動かしたあと、ステータスバー右に `5h ◯% ↻ 時刻  週 ◯% ↻ 曜日 時刻`
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
