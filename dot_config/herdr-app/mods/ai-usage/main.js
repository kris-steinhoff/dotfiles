// AI service usage at the right end of the bottom bar, from the `ai-usage`
// script in ~/.local/bin. That script keeps a shared cache with its own fetch
// interval, so polling it here never adds requests to the providers. The mod
// also re-reads whenever that cache changes, so a fetch made by the live view
// (or its Ctrl-R) shows here at once rather than up to a minute later.
//
// Each service is one glyph of nested rings, one ring per limit window, the
// longest window innermost. A ring fills with the share used. Its color goes
// by pace, not by the raw percent: 70% of a week with a day left is fine, 40%
// of five hours after twenty minutes is not.
import { View, div, PathBuilder } from "gpui-kit";
import { h_flex } from "gpui-base";
import { exec, home, layout, run, spaces, theme, watchFolder } from "herdr";

const BLOCK_ID = "ai-usage";
const POLL_MS = 60_000;
const PAD_X = 14; // matches the shipped status bar
const GLYPH = 18; // px; the bar is 28 tall
const MAX_RINGS = 3;
const LIVE_TAB = "AI usage";
const NAMES = { claude: "Claude", chatgpt: "ChatGPT", openrouter: "OpenRouter" };

// The script's cache, where every caller's fetches land.
const cacheDir = () => `${home()}/.local/state/ai-usage`;

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// How far the window is ahead of the even pace, as a share of its length,
// from `ai-usage` (see `ahead_of_pace` there). Ahead at all means on track to
// run out before the reset; negative when behind pace, null when the window
// has no fixed length or reset time.
const ahead = (w) => w.ahead_of_pace ?? null;

// ok, warn, high, or danger, from `ai-usage`, which colors its own bars by
// the same rule (see `level` there). The theme has no orange, so a ring
// shows high in the warning color.
const level = (w) => w.level ?? "ok";

