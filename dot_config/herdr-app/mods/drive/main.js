// Drive: start and find the agents that drive a plan (see PROTOCOL.md).
//
// - `{ dialog: "plan", space? }`, opened with openOverlay (kind dialog): asks for
//   a plan page's link, then starts its driver or shows the one already running.
//   `space` is where to find the repo (default: the focused space).
// - no props: the panel (panel.js). In a plan's space it shows that plan in
//   detail; anywhere else it lists every plan.
//
// The model (model.js), the launching (launch.js) and what the panel works out
// (view.js) hold no rendering.
import { View, div } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { closeOverlay, focused, props, spaces, theme } from "herdr";
import { launchPlan, parseArtifact } from "./launch.js";
import { Panel } from "./panel.js";

// Test data: true shows the made-up plans of demo.js, with a row of chips
// to switch between the views, instead of the real ones. Launching from the
// dialog is real either way; the panel's own buttons only say what they would do.
const DEMO = false;

const DIALOGS = {
  plan: {
    title: "Drive a plan",
    placeholder: "https://claude.ai/artifact/…",
    hint: "The plan page's link, in the claude.ai/artifact/<id> form plan pages are published in. The claude.ai/code/artifact/<uuid> form names the same page by another id and starts a separate record.",
  },
};

export default class Drive extends View {
  init(_props, cx) {
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
  }

  space() {
    const id = props()?.space ?? focused()?.space;
    return spaces().find((s) => s.id === id) ?? null;
  }

  go(cx) {
    if (this.busy) return;
    const text = this.text.trim();
    if (!text) return;
    if (!parseArtifact(text)) {
      this.error = "Not a plan page link: expected claude.ai/artifact/<id>.";
      cx.notify();
      return;
    }
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
      .child(div().flex_1())
      .child(h_flex().justify_end().text_size(11).text_color(t.dim).gap(6)
        .when(this.busy, (el) => el.child(div().frames(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], 90)))
        .child(this.busy ? "starting…" : "↵ start · esc cancel"));
  }

  render() {
    return this.kind ? this.renderDialog() : this.panel.render();
  }
}
