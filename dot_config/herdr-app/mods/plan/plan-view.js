// The Plan tab: a local plan laid out as the claude.ai plan page lays one out,
// for a pane as wide as a tab: the title and progress pinned at the top, and
// below them, when there is room, the task graph on the left beside the plan.
// Read-only, and live: it rereads the plan's folder whenever something in it
// changes. Questions are answered in the driver's session, so an open one
// offers a way there. The driver is the live terminal whose `plan.driver`
// label is this plan's folder, which /drive-implementation has it set.
import { div, PathBuilder } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import { exec, notify, run, settings, terminals, theme, watchFolder } from "herdr";
import {
  CHECK_MARK, G, PR_STATUS, RUN_STATUS, TASK_STATUS, after, ago, arr, byLine, graphLayout, journal, loadPlan, openQuestions,
  prChain, prName, prNumber, progress, runStatus, sortedPrs, sortedTasks, waits, wrapTitle,
} from "./plan.js";

const REFRESH_MS = 30_000; // also keeps the "5 min ago" times current
const NARROW = 640; // below this, a task's field names sit above their values
const CONTENT = 880; // the plan's column, at most
const GRAPH_W = 3 * G.W + 2 * G.GX + 2 * G.SIDE; // the graph at its widest
const GAP = 40; // between the graph's column and the plan's
const SIDE_BY_SIDE = 1100; // from this width the graph has its own column beside the plan
const FLASH_MS = 1200; // how long a card stays highlighted after its id is picked in the graph
const TITLE_CHARS = 17; // a graph node's title line

export class PlanView {
  // `demo`: a plan to show instead of reading `dir` (DEMO in main.js).
  constructor(dir, demo = null) {
    this.dir = dir;
    this.demo = demo;
    this.plan = demo;
    this.cache = new Map();
    this.openTasks = new Set();
    this.openAnswers = new Set();
    this.selected = null; // the task picked in the graph
    this.graphOpen = false; // the graph, when it shows under the header
    this.flash = null; // { id, on }: the card highlighted after a jump from the graph
    this.cardIndex = new Map(); // task id -> its card's place in the scrolling column
    this.width = 1000;
  }

  init(cx) {
    this.scroll = ScrollHandle.new();
    if (this.demo) return;
    this.reload(cx);
    cx.timer.every(REFRESH_MS, (cx) => this.reload(cx));
    cx.spawn(async (cx) => {
      for (;;) {
        try {
          await watchFolder(this.dir);
        } catch (e) {
          console.log(`plan: can't watch ${this.dir}, refreshing on a timer: ${e?.message ?? e}`);
          return;
        }
        await this.load();
        cx.notify();
      }
    });
  }

  reload(cx) {
    cx.spawn(async (cx) => {
      await this.load();
      cx.notify();
    });
  }

  async load() {
    try {
      this.plan = await loadPlan(this.dir, this.cache);
      this.error = "";
    } catch (e) {
      this.error = String(e?.message ?? e);
    }
  }

  // The plan's running driver, { address, blocked }, or null. A tab's terminal
  // outlives the agent run in it, so a live terminal counts only while its
  // agent is still there.
  driver() {
    if (this.demo) return { address: "demo", blocked: true };
    const t = terminals().find((x) => x.state === "live" && x.program?.agent && x.labels?.["plan.driver"] === this.dir);
    return t ? { address: t.address, blocked: t.status === "blocked" } : null;
  }

  goToDriver(d) {
    if (this.demo) notify({ title: "Demo", body: "Would show the driver's tab." });
    else run("agent.focus", { terminal: d.address });
  }

  open(url) {
    if (this.demo) notify({ title: "Demo", body: `Would open ${url}` });
    else exec("open", [url]);
  }

  // --- Pieces -------------------------------------------------------------------

  tone(t, tone) {
    return { ok: t.done, run: t.working, attn: t.blocked, bad: t.ansi1, idle: t.muted }[tone] ?? t.muted;
  }

  chip(t, map, key, big = false) {
    const [label, tone] = map[key] ?? [key || "Unknown", "idle"];
    const c = this.tone(t, tone);
    return div().flex_none().px(big ? 9 : 7).h(big ? 22 : 19).flex().items_center().rounded(11)
      .text_size(big ? 12 : 11).font_medium().text_color(c).bg(c + "1f").child(label);
  }

