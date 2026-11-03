import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, window, keys, home, readTextFile } from "herdr";

// Claude Code のステータスラインスクリプトが書き出す rate_limits
const USAGE_FILE = () => `${home()}/.claude/herdr-usage/usage.json`;
const RELOAD_MS = 10_000;
// これより古いデータは「◯分前」を添える
const STALE_SEC = 10 * 60;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const pad = (n) => String(n).padStart(2, "0");

// リセット時刻: 今日なら時刻だけ、別の日なら曜日も付ける
function formatReset(epochSec) {
  const d = new Date(epochSec * 1000);
  const time = `${d.getHours()}:${pad(d.getMinutes())}`;
  return d.toDateString() === new Date().toDateString() ? time : `${WEEKDAYS[d.getDay()]} ${time}`;
}

function formatAge(sec) {
  if (sec < 3600) return `${Math.floor(sec / 60)}分前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}時間前`;
  return `${Math.floor(sec / 86400)}日前`;
}

// 使用率に応じた文字色
function usageColor(pct, t) {
  if (pct >= 90) return t.blocked;
  if (pct >= 70) return t.working;
  return t.muted;
}

export default class WorkspaceStatus extends View {
  init(_props, cx) {
    this.usage = null;
    this.loadUsage(cx);
    // ファイルの再読み込みと、リセット済み判定・「◯分前」の更新を兼ねる
    cx.timer.every(RELOAD_MS, (cx) => this.loadUsage(cx));
  }

  loadUsage(cx) {
    cx.spawn(async (cx) => {
      const text = await readTextFile(USAGE_FILE()).catch(() => null);
      try {
        this.usage = text ? JSON.parse(text) : null;
      } catch {
        // 書き込み途中などで壊れていたら前回の値を使う
      }
      cx.notify();
    });
  }

  // The palette key as actually bound, not a hardcoded one; without a
  // binding the hint stays useful ("commands") instead of lying.
  hint(t) {
    const mac = window()?.platform === "macos";
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
    const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
    const key = parts && parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
    return key ? `${key}  commands` : "commands";
  }

  // 1つの枠（5h / 週）: 使用率とリセット時刻
  usageWindow(label, w, t) {
    const now = Date.now() / 1000;
    if (!w) return null;
    if (w.resets_at <= now) return div().text_color(t.dim).child(`${label} リセット済`);
    const pct = Math.floor(w.used_percentage);
    return h_flex().gap(5).items_center()
      .child(div().text_color(t.dim).child(label))
      .child(div().text_color(usageColor(pct, t)).child(`${pct}%`))
      .child(div().text_color(t.dim).child(`↻ ${formatReset(w.resets_at)}`));
  }

  usageSection(t) {
    const u = this.usage;
    if (!u) return null;
    const parts = [this.usageWindow("5h", u.five_hour, t), this.usageWindow("週", u.seven_day, t)].filter(Boolean);
    if (parts.length === 0) return null;
    const age = Date.now() / 1000 - (u.updated_at ?? 0);
    return h_flex().gap(14).items_center()
      .children(parts)
      .when(age > STALE_SEC, (el) => el.child(div().text_color(t.dim).child(`(${formatAge(age)})`)));
  }

  render() {
    const t = theme();
    const space = spaces().find(s => s.active);
    const list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    const usage = this.usageSection(t);
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agents`)
        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .child(div().flex_1())
      .when(Boolean(usage), el => el.child(usage))
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(this.hint(t)));
  }
}
