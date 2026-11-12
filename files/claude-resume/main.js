// Claude Code の会話を中身を見ながら選んで再開する（claude -r の代わり）。
// 左に会話の一覧（タイトル・フォルダ・ブランチ・経過時間）、右に選んだ会話の中身
// （最初の依頼、最近の依頼、最後の返答、離席中の要約）。文字を打つと絞り込み、
// ↑/↓ で選んで Enter で新しいタブに再開。Tab でこのフォルダだけ / すべてを切り替える。

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { exec, run, theme, props, closeOverlay, focused, appHome, home } from "herdr";

const ROW_H = 50;
const LIST_W = 360;
const VISIBLE_ROWS = 10; // 一覧の高さ（行数）。プレビューも同じ高さ
const BODY_H = ROW_H * VISIBLE_ROWS + 70; // 一覧 + 検索欄 + 下の案内

// 経過時間: 3d / 5h / 12m / now
function age(sec) {
  const m = Math.floor(Math.max(0, Date.now() / 1000 - sec) / 60);
  if (m >= 1440) return `${Math.floor(m / 1440)}d`;
  if (m >= 60) return `${Math.floor(m / 60)}h`;
  return m > 0 ? `${m}m` : "now";
}

const oneLine = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const tilde = (p) => (p && p.startsWith(home()) ? `~${p.slice(home().length)}` : p ?? "");
const folderName = (p) => (p ?? "").split("/").filter(Boolean).pop() ?? "~";

export default class ClaudeResume extends View {
  init(_props, cx) {
    this.sessions = null;
    this.error = null;
    this.filter = "";
    this.at = 0;
    this.top = 0;
    // 開いたときのペインのフォルダ。そこに会話があればそのフォルダだけを出す
    this.cwd = focused()?.cwd ?? null;
    this.onlyHere = true;
    this.input = InputState.new({ placeholder: "Search conversations…" });
    this.input.on("change", (_e, cx) => {
      this.filter = this.input.value();
      this.at = 0;
      this.top = 0;
      cx.notify();
    });
    this.input.on("submit", () => this.resume(this.rows()[this.at]));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
    cx.spawn(async (cx) => {
      try {
        const r = await exec("python3", ["-I", `${appHome()}/mods/claude-resume/index.py`], { timeout: 120_000 });
        if (r.code !== 0) throw new Error(r.stderr.trim().split("\n").pop() || `exit ${r.code}`);
        this.sessions = JSON.parse(r.stdout);
        if (!this.sessions.some((s) => s.cwd === this.cwd)) this.onlyHere = false;
      } catch (e) {
        this.error = String(e?.message ?? e);
        this.sessions = [];
      }
      cx.notify();
    });
  }

  close() {
    closeOverlay(props().overlay);
  }