  mono(t) {
    return div().font_family(settings().font_family ?? "JetBrains Mono").text_size(11.5);
  }

  button(t, id, label, action, primary = false) {
    return div().id(id).flex_none().px(10).h(24).flex().items_center().rounded(6).cursor_pointer()
      .text_size(12).font_semibold()
      .when(primary, (el) => el.bg(t.solid).text_color(t.solid_foreground))
      .when(!primary, (el) => el.border(1).border_color(t.border).text_color(t.foreground).hover((s) => s.bg(t.hover)))
      .on_click((_e, cx) => { cx.stop_propagation(); action(cx); })
      .child(label);
  }

  link(t, id, text, url) {
    return div().id(id).flex_none().text_color(t.accent).cursor_pointer()
      .on_click((_e, cx) => { cx.stop_propagation(); this.open(url); }).child(text);
  }

  // Paragraphs, as the guide writes long fields: blank lines between them.
  prose(t, text, color = t.foreground) {
    const paras = String(text ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    return v_flex().gap(8).text_color(color).line_height(1.5).children(paras.map((p) => div().child(p)));
  }

  bullets(t, items, { mono = false } = {}) {
    return v_flex().gap(4).children(items.map((s) => h_flex().gap(8).items_start()
      .child(div().flex_none().text_color(t.dim).child("•"))
      .child((mono ? this.mono(t) : div()).flex_1().min_w(0).line_height(1.45).child(String(s)))));
  }

  time(t, id, iso) {
    return div().id(id).flex_none().text_size(11.5).text_color(t.dim)
      .when(Boolean(iso), (el) => el.tooltip(new Date(Date.parse(iso)).toLocaleString())).child(ago(iso));
  }

  card(t, id) {
    return v_flex().id(id).gap(8).p(14).rounded(8).border(1).border_color(t.border).bg(t.background);
  }

  section(t, title, count, ...children) {
    return v_flex().gap(10)
      .child(h_flex().gap(8).items_center().text_size(15).font_semibold()
        .child(title)
        .when(count != null && count !== "", (el) => el.child(div().text_size(12).font_normal().text_color(t.dim).child(String(count)))))
      .children(children);
  }

  part(t, title) {
    return div().pt(8).pb(4).border_b(1).border_color(t.border).text_size(11.5).font_semibold().text_color(t.dim).child(title.toUpperCase());
  }

  label(t, text) {
    return div().text_size(11.5).font_semibold().text_color(t.dim).child(text);
  }

  quiet(t, text) {
    return div().text_size(12.5).text_color(t.dim).child(text);
  }

  // --- Header -------------------------------------------------------------------

  // Pinned above the scrolling column.
  header(t, plan) {
    const r = plan.run;
    const count = progress(plan);
    const share = (n) => (count.live ? (n / count.live) * 100 : 0);
    const d = this.driver();
    return v_flex().gap(10)
      .child(h_flex().gap(12).items_start()
        .child(v_flex().flex_1().min_w(0).gap(3)
          .child(div().text_size(20).font_semibold().line_height(1.25).child(r.title || "Plan"))
          .child(div().text_size(12).text_color(t.dim).child(["Implementation plan", r.slug].filter(Boolean).join(" · "))))
        .child(h_flex().flex_none().gap(8).items_center()
          .when(Boolean(d), (el) => el.child(this.button(t, "go-driver", "Go to driver", () => this.goToDriver(d), d.blocked)
            .when(d.blocked, (el) => el.tooltip("The driver is waiting on you."))))
          .child(this.chip(t, RUN_STATUS, runStatus(plan), true))))
      .when(count.live > 0, (el) => el
        .child(h_flex().h(6).w_full().rounded(3).overflow_hidden().bg(t.border)
          .child(div().h_full().w(`${share(count.merged)}%`).bg(t.done))
          .child(div().h_full().w(`${share(count.in_progress)}%`).bg(t.working)))
        .child(div().text_size(12).text_color(t.muted)
          .child(`${count.merged} done, ${count.in_progress} in progress, of ${count.live} tasks`)));
  }

  // --- Handover and questions ---------------------------------------------------

  handover(t, h) {
    return this.section(t, "Ready for your review", null, this.card(t, "handover")
      .when(Boolean(h.summary), (el) => el.child(this.prose(t, h.summary)))
      .when(Boolean(h.branch || h.pr_url), (el) => el.child(h_flex().gap(12).flex_wrap().text_size(12).text_color(t.muted)
        .when(Boolean(h.branch), (el) => el.child(this.mono(t).child(h.branch)))
        .when(Boolean(h.pr_url), (el) => el.child(this.link(t, "handover-pr", h.pr_url, h.pr_url)))))
      .children([["look_first", "Look at first"], ["risks", "Least sure of"]].filter(([k]) => arr(h[k]).length)
        .map(([k, label]) => v_flex().gap(4).child(this.label(t, label)).child(this.bullets(t, arr(h[k]))))));
  }

  // A question's card, open (on Needs attention) or answered (in the journal).
  question(t, q, open) {
    const opts = arr(q.options);
    return this.card(t, `q-${q.id}${open ? "" : "-closed"}`)
      .when(open, (el) => el.border_color(t.blocked + "80"))
      .child(h_flex().gap(10).items_start()
        .child(div().flex_1().min_w(0).font_semibold().line_height(1.35).child(q.title || q.id))
        .child(this.mono(t).flex_none().text_color(t.dim).child(q.id + (q.task ? ` · ${q.task}` : ""))))
      .when(Boolean(q.context), (el) => el.child(this.prose(t, q.context, t.muted)))
      .when(opts.length > 0, (el) => el.child(v_flex().gap(4).children(opts.map((o) => {
        const rec = o.label === q.recommendation;
        return h_flex().gap(8).items_start()
          .child(div().flex_none().text_color(rec ? t.accent : t.dim).child(rec ? "★" : "•"))
          .child(v_flex().flex_1().min_w(0).gap(1)
            .child(div().text_color(rec ? t.foreground : t.muted).when(rec, (el) => el.font_medium())
              .child(o.label + (rec ? " (recommended)" : "")))
            .when(Boolean(o.cost), (el) => el.child(div().text_size(12).text_color(t.dim).child(o.cost))));
      }))))
      .when(!opts.length && Boolean(q.recommendation), (el) => el.child(div().text_color(t.muted).child(`Recommended: ${q.recommendation}`)))
      .when(!open, (el) => el.child(this.prose(t, `${q.status === "withdrawn" ? "Withdrawn" : "Answer"}: ${q.answer || ""}`)))
      .child(h_flex().gap(12).text_size(12).text_color(t.dim)
        .when(open && Boolean(q.blocks), (el) => el.child(div().flex_1().min_w(0).child(`Holding up: ${q.blocks}`)))
        .when(!(open && q.blocks), (el) => el.child(div().flex_1()))
        .child(this.time(t, `q-${q.id}-${open ? "asked" : "answered"}`, open ? q.asked_at : q.answered_at)));
  }

  attention(t, plan) {
    const open = openQuestions(plan);
    const d = this.driver();
    return this.section(t, "Needs attention", open.length || null,
      open.length === 0 ? this.quiet(t, "Nothing needs attention right now.")
        : h_flex().gap(10).items_center().text_size(12.5).text_color(t.muted)
          .child(div().flex_1().min_w(0).child(d ? "The driver asks these in its own session; answer them there."
            : `The driver asks these in its own session; none is running. /drive-implementation ${this.dir.split("/").pop()} starts one.`))
          .when(Boolean(d), (el) => el.child(this.button(t, "go-driver-ask", "Answer in the driver", () => this.goToDriver(d), true))),
      ...open.map((q) => this.question(t, q, true)));
  }

  // --- The plan -----------------------------------------------------------------

  doneWhen(t, checks) {
    if (!checks.length) return this.quiet(t, "Not written yet.");
    return v_flex().gap(8).children(checks.map((c) => {
      const [mark, tone] = CHECK_MARK[c.state] ?? CHECK_MARK.unchecked;
      return h_flex().gap(10).items_start()
        .child(div().flex_none().w(14).font_semibold().text_color(this.tone(t, tone)).child(mark))
        .child(v_flex().flex_1().min_w(0).gap(2)
          .child(div().line_height(1.45).child(c.text ?? ""))
          .when(Boolean(c.note), (el) => el.child(div().text_size(12).text_color(t.dim).line_height(1.4).child(c.note))));
    }));
  }

  prs(t, plan) {
    const prs = sortedPrs(plan);
    const byId = new Map(prs.map((p) => [p.id, p]));
    const chain = prChain(prs);
    const ref = (p) => div().text_color(["merged", "closed"].includes(p.status) ? t.dim : t.accent).child(prName(p));
    return this.section(t, "Pull requests", prs.length > 1 ? prs.length : null,
      ...(chain ? [h_flex().gap(6).flex_wrap().items_center().text_size(12.5)
        .child(this.mono(t).text_color(t.muted).child(chain.base))
        .children(chain.chain.flatMap((p) => [div().text_color(t.dim).child("←"), ref(p)]))] : []),
      ...prs.map((p) => {
        const number = prNumber(p);
        const below = byId.get(p.base);
        return this.card(t, `pr-${p.id}`)
          .when(Boolean(p.summary), (el) => el.tooltip(p.summary))
          .child(h_flex().gap(10).items_center()
            .when(Boolean(number), (el) => el.child(this.link(t, `pr-${p.id}-link`, number, p.url)))
            .child(div().flex_1().min_w(0).font_semibold().truncate().child(p.title || ""))
            .child(this.chip(t, PR_STATUS, p.status)))
          .when(["open", "draft"].includes(p.status) && Boolean(p.waiting_on), (el) => el.child(h_flex().gap(8).items_start().text_size(12.5)
            .child(this.label(t, "Waiting on").flex_none())
            .child(div().flex_1().min_w(0).text_color(t.blocked).child(p.waiting_on))))
          .when(Boolean(p.branch || p.base), (el) => el.child(h_flex().gap(12).flex_wrap().text_size(12).text_color(t.dim)
            .when(Boolean(p.branch), (el) => el.child(this.mono(t).child(p.branch)))
            .when(Boolean(below), (el) => el.child(h_flex().gap(4).child("stacks on").child(ref(below))))
            .when(!below && Boolean(p.base), (el) => el.child(h_flex().gap(4).child("based on").child(this.mono(t).text_color(t.muted).child(p.base))))));
      }));
  }

  // One field of a task's open card: its name beside the value, or above it when narrow.
  field(t, label, value) {
    const narrow = this.width < NARROW;
    return (narrow ? v_flex().gap(3) : h_flex().gap(14).items_start())
      .child(this.label(t, label).flex_none().when(!narrow, (el) => el.w(104).pt(1)))
      .child(div().flex_1().min_w(0).child(value));
  }

  task(t, plan, task) {
    const open = this.openTasks.has(task.id);
    const holds = waits(plan, task);
    const r = plan.run ?? {};
    const pr = task.pr ? plan.prs.find((p) => p.id === task.pr) : null;
    const deps = after(plan, task);
    const epics = arr(task.epics);
    const fields = [
      epics.length && this.field(t, epics.length > 1 ? "Epics" : "Epic", v_flex().gap(2).children(epics.map((k) =>
        h_flex().gap(4).child(r.jira_browse_url ? this.link(t, `t-${task.id}-epic-${k}`, k, r.jira_browse_url + k) : div().child(k))
          .when(Boolean(r.epics?.[k]), (el) => el.child(div().text_color(t.dim).child(`· ${r.epics[k]}`)))))),
      task.approach && this.field(t, "Approach", this.prose(t, task.approach)),
      arr(task.touches).length && this.field(t, "Likely touches", this.bullets(t, arr(task.touches), { mono: true })),
      task.verify && this.field(t, "Verified by", this.prose(t, task.verify)),
      (deps.tasks.length || deps.questions.length) && this.field(t, "After", v_flex().gap(2)
        .when(deps.tasks.length > 0, (el) => el.child(div().child(deps.tasks.join(", "))))
        .children(deps.questions.map((q) => div().text_color(q.open ? t.blocked : t.muted)
          .child(`${q.id} · ${q.title} (${q.open ? "open" : "answered"})`)))),
      task.pr && this.field(t, "PR", div().child([pr && prNumber(pr), pr?.title].filter(Boolean).join(" · ") || task.pr)),
      task.outcome && this.field(t, "Outcome", this.prose(t, task.outcome)),
    ].filter(Boolean);
    const toggle = () => { if (open) this.openTasks.delete(task.id); else this.openTasks.add(task.id); };
    const flash = this.flash?.id === task.id ? this.flash : null;
    return this.card(t, `t-${task.id}`).gap(0).p(0).relative()
      .when(task.status === "dropped", (el) => el.opacity(0.6))
      // The highlight after a jump from the graph: on at once, then fading out.
      .when(Boolean(flash), (el) => el.child(div().absolute().top(0).left(0).size_full().rounded(8)
        .border(2).border_color(t.accent).bg(t.accent + "1f")
        .opacity(flash.on ? 1 : 0).transition("opacity", { duration: FLASH_MS - 200, easing: "ease-out" })))
      .child(v_flex().id(`t-${task.id}-head`).gap(6).p(14).cursor_pointer().rounded(8).hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => { toggle(); cx.notify(); })
        .child(h_flex().gap(8).items_center()
          .child(div().flex_none().w(10).text_size(10).text_color(t.dim).child(open ? "▾" : "▸"))
          .child(this.mono(t).flex_none().text_color(t.dim).child(task.id))
          .child(div().flex_1().min_w(0).font_semibold().truncate().child(task.title || ""))
          .child(this.chip(t, TASK_STATUS, task.status)))
        .when(Boolean(task.goal), (el) => el.child(div().pl(18).text_color(t.muted).line_height(1.45).child(task.goal)))
        .when(holds.length > 0, (el) => el.child(h_flex().pl(18).gap(8).items_start().text_size(12.5)
          .child(this.label(t, "Waiting on").flex_none())
          .child(v_flex().flex_1().min_w(0).gap(2).text_color(t.blocked).children(holds.map((h) => div().child(h.text)))))))
      .when(open, (el) => el.child(v_flex().gap(12).px(14).pb(14).pt(12).ml(18).border_t(1).border_color(t.border)
        .children(fields)
        .when(Boolean(task.branch), (el) => el.child(this.mono(t).text_color(t.dim).child(task.branch)))
        .when(!fields.length && !task.branch, (el) => el.child(this.quiet(t, "Not planned in detail yet.")))));
  }

