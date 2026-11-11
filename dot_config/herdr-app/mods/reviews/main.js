// The GitHub review queue, from the github-pr skill's own queue script, for
// every GitHub repo a Herdr space on this computer is in.
//
// One mod in two places, told apart by props:
// - `{ badge: true }`, a block in the bottom bar: polls the queue, publishes it
//   in shared state, and shows a count. Clicking it goes to the Reviews tab.
// - no props, the Reviews tab's pane: lists the PRs, and starts or switches to
//   a tab running `/github-pr review <n>` for each.
// The queue keeps no state of its own (a PR is done when my review is at its
// head), so the tab a review runs in is what stops a second session starting
// one for the same PR.
import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { exec, home, layout, panes, props, run, setShared, shared, spaces, theme } from "herdr";

const QUEUE_KEY = "reviews.queue"; // { checked_at, repos: [...] }
const CHECKING_KEY = "reviews.checking";
const REFRESH_KEY = "reviews.refresh"; // a time; the poller checks when it's newer than its last check
const POLL_MS = 5 * 60_000;
const BADGE_ID = "reviews-badge";
const TAB_NAME = "Reviews";
const MOD_NAME = "reviews";
const PAD_X = 12;

const queueScript = () => `${home()}/.agents/skills/github-pr/scripts/queue.py`;

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const clock = (ms) => {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const reviewTabName = (item) => `#${item.number} ${truncate(item.title, 28)}`;

function spaceOfTab(tabId) {
  for (const s of spaces()) for (const t of s.tabs) if (t.id === tabId) return { space: s, tab: t };
  return null;
}

// The tab reviewing a PR: one named "#<n> …" in a space of that repo.
function reviewTab(repo, number) {
  for (const s of spaces()) {
    if (!repo.spaces.includes(s.id)) continue;
    const tab = s.tabs.find((t) => t.name.startsWith(`#${number} `));
    if (tab) return { space: s, tab };
  }
  return null;
}

function selectTab(found) {
  if (!found.space.active) run("space.select", { id: found.space.id });
  run("tab.select", { id: found.tab.id });
}

// The Reviews tab: the tab holding this mod's pane, if one is open.
function queueTab() {
  const pane = panes().find((p) => p.mod === MOD_NAME);
  return pane ? spaceOfTab(pane.tab) : null;
}

function openQueueTab() {
  const found = queueTab();
  if (found) selectTab(found);
  else run("tab.new", { name: TAB_NAME, mod: MOD_NAME });
}

// Starts a review in its own tab, or goes to the one already running.
function openReview(repo, item, { stay = false } = {}) {
  const found = reviewTab(repo, item.number);
  if (found) {
    if (!stay) selectTab(found);
    return;
  }
  const space = spaces().find((s) => s.id === repo.space);
  if (space && !space.active) run("space.select", { id: space.id });
  run("tab.new", {
    space: repo.space,
    folder: repo.root,
    name: reviewTabName(item),
    argv: ["claude", `/github-pr review ${item.number}`],
  });
}

// What a review tab's session is doing, from Herdr's agent status.
function tabStage(t, tab) {
  switch (tab.status) {
    case "blocked": return { label: "needs you", color: t.blocked, needs: true };
    case "done": return { label: "finished", color: t.done, needs: true };
    case "working": return { label: "reviewing", color: t.working, needs: false };
    default: return { label: "open", color: t.muted, needs: false };
  }
}

// --- Finding the repos ------------------------------------------------------

async function git(folder, args) {
  try {
    const r = await exec("git", ["-C", folder, ...args], { timeout: 10_000 });
    return r.code === 0 ? r.stdout.trim() : null;
  } catch {
    return null;
  }
}

function githubName(url) {
  return /github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(url ?? "")?.[1] ?? null;
}

// Where each local space's work is: the folder its new terminals start in and
// where its terminals are now.
function spaceFolders() {
  const local = spaces().filter((s) => !s.machine);
  const spaceOf = new Map();
  for (const s of local) for (const t of s.tabs) spaceOf.set(t.id, s.id);
  const out = local.filter((s) => s.folder).map((s) => ({ folder: s.folder, space: s.id }));
  for (const p of panes()) {
    if (p.cwd && spaceOf.has(p.tab)) out.push({ folder: p.cwd, space: spaceOf.get(p.tab) });
  }
  return out;
}

// One entry per GitHub repo, however many checkouts and spaces it spans.
async function scan() {
  const repos = new Map(); // git common dir -> repo
  const known = new Map(); // folder -> { top, common } | null
  for (const { folder, space } of spaceFolders()) {
    if (!known.has(folder)) {
      const out = await git(folder, ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir"]);
      const [top, common] = out ? out.split("\n") : [];
      known.set(folder, top && common ? { top, common } : null);
    }
    const info = known.get(folder);
    if (!info) continue;
    let repo = repos.get(info.common);
    if (!repo) {
      const main = info.common.endsWith("/.git") ? info.common.slice(0, -5) : info.top;
      repo = { main, spaces: [] };
      repos.set(info.common, repo);
    }
    if (!repo.spaces.some((x) => x.space === space)) repo.spaces.push({ space, top: info.top });
  }

  const result = [];
  for (const [key, repo] of repos) {
    const name = githubName(await git(repo.main, ["remote", "get-url", "origin"]));
    if (!name) continue;
    // Reviews start in a space on the main checkout when there is one.
    const start = repo.spaces.find((x) => x.top === repo.main) ?? repo.spaces[0];
    const entry = {
      key, name, root: repo.main, space: start.space,
      spaces: repo.spaces.map((x) => x.space), items: [], error: null,
    };
    try {
      const r = await exec(queueScript(), ["ready", "--repo", repo.main], { timeout: 120_000 });
      if (r.code !== 0) throw new Error(r.stderr.trim().split("\n").pop() || `exit ${r.code}`);
      entry.items = (JSON.parse(r.stdout).items ?? []).sort((a, b) => a.number - b.number);
    } catch (e) {
      entry.error = String(e?.message ?? e);
    }
    result.push(entry);
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

// --- The mod ----------------------------------------------------------------

export default class Reviews extends View {
  init(_props, cx) {
    this.badge = Boolean(props()?.badge);
    this.lastCheck = 0;
    // The badge polls. A Reviews tab polls only in a layout without the badge.
    if (this.polls()) this.refresh(cx);
    cx.timer.every(POLL_MS, (cx) => { if (this.polls()) this.refresh(cx); });
  }

  polls() {
    return this.badge || !find(layout(), BADGE_ID);
  }

  refresh(cx) {
    if (this.busy) return;
    this.busy = true;
    this.lastCheck = Date.now();
    setShared(CHECKING_KEY, true);
    cx.spawn(async (cx) => {
      try {
        const repos = await scan();
        setShared(QUEUE_KEY, { checked_at: Date.now(), repos });
      } catch (e) {
        console.log(`reviews: scan failed: ${e?.message ?? e}`);
      } finally {
        this.busy = false;
        setShared(CHECKING_KEY, false);
      }
      cx.notify();
    });
  }

  // A refresh asked for from the Reviews tab reaches the poller here, since
  // every copy re-renders when shared state changes.
  maybeRefresh(cx) {
    const asked = shared(REFRESH_KEY);
    if (this.polls() && typeof asked === "number" && asked > this.lastCheck) this.refresh(cx);
  }

  render(cx) {
    this.maybeRefresh(cx);
    return this.badge ? this.renderBadge(cx) : this.renderTab();
  }

  // --- Badge -----------------------------------------------------------------

  fitBlock(contentWidth, cx) {
    // Never 0: a block with no width might not start its mod after a restart.
    const px = Math.max(1, Math.ceil(contentWidth));
    const current = find(layout(), BADGE_ID)?.size?.px;
    if (current === px || this.resizingTo === px) return;
    this.resizingTo = px;
    cx.spawn(async () => {
      run("layout.resize", { id: BADGE_ID, px });
      this.resizingTo = null;
    });
  }

  renderBadge() {
    const t = theme();
    const queue = shared(QUEUE_KEY);
    let start = 0, needs = 0, running = 0;
    for (const repo of queue?.repos ?? []) {
      for (const item of repo.items) {
        const found = reviewTab(repo, item.number);
        if (found) (tabStage(t, found.tab).needs ? needs++ : running++);
        else if (item.state === "new") start++;
      }
    }

    const parts = [];
    if (start) parts.push(div().text_color(t.foreground).child(`${start} to review`));
    if (needs) parts.push(div().text_color(t.blocked).child(`${needs} need${needs === 1 ? "s" : ""} you`));
    if (running) parts.push(div().text_color(t.muted).child(`${running} reviewing`));
    const dot = needs ? t.blocked : start ? t.accent : t.dim;

    return h_flex().id("root").size_full().justify_end().items_center()
      .bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).cursor_pointer()
      .on_click(() => openQueueTab())
      .child(h_flex().id("content").flex_none().gap(6).items_center()
        .when(parts.length > 0, (el) => el.px(PAD_X)
          .tooltip("GitHub reviews waiting on you. Click for the queue.")
          .child(div().size(6).rounded(3).bg(dot))
          .children(parts.flatMap((p, i) => (i ? [div().text_color(t.dim).child("·"), p] : [p]))))
        .on_size_change((size, cx) => this.fitBlock(size.width, cx)));
  }

  // --- Reviews tab -----------------------------------------------------------

  button(t, id, label, action, primary) {
    return div().id(id).flex_none().px(10).h(24).flex().items_center().rounded(6).cursor_pointer()
      .text_size(12).font_semibold()
      .when(primary, (el) => el.bg(t.solid).text_color(t.solid_foreground))
      .when(!primary, (el) => el.border(1).border_color(t.border).text_color(t.foreground).hover((s) => s.bg(t.hover)))
      .on_click(action).child(label);
  }

  row(t, repo, item) {
    const found = reviewTab(repo, item.number);
    if (!found && item.state !== "new") return null; // reviewed at this head, nothing open

    const size = item.size ?? {};
    const meta = [
      item.author,
      `+${size.additions ?? 0} −${size.deletions ?? 0}`,
      `${size.files ?? 0} file${size.files === 1 ? "" : "s"}`,
      item.stacked_on ? `stacked on #${item.stacked_on}` : null,
      ...(item.jira_keys ?? []),
    ].filter(Boolean).join(" · ");

    let right;
    if (found) {
      const stage = item.state === "reviewed" && !tabStage(t, found.tab).needs
        ? { label: "reviewed", color: t.muted }
        : tabStage(t, found.tab);
      right = h_flex().gap(10).items_center()
        .child(div().text_size(12).text_color(stage.color).child(stage.label))
        .child(this.button(t, `go-${repo.key}-${item.number}`, "Open", () => openReview(repo, item), false));
    } else {
      right = this.button(t, `review-${repo.key}-${item.number}`, "Review", () => openReview(repo, item), true);
    }

    return h_flex().id(`row-${repo.key}-${item.number}`).gap(12).px(10).py(7).items_center().rounded(8)
      .hover((s) => s.bg(t.hover))
      .child(div().id(`num-${repo.key}-${item.number}`).w(52).flex_none().text_color(t.accent).cursor_pointer()
        .tooltip("Open on GitHub").on_click(() => exec("open", [item.url]))
        .child(`#${item.number}`))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(div().truncate().text_color(t.foreground).child(item.title))
        .child(div().truncate().text_size(11.5).text_color(t.dim).child(meta)))
      .child(right);
  }

  renderTab() {
    const t = theme();
    const queue = shared(QUEUE_KEY);
    const checking = Boolean(shared(CHECKING_KEY));
    const repos = queue?.repos ?? [];

    const startable = [];
    for (const repo of repos) {
      for (const item of repo.items) {
        if (item.state === "new" && !reviewTab(repo, item.number)) startable.push([repo, item]);
      }
    }
    const reviewAll = () => {
      const here = queueTab();
      for (const [repo, item] of startable) openReview(repo, item, { stay: true });
      if (here) selectTab(here);
    };

    const checked = queue?.checked_at
      ? `checked ${clock(queue.checked_at)}`
      : "not checked yet";

    const header = h_flex().gap(10).items_center()
      .child(div().text_size(15).font_semibold().text_color(t.foreground).child("Reviews"))
      .child(div().text_size(12).text_color(t.dim).child(checking ? "checking…" : checked))
      .child(div().flex_1())
      .when(startable.length > 1, (el) => el.child(
        this.button(t, "review-all", `Review all ${startable.length}`, reviewAll, false)))
      .child(this.button(t, "refresh", "Refresh", () => setShared(REFRESH_KEY, Date.now()), false));

    const sections = repos.map((repo) => {
      const rows = repo.items.map((item) => this.row(t, repo, item)).filter(Boolean);
      if (!rows.length && !repo.error) return null;
      return v_flex().gap(2)
        .child(h_flex().gap(8).px(10).pb(2).items_center()
          .child(div().text_size(12).font_semibold().text_color(t.muted).child(repo.name))
          .when(Boolean(repo.error), (el) => el.child(div().id(`err-${repo.key}`).text_size(12).truncate()
            .text_color(t.blocked).tooltip(repo.error).child("couldn't read the queue"))))
        .children(rows);
    }).filter(Boolean);

    const empty = v_flex().gap(4).px(10).pt(8)
      .child(div().text_color(t.muted).child(
        queue ? "Nothing is waiting for your review." : checking ? "Checking the queue…" : "The queue hasn't been checked yet."))
      .when(repos.length > 0, (el) => el.child(div().text_size(12).text_color(t.dim)
        .child(`Watching ${repos.map((r) => r.name).join(", ")}`)));

    return v_flex().id("reviews").size_full().bg(t.background).p(16).gap(14).text_size(13)
      .overflow_y_scrollbar()
      .child(header)
      .children(sections.length ? sections : [empty]);
  }
}
