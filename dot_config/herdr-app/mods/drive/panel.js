// The Drive panel: a plan's or a PR's detail in its own space, and every plan and
// driven PR anywhere else. Laid out for a column about 368 px wide.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { exec, focused, notify, openOverlay, spaces, theme } from "herdr";
import { launchPR, relaunchPlan } from "./launch.js";
import { L } from "./model.js";
import { LB, closePR, derive, goTo, inSpace, live, peek, planName, prFinished, prune, show } from "./view.js";
import { demo } from "./demo.js";

const PRUNE_MS = 60_000;
const STATUS_COLORS = { working: "working", blocked: "blocked", done: "done", idle: "idle" };

// What a phase or PR status looks like: label color and whether it needs the owner.
function tone(t, value) {
  switch (value) {
    case "blocked": case "changes-requested": case "ci-failing": case "conflicting": return t.blocked;
    case "done": case "merged": case "approved": return t.done;
    case "building": case "reviewing": case "implementing": case "fixing": case "merging": return t.working;
    default: return t.muted;
  }
}

export class Panel {
  constructor(demoOn) {
    this.demoOn = demoOn;
    this.busy = new Set();
    this.demoView = null; // DEMO: the key of the plan or PR to show in detail, null for the overview
  }

  // Looks for records whose folder is gone once a minute, while the panel exists.
  init(cx) {
    if (this.demoOn) return;
    const check = () => prune().catch((e) => console.log(`drive: prune failed: ${e?.message ?? e}`));
    cx.spawn(async () => check());
    cx.timer.every(PRUNE_MS, (cx) => cx.spawn(async () => check()));
  }

  data() {
    return this.demoOn ? derive(demo.terms, demo.plans, demo.prs, demo.space) : live();
  }