  // The scrolling column as a flat list of [element, space above it], so each
  // task card is a direct child of the scroll area, which is all a scroll
  // handle can bring into view. Records where each card is.
  blocks(t, plan, side) {
    const r = plan.run;
    const tasks = sortedTasks(plan);
    const out = [];
    const add = (el, gap = 24) => out.push([el, gap]);
    this.cardIndex = new Map();
    // Without a column of its own, the graph opens at the top of this one.
    if (!side && tasks.length) {
      add(h_flex().child(this.button(t, "graph-toggle", `${this.graphOpen ? "Hide" : "Show"} task dependency graph`,
        (cx) => { this.graphOpen = !this.graphOpen; cx.notify(); })));
    }
    if (!side && this.graphOpen && tasks.length) {
      add(div().id("graph-inline").w_full().overflow_x_scrollbar()
        .on_click((_e, cx) => { this.selected = null; cx.notify(); }).child(this.graph(t, plan)), 12);
    }
    if (r.handover) add(this.handover(t, r.handover));
    add(this.attention(t, plan));
    add(this.part(t, "Plan"), 30);
    add(this.section(t, "Approach", null, r.approach ? this.prose(t, r.approach)
      : this.quiet(t, "The approach appears here once the code has been read.")), 18);
    if (r.delivery) add(this.section(t, "Delivery", null, this.prose(t, r.delivery)));
    add(this.section(t, "Done when", null, this.doneWhen(t, arr(r.done_check))));
    if (plan.prs.length) add(this.prs(t, plan));
    add(this.section(t, "Tasks", tasks.length || null));
    if (!tasks.length) add(this.quiet(t, "No tasks yet. They appear here as the plan takes shape."), 10);
    for (const task of tasks) {
      this.cardIndex.set(task.id, out.length);
      add(this.task(t, plan, task), 10);
    }
    if (arr(r.out_of_scope).length) add(this.section(t, "Out of scope", null, this.bullets(t, arr(r.out_of_scope))));
    if (arr(r.risks).length) add(this.section(t, "Risks", null, this.bullets(t, arr(r.risks))));
    add(this.journal(t, plan), 30);
    add(div().text_size(11.5).text_color(t.dim).line_height(1.45)
      .child(`Read from ${this.dir}. Agents work this plan by the guide stored with it, at meta/guide.`), 26);
    out[0][1] = 20;
    return out;
  }

