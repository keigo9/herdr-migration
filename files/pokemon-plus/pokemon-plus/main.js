// Pokémon plus: every agent is a pixel-art Pokémon (974 of them, every one PMD SpriteCollab can walk)
// roaming a strip at the bottom of the window. Working ones walk around, idle ones stroll and nap,
// blocked ones stop and call for you. Click one to go to its agent; right-click to choose which it is.
// The strip also fetches what the tab bar (pokemon-tabs) and the agents list (pokemon-agents-list)
// draw: menu icons and portraits, announced in shared "pokemon-plus.assets".
// With props { cries: true }, an agent that starts waiting on you cries, and one that finishes
// unseen chirps.
import { View, div, image } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { agents, spaces, theme, settings, run, props, shared, setShared, openOverlay, closeOverlay, nextCommand, playSound } from "herdr";
import { DEX, COUNT, GENS, has, idAt, nameOf, enNameOf, dexNo } from "./dex.js";
import { loadSprite, ensureIcons, hasIcon, iconPath, imageMagick, ensurePortraits, ensureCry, ensureChirp } from "./sprites.js";

const KEY = "pokemon-plus"; // shared state: { panes: { <pane id>: <dex number> } }
const ASSETS = "pokemon-plus.assets"; // shared state: { <dex number>: { icon, faces } }
const OLD_KEY = "pokemon-agents"; // the original mod's picks, taken over once
const SLOT = 128; // width of one Pokémon's column (sprite + name tag)
const LABEL_H = 18; // name tag under the feet
const FEET = 24; // ground line, px above the strip's bottom
const SPEED = { working: 70, idle: 32 }; // px per second
const SLEEP_AFTER = 3 * 60 * 1000; // idle this long: fall asleep
const CRY_GAP = 1500; // at most one cry this often, when several agents block at once
const RESULTS = 200; // search results the picker draws at most
// While a Pokémon's sprite loads, a random ball (PokeAPI item sprites, in balls/) waits in its place.
const BALLS = ["poke-ball", "great-ball", "ultra-ball", "master-ball", "premier-ball", "safari-ball", "dive-ball",
  "net-ball", "nest-ball", "repeat-ball", "timer-ball", "luxury-ball", "dusk-ball", "heal-ball", "quick-ball",
  "cherish-ball", "friend-ball", "love-ball", "moon-ball", "level-ball", "lure-ball", "heavy-ball", "fast-ball",
  "sport-ball", "dream-ball", "beast-ball"];

// ---- who is which Pokémon -------------------------------------------------------

const slotOf = (a) => a.pane || a.address;

function savedPicks() {
  const s = shared(KEY);
  return s && typeof s === "object" && s.panes && typeof s.panes === "object" ? s.panes : {};
}

