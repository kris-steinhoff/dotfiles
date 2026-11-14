// Drive: start and find the agents that drive a plan (see PROTOCOL.md).
//
// - `{ dialog: "plan", space? }`, opened with openOverlay (kind dialog): asks for
//   a plan (a plan page's link, a local plan's folder, or its slug), then starts
//   its driver or shows the one already running. `space` is where to find the
//   repo (default: the focused space).
// - `{ plan: <folder>, demo? }`, a pane in a plan's Plan tab: the local plan
//   in that folder, laid out like the plan page (plan-view.js).
// - no props: the panel (panel.js). In a plan's space it shows that plan in
//   detail; anywhere else it lists every plan.
//
// The model (model.js), the launching (launch.js), what the panel works out
// (view.js) and the plan's documents (plan.js) hold no rendering.
import { View, div } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { closeOverlay, focused, props, spaces, theme } from "herdr";
import { launchPlan, localPlans } from "./launch.js";
import { Panel } from "./panel.js";
import { PlanView } from "./plan-view.js";
import { demoPlan } from "./demo.js";

// Test data: true shows the made-up plans of demo.js, with a row of chips
// to switch between the views, instead of the real ones. Launching from the
// dialog is real either way; the panel's own buttons only say what they would
// do, except Open plan, which opens a Plan tab showing demo.js's plan.
const DEMO = false;

const DIALOGS = {
  plan: {
    title: "Drive a plan",
    placeholder: "A plan's slug or folder, or a plan page link",
    hint: "A local plan's slug in this space's repo, or its folder. For a plan page, its claude.ai/artifact/<id> link; the claude.ai/code/artifact/<uuid> form names the same page by another id and starts a separate record.",
  },
};

const LOCAL_SHOWN = 5;

export default class Drive extends View {
  init(_props, cx) {
    if (props()?.plan) {
      this.view = new PlanView(props().plan, props().demo ? demoPlan : null);
      this.view.init(cx);
      return;
    }
    this.kind = DIALOGS[props()?.dialog] ? props().dialog : null;
    this.busy = false;
    this.error = "";
    this.text = "";
    if (!this.kind) {
      this.panel = new Panel(DEMO);
      this.panel.init(cx);
      return;
    }
    this.input = InputState.new({ value: "", placeholder: DIALOGS[this.kind].placeholder });
    this.input.on("change", (_e, cx) => { this.text = this.input.value(); this.error = ""; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.go(cx));
    this.inputFocused = true;
    this.input.on("focus", (_e, cx) => { this.inputFocused = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.inputFocused = false; cx.notify(); });
    this.handle = cx.focus_handle();
    this.input.focus();
    cx.timer.after(300, () => this.input.focus());
    // The plans in this space's repo, to pick from.
    this.locals = [];
    cx.spawn(async (cx) => {
      try {
        const space = this.space();
        if (space) this.locals = (await localPlans(space)).filter((p) => p.status !== "done").slice(0, LOCAL_SHOWN);
      } catch {}
      cx.notify();
    });
  }

  space() {
    const id = props()?.space ?? focused()?.space;
    return spaces().find((s) => s.id === id) ?? null;
  }

  go(cx, picked = null) {
    if (this.busy) return;
    const text = (picked ?? this.text).trim();
    if (!text) return;
    const space = this.space();
    if (!space) {
      this.error = "No space to find the repo from.";
      cx.notify();
      return;
    }
    this.busy = true;
    this.error = "";
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await launchPlan(text, space);
        closeOverlay(props().overlay);
        return;
      } catch (e) {
        this.error = String(e?.message ?? e);
      }
      this.busy = false;
      cx.notify();
    });
  }

  key(e, cx) {
    if (e.key === "escape") {
      closeOverlay(props().overlay);
      cx.stop_propagation();
    }
  }

  renderDialog() {
    const t = theme();
    const d = DIALOGS[this.kind];
    return v_flex().id("drive-dialog").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .size_full().p(16).gap(10).bg(t.popover).text_size(13).text_color(t.foreground)
      .child(div().font_semibold().child(d.title))
      .child(Input.new(this.input).h(32).px(10).items_center().rounded(6).border(1)
        .border_color(this.inputFocused ? t.accent : t.input).bg(t.background).text_color(t.foreground))
      .child(div().text_size(11.5).text_color(t.dim).child(d.hint))
      .when(Boolean(this.error), (el) => el.child(div().text_color(t.blocked).child(this.error)))
      .when(this.locals?.length > 0, (el) => el.child(v_flex().gap(2)
        .child(div().text_size(11.5).font_semibold().text_color(t.dim).child("Plans in this repo"))
        .children(this.locals.map((p) => h_flex().id(`local-${p.slug}`).gap(8).px(6).py(4).rounded(6).items_center()
          .cursor_pointer().hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => this.go(cx, p.dir))
          .child(div().flex_1().min_w(0).truncate().child(p.title))
          .child(div().flex_none().text_size(11.5).text_color(t.dim).child(p.status ?? p.slug))))))
      .child(div().flex_1())
      .child(h_flex().justify_end().text_size(11).text_color(t.dim).gap(6)
        .when(this.busy, (el) => el.child(div().frames(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], 90)))
        .child(this.busy ? "starting…" : "↵ start · esc cancel"));
  }

  render() {
    if (this.view) return this.view.render();
    return this.kind ? this.renderDialog() : this.panel.render();
  }
}