  // --- The dependency graph -----------------------------------------------------

  // As on the plan page: picking a task highlights its chain (clicking beside
  // the tasks lets go), and picking its id also scrolls to its card and
  // highlights it briefly.
  jump(id, cx) {
    this.selected = id;
    const index = this.cardIndex.get(id);
    if (index != null) this.scroll.scroll_to_item(index);
    const flash = { id, on: true };
    this.flash = flash;
    cx.notify();
    cx.spawn(async (cx) => {
      await cx.sleep(200);
      if (this.flash !== flash) return;
      flash.on = false;
      cx.notify();
      await cx.sleep(FLASH_MS);
      if (this.flash === flash) this.flash = null;
      cx.notify();
    });
  }

  // Edges as one stroked path per color, arrowheads as one filled path.
  paths(L, edges, color, width) {
    if (!edges.length) return [];
    let line = PathBuilder.stroke(width);
    let heads = PathBuilder.fill();
    for (const e of edges) {
      for (const [op, ...a] of e.cmds) {
        if (op === "M") line = line.move_to(a[0], a[1]);
        else if (op === "L") line = line.line_to(a[0], a[1]);
        else if (op === "Q") line = line.curve_to(a[0], a[1], a[2], a[3]);
        else if (op === "C") line = line.cubic_bezier_to(a[0], a[1], a[2], a[3], a[4], a[5]);
      }
      const [x, y] = e.end;
      heads = heads.add_polygon([[x - 3.5, y - 6], [x + 3.5, y - 6], [x, y + 1]], true);
    }
    const layer = (path) => window.paint_path(path, color).absolute().top(0).left(0).w(L.width).h(L.height);
    return [layer(line.build()), layer(heads.build())];
  }