function savePicks(update) {
  const next = { ...savedPicks(), ...update };
  const keys = Object.keys(next);
  for (let i = 0; i < keys.length - 300; i++) delete next[keys[i]]; // forget the oldest panes
  setShared(KEY, { panes: next });
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Saved picks first; a new agent gets a Pokémon nobody on screen has yet (stable per pane).
function assign(list) {
  const saved = savedPicks();
  const ids = {};
  const fresh = {};
  const used = new Set();
  for (const a of list) {
    const id = saved[slotOf(a)];
    if (has(id)) { ids[a.address] = id; used.add(id); }
  }
  for (const a of list) {
    if (ids[a.address]) continue;
    let i = hash(slotOf(a)) % COUNT;
    for (let n = 0; n < COUNT && used.has(idAt(i)); n++) i = (i + 1) % COUNT;
    const id = idAt(i);
    ids[a.address] = id;
    if (a.pane) fresh[a.pane] = id; // only remember agents that have a pane (sub-agents don't)
    used.add(id);
  }
  return { ids, fresh };
}

function tabsById() {
  const out = {};
  for (const s of spaces()) for (const t of s.tabs) out[t.id] = { ...t, space_name: s.name };
  return out;
}

function tagOf(a, tabs) {
  const t = tabs[a.tab];
  if (t?.named) return t.name;
  return a.space_name || a.tab_name || a.address;
}

// What the Pokémon is doing: walks while working, strolls while idle, sleeps when idle long.
function moodOf(a, tabs, now) {
  if (a.status === "blocked") return "blocked";
  if (a.status === "done") return "done";
  if (a.status === "working") return "working";
  // changed_at is null when nothing in the tab changed since the app started: idle all along.
  const changed = tabs[a.tab]?.changed_at;
  return changed == null || now - changed > SLEEP_AFTER ? "sleep" : "idle";
}

// Dex numbers whose Japanese or English name contains the search, or whose number starts with it.
function matches(query) {
  const f = query.trim().toLowerCase().replace(/^#/, "");
  const out = [];
  for (const [id, en, ja] of DEX) {
    if (ja.includes(f) || en.toLowerCase().includes(f) || String(id) === f.replace(/^0+/, "") || String(id).padStart(4, "0").startsWith(f)) out.push(id);
  }
  return out;
}

const genIds = (g) => DEX.filter(([id]) => id >= GENS[g][1] && id <= GENS[g][2]).map(([id]) => id);
const genOf = (id) => Math.max(0, GENS.findIndex(([, lo, hi]) => id >= lo && id <= hi));

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const zoom = () => (Number(settings()?.zoom) > 0 ? Number(settings().zoom) : 1);

// ---- the view -------------------------------------------------------------------

export default class PokemonPlus extends View {
  init(_p, cx) {
    this.picker = !!props()?.picker;
    if (this.picker) return this.initPicker(cx);
    if (!shared(KEY)) {
      const old = shared(OLD_KEY)?.panes;
      if (old && typeof old === "object") setShared(KEY, { panes: { ...old } });
    }
    this.width = 900;
    this.height = 112;
    this.mons = {}; // address -> { x, from, target, dir, moving, start, dur, pauseUntil, mood }
    this.sprites = {}; // dex number -> meta | "loading" | { error }
    this.balls = {}; // dex number -> the ball shown while its sprite loads
    this.assets = {}; // dex number -> "loading" | "ready" | { error, at }
    this.cries = {}; // dex number -> "loading" | { cry, chirp } | { error, at }
    this.seen = {}; // address -> its status at the last tick (no cry for one already blocked)
    this.cried = 0;
    this.hover = null;
    this.magick = null; // null: not checked yet
    cx.spawn(async (cx) => {
      this.magick = !!(await imageMagick());
      cx.notify();
    });
    cx.timer.every(250, (cx) => this.tick(cx));
    // keys.json: "alt-shift-p": "pokemon-plus.pick" chooses the focused agent's Pokémon.
    cx.spawn(async () => {
      for (;;) {
        const c = await nextCommand();
        if (c !== "pick") continue;
        const list = agents();
        const a = list.find((x) => x.focused) ?? list[0];
        if (a) this.openPicker(a, assign(list).ids[a.address], tagOf(a, tabsById()));
      }
    });
  }

  // Loads one Pokémon's sprites in the background; a failed one retries after a minute.
  want(id, cx) {
    const cur = this.sprites[id];
    if (cur === "loading" || (cur && !cur.error)) return;
    if (cur?.error && Date.now() - cur.at < 60000) return;
    this.sprites[id] = "loading";
    cx.spawn(async (cx) => {
      try {
        this.sprites[id] = await loadSprite(id);
        delete this.balls[id]; // the next wait gets a new ball
      } catch (e) {
        this.sprites[id] = { error: String(e?.message ?? e), at: Date.now() };
      }
      cx.notify();
    });
  }

  // Fetches a Pokémon's menu icon and portraits, and tells the tab bar and the list what it has.
  wantAssets(id, cx) {
    const cur = this.assets[id];
    if (cur === "loading" || cur === "ready") return;
    if (cur?.error && Date.now() - cur.at < 60000) return;
    this.assets[id] = "loading";
    cx.spawn(async () => {
      try {
        await ensureIcons([id]);
        const icon = await hasIcon(id);
        // The icon is announced even when the faces fail; those retry after a minute.
        let faces = [];
        let failed = null;
        try { faces = await ensurePortraits(id); } catch (e) { failed = e; }
        const all = shared(ASSETS) ?? {};
        const next = { icon, faces };
        if (JSON.stringify(all[id]) !== JSON.stringify(next)) setShared(ASSETS, { ...all, [id]: next });
        this.assets[id] = failed ? { error: String(failed?.message ?? failed), at: Date.now() } : "ready";
      } catch (e) {
        this.assets[id] = { error: String(e?.message ?? e), at: Date.now() };
      }
    });
  }

  // Fetches a Pokémon's cry ahead of time, so it plays the moment its agent blocks.
  wantCry(id, cx) {
    const cur = this.cries[id];
    if (cur === "loading" || cur?.cry) return;
    if (cur?.error && Date.now() - cur.at < 60000) return;
    this.cries[id] = "loading";
    cx.spawn(async () => {
      try {
        const cry = await ensureCry(id, enNameOf(id));
        this.cries[id] = { cry, chirp: (await ensureChirp(id, enNameOf(id))) ?? cry };
      } catch (e) {
        this.cries[id] = { error: String(e?.message ?? e), at: Date.now() };
      }
    });
  }

  // An agent that has just started waiting on you cries; one that just finished unseen chirps.
  cry(list, ids, now) {
    const live = new Set();
    for (const a of list) {
      live.add(a.address);
      const was = this.seen[a.address];
      this.seen[a.address] = a.status;
      if (was === undefined || was === a.status || (a.status !== "blocked" && a.status !== "done")) continue;
      const sound = this.cries[ids[a.address]];
      const path = a.status === "blocked" ? sound?.cry : sound?.chirp;
      if (path && now - this.cried >= CRY_GAP) {
        playSound(path);
        this.cried = now;
      }
    }
    for (const k of Object.keys(this.seen)) if (!live.has(k)) delete this.seen[k];
  }

  tick(cx) {
    const now = Date.now();
    const list = agents();
    const tabs = tabsById();
    const { ids, fresh } = assign(list);
    if (Object.keys(fresh).length) savePicks(fresh); // keeps new agents' Pokémon stable
    const cries = props()?.cries === true;
    for (const id of new Set(Object.values(ids))) {
      if (this.magick) this.want(id, cx);
      this.wantAssets(id, cx);
      if (cries) this.wantCry(id, cx);
    }
    if (cries) this.cry(list, ids, now);

    const lo = SLOT / 2;
    const hi = Math.max(lo, this.width - SLOT / 2);
    let changed = false;
    const live = new Set();
    list.forEach((a, i) => {
      live.add(a.address);
      let m = this.mons[a.address];
      if (!m) {
        const x = clamp(((i + 0.5) / list.length) * this.width + rand(-20, 20), lo, hi);
        m = this.mons[a.address] = { x, from: x, target: x, dir: Math.random() < 0.5 ? "l" : "r", moving: false, start: 0, dur: 0, pauseUntil: now + rand(300, 2500), mood: null };
        changed = true;
      }
      const mood = moodOf(a, tabs, now);
      if (mood !== m.mood) { m.mood = mood; changed = true; }
      if (m.moving) {
        const f = clamp((now - m.start) / m.dur, 0, 1);
        if (m.target < lo || m.target > hi) {
          // The strip got narrower mid-walk: stop inside it instead of walking off the edge.
          m.x = m.target = clamp(m.from + (m.target - m.from) * f, lo, hi);
          m.moving = false;
          m.dur = 150;
          m.pauseUntil = now + rand(1000, 3000);
          changed = true;
        } else if (f >= 1) {
          m.moving = false;
          m.x = m.target;
          m.pauseUntil = now + (mood === "working" ? rand(300, 1800) : rand(4000, 12000));
          changed = true;
        } else if (mood !== "working" && mood !== "idle") {
          // Stop where it is: something needs the person, or it fell asleep.
          m.x = m.target = m.from + (m.target - m.from) * f;
          m.moving = false;
          m.dur = 150;
          changed = true;
        }
      } else if ((mood === "working" || mood === "idle") && now >= m.pauseUntil && hi > lo) {
        let target = rand(lo, hi);
        if (Math.abs(target - m.x) < 60) target = m.x + (target >= m.x ? 60 : -60);
        target = clamp(target, lo, hi);
        if (Math.abs(target - m.x) >= 8) {
          m.from = m.x;
          m.target = target;
          m.dir = target > m.x ? "r" : "l";
          m.start = now;
          m.dur = (Math.abs(target - m.x) / SPEED[mood]) * 1000;
          m.moving = true;
          changed = true;
        } else {
          m.pauseUntil = now + rand(1000, 3000);
        }
      }
      if (!m.moving && (m.x < lo || m.x > hi)) { m.x = m.target = clamp(m.x, lo, hi); m.dur = 150; changed = true; }
    });
    for (const k of Object.keys(this.mons)) if (!live.has(k)) { delete this.mons[k]; changed = true; }
    if (changed) cx.notify();
  }

  openPicker(a, id, tag) {
    openOverlay({
      mod: "pokemon-plus",
      kind: "dialog",
      width: 720,
      height: 600,
      props: { picker: true, slot: slotOf(a), current: id, tag },
    });
  }

  render(cx) {
    return this.picker ? this.renderPicker(cx) : this.renderStrip(cx);
  }

  renderStrip(cx) {
    const t = theme();
    const configuredScale = props()?.scale;
    const scale = Number.isFinite(configuredScale) && configuredScale > 0 ? configuredScale : 1;
    const now = Date.now();
    const list = agents();
    const tabs = tabsById();
    const { ids } = assign(list);
    const ground = this.height - FEET;

    const root = div()
      .id("pokemon-strip")
      .relative()
      .size_full()
      .overflow_hidden()
      .bg(t.chrome)
      .on_size_change((size, cx) => {
        // The size comes in zoomed px, but everything here is drawn in unzoomed units.
        const width = size.width / zoom();
        const height = size.height / zoom();
        if (Math.abs(width - this.width) > 1 || Math.abs(height - this.height) > 1) {
          this.width = width;
          this.height = height;
          cx.notify();
        }
      })
      // the ground: a faint line the Pokémon stand on
      .child(div().absolute().left(0).right(0).top(ground + 4).h(1).bg(t.border));

    if (list.length === 0) {
      return root.child(
        div().absolute().inset_0().flex().items_center().justify_center()
          .text_size(12).text_color(t.dim)
          .child("No agents yet. Each agent you start shows up here as a Pokémon."),
      );
    }
    if (this.magick === false) {
      root.child(
        div().absolute().top(8).right(12).text_size(11).text_color(t.muted)
          .child("Install ImageMagick (magick) to see the Pokémon"),
      );
    }

    const order = [...list].sort((a, b) => (this.mons[a.address]?.x ?? 0) - (this.mons[b.address]?.x ?? 0));
    // Name tags never overlap: the ones that matter most (hovered, needs you, focused) win.
    const rank = (a) => (this.hover === a.address ? 0 : a.status === "blocked" ? 1 : a.status === "done" ? 2 : a.focused ? 3 : 4);
    const placed = [];
    const showTag = new Set();
    for (const a of [...list].sort((x, y) => rank(x) - rank(y))) {
      const m = this.mons[a.address];
      const f = m?.moving ? clamp((now - m.start) / m.dur, 0, 1) : 1;
      const cx0 = m ? m.from + ((m.moving ? m.target : m.x) - m.from) * f : this.width / 2;
      const text = this.hover === a.address ? `${nameOf(ids[a.address])} · ${tagOf(a, tabs)}` : tagOf(a, tabs);
      const half = Math.min(SLOT - 8, text.length * 6 + 18) / 2;
      if (placed.every(([l, r]) => cx0 + half + 6 < l || cx0 - half - 6 > r)) {
        placed.push([cx0 - half, cx0 + half]);
        showTag.add(a.address);
      }
    }
    for (const a of order) {
      const id = ids[a.address];
      const m = this.mons[a.address] ?? { x: this.width / 2, target: this.width / 2, dir: "r", moving: false, dur: 0 };
      const mood = m.mood ?? moodOf(a, tabs, now);
      const meta = this.sprites[id];
      const tag = tagOf(a, tabs);
      const hovered = this.hover === a.address;
      const x = m.moving ? m.target : m.x;

      let body;
      let headY = ground - 40 * scale;
      if (meta && meta.walkR) {
        const s = mood === "sleep" ? meta.sleep
          : m.moving ? (m.dir === "r" ? meta.walkR : meta.walkL)
          : (m.dir === "r" ? meta.idleR : meta.idleL);
        // Stand the sprite's visible feet on the ground line, centered on its visible body.
        const left = SLOT / 2 - (s.box.x + s.box.w / 2) * scale;
        const top = ground - (s.box.y + s.box.h) * scale;
        headY = ground - s.box.h * scale;
        const shadowW = Math.max(14, Math.round(s.box.w * 0.7)) * scale;
        body = div()
          .child(div().absolute().left(SLOT / 2 - shadowW / 2).top(ground - 2 * scale).w(shadowW).h(6 * scale).rounded_full().bg("#00000030"))
          .child(image(s.path).absolute().left(left).top(top).w(s.w * scale).h(s.h * scale));
      } else {
        // Loading (or no ImageMagick): a ball waits in its place.
        const size = 24 * scale;
        headY = ground - size;
        // Picked at the first frame it shows, so the same ball stays until the sprite is ready.
        this.balls[id] ??= BALLS[Math.floor(Math.random() * BALLS.length)];
        body = image(`mods/pokemon-plus/balls/${this.balls[id]}.png`)
          .absolute().left(SLOT / 2 - size / 2).top(ground - size).size(size)
          .when(meta === "loading" || meta === undefined, (el) => el.loop("opacity", { from: 0.35, to: 1, period: 1200 }));
      }

      const bubble =
        mood === "blocked" ? div().px(6).rounded(7).bg(t.blocked).text_color("#ffffff").font_bold().child("!")
            .loop("opacity", { from: 0.7, to: 1, period: 900 })
        : mood === "done" ? div().px(6).rounded(7).bg(t.done).text_color("#ffffff").font_bold().child("✓")
        : mood === "sleep" ? div().text_color(t.muted).frames(["z", "zZ", "zZz", "zZ"], 700)
        : null;

      const name = hovered ? `${nameOf(id)} · ${tag}` : tag;
      root.child(
        div()
          .id(`mon-${a.address}`)
          .absolute()
          .top(0)
          .h_full()
          .w(SLOT)
          .left(x - SLOT / 2)
          .transition("left", { duration: Math.max(1, Math.round(m.moving ? m.dur : m.dur || 150)), easing: "linear" })
          .cursor_pointer()
          .on_hover((h, cx) => {
            const next = h ? a.address : this.hover === a.address ? null : this.hover;
            if (next !== this.hover) { this.hover = next; cx.notify(); }
          })
          .on_click(() => (a.pane ? run("pane.focus", { pane: a.pane }) : run("agent.focus", { terminal: a.address })))
          .on_mouse_down("right", (_e, cx) => {
            cx.stop_propagation();
            this.openPicker(a, id, tag);
          })
          .child(body)
          .when(!!bubble, (el) =>
            el.child(h_flex().absolute().left(0).w(SLOT).top(Math.max(2, headY - 22)).justify_center().text_size(12.5).child(bubble)))
          .when(showTag.has(a.address), (el) => el.child(
            h_flex()
              .absolute().left(4).w(SLOT - 8).top(ground + 6).h(LABEL_H)
              .justify_center().items_center().gap(4)
              .child(div().flex_none().size(6).rounded_full().bg(t[a.status] ?? t.idle))
              .child(
                div().min_w(0).truncate().text_size(10.5)
                  .text_color(hovered || a.focused ? t.foreground : t.muted)
                  .child(name),
              ),
          )),
      );
    }
    return root;
  }

  // ---- the picker (opened as a dialog with props { picker, slot, current, tag }) ----
  // One generation at a time (about 150 Pokémon), or the search results across all of them.

  initPicker(cx) {
    this.filter = "";
    this.gen = genOf(props()?.current ?? 1);
    this.icons = new Set(); // dex numbers whose icon is on disk
    this.fetching = null; // the id list being fetched; another waits in this.queued
    this.queued = null;
    this.input = InputState.new({ placeholder: "名前（日本語・英語）か番号で検索…" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); this.wantIcons(this.shown(), cx); cx.notify(); });
    this.input.on("submit", () => {
      const shown = this.shown();
      if (shown.length === 1) this.choose(shown[0]);
    });
    this.input.focus();
    cx.timer.after(300, () => this.input.focus());
    this.wantIcons(this.shown(), cx);
  }

  shown() {
    return this.filter.trim() ? matches(this.filter).slice(0, RESULTS) : genIds(this.gen);
  }

  // Downloads the icons of what is shown, one batch at a time; the newest request wins the queue.
  wantIcons(ids, cx) {
    if (this.fetching) { this.queued = ids; return; }
    this.fetching = ids;
    cx.spawn(async (cx) => {
      try {
        await ensureIcons(ids);
      } catch {}
      for (const id of ids) if (!this.icons.has(id) && (await hasIcon(id))) this.icons.add(id);
      this.fetching = null;
      cx.notify();
      const next = this.queued;
      this.queued = null;
      if (next) this.wantIcons(next, cx);
    });
  }

  choose(id) {
    const p = props();
    savePicks({ [p.slot]: id });
    closeOverlay(p.overlay);
  }

  renderPicker(cx) {
    const t = theme();
    const p = props() ?? {};
    const searching = !!this.filter.trim();
    const shown = this.shown();
    return v_flex()
      .id("pokemon-picker")
      .size_full()
      .min_h(0)
      .p(18)
      .gap(10)
      .bg(t.popover)
      .child(
        h_flex().items_center().justify_between()
          .child(
            v_flex().min_w(0).gap(2)
              .child(div().text_size(15).font_semibold().text_color(t.foreground).child("ポケモンを選ぶ"))
              .child(div().text_size(11.5).text_color(t.muted).truncate().child(`${p.tag ?? "このエージェント"} · いまは ${nameOf(p.current)}`)),
          )
          .child(div().text_size(11).text_color(t.dim).child("Esc")),
      )
      .child(
        Input.new(this.input).h(34).flex_none().px(10).rounded(8).border_1().border_color(t.accent)
          .bg(t.background).text_size(12.5).text_color(t.foreground),
      )
      .child(
        h_flex().flex_wrap().gap(4).flex_none().children(GENS.map(([label], g) => {
          const on = !searching && g === this.gen;
          return div().id(`gen-${g}`).px(8).h(24).flex().items_center().rounded(6).text_size(11.5)
            .bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
            .hover((s) => s.bg(t.hover)).cursor_pointer()
            .on_click((_e, cx) => {
              this.gen = g;
              this.filter = "";
              this.input.set_value("");
              this.wantIcons(genIds(g), cx);
              cx.notify();
            })
            .child(label);
        })),
      )
      .when(searching, (el) => el.child(div().text_size(11).text_color(t.dim).child(
        shown.length >= RESULTS ? `先頭の ${RESULTS} 件を表示中。もう少し絞り込んでください。` : `${shown.length} 件`)))
      .child(
        div().flex_1().min_h(0).overflow_y_scrollbar().child(
          h_flex().flex_wrap().gap(6).children(
            shown.map((id) => {
              const current = id === p.current;
              return v_flex()
                .id(`pick-${id}`)
                .w(92).h(96).flex_none()
                .items_center().justify_center().gap(2)
                .rounded(8).border_1()
                .border_color(current ? t.accent : "#00000000")
                .bg(current ? t.selected : "#00000000")
                .hover((s) => s.bg(t.hover))
                .cursor_pointer()
                .on_click(() => this.choose(id))
                .child(
                  this.icons.has(id)
                    ? image(iconPath(id)).w(80).h(60).flex_none()
                    : div().w(80).h(60).flex_none(),
                )
                .child(div().text_size(9.5).text_color(t.dim).child(dexNo(id)))
                .child(div().w_full().px(2).text_center().truncate().text_size(11).text_color(t.foreground).child(nameOf(id)));
            }),
          ),
        ),
      );
  }
}
