// Plan: local plans in Herdr tabs.
//
// - `{ plan: <folder>, demo? }`, the pane of a Plan tab: the local plan in that
//   folder, laid out like the claude.ai plan page (plan-view.js).
// - no plan, opened with `mod.open {name: "plan"}` (cmd-shift-o in keys.json):
//   a picker of the plans in the focused space's repo. Enter or a click opens
//   one in a Plan tab; a folder or a slug can be typed instead.
//
// Finding plans and their tabs (find.js) and reading a plan (plan.js) hold no
// rendering.
import { View, div } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { closeOverlay, props, theme } from "herdr";
import { here, localPlan, localPlans, openPlanPane, openPlanTab } from "./find.js";
import { PlanView } from "./plan-view.js";
import { demoPlan } from "./demo.js";

// Test data: true makes the picker open demo.js's plan in a Plan tab, whatever
// is picked.
const DEMO = false;

const SHOWN = 12;

export default class Plan extends View {
  init(_props, cx) {
    if (props()?.plan) {
      this.view = new PlanView(props().plan, props().demo ? demoPlan : null);
      this.view.init(cx);
      return;
    }
    this.folder = here();
    this.plans = null; // until read
    this.text = "";
    this.at = 0;
    this.error = "";
    this.input = InputState.new({ value: "", placeholder: "Filter, or a plan's folder or slug" });
    this.input.on("change", (_e, cx) => { this.text = this.input.value(); this.at = 0; this.error = ""; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.submit(cx));
    this.handle = cx.focus_handle();
    this.input.focus();
    cx.timer.after(300, () => this.input.focus());
    cx.spawn(async (cx) => {
      try {
        this.plans = this.folder ? await localPlans(this.folder) : [];
      } catch (e) {
        this.plans = [];
        this.error = String(e?.message ?? e);
      }
      cx.notify();
    });
  }

  // The plans the filter matches, by title or slug.
  shown() {
    const q = this.text.trim().toLowerCase();
    const all = this.plans ?? [];
    return (q ? all.filter((p) => `${p.title} ${p.slug}`.toLowerCase().includes(q)) : all).slice(0, SHOWN);
  }

  close() {
    closeOverlay(props().overlay);
  }

  // as: "pane" (a split of the focused pane) or "tab".
  open(dir, as = "pane") {
    this.close();
    const open = as === "tab" ? openPlanTab : openPlanPane;
    open(DEMO ? "/demo/repo/.plans/wid-12-rate-limit-headers" : dir, DEMO ? { demo: true } : {});
  }

  // Enter opens a pane, Shift-Enter a tab: the highlighted plan, else what was
  // typed as a folder or slug.
  submit(cx, as = "pane") {
    const pick = this.shown()[this.at];
    if (pick) return this.open(pick.dir, as);
    if (!this.text.trim()) return;
    cx.spawn(async (cx) => {
      try {
        this.open(await localPlan(this.text, this.folder), as);
      } catch (e) {
        this.error = String(e?.message ?? e);
        cx.notify();
      }
    });
  }

  key(e, cx) {
    const n = this.shown().length;
    if (e.keystroke === "shift-enter") this.submit(cx, "tab");
    else if (e.key === "escape") this.close();
    else if (e.key === "down" && n) this.at = (this.at + 1) % n;
    else if (e.key === "up" && n) this.at = (this.at + n - 1) % n;
    else return;
    cx.stop_propagation();
    cx.notify();
  }

  // A button with its key hint; the primary one is filled.
  button(id, label, hint, primary, onClick) {
    const t = theme();
    return h_flex().id(id).gap(6).px(10).h(26).items_center().rounded(6).cursor_pointer()
      .text_size(12).border(1).border_color(t.accent)
      .when(primary, (el) => el.bg(t.accent).text_color(t.background))
      .when(!primary, (el) => el.text_color(t.foreground).hover((s) => s.bg(t.hover)))
      .on_click((_e, cx) => onClick(cx))
      .child(label).child(div().text_size(11).opacity(0.7).child(hint));
  }

  renderPicker() {
    const t = theme();
    const rows = this.shown();
    return v_flex().id("plan-picker").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .size_full().p(16).gap(10).bg(t.popover).text_size(13).text_color(t.foreground)
      .child(div().font_semibold().child("Open a plan"))
      .child(Input.new(this.input).h(32).px(10).items_center().rounded(6).border(1)
        .border_color(t.accent).bg(t.background).text_color(t.foreground))
      .when(Boolean(this.error), (el) => el.child(div().text_size(12).text_color(t.blocked).child(this.error)))
      .child(v_flex().flex_1().min_h(0).gap(2)
        .when(this.plans === null, (el) => el.child(div().text_size(12).text_color(t.dim).child("Looking for plans…")))
        .when(this.plans !== null && !rows.length, (el) => el.child(div().text_size(12).text_color(t.dim)
          .child(this.plans.length ? "No plan matches; Enter opens it as a folder or slug." : "No plans in this space's repo.")))
        .children(rows.map((p, i) => h_flex().id(`plan-${p.slug}`).gap(8).px(8).py(5).rounded(6).items_center()
          .cursor_pointer().when(i === this.at, (el) => el.bg(t.hover)).hover((s) => s.bg(t.hover))
          .on_click(() => this.open(p.dir))
          .child(div().flex_1().min_w(0).truncate().child(p.title))
          .child(div().flex_none().text_size(11.5).text_color(t.dim).child(p.status ?? p.slug)))))
      .child(h_flex().items_center().gap(8).text_size(11).text_color(t.dim)
        .child(div().flex_1().child("↑↓ choose · esc close"))
        .child(this.button("plan-open-tab", "Open as tab", "⇧↵", false, cx => this.submit(cx, "tab")))
        .child(this.button("plan-open-pane", "Open as pane", "↵", true, cx => this.submit(cx, "pane"))));
  }

  render() {
    return this.view ? this.view.render() : this.renderPicker();
  }
}
