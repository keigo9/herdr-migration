"""Herdr の main レイアウトから pokemon-plus（鳴き声あり）と pokemon-plus-quiet（鳴き声なし）を作る。

使い方: python3 -I make-layouts.py [Herdr のホーム]（省略時は ~/.config/herdr-app）
既に同じ名前のレイアウトがあれば上書きせずに止まる。
"""
import json
import os
import sys

home = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.config/herdr-app")

# Herdr 標準の mod を、手を入れた複製に差し替える。
SWAP = {"tabs": "pokemon-tabs", "agents": "pokemon-agents-list", "spaces": "pokemon-spaces"}
# usage-status（Claude の usage 表示）が入っていれば、ステータスバーもそれにする。
if os.path.exists(f"{home}/mods/usage-status/main.js"):
    SWAP["workspace-status"] = "usage-status"


def swap_mods(node):
    content = node.get("content") or {}
    if content.get("mod") in SWAP:
        content["mod"] = SWAP[content["mod"]]
    for child in node.get("children", []):
        swap_mods(child)


def build(cries):
    with open(f"{home}/layouts/main.json", encoding="utf-8") as f:
        layout = json.load(f)
    layout["theme"] = {"light": "pokedex", "dark": "graphite"}
    swap_mods(layout)
    # ポケモンの帯は、右側の列（work）のステータスバーのすぐ上に置く。
    work = next(c for c in layout["children"] if c["id"] == "work")
    status = next(i for i, c in enumerate(work["children"]) if c["id"] == "status")
    work["children"].insert(status, {
        "id": "pokemon-plus", "type": "block",
        "content": {"mod": "pokemon-plus", "props": {"cries": cries}},
        "size": {"px": 112}, "min": 72, "max": 240,
    })
    return layout


for name, cries in (("pokemon-plus", True), ("pokemon-plus-quiet", False)):
    path = f"{home}/layouts/{name}.json"
    if os.path.exists(path):
        sys.exit(f"{path} が既にあるので止めました")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(build(cries), f, indent=2, ensure_ascii=False)
    print(f"作成: {path}")