  graph(t, plan) {
    const L = graphLayout(sortedTasks(plan), this.selected);
    if (!L.nodes.length) return this.quiet(t, "No tasks yet.");
    const some = Boolean(L.selected);
    return div().relative().flex_none().w(L.width).h(L.height)
      .children(this.paths(L, L.edges.filter((e) => !e.rel), some ? t.border : t.dim + "aa", 1.25))
      .children(this.paths(L, L.edges.filter((e) => e.rel), t.accent, 1.75))
      .children(L.nodes.map(({ task, x, y, rel, sel }) => {
        const [label, tone] = TASK_STATUS[task.status] ?? [task.status || "Unknown", "idle"];
        return v_flex().id(`g-${task.id}`).absolute().left(x).top(y).w(G.W).h(G.H).px(9).py(5).gap(1).rounded(6)
          .border(sel ? 2 : 1).border_color(sel ? t.accent : this.tone(t, tone) + (some && !rel ? "55" : "aa")).bg(t.background)
          .when(some && !rel, (el) => el.opacity(0.4))
          .when(!some && task.status === "dropped", (el) => el.opacity(0.5))
          .cursor_pointer().hover((s) => s.bg(t.hover))
          .tooltip(`${task.id} · ${task.title || ""} · ${label}`)
          .on_click((_e, cx) => { cx.stop_propagation(); this.selected = task.id; cx.notify(); })
          .child(h_flex().gap(6).items_center()
            .child(div().flex_none().size(7).rounded(4).bg(this.tone(t, tone)))
            .child(this.mono(t).id(`g-${task.id}-id`).text_size(10.5).line_height(1.25).text_color(t.muted)
              .cursor_pointer().hover((s) => s.text_color(t.accent)).tooltip("Go to its card")
              .on_click((_e, cx) => { cx.stop_propagation(); this.jump(task.id, cx); })
              .child(task.id)))
          .children(wrapTitle(task.title, TITLE_CHARS).map((line) => div().text_size(11).line_height(1.25).truncate().child(line)));
      }));
  }

