import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex, HoverCard } from "gpui-base";
import { spaces, agents, theme, run, window, keys, home, readTextFile, focused } from "herdr";
import * as fs from "fs/promises";

// Claude Code のステータスラインスクリプト（~/.claude/statusline-usage.sh）が書き出すファイル
const USAGE_DIR = () => `${home()}/.claude/herdr-usage`;
const RELOAD_MS = 10_000;
// これより古いデータは「updated ◯ ago」を目立たせる
const STALE_SEC = 10 * 60;
const BAR_W = 44; // ステータスバーのバー
const PANEL_BAR_W = 110; // ホバーパネルのバー
const WINDOWS = [
  { key: "five_hour", short: "5h", long: "5-hour" },
  { key: "seven_day", short: "wk", long: "Weekly" },
];

// 残り時間: 3d 6h / 2h 41m / 12m
function formatLeft(sec) {
  const m = Math.max(0, Math.floor(sec / 60));
  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}m`;
}

function formatAge(sec) {
  if (sec < 60) return "just now";
  return `${formatLeft(sec)} ago`;
}

// 169122 -> 169k, 1000000 -> 1M
function formatTokens(n) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// 使用率の色: 70% から黄、90% から赤
function barColor(pct, t) {
  if (pct >= 90) return t.ansi1;
  if (pct >= 70) return t.ansi3;
  return t.done;
}

function textColor(pct, t) {
  return pct >= 70 ? barColor(pct, t) : t.foreground;
}

const BAR_H = 5;

function bar(pct, width, t) {
  const p = Math.min(100, Math.max(0, pct));
  // 小さい値でも丸い点に見えるよう、0% より上はバーの高さを最小幅にする
  const fill = p > 0 ? Math.max(BAR_H, Math.round((width * p) / 100)) : 0;
  return div().flex_none().w(width).h(BAR_H).rounded(3).bg(t.border)
    .child(div().h_full().w(fill).rounded(3).bg(barColor(pct, t)));
}

// リセット済みの枠は null（次の読み取りまで — を出す）
function windowPct(w) {
  if (!w || w.resets_at <= Date.now() / 1000) return null;
  return Math.floor(w.used_percentage);
}

export default class WorkspaceStatus extends View {
  init(_props, cx) {
    this.usage = null;
    this.sessions = [];
    this.load(cx);
    // ファイルの再読み込みと、リセット済み判定・経過時間の更新を兼ねる
    cx.timer.every(RELOAD_MS, (cx) => this.load(cx));
  }

  load(cx) {
    cx.spawn(async (cx) => {
      const dir = USAGE_DIR();
      this.usage = this.parse(await readTextFile(`${dir}/usage.json`).catch(() => null)) ?? this.usage;
      const names = await fs.readdir(`${dir}/sessions`).catch(() => []);
      const sessions = [];
      for (const name of names.filter((n) => n.endsWith(".json"))) {
        const s = this.parse(await readTextFile(`${dir}/sessions/${name}`).catch(() => null));
        if (s) sessions.push(s);
      }
      this.sessions = sessions.sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0));
      cx.notify();
    });
  }

  // 書き込み途中などで壊れていたら null
  parse(text) {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  // lean: フォーカス中のペインと同じフォルダで最後に更新されたセッション。なければ全体で最新。
  // 同じフォルダで Claude Code を複数開くと取り違えうる — 厳密にするならプロセス id で突き合わせる
  session() {
    const cwd = focused()?.cwd;
    return this.sessions.find((s) => cwd && s.cwd === cwd) ?? this.sessions[0] ?? null;
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

  // ステータスバー: Used [5h のバー] 5h 38% · wk 54% · ctx 17%
  usageBar(t, s) {
    const u = this.usage;
    const items = [];
    if (u) {
      for (const w of WINDOWS) {
        const pct = windowPct(u[w.key]);
        items.push(div().text_color(pct == null ? t.dim : textColor(pct, t)).child(`${w.short} ${pct == null ? "—" : `${pct}%`}`));
      }
    }
    if (s?.ctx?.percent != null) items.push(div().text_color(textColor(s.ctx.percent, t)).child(`ctx ${Math.floor(s.ctx.percent)}%`));
    if (items.length === 0) return null;
    const first = u ? windowPct(u[WINDOWS[0].key]) : null;
    const row = h_flex().gap(6).items_center()
      .child(div().text_color(t.dim).child("Used"))
      .when(first != null, (el) => el.child(bar(first, BAR_W, t)));
    items.forEach((item, i) => {
      if (i > 0) row.child(div().text_color(t.dim).child("·"));
      row.child(item);
    });
    return row;
  }

  // ホバーパネル: 枠ごとのバーと残り時間、このセッションの情報
  panel(t, s) {
    const u = this.usage;
    const now = Date.now() / 1000;
    const panel = v_flex().w(340).p(16).gap(10).rounded(10).border_1().border_color(t.border).bg(t.popover).text_size(12.5).text_color(t.foreground);

    if (u) {
      const age = now - (u.updated_at ?? 0);
      panel.child(h_flex().items_center().justify_between()
        .child(div().font_semibold().text_size(13.5).child("Claude"))
        .child(div().text_color(age > STALE_SEC ? t.ansi3 : t.dim).child(`updated ${formatAge(age)}`)));
      for (const w of WINDOWS) {
        const pct = windowPct(u[w.key]);
        panel.child(h_flex().items_center().gap(10)
          .child(div().w(70).flex_none().text_color(t.muted).child(w.long))
          .child(bar(pct ?? 0, PANEL_BAR_W, t))
          .child(div().flex_1().text_right().text_color(pct == null ? t.dim : textColor(pct, t)).child(pct == null ? "—" : `${pct}%`))
          .child(div().w(56).flex_none().text_right().text_color(t.dim).child(pct == null ? "reset" : formatLeft(u[w.key].resets_at - now))));
      }
    }

    if (s) {
      if (u) panel.child(div().h(1).bg(t.border));
      const pct = s.ctx?.percent;
      panel.child(h_flex().items_center().gap(8)
        .child(div().flex_none().font_semibold().child("This session"))
        .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child([s.project, s.name].filter(Boolean).join(" · ")))
        .when(pct != null, (el) => el.child(bar(pct, 60, t)).child(div().flex_none().text_color(textColor(pct, t)).child(`ctx ${Math.floor(pct)}%`))));
      const usage = [
        s.ctx ? `${formatTokens(s.ctx.used)} of ${formatTokens(s.ctx.size)} tokens` : null,
        plural(s.calls ?? 0, "call"),
        plural(s.compactions ?? 0, "compaction"),
      ].filter(Boolean).join(" · ");
      const meta = [
        s.model,
        s.effort,
        s.cost_usd != null ? `$${s.cost_usd.toFixed(2)}` : null,
        s.duration_ms != null ? formatLeft(s.duration_ms / 1000) : null,
        s.lines_added != null ? `+${s.lines_added} −${s.lines_removed ?? 0}` : null,
      ].filter(Boolean).join(" · ");
      panel.child(div().text_color(t.muted).child(usage));
      if (meta) panel.child(div().text_color(t.muted).child(meta));
    }

    return panel.child(div().text_size(11).text_color(t.dim).child("Data: Claude Code status line"));
  }

  render() {
    const t = theme();
    const space = spaces().find(s => s.active);
    const list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    const session = this.session();
    const usage = this.usageBar(t, session);
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agents`)
        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .child(div().flex_1())
      .when(Boolean(usage), el => el.child(
        HoverCard.new("usage-card").anchor("bottom_right").open_delay(350)
          .trigger(usage)
          .content(this.panel(t, session)),
      ))
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(this.hint(t)));
  }
}
