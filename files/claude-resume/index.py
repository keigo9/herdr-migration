"""Claude Code の会話ログ（~/.claude/projects/*/*.jsonl）から、再開ピッカー用の一覧を JSON で出す。

使い方: python3 -I index.py
ファイルの大きさと更新時刻が変わっていなければ、前回の結果（~/.cache/herdr-claude-resume/index.json）を使う。
"""
import json
import os
import sys

PROJECTS = os.path.expanduser("~/.claude/projects")
CACHE = os.path.expanduser("~/.cache/herdr-claude-resume/index.json")
LIMIT = 400  # 新しい順にこの数まで
TEXT_MAX = 600
RECENT_PROMPTS = 4


def text_of(content):
    """ユーザー発言の本文。ツール結果だけのものは None"""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"]
        return "\n".join(parts) if parts else None
    return None


def clip(s):
    s = (s or "").strip()
    return s if len(s) <= TEXT_MAX else s[:TEXT_MAX] + "…"


def scan(path):
    first = None
    recent = []
    prompts = 0
    meta = {}
    last_lines = {}
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            # 大きいツール結果などは中身を読まずに飛ばす
            if line.startswith('{"type":"user"') or '"type":"user"' in line[:400]:
                if '"tool_result"' in line or '"isSidechain":true' in line or '"isMeta":true' in line or '"isCompactSummary":true' in line:
                    continue
                try:
                    e = json.loads(line)
                except ValueError:
                    continue
                if e.get("type") != "user":
                    continue
                text = text_of((e.get("message") or {}).get("content"))
                # スラッシュコマンドやその出力（<command-name> など）は会話の中身ではない
                if not text or text.lstrip().startswith("<"):
                    continue
                prompts += 1
                if first is None:
                    first = clip(text)
                    meta["cwd"] = e.get("cwd")
                    meta["branch"] = e.get("gitBranch")
                    meta["started"] = e.get("timestamp")
                recent = (recent + [clip(text)])[-RECENT_PROMPTS:]
                continue
            for key, marker in (
                ("ai", '"type":"ai-title"'),
                ("custom", '"type":"custom-title"'),
                ("away", '"subtype":"away_summary"'),
            ):
                if marker in line[:400]:
                    last_lines[key] = line
                    break
            else:
                # assistant の type は本文の後ろに来るので行全体を見る（最後に type を確かめる）
                if '"type":"assistant"' in line and '"type":"text"' in line:
                    last_lines["assistant"] = line
    if not prompts:
        return None

    def load(key):
        try:
            return json.loads(last_lines[key]) if key in last_lines else {}
        except ValueError:
            return {}

    reply = None
    answer = load("assistant")
    content = (answer.get("message") or {}).get("content") if answer.get("type") == "assistant" else None
    if isinstance(content, list):
        texts = [c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"]
        reply = clip("\n".join(texts)) or None
    return {
        "title": load("custom").get("customTitle") or load("ai").get("aiTitle"),
        "first": first,
        "recent": recent,
        "prompts": prompts,
        "away": clip(load("away").get("content")) or None,
        "reply": reply,
        **meta,
    }


def main():
    try:
        with open(CACHE, encoding="utf-8") as f:
            cache = json.load(f)
    except (OSError, ValueError):
        cache = {}
    files = []
    for d in os.listdir(PROJECTS):
        dp = os.path.join(PROJECTS, d)
        if not os.path.isdir(dp):
            continue
        for name in os.listdir(dp):
            if name.endswith(".jsonl"):
                p = os.path.join(dp, name)
                st = os.stat(p)
                files.append((st.st_mtime, st.st_size, p, name[:-6]))
    files.sort(reverse=True)

    out, fresh = [], {}
    for mtime, size, path, sid in files:
        hit = cache.get(path)
        if hit and hit["mtime"] == mtime and hit["size"] == size:
            item = hit["item"]
        else:
            try:
                item = scan(path)
            except OSError:
                continue
        fresh[path] = {"mtime": mtime, "size": size, "item": item}
        if item:
            out.append({"id": sid, "updated": mtime, **item})
            if len(out) >= LIMIT:
                break

    # キャッシュは速くするためだけのもの。書けなくても一覧は出す（同時に開いても混ざらないよう pid 付きの一時ファイル経由）
    try:
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        tmp = f"{CACHE}.{os.getpid()}.tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(fresh, f, ensure_ascii=False)
        os.replace(tmp, CACHE)
    except OSError:
        pass
    json.dump(out, sys.stdout, ensure_ascii=False)


main()