  // --- Journal ------------------------------------------------------------------

  journal(t, plan) {
    const items = journal(plan);
    return v_flex().gap(14)
      .child(this.part(t, "Journal"))
      .when(!items.length, (el) => el.child(this.quiet(t, "Nothing yet.")))
      .children(items.map((j, i) => h_flex().gap(14).items_start()
        .child(div().flex_none().w(84).pt(1).child(this.time(t, `j-${i}`, j.at)))
        .child(v_flex().flex_1().min_w(0).gap(4)
          .child(div().line_height(1.45).child(j.text ?? ""))
          .when(Boolean(j.by), (el) => el.child(div().text_size(11.5).text_color(t.dim).child(byLine(j.by))))
          .children(j.asked.map((q) => {
            const key = `${j.at}-${q.id}`; // not the row, which moves as entries arrive
            const open = this.openAnswers.has(key);
            return v_flex().gap(6)
              .child(h_flex().id(`j-${key}`).gap(6).items_center().cursor_pointer().text_size(12.5).text_color(t.muted)
                .hover((s) => s.text_color(t.foreground))
                .on_click((_e, cx) => { if (open) this.openAnswers.delete(key); else this.openAnswers.add(key); cx.notify(); })
                .child(div().w(10).text_size(10).text_color(t.dim).child(open ? "▾" : "▸"))
                .child(div().flex_1().min_w(0).truncate().child(`${q.id} · ${q.title || ""}`)))
              .when(open, (el) => el.child(this.question(t, q, false)));
          })))));
  }

