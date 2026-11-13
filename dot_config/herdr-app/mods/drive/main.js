// Drive: start and find the agents that drive a plan or a PR (see PROTOCOL.md).
//
// - `{ dialog: "plan" | "pr", space? }`, opened with openOverlay (kind dialog):
//   asks for a plan page's link or a PR number, then starts its driver or shows
//   the one already running. `space` is where to find the repo (default: the
//   focused space).
// - no props: for now a plain list of plans. The panel comes later.
//
// The model (model.js) and the launching (launch.js) hold no rendering.
import { View, div } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { closeOverlay, focused, props, spaces, terminals, theme } from "herdr";
import { launchPR, launchPlan, parseArtifact } from "./launch.js";
import { groupPlans } from "./model.js";

// Test data: true lists made-up plans instead of the real ones, for trying the
// interface. Launching is real either way.
const DEMO = false;

function demoPlans() {
  const agent = (address, running, status) => ({ address, name: null, running, status: running ? status : null, labels: {} });
  return [
    { id: "a1b2c3d4-demo", key: "a1b2c3d4", url: null, title: "Rate limit headers", record: null, driver: agent("t1", true, "working"), agents: [agent("t2", true, "idle")] },
    { id: "e5f6a7b8-demo", key: "e5f6a7b8", url: null, title: null, record: null, driver: null, agents: [] },
  ];
}

const DIALOGS = {
  plan: {
    title: "Drive a plan",
    placeholder: "https://claude.ai/artifact/…",
    hint: "The plan page's link, in the claude.ai/artifact/<id> form plan pages are published in. The claude.ai/code/artifact/<uuid> form names the same page by another id and starts a separate record.",
  },
  pr: {
    title: "Drive a PR",
    placeholder: "PR number",
    hint: "One of your own PRs in this space's repo. It gets a space of its own.",
  },
};

export default class Drive extends View {
  init(_props, cx) {
    this.kind = DIALOGS[props()?.dialog] ? props().dialog : null;
    this.busy = false;
    this.error = "";
    this.text = "";
    if (!this.kind) return;
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
    if (this.kind === "plan" && !parseArtifact(text)) {
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
        await (this.kind === "plan" ? launchPlan(text, space) : launchPR(text, space));
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
    if (this.kind) return this.renderDialog();
    const t = theme();
    const plans = DEMO ? demoPlans() : groupPlans(terminals()).plans;
    return v_flex().size_full().p(12).gap(6).bg(t.surface).text_size(13).text_color(t.foreground)
      .when(plans.length === 0, (el) => el.child(div().text_color(t.dim).child("No plans")))
      .children(plans.map((p) => div().id(`plan-${p.id}`).truncate().child(p.title ?? p.id)));
  }
}