  rows() {
    const words = this.filter.toLowerCase().split(/\s+/).filter(Boolean);
    return (this.sessions ?? []).filter((s) => {
      if (this.onlyHere && s.cwd !== this.cwd) return false;
      const hay = [s.title, s.first, ...(s.recent ?? []), s.away, s.branch, s.cwd].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }

  resume(s) {
    if (!s) return;
    this.close();
    run("tab.new", { folder: s.cwd ?? home(), argv: ["claude", "-r", s.id] });
  }

  toggleScope() {
    this.onlyHere = !this.onlyHere;
    this.at = 0;
    this.top = 0;
  }

  // 1回目のクリックで選択、選択中の行をもう一度クリックで再開
  row(t, s, on) {
    return v_flex()
      .id(`cr-${s.id}`)
      .h(ROW_H)
      .flex_none()
      .mx(4)
      .px(10)
      .justify_center()
      .gap(3)
      .rounded(7)
      .cursor_pointer()
      .when(on, (el) => el.bg(t.hover))
      .hover((st) => st.bg(t.hover))
      .on_click((_e, cx) => {
        if (on) return this.resume(s);
        this.at = this.rows().indexOf(s);
        cx.notify();
      })
      .child(div().truncate().text_color(t.foreground).when(on, (el) => el.font_semibold()).child(oneLine(s.title || s.first)))
      .child(h_flex().gap(6).text_size(11).text_color(t.dim)
        .child(div().flex_none().child(age(s.updated)))
        .child(div().flex_1().min_w(0).truncate().child([this.onlyHere ? null : folderName(s.cwd), s.branch, `${s.prompts} prompts`].filter(Boolean).join(" · "))));
  }

  section(t, label, body) {
    if (!body) return false;
    return v_flex().gap(4)
      .child(div().text_size(11).font_semibold().text_color(t.dim).child(label))
      .child(body);
  }

  preview(t, s) {
    if (!s) return v_flex().flex_1().items_center().justify_center().text_color(t.dim).child(this.sessions ? "No conversations" : "Loading…");
    const text = (str, color) => div().text_color(color).child(str.trim());
    const recent = (s.recent ?? []).filter((p) => p !== s.first || s.prompts > 1);
    return v_flex().id("cr-preview").size_full().p(16).gap(14).overflow_y_scroll().text_size(12.5)
      .child(v_flex().gap(4)
        .child(div().text_size(15).font_semibold().text_color(t.foreground).child(oneLine(s.title || s.first)))
        .child(div().text_size(11).text_color(t.dim).child([tilde(s.cwd), s.branch, `${age(s.updated)} ago`, `${s.prompts} prompts`].filter(Boolean).join(" · "))))
      .child(this.section(t, "SUMMARY", s.away && text(s.away, t.foreground)))
      .child(this.section(t, "FIRST PROMPT", s.first && text(s.first, t.foreground)))
      .child(this.section(t, "RECENT PROMPTS", recent.length > 0 && v_flex().gap(6).children(recent.map((p) => h_flex().gap(6).items_start()
        .child(div().flex_none().text_color(t.accent).child("›"))
        .child(div().flex_1().min_w(0).text_color(t.foreground).child(p.trim()))))))
      .child(this.section(t, "LAST REPLY", s.reply && text(s.reply, t.muted)));
  }

  render() {
    const t = theme();
    const rows = this.rows();
    this.at = Math.max(0, Math.min(this.at, rows.length - 1));
    const sel = rows[this.at];
    // 一覧は見えている行だけを描く。選択が見える範囲に入るよう上端をずらす
    const fit = VISIBLE_ROWS;
    if (this.at < this.top) this.top = this.at;
    if (this.at >= this.top + fit) this.top = this.at - fit + 1;
    this.top = Math.max(0, Math.min(this.top, Math.max(0, rows.length - fit)));
    const shown = rows.slice(this.top, this.top + fit);
    const here = this.cwd ? folderName(this.cwd) : null;

    const scope = (label, active) => div().id(`cr-scope-${label}`).px(8).py(3).rounded(6).text_size(11.5).cursor_pointer()
      .text_color(active ? t.foreground : t.dim).when(active, (el) => el.bg(t.hover)).hover((st) => st.text_color(t.foreground))
      .on_click((_e, cx) => {
        if (active) return;
        this.toggleScope();
        cx.notify();
      })
      .child(label);

    return v_flex()
      .id("claude-resume")
      .track_focus(this.handle)
      .w_full()
      .p(16)
      .gap(10)
      .bg(t.popover)
      .text_size(13)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") return this.close();
        if (k === "down" && rows.length) this.at = (this.at + 1) % rows.length;
        else if (k === "up" && rows.length) this.at = (this.at + rows.length - 1) % rows.length;
        else if (k === "tab" && this.cwd) this.toggleScope();
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().items_center().gap(8)
        .child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child("Resume a conversation"))
        .when(Boolean(here), (el) => el.child(scope(here, this.onlyHere)).child(scope("All", !this.onlyHere)))
        .child(div().id("cr-esc").px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer().hover((st) => st.bg(t.hover).text_color(t.foreground)).on_click(() => this.close()).child("Esc")))
      .child(h_flex().h(BODY_H).flex_none().gap(12)
        .child(v_flex().w(LIST_W).flex_none().min_h(0).gap(8)
          .child(h_flex().h(36).flex_none().px(10).gap(8).items_center().rounded(9).border_1().border_color(t.accent).bg(t.background)
            .child(svg("mods/workspace-chrome/search.svg").size(15).text_color(t.dim))
            .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground)))
          .child(v_flex().id("cr-list").h(ROW_H * VISIBLE_ROWS).flex_none().overflow_hidden()
            .on_scroll_wheel((e, cx) => {
              // トラックパッドの細かい量を溜めて、1行分たまったら1行動かす
              this.wheel = (this.wheel ?? 0) - e.delta.y;
              const step = Math.trunc(this.wheel / ROW_H);
              if (step === 0) return;
              this.wheel -= step * ROW_H;
              this.top = Math.max(0, Math.min(this.top + step, Math.max(0, rows.length - fit)));
              this.at = Math.max(this.top, Math.min(this.at, this.top + fit - 1));
              cx.notify();
            })
            .when(Boolean(this.error), (el) => el.child(div().p(10).text_color(t.ansi1).child(`Couldn't read conversations: ${this.error}`)))
            .children(shown.map((s) => this.row(t, s, s === sel))))
          .child(div().flex_none().text_size(11).text_color(t.dim).child(`${rows.length} conversations · ↑↓ select · Enter resume in a new tab${this.cwd ? " · Tab scope" : ""}`)))
        .child(v_flex().flex_1().min_w(0).h_full().overflow_hidden().rounded(9).border_1().border_color(t.border).bg(t.background)
          .child(this.preview(t, sel))));
  }
}