function duration(ms) {
  const mins = Math.round(ms / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function untilReset(iso, now) {
  if (!iso) return "";
  const ms = Date.parse(iso) - now;
  if (!(ms > 0)) return "resetting";
  return `resets in ${duration(ms)}`;
}

// Ring geometry for n rings in the glyph: radii outermost first, and a stroke
// that leaves a hairline between neighbours.
function rings(n) {
  const outer = GLYPH / 2 - 1;
  if (n === 1) return { stroke: 2.5, radii: [outer - 0.25] };
  const step = Math.min(3.5, (outer - 3) / (n - 1));
  const stroke = Math.min(2, step - 1);
  return { stroke, radii: Array.from({ length: n }, (_, i) => outer - stroke / 2 - i * step) };
}

const C = GLYPH / 2;
const at = (r, frac) => [C + r * Math.sin(frac * 2 * Math.PI), C - r * Math.cos(frac * 2 * Math.PI)];

// A circle as two half arcs, added to a builder as its own subpath.
function circle(b, r) {
  return b.move_to(C, C - r).arc_to(r, r, 0, false, true, C, C + r).arc_to(r, r, 0, false, true, C, C - r);
}

// Clockwise from twelve o'clock, `frac` of the way round.
function arc(b, r, frac) {
  if (frac >= 0.999) return circle(b, r);
  const [x, y] = at(r, frac);
  return b.move_to(C, C - r).arc_to(r, r, 0, frac > 0.5, true, x, y);
}

function layer(path, color) {
  return window.paint_path(path, color).absolute().top(0).left(0).size(GLYPH);
}

export default class AiUsage extends View {
  init(_props, cx) {
    this.services = null; // [{ id, name, status, error, windows }]
    this.failure = null;
    this.refresh(cx);
    // The timer keeps pace current and lets the script fetch when it's due.
    cx.timer.every(POLL_MS, (cx) => this.refresh(cx));
    cx.spawn(async (cx) => {
      try {
        for (;;) {
          await watchFolder(cacheDir());
          this.refresh(cx);
        }
      } catch (e) {
        console.log(`ai-usage: can't watch the cache, polling only: ${e?.message ?? e}`);
      }
    });
  }

  // A refresh asked for while one runs (a cache write it caused, or a click)
  // runs again after it, so the last change is never missed.
  refresh(cx) {
    if (this.busy) {
      this.again = true;
      return;
    }
    this.busy = true;
    this.again = false;
    cx.spawn(async (cx) => {
      try {
        const r = await exec(`${home()}/.local/bin/ai-usage`, ["--json", "windows"], { timeout: 120_000 });
        if (r.code !== 0) throw new Error(r.stderr.trim().split("\n").pop() || `exit ${r.code}`);
        const data = JSON.parse(r.stdout);
        this.services = Object.entries(data)
          .filter(([, s]) => (s.status === "ok" || s.status === "stale") && s.windows.length > 0)
          .map(([id, s]) => ({ id, name: NAMES[id] ?? id, status: s.status, error: s.error, windows: s.windows }));
        this.failure = this.services.length ? null : "No service reported usage";
      } catch (e) {
        this.failure = `ai-usage failed: ${e?.message ?? e}`;
      } finally {
        this.busy = false;
      }
      cx.notify();
      if (this.again) this.refresh(cx);
    });
  }

  // The block is as wide as what it shows: the content row is measured and
  // the block resized to fit, so the bar's other items keep their room.
  fitBlock(contentWidth, cx) {
    const px = Math.ceil(contentWidth) + 2 * PAD_X;
    const current = find(layout(), BLOCK_ID)?.size?.px;
    if (current !== undefined && Math.abs(current - px) <= 1) return;
    if (this.resizingTo === px) return;
    this.resizingTo = px;
    cx.spawn(async () => {
      run("layout.resize", { id: BLOCK_ID, px });
      this.resizingTo = null;
    });
  }

  // The windows a glyph draws, outermost first: the shortest outside, the
  // longest (and those with no fixed length) inside.
  // Past MAX_RINGS, the ones furthest along their pace are kept.
  ringWindows(s) {
    const length = (w) => w.window_seconds ?? Infinity;
    let ws = [...s.windows];
    if (ws.length > MAX_RINGS) {
      const urgency = (w) => ahead(w) ?? w.used_percent / 100 - 1;
      ws = ws.sort((a, b) => urgency(b) - urgency(a)).slice(0, MAX_RINGS);
    }
    return ws.sort((a, b) => (length(a) === length(b) ? 0 : length(a) - length(b)));
  }

  tooltip(s, ws, now) {
    const lines = ws.map((w) => {
      const parts = [`${w.label}: ${Math.round(w.used_percent)}%`];
      const a = ahead(w);
      if (a !== null && a * w.window_seconds >= 60) parts.push(`on pace again in ${duration(a * w.window_seconds * 1000)}`);
      const reset = untilReset(w.resets_at, now);
      if (reset) parts.push(reset);
      return parts.join(" · ");
    });
    const hidden = s.windows.length - ws.length;
    if (hidden > 0) lines.push(`${hidden} more in the live view`);
    if (s.status === "stale") lines.push(`Stale: ${s.error ?? "last fetch failed"}`);
    return [s.name, ...lines].join("\n");
  }

  glyph(t, s, now) {
    const ws = this.ringWindows(s);
    const { stroke, radii } = rings(ws.length);
    const colors = { ok: t.accent, warn: t.ansi3, high: t.ansi3, danger: t.ansi1 };

    const track = radii.reduce((b, r) => circle(b, r), PathBuilder.stroke(stroke)).build();
    const layers = [layer(track, t.border)];

    ws.forEach((w, i) => {
      const frac = Math.max(0, Math.min(1, w.used_percent / 100));
      if (frac > 0.005) {
        const color = s.status === "stale" ? t.dim : colors[level(w)];
        layers.push(layer(arc(PathBuilder.stroke(stroke), radii[i], frac).build(), color));
      }
    });

    // No label: hovering names the service.
    return div().id(`svc-${s.id}`).relative().size(GLYPH).flex_none()
      .tooltip(this.tooltip(s, ws, now)).children(layers);
  }

  // Shows the live `ai-usage` view: the tab already running it if there is
  // one (this space's first), else a new tab in this space.
  openLive() {
    const all = spaces();
    const ordered = [...all.filter((s) => s.active), ...all.filter((s) => !s.active)];
    for (const space of ordered) {
      const tab = space.tabs.find((tb) => tb.named && tb.name === LIVE_TAB);
      if (tab) {
        if (!space.active) run("space.select", { id: space.id });
        run("tab.select", { id: tab.id });
        return;
      }
    }
    run("tab.new", { name: LIVE_TAB, argv: ["ai-usage"] });
  }

  render() {
    const t = theme();
    const now = Date.now();

    const content = this.services?.length
      ? this.services.map((s) => this.glyph(t, s, now))
      : [div().id("empty").text_color(t.dim).tooltip(this.failure ?? "Loading AI usage")
          .child(this.services === null && !this.failure ? "AI usage …" : "AI usage unavailable")];

    return h_flex().id("root").size_full().px(PAD_X).justify_end().items_center()
      .bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).cursor_pointer()
      .on_click((_e, cx) => {
        this.refresh(cx);
        this.openLive();
      })
      .child(h_flex().id("content").flex_none().gap(12).items_center()
        .on_size_change((size, cx) => this.fitBlock(size.width, cx))
        .children(content));
  }
}
