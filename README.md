# herdr-migration

Herdr デスクトップアプリのカスタマイズ（glass + glass-onedark、Graph、pixel-spaces、Claude の usage 表示）を別の PC で再現するための手順とファイル。

新しい PC でこのリポジトリを clone し、Claude Code などのエージェントに次のように頼む:

> `AGENT_INSTRUCTIONS.md` の手順で、Herdr をセットアップして

- `AGENT_INSTRUCTIONS.md`: エージェント向けの手順書
- `files/`: GitHub にない自作ファイル（テーマ、usage-status mod、ステータスラインスクリプト）
- `files/moonlit/`: 別テーマ moonlit（ドット絵の夜空の背景と紺のテーマ）。手順は `AGENT_INSTRUCTIONS.md` の最後
- `files/pokemon-plus/`: 別テーマ pokemon-plus（エージェントごとのポケモンが画面下を歩く。鳴き声あり・なしの 2 レイアウト）。手順は `AGENT_INSTRUCTIONS.md` の最後
- `files/claude-resume/`: 単体の mod claude-resume（`claude -r` の代わりに、会話の中身を見て選んで再開する。`cmd-shift-r`）。手順は `AGENT_INSTRUCTIONS.md` の最後
