// AI service usage at the foot of the sidebar, from the `ai-usage` script in
// ~/.local/bin. That script keeps a shared cache with its own fetch interval,
// so polling it here never adds requests to the providers.
import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { exec, home, layout, run, theme } from "herdr";

const BLOCK_ID = "ai-usage";
const POLL_MS = 60_000;
const NAMES = { claude: "Claude", chatgpt: "ChatGPT", openrouter: "OpenRouter" };

// Heights, in px, that the block is sized from.
const PAD_Y = 8;
const TITLE_H = 15;
const ROW_H = 16;
const ROW_GAP = 3;
const SERVICE_GAP = 8;

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// Matches the shipped sidebar mods: the rail goes by the sidebar's width.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

function barColor(t, pct) {
  if (pct >= 90) return t.ansi1;
  if (pct >= 75) return t.ansi3;
  return t.accent;
}

function untilReset(iso) {
  if (!iso) return "";
  const ms = Date.parse(iso) - Date.now();
  if (!(ms > 0)) return "resetting";
  const mins = Math.round(ms / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `resets in ${d}d ${h}h`;
  if (h > 0) return `resets in ${h}h ${m}m`;
  return `resets in ${m}m`;
}

export default class AiUsage extends View {
  init(_props, cx) {
    this.services = null; // [{ id, name, status, windows }]
    this.failure = null;
    this.refresh(cx);
    cx.timer.every(POLL_MS, (cx) => this.refresh(cx));
  }

  refresh(cx) {
    if (this.busy) return;
    this.busy = true;
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
    });
  }

  // The block's height follows its rows, so it never clips or leaves a gap.
  wantedHeight(collapsed) {
    const inner = !this.services?.length
      ? ROW_H
      : collapsed
        ? this.services.length * ROW_H + (this.services.length - 1) * ROW_GAP
        : this.services.reduce((sum, s) => sum + TITLE_H + s.windows.length * (ROW_H + ROW_GAP), 0) +
          (this.services.length - 1) * SERVICE_GAP;
    return inner + 2 * PAD_Y + 1; // + the top border
  }

  fitBlock(cx, collapsed) {
    const px = this.wantedHeight(collapsed);
    if (find(layout(), BLOCK_ID)?.size?.px === px || this.resizingTo === px) return;
    this.resizingTo = px;
    cx.spawn(async () => {
      run("layout.resize", { id: BLOCK_ID, px });
      this.resizingTo = null;
    });
  }

  render(cx) {
    const t = theme();
    const collapsed = narrow();
    this.fitBlock(cx, collapsed);
    const openLive = () => run("tab.new", { name: "AI usage", argv: ["ai-usage"] });

    const root = v_flex().id("root").size_full().bg(t.chrome).border_t(1).border_color(t.border)
      .px(collapsed ? 4 : 12).py(PAD_Y).text_size(12).cursor_pointer().on_click(openLive);

    if (!this.services?.length) {
      const text = this.services === null && !this.failure ? "…" : collapsed ? "–" : "AI usage unavailable";
      return root.child(h_flex().id("empty").h(ROW_H).items_center().when(collapsed, (el) => el.justify_center())
        .text_color(t.dim).tooltip(this.failure ?? "Loading AI usage").child(text));
    }

    if (collapsed) {
      return root.gap(ROW_GAP).children(this.services.map((s) => {
        const top = Math.max(...s.windows.map((w) => w.used_percent));
        const detail = s.windows.map((w) => `${w.label}: ${Math.round(w.used_percent)}%`).join("\n");
        return h_flex().id(`rail-${s.id}`).h(ROW_H).justify_center().items_center()
          .text_size(11).font_semibold().text_color(barColor(t, top))
          .tooltip(`${s.name}\n${detail}`).child(`${Math.round(top)}%`);
      }));
    }

    return root.gap(SERVICE_GAP).children(this.services.map((s) =>
      v_flex().gap(ROW_GAP)
        .child(h_flex().h(TITLE_H).gap(6).items_center().text_size(11).font_semibold().text_color(t.muted)
          .child(s.name)
          .when(s.status === "stale", (el) => el.child(div().id(`stale-${s.id}`).font_normal().text_color(t.dim)
            .tooltip(s.error ?? "Last fetch failed").child("stale"))))
        .children(s.windows.map((w) => {
          const pct = Math.max(0, Math.min(100, w.used_percent));
          const reset = untilReset(w.resets_at);
          return h_flex().id(`w-${s.id}-${w.key}`).h(ROW_H).gap(8).items_center()
            .tooltip(reset ? `${w.label} · ${reset}` : w.label)
            .child(div().w(92).flex_none().truncate().text_color(t.muted).child(w.label))
            .child(div().flex_1().h(4).rounded_full().bg(t.border).overflow_hidden()
              .child(div().h_full().w(`${pct}%`).rounded_full().bg(barColor(t, pct))))
            .child(div().w(34).flex_none().text_right().text_color(t.foreground).child(`${Math.round(w.used_percent)}%`));
        }))));
  }
}