  // Runs a button's action once at a time, telling the owner how it went.
  run(cx, key, label, fn) {
    if (this.busy.has(key)) return;
    if (this.demoOn) {
      notify({ title: "Demo", body: `${label} would run here.` });
      return;
    }
    this.busy.add(key);
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await fn();
        if (r?.message) notify({ title: label, body: r.message, level: r.ok ? "success" : "warning" });
      } catch (e) {
        notify({ title: `${label} failed`, body: String(e?.message ?? e), level: "error" });
      }
      this.busy.delete(key);
      cx.notify();
    });
  }

  // --- Pieces -------------------------------------------------------------------

  button(t, id, label, action, { primary = false, busy = false } = {}) {
    return div().id(id).flex_none().px(8).h(22).flex().items_center().rounded(6).cursor_pointer()
      .text_size(11.5).font_semibold()
      .when(primary, (el) => el.bg(t.solid).text_color(t.solid_foreground))
      .when(!primary, (el) => el.border(1).border_color(t.border).text_color(t.foreground).hover((s) => s.bg(t.hover)))
      .when(busy, (el) => el.opacity(0.5))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); action(cx); })
      .child(label);
  }

  // A colored dot, pulsing while the agent works. Ended agents are dim.
  dot(t, e) {
    const color = !e?.live ? t.dim : t[STATUS_COLORS[e.status] ?? "idle"];
    return div().flex_none().size(7).rounded(4).bg(color)
      .when(e?.live && e.status === "working", (el) => el.loop("opacity", { from: 0.35, to: 1, period: 1200 }));
  }

  tag(color, text) {
    return div().flex_none().text_size(11.5).text_color(color).child(text);
  }

  // A PR number that opens the PR.
  prLink(t, id, number, url) {
    return div().id(id).flex_none().text_color(url ? t.accent : t.muted).when(Boolean(url), (el) => el.cursor_pointer()
      .tooltip("Open on GitHub")
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); this.open(url); })).child(`#${number}`);
  }

  open(url) {
    if (this.demoOn) notify({ title: "Demo", body: `Would open ${url}` });
    else exec("open", [url]);
  }

  rowBase(t, id, onClick) {
    return h_flex().id(id).gap(8).px(8).py(6).items_center().rounded(8)
      .when(Boolean(onClick), (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => { onClick(cx); }));
  }

  group(t, label, count, rows, empty) {
    return v_flex().gap(2)
      .child(h_flex().px(8).pb(2).gap(6).text_size(11.5).font_semibold().text_color(t.dim)
        .child(label).child(div().font_normal().child(String(count))))
      .when(rows.length === 0, (el) => el.child(div().px(8).text_size(12).text_color(t.dim).child(empty)))
      .children(rows);
  }

  // --- Overview -----------------------------------------------------------------

  spaceId() {
    return focused()?.space ?? spaces().find((s) => s.active)?.id;
  }

  dialog(kind) {
    openOverlay({ mod: "drive", kind: "dialog", width: 460, height: 230, props: { dialog: kind, space: this.spaceId() } });
  }

  // One plan or PR as a row: its name and state, a line of facts, what the owner must do.
  overviewRow(t, item) {
    const plan = item.kind === "plan";
    const name = plan ? planName(item) : `${item.title ?? "PR"}`;
    const state = item.stopped ? "stopped" : plan ? (item.phase ?? "starting") : (item.status ?? "starting");
    const color = item.stopped ? t.dim : tone(t, state);
    const facts = [
      item.repo,
      plan ? item.tasks : null,
      item.working ? `${item.working} working` : null,
      !plan ? item.waiting : null,
    ].filter(Boolean).join(" · ");
    const resumeKey = `resume-${item.key}`;
    const resume = plan
      ? (cx) => this.run(cx, resumeKey, "Resume plan", () => relaunchPlan(item.id))
      : (cx) => this.run(cx, resumeKey, "Resume PR", () => launchPR(item.number, this.resumeSpace(item)));
    return this.rowBase(t, `row-${item.key}`, item.space ? (cx) => this.goTo(item, cx) : null)
      .child(this.dot(t, plan ? item.driver : item.term))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(h_flex().min_w(0).gap(6).items_center()
          .when(!plan, (el) => el.child(this.prLink(t, `num-${item.key}`, item.number, item.url)))
          .child(div().flex_1().min_w(0).truncate().text_color(item.stopped ? t.muted : t.foreground).child(name))
          .child(this.tag(color, state)))
        .when(Boolean(facts), (el) => el.child(div().truncate().text_size(11.5).text_color(t.dim).child(facts)))
        .when(Boolean(item.needs), (el) => el.child(div().truncate().text_size(11.5).text_color(t.blocked).child(item.needs))))
      .when(item.stopped, (el) => el.child(this.button(t, `resume-btn-${item.key}`, "Resume", resume, { busy: this.busy.has(resumeKey) })));
  }

  // A stopped PR is started again from the space its record names, else one in its checkout.
  resumeSpace(item) {
    const id = item.record?.space_id;
    return spaces().find((s) => s.id === id)
      ?? spaces().find((s) => s.folder === item.record?.worktree || s.folder === item.record?.repo_root)
      ?? this.spaceId();
  }

  renderOverview(t, data) {
    return v_flex().gap(14)
      .child(h_flex().gap(8)
        .child(this.button(t, "new-driver", "New driver", () => this.dialog("plan"), { primary: true }))
        .child(this.button(t, "drive-pr", "Drive PR", () => this.dialog("pr"))))
      .child(this.group(t, "Plans", data.plans.length, data.plans.map((p) => this.overviewRow(t, p)), "No plans yet"))
      .child(this.group(t, "PRs", data.prs.length, data.prs.map((p) => this.overviewRow(t, p)), "No driven PRs"));
  }

  // --- A plan's space -----------------------------------------------------------

  planHeader(t, p) {
    const state = p.stopped ? "stopped" : (p.phase ?? "starting");
    const resumeKey = `resume-${p.key}`;
    return v_flex().gap(6).px(8)
      .child(h_flex().gap(8).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(14).font_semibold().child(planName(p)))
        .child(this.tag(p.stopped ? t.dim : tone(t, state), state)))
      .when(Boolean(p.tasks || p.repo), (el) => el.child(div().truncate().text_size(12).text_color(t.muted)
        .child([p.tasks, p.repo].filter(Boolean).join(" · "))))
      .when(Boolean(p.needs), (el) => el.child(div().text_size(12).text_color(t.blocked).child(p.needs)))
      .child(h_flex().gap(6).flex_wrap()
        .when(Boolean(p.url), (el) => el.child(this.button(t, "open-plan", "Open plan page", () => this.open(p.url))))
        .when(p.stopped, (el) => el.child(this.button(t, "resume-plan", "Resume",
          (cx) => this.run(cx, resumeKey, "Resume plan", () => relaunchPlan(p.id)), { primary: true, busy: this.busy.has(resumeKey) })))
        .when(p.phase === "done" && Boolean(p.space), (el) => el.child(this.button(t, "close-plan", "Close plan",
          () => (this.demoOn ? notify({ title: "Demo", body: "Would open the remove-worktree dialog." })
            : openOverlay({ mod: "worktree", kind: "dialog", width: 460, height: 280, props: { space: p.space.id, action: "remove" } })),
          { primary: true }))));
  }

  agentRow(t, e, { driver = false } = {}) {
    const lb = e.labels;
    const isPR = lb[L.role] === "pr";
    const id = lb[LB.task] ?? lb[LB.pr] ?? null;
    const name = driver ? "Driver" : (lb[L.title] ?? e.name ?? e.address);
    const status = driver ? (lb[L.phase] ?? e.status) : (lb[L.status] ?? e.status);
    const second = [lb[LB.branch], isPR ? lb[LB.waitingOn] : null].filter(Boolean).join(" · ");
    return this.rowBase(t, `agent-${e.address}`, () => (this.demoOn ? notify({ title: "Demo", body: `Would show ${e.address}.` }) : driver ? show(e.address) : peek(e.address)))
      .child(this.dot(t, e))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(h_flex().min_w(0).gap(6).items_center()
          .when(Boolean(id) && !isPR, (el) => el.child(div().flex_none().text_color(t.muted).child(id)))
          .when(isPR && Boolean(lb[L.prNumber] ?? lb["drive.pr_number"]), (el) => el.child(
            this.prLink(t, `num-${e.address}`, lb["drive.pr_number"], lb[LB.prUrl])))
          .child(div().flex_1().min_w(0).truncate().text_color(e.live ? t.foreground : t.muted).child(name))
          .when(Boolean(status), (el) => el.child(this.tag(e.live ? tone(t, status) : t.dim, e.live ? status : "ended"))))
        .when(Boolean(second), (el) => el.child(div().truncate().text_size(11.5).text_color(t.dim).child(second))));
  }

  renderPlan(t, p) {
    const agents = [...p.agents].sort((a, b) => (a.labels[LB.task] ?? a.labels[LB.pr] ?? "").localeCompare(b.labels[LB.task] ?? b.labels[LB.pr] ?? "", undefined, { numeric: true }));
    return v_flex().gap(12)
      .child(this.planHeader(t, p))
      .child(v_flex().gap(2)
        .child(div().px(8).pb(2).text_size(11.5).font_semibold().text_color(t.dim).child(`Agents (${agents.length + (p.driver ? 1 : 0)})`))
        .when(Boolean(p.driver), (el) => el.child(this.agentRow(t, p.driver, { driver: true })))
        .children(agents.map((a) => this.agentRow(t, a)))
        .when(!p.driver && agents.length === 0, (el) => el.child(div().px(8).text_size(12).text_color(t.dim).child("No agents running"))));
  }

  // --- A single PR's space ------------------------------------------------------

  renderPR(t, p) {
    const state = p.stopped ? "stopped" : (p.status ?? "starting");
    const resumeKey = `resume-${p.key}`;
    const closeKey = `close-${p.key}`;
    const finished = prFinished(p) || p.stopped;
    return v_flex().gap(6).px(8)
      .child(h_flex().gap(8).items_center()
        .child(this.prLink(t, "pr-num", p.number, p.url))
        .child(div().flex_1().min_w(0).truncate().text_size(14).font_semibold().child(p.title ?? "PR"))
        .child(this.tag(p.stopped ? t.dim : tone(t, state), state)))
      .when(Boolean(p.repo), (el) => el.child(div().truncate().text_size(12).text_color(t.muted).child(p.repo)))
      .when(Boolean(p.waiting), (el) => el.child(div().text_size(12).text_color(t.foreground).child(p.waiting)))
      .when(Boolean(p.needs), (el) => el.child(div().text_size(12).text_color(t.blocked).child(p.needs)))
      .child(h_flex().gap(6).flex_wrap()
        .when(Boolean(p.url), (el) => el.child(this.button(t, "open-pr", "Open PR", () => this.open(p.url))))
        .when(p.stopped, (el) => el.child(this.button(t, "resume-pr", "Resume",
          (cx) => this.run(cx, resumeKey, "Resume PR", () => launchPR(p.number, this.resumeSpace(p))), { busy: this.busy.has(resumeKey) })))
        .when(finished, (el) => el.child(this.button(t, "close-pr", "Close",
          (cx) => this.run(cx, closeKey, "Close PR", () => closePR(p)), { primary: true, busy: this.busy.has(closeKey) }))));
  }

  // --- Render -------------------------------------------------------------------

  demoBar(t, data) {
    const items = [{ key: null, label: "Overview" }, ...[...data.plans, ...data.prs].map((i) => ({
      key: i.key, label: i.kind === "plan" ? `${i.stopped ? "stopped " : ""}${i.phase ?? "plan"}${i.title ? "" : " (no title)"}` : `PR ${i.number}`,
    }))];
    return h_flex().gap(4).flex_wrap().pb(6).text_size(11)
      .children(items.map((i) => div().id(`demo-${i.key ?? "overview"}`).px(6).py(2).rounded(5).cursor_pointer()
        .border(1).border_color(this.demoView === i.key ? t.accent : t.border).text_color(this.demoView === i.key ? t.accent : t.muted)
        .on_click((_e, cx) => { this.demoView = i.key; cx.notify(); }).child(i.label)));
  }

  // In DEMO the fake spaces can't be selected, so a row opens that item's view.
  goTo(item, cx) {
    if (!this.demoOn) return goTo(item.space);
    this.demoView = item.key;
    cx.notify();
  }

  render() {
    const t = theme();
    const data = this.data();
    const active = this.demoOn
      ? [...data.plans, ...data.prs].find((i) => i.key === this.demoView) ?? null
      : inSpace(data, spaces().find((s) => s.active)?.id);
    const body = !active ? this.renderOverview(t, data) : active.kind === "plan" ? this.renderPlan(t, active) : this.renderPR(t, active);
    return v_flex().id("drive-panel").size_full().p(12).gap(10).bg(t.surface).text_size(12.5).text_color(t.foreground)
      .overflow_y_scrollbar()
      .when(this.demoOn, (el) => el.child(this.demoBar(t, data)))
      .child(body);
  }
}