  // --- Render -------------------------------------------------------------------

  render() {
    const t = theme();
    const plan = this.plan;
    const ready = Boolean(plan && !plan.missing && plan.run);
    const side = ready && this.width >= SIDE_BY_SIDE && plan.tasks.length > 0;
    const frame = (el) => el.w_full().max_w(side ? GRAPH_W + GAP + CONTENT : CONTENT).mx_auto().px(24);
    const root = v_flex().id("plan-view").size_full().bg(t.surface).text_size(13).text_color(t.foreground)
      .on_size_change((size, cx) => {
        if (Math.abs(size.width - this.width) < 1) return;
        this.width = size.width;
        cx.notify();
      });
    if (!ready) {
      const why = !plan ? (this.error ? `Can't read the plan: ${this.error}` : "Reading the plan…")
        : plan.missing ? `No plan at ${this.dir}.` : `${this.dir} has no run/main.json yet.`;
      return root.child(frame(v_flex()).pt(20).child(this.quiet(t, why)));
    }
    const clear = (_e, cx) => { this.selected = null; cx.notify(); };
    return root
      .child(div().w_full().flex_none().border_b(1).border_color(t.border)
        .child(frame(v_flex()).pt(18).pb(14).child(this.header(t, plan))))
      .child(frame(h_flex()).flex_1().min_h(0).gap(side ? GAP : 0)
        .when(side, (el) => el.child(v_flex().id("plan-graph").flex_none().w(GRAPH_W).h_full().overflow_y_scrollbar()
          .pt(20).pb(32).gap(12).on_click(clear)
          .child(h_flex().gap(8).items_center().h(24)
            .child(div().text_size(11.5).font_semibold().text_color(t.dim).child("TASK DEPENDENCIES"))
            .child(div().flex_1())
            .when(Boolean(this.selected), (el) => el.child(this.button(t, "graph-clear", "Clear", (cx) => { this.selected = null; cx.notify(); }))))
          .child(this.graph(t, plan))))
        .child(v_flex().id("plan-main").flex_1().min_w(0).h_full().overflow_y_scrollbar().track_scroll(this.scroll)
          .children(this.blocks(t, plan, side).map(([el, gap]) => div().w_full().flex_none().pt(gap).child(el)))
          .child(div().flex_none().h(32))));
  }
}
