// The GitHub review queue, from the github-pr skill's own queue script, for
// every GitHub repo a Herdr space on this computer is in.
//
// One mod in two places, told apart by props:
// - `{ badge: true }`, a block in the bottom bar: polls the queue, publishes it
//   in shared state, shows a count, and notifies when a session needs me.
//   Clicking it goes to the Reviews tab.
// - no props, the Reviews tab: the list, with one viewer pane split beside it.
// - `{ menu: { key, url } }`, a row's right-click popup: Mute / Unmute, and
//   Open on GitHub. `{ menu: { sort: true } }`: the sort menu.
//
// Each review's Claude session (`/github-pr review <n>`) runs as a herdr-core
// terminal with no tab of its own, labeled with its repo and PR number. The
// queue keeps no state of its own (a PR is done when my review is at its head),
// so finding a session by its labels is what stops a second one starting for
// the same PR. Clicking a row shows its session in the viewer pane with
// `terminal.show`.
import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import {
  closeOverlay, exec, hc, home, layout, nextCommand, notify, openOverlay, panes, props, run,
  setShared, shared, spaces, terminals, theme,
} from "herdr";

// Test data: true lists the made-up PRs in demoScan() instead of running the
// queue. Sessions are real Claude sessions either way.
const DEMO = false;

const QUEUE_KEY = "reviews.queue"; // { checked_at, repos: [...] }
const CHECKING_KEY = "reviews.checking";
const REFRESH_KEY = "reviews.refresh"; // a time; the poller checks when it's newer than its last check
const SHOW_KEY = "reviews.show"; // { address, at }: a session to show, asked for from a notification
const SHOWN_KEY = "reviews.shown"; // the session the viewer pane shows now
const SORT_KEY = "reviews.sort"; // an id from SORTS
const MUTED_KEY = "reviews.muted"; // ["owner/repo#n"]: set aside until unmuted or gone from the queue
const POLL_MS = 5 * 60_000;
const NEXT_KEY = "reviews.next"; // when the poller checks next, for the countdown
const TICK_MS = 10_000; // how often the poller looks at the clock, and the tab redraws its times
const BADGE_ID = "reviews-badge";
const TAB_NAME = "Reviews";
const MOD_NAME = "reviews";
const PAD_X = 12;

// Session labels.
const L_REPO = "herdr-reviews.repo";
const L_PR = "herdr-reviews.pr";
const L_TITLE = "herdr-reviews.title";

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
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const lastLine = (s) => s.trim().split("\n").pop();

// How long ago an ISO time was, shortly: "40m", "5h", "3d".
function span(ms) {
  if (!(ms >= 0)) return null;
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
}
const age = (iso) => span(Date.now() - Date.parse(iso));

// The header's line about checking: when the last check was, and when the next is.
function checkedLine(queue, checking, next) {
  if (checking) return "Checking…";
  if (!queue?.checked_at) return "Not checked yet";
  const ago = Date.now() - queue.checked_at;
  const updated = ago < 60_000 ? "Updated just now" : `Updated ${span(ago)} ago`;
  if (typeof next !== "number") return updated;
  const left = next - Date.now();
  return `${updated} · next in ${left < 60_000 ? "<1m" : `${Math.ceil(left / 60_000)}m`}`;
}

// Orders for the list; each compares two [repo, item] pairs.
const opened = ([, item]) => Date.parse(item.created_at) || 0;
const lines = ([, item]) => (item.size?.additions ?? 0) + (item.size?.deletions ?? 0);
const byRepo = ([ra, a], [rb, b]) => ra.name.localeCompare(rb.name) || a.number - b.number;
const SORTS = [
  { id: "oldest", label: "Oldest first", compare: (a, b) => opened(a) - opened(b) || byRepo(a, b) },
  { id: "newest", label: "Newest first", compare: (a, b) => opened(b) - opened(a) || byRepo(a, b) },
  { id: "smallest", label: "Smallest first", compare: (a, b) => lines(a) - lines(b) || byRepo(a, b) },
  { id: "repo", label: "Repo", compare: byRepo },
  { id: "author", label: "Author", compare: (a, b) => (a[1].author ?? "").localeCompare(b[1].author ?? "") || byRepo(a, b) },
];
const sortOf = () => SORTS.find((s) => s.id === shared(SORT_KEY)) ?? SORTS[0];

// --- Sessions -------------------------------------------------------------------

// Every session terminal, ended ones too until they're closed; and the running ones.
const allSessions = () => terminals().filter((t) => t.labels?.[L_REPO]);
const sessions = () => allSessions().filter((t) => t.state === "live");

function sessionFor(repoName, number) {
  return sessions().find((s) => s.labels[L_REPO] === repoName && s.labels[L_PR] === String(number)) ?? null;
}

// What a session is doing, from the status its agent reports.
function stage(t, session) {
  switch (session.status) {
    case "blocked": return { label: "needs you", color: t.blocked, waits: true };
    case "done": return { label: "finished", color: t.done, waits: true };
    case "working": return { label: "working", color: t.working, busy: true };
    default: return { label: "idle", color: t.muted };
  }
}

async function startSession(repo, item) {
  // Through a login shell, so claude is on the PATH it has in a terminal. Not
  // --rm: a session that dies at launch stays in `hc ls --all` to be inspected.
  const r = await hc([
    "run", "--bg", "--json", "--no-parent", "--cwd", repo.root,
    "--label", `${L_REPO}=${repo.name}`, "--label", `${L_PR}=${item.number}`,
    "--label", `${L_TITLE}=${item.title}`,
    "--", "/bin/zsh", "-lic", `exec claude '/github-pr review ${item.number}'`,
  ]);
  if (r.code !== 0) throw new Error(lastLine(r.stderr) || `hc run exited ${r.code}`);
  const out = JSON.parse(r.stdout);
  return out.address ?? out.terminal?.address ?? null;
}

// --- Tabs and panes -------------------------------------------------------------

function spaceOfTab(tabId) {
  for (const s of spaces()) for (const t of s.tabs) if (t.id === tabId) return { space: s, tab: t };
  return null;
}

function selectTab(found) {
  if (!found.space.active) run("space.select", { id: found.space.id });
  run("tab.select", { id: found.tab.id });
}

const listPane = () => panes().find((p) => p.mod === MOD_NAME) ?? null;

// The Reviews tab: the tab holding this mod's pane, if one is open.
function queueTab() {
  const pane = listPane();
  return pane ? spaceOfTab(pane.tab) : null;
}

function openQueueTab() {
  const found = queueTab();
  if (found) selectTab(found);
  else run("tab.new", { name: TAB_NAME, mod: MOD_NAME });
}

// The terminal pane beside the list, where sessions are shown.
function viewerPane() {
  const list = listPane();
  return list ? panes().find((p) => p.tab === list.tab && p.terminal) ?? null : null;
}

// --- Finding the repos ----------------------------------------------------------

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
  const ids = new Set(local.flatMap((s) => s.tabs.map((t) => t.id)));
  const out = local.filter((s) => s.folder).map((s) => s.folder);
  for (const p of panes()) if (p.cwd && ids.has(p.tab)) out.push(p.cwd);
  return [...new Set(out)];
}

// One entry per GitHub repo, however many checkouts and spaces it spans.
// Reviews start in its main checkout.
async function scan() {
  const roots = new Map(); // git common dir -> main checkout
  for (const folder of spaceFolders()) {
    const out = await git(folder, ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir"]);
    const [top, common] = out ? out.split("\n") : [];
    if (!top || !common || roots.has(common)) continue;
    roots.set(common, common.endsWith("/.git") ? common.slice(0, -5) : top);
  }

  const result = [];
  for (const [key, root] of roots) {
    const name = githubName(await git(root, ["remote", "get-url", "origin"]));
    if (!name) continue;
    const entry = { key, name, root, items: [], error: null };
    try {
      const r = await exec(queueScript(), ["ready", "--repo", root], { timeout: 120_000 });
      if (r.code !== 0) throw new Error(lastLine(r.stderr) || `exit ${r.code}`);
      entry.items = (JSON.parse(r.stdout).items ?? []).sort((a, b) => a.number - b.number);
    } catch (e) {
      entry.error = String(e?.message ?? e);
    }
    result.push(entry);
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

// Test sessions start here rather than in home, which Claude isn't trusted with.
const demoRoot = () => `${home()}/scratch`;

function demoScan() {
  const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
  const item = (repo, number, title, author, [additions, deletions, files], extra = {}) => ({
    number, title, author, url: `https://github.com/${repo}/pull/${number}`, created_at: hoursAgo(number % 97),
    size: { additions, deletions, files }, state: "new", stacked_on: null, jira_keys: [], ...extra,
  });
  return [
    {
      key: "demo-api", name: "acme/api", root: demoRoot(), error: null,
      items: [
        item("acme/api", 398, "Bump pg driver", "renovate[bot]", [3, 3, 2], { state: "reviewed" }),
        item("acme/api", 412, "Add rate limit headers to public endpoints", "Dana Ortiz", [120, 30, 4], { jira_keys: ["API-88"] }),
        item("acme/api", 415, "Return Retry-After on 429s", "Dana Ortiz", [40, 6, 2], { stacked_on: 412, jira_keys: ["API-88"] }),
      ],
    },
    {
      key: "demo-web", name: "acme/web", root: demoRoot(), error: null,
      items: [item("acme/web", 88, "Dark mode for settings page", "Sam Lee", [200, 45, 7])],
    },
    { key: "demo-infra", name: "acme/infra", root: demoRoot(), items: [], error: "gh: HTTP 502 (test data)" },
  ];
}

// --- Which rows show ------------------------------------------------------------

// A PR shows while it's new at its head, or while its session is still busy or
// waiting on me.
function listed(item, session) {
  if (item.state === "new") return true;
  return Boolean(session && (session.status === "working" || session.status === "blocked"));
}

const muted = () => new Set(shared(MUTED_KEY) ?? []);

function setMuted(key, on) {
  const keys = muted();
  if (on) keys.add(key);
  else keys.delete(key);
  setShared(MUTED_KEY, [...keys]);
}

// Mutes last until undone, or until the PR leaves the queue of a repo that was
// read; a repo that failed or isn't watched now keeps its mutes.
function pruneMuted(repos) {
  const keys = shared(MUTED_KEY) ?? [];
  if (!keys.length) return;
  const read = new Set(repos.filter((r) => !r.error).map((r) => r.name));
  const queued = new Set(repos.flatMap((r) => r.items.map((i) => `${r.name}#${i.number}`)));
  const kept = keys.filter((k) => queued.has(k) || !read.has(k.slice(0, k.lastIndexOf("#"))));
  if (kept.length !== keys.length) setShared(MUTED_KEY, kept);
}

// Sessions to close: their PR has left the list (reviewed at its head, merged,
// closed, or no longer asked) in a repo whose queue was read, and the agent
// isn't working or waiting on me. A repo that failed to read, or that no space
// is in now, keeps its sessions, so a bad read never closes one. An ended
// session whose PR is still listed stays too, to be inspected.
function leftoverSessions(repos) {
  const read = new Set(repos.filter((r) => !r.error).map((r) => r.name));
  const keys = new Set();
  for (const repo of repos) {
    for (const item of repo.items) {
      if (listed(item, sessionFor(repo.name, item.number))) keys.add(`${repo.name}#${item.number}`);
    }
  }
  return allSessions().filter((s) => read.has(s.labels[L_REPO])
    && !keys.has(`${s.labels[L_REPO]}#${s.labels[L_PR]}`)
    && !(s.state === "live" && (s.status === "working" || s.status === "blocked")));
}

// --- The mod ----------------------------------------------------------------------

export default class Reviews extends View {
  init(_props, cx) {
    this.menu = props()?.menu ?? null;
    if (this.menu) {
      this.handle = cx.focus_handle();
      this.handle.focus();
      return;
    }
    this.badge = Boolean(props()?.badge);
    this.lastCheck = 0;
    this.statuses = new Map(); // session address -> last status seen, for notifications
    this.scanned = false; // whether this copy has read the queue itself since it started
    this.closing = new Set(); // sessions being closed
    this.selected = null; // "owner/repo#n"
    this.pendingShow = null; // an address to show once the viewer pane exists
    // A show asked for just before this copy started (the badge opening the tab) still counts.
    this.handledShow = Date.now() - 10_000;
    // The badge polls. A Reviews tab polls only in a layout without the badge.
    if (this.polls()) this.refresh(cx);
    // The poller checks when the next check is due, so a check asked for by
    // hand starts the countdown again; the tab redraws to keep its times current.
    cx.timer.every(TICK_MS, (cx) => {
      if (this.polls() && Date.now() >= (shared(NEXT_KEY) ?? 0)) this.refresh(cx);
      if (!this.badge) cx.notify();
    });
    cx.spawn(async (cx) => {
      for (;;) {
        this.command(await nextCommand());
        cx.notify();
      }
    });
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
        const repos = DEMO ? demoScan() : await scan();
        setShared(QUEUE_KEY, { checked_at: Date.now(), repos });
        pruneMuted(repos);
        this.scanned = true;
      } catch (e) {
        console.log(`reviews: scan failed: ${e?.message ?? e}`);
      } finally {
        this.busy = false;
        setShared(NEXT_KEY, Date.now() + POLL_MS);
        setShared(CHECKING_KEY, false);
      }
      cx.notify();
    });
  }

  // `reviews.show-<address>`, from a notification: the poller opens the
  // Reviews tab and asks its copy to show that session.
  command(c) {
    const m = /^show-(.+)$/.exec(c ?? "");
    if (!m || !this.polls()) return;
    openQueueTab();
    setShared(SHOW_KEY, { address: m[1], at: Date.now() });
  }

  // Asks made through shared state reach the right copy here, since every copy
  // re-renders when shared state changes.
  handleShared(cx) {
    const asked = shared(REFRESH_KEY);
    if (this.polls() && typeof asked === "number" && asked > this.lastCheck) this.refresh(cx);
    if (this.badge) return;
    const show = shared(SHOW_KEY);
    if (show?.at > this.handledShow) {
      this.handledShow = show.at;
      const s = sessions().find((x) => x.address === show.address);
      if (s) {
        this.selected = `${s.labels[L_REPO]}#${s.labels[L_PR]}`;
        cx.spawn(async () => this.show(show.address));
      }
    }
    // A new session waits until Herdr lists it, and until the viewer exists. A
    // viewer just split in is still starting its own shell, which wins over a
    // show sent at once; so show after a moment, and once more to be sure.
    const pending = this.pendingShow;
    if (pending && viewerPane() && terminals().some((t) => t.address === pending)) {
      const address = this.pendingShow;
      this.pendingShow = null;
      for (const ms of [300, 1200]) cx.timer.after(ms, () => this.show(address));
    }
  }

  // Tells me when a session turns to needing me or finishes, since sessions
  // without a tab get none of Herdr's own attention cues.
  watchSessions(cx) {
    const seen = new Map();
    for (const s of sessions()) {
      const before = this.statuses.get(s.address);
      seen.set(s.address, s.status);
      if (!before || before === s.status || (s.status !== "blocked" && s.status !== "done")) continue;
      const here = queueTab();
      if (shared(SHOWN_KEY) === s.address && here?.tab.active && here?.space.active) continue;
      const blocked = s.status === "blocked";
      cx.spawn(async () => notify({
        title: `#${s.labels[L_PR]} ${blocked ? "needs you" : "finished"}`,
        body: s.labels[L_TITLE] ?? "",
        level: blocked ? "warning" : "info",
        action: { name: `${MOD_NAME}.show-${s.address}` },
      }));
    }
    this.statuses = seen;
  }

  render(cx) {
    if (this.menu) return this.renderMenu();
    this.handleShared(cx);
    if (this.polls()) {
      this.watchSessions(cx);
      this.closeLeftovers(cx);
    }
    return this.badge ? this.renderBadge() : this.renderTab();
  }

  // --- Actions ----------------------------------------------------------------------

  show(address) {
    const viewer = viewerPane();
    if (!viewer) {
      // Split a viewer in beside the list, and show the session once it's there.
      this.later(address);
      return;
    }
    run("terminal.show", { terminal: address, pane: viewer.pane });
    setShared(SHOWN_KEY, address);
  }

  // Shows a session once it and the viewer pane are ready (see handleShared).
  later(address) {
    this.pendingShow = address;
    if (!viewerPane()) run("pane.split", { direction: "right", pane: listPane()?.pane });
  }

  start(repo, item, cx, { stay = false } = {}) {
    if (!stay) this.selected = `${repo.name}#${item.number}`;
    cx.spawn(async (cx) => {
      try {
        const address = await startSession(repo, item);
        if (address && !stay) this.later(address);
      } catch (e) {
        notify({ title: `Couldn't start #${item.number}`, body: String(e?.message ?? e), level: "error" });
      }
      cx.notify();
    });
  }

  // Runs on every render of the poller, since a session can settle after its
  // PR has left the list. Only on a queue this copy read itself, not one left
  // in shared state from before a restart.
  closeLeftovers(cx) {
    if (!this.scanned) return;
    for (const s of leftoverSessions(shared(QUEUE_KEY)?.repos ?? [])) {
      if (this.closing.has(s.address)) continue;
      this.closing.add(s.address);
      this.close(s, cx);
    }
  }

  close(session, cx) {
    if (shared(SHOWN_KEY) === session.address) {
      const viewer = viewerPane();
      if (viewer) run("terminal.show", { pane: viewer.pane });
      setShared(SHOWN_KEY, null);
    }
    // Kill, then remove: an ended terminal stays listed until it's removed.
    cx.spawn(async () => {
      try {
        if (session.state === "live") await hc(["kill", session.address]);
        await hc(["rm", session.address]);
      } finally {
        this.closing.delete(session.address);
      }
    });
  }

  // --- Badge ------------------------------------------------------------------------

  fitBlock(contentWidth, cx) {
    const px = Math.ceil(contentWidth);
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
    // The count is what the Reviews tab lists; the red dot, a session waiting on me.
    const waits = sessions().some((s) => stage(t, s).waits);
    const quiet = muted();
    let count = 0;
    for (const repo of queue?.repos ?? []) {
      for (const item of repo.items) {
        if (listed(item, sessionFor(repo.name, item.number)) && !quiet.has(`${repo.name}#${item.number}`)) count++;
      }
    }

    // Shown even when nothing waits, so the Reviews tab is always a click away.
    return h_flex().id("root").size_full().justify_end().items_center()
      .bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).cursor_pointer()
      .on_click(() => openQueueTab())
      .child(h_flex().id("content").flex_none().gap(6).px(PAD_X).items_center()
        .tooltip(waits ? "A review session needs you. Click for the queue." : "GitHub reviews waiting on you. Click for the queue.")
        .when(waits, (el) => el.child(div().size(6).rounded(3).bg(t.blocked)))
        .child(div().text_color(count ? t.foreground : t.dim).child(count ? `Reviews: ${count}` : "Reviews"))
        .on_size_change((size, cx) => this.fitBlock(size.width, cx)));
  }


  // --- Reviews tab ------------------------------------------------------------------

  button(t, id, label, action, { primary = false } = {}) {
    return div().id(id).flex_none().px(10).h(24).flex().items_center().rounded(6).cursor_pointer()
      .text_size(12).font_semibold()
      .when(primary, (el) => el.bg(t.solid).text_color(t.solid_foreground))
      .when(!primary, (el) => el.border(1).border_color(t.border).text_color(t.foreground)
        .hover((s) => s.bg(t.hover)))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => {
        cx.stop_propagation();
        action(cx);
        cx.notify();
      })
      .child(label);
  }

  stageTag(st) {
    return h_flex().gap(5).items_center()
      .child(div().size(6).rounded(3).bg(st.color))
      .child(div().text_size(12).text_color(st.color).child(st.label));
  }

  row(t, repo, item, { isMuted = false } = {}) {
    const key = `${repo.name}#${item.number}`;
    const session = sessionFor(repo.name, item.number);
    const selected = this.selected === key;
    const size = item.size ?? {};
    const meta = [
      item.created_at && age(item.created_at) ? `opened ${age(item.created_at)} ago` : null,
      `+${size.additions ?? 0} −${size.deletions ?? 0}`,
      plural(size.files ?? 0, "file"),
      item.stacked_on ? `stacked on #${item.stacked_on}` : null,
      ...(item.jira_keys ?? []),
    ].filter(Boolean).join(" · ");

    return h_flex().id(`row-${key}`).gap(12).px(10).py(7).items_center().rounded(8)
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        openOverlay({ mod: MOD_NAME, kind: "popup", width: 200, height: 78, props: { menu: { key, url: item.url } } });
      })
      .when(selected, (el) => el.bg(t.selected))
      .when(!selected, (el) => el.hover((s) => s.bg(t.hover)))
      .when(Boolean(session), (el) => el.cursor_pointer())
      .on_click((_e, cx) => {
        this.selected = key;
        if (session) this.show(session.address);
        cx.notify();
      })
      .child(v_flex().w(92).flex_none().gap(2)
        .child(div().id(`num-${key}`).text_color(isMuted ? t.dim : t.accent).cursor_pointer()
          .tooltip("Open on GitHub")
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click((_e, cx) => { cx.stop_propagation(); exec("open", [item.url]); })
          .child(`#${item.number}`))
        .child(div().truncate().text_size(11.5).text_color(t.dim).child(repo.name)))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(h_flex().min_w(0).gap(12).items_center()
          .child(div().flex_1().min_w(0).truncate().text_color(isMuted ? t.muted : t.foreground).child(item.title))
          .when(Boolean(item.author), (el) => el.child(div().flex_none().max_w(160).truncate()
            .text_color(isMuted ? t.dim : t.muted).child(item.author))))
        .child(div().truncate().text_size(11.5).text_color(t.dim).child(meta)))
      // A fixed width, so the authors before it line up whatever it holds.
      // Muted rows show a session's status but no actions; unmute to review.
      .child(h_flex().w(96).flex_none().justify_end()
        .when(Boolean(session), (el) => el.child(
          this.stageTag(isMuted ? { ...stage(t, session), color: t.dim } : stage(t, session))))
        .when(!session && !isMuted, (el) => el.child(
          this.button(t, `review-${key}`, "Review", (cx) => this.start(repo, item, cx), { primary: true }))));
  }

  renderTab() {
    const t = theme();
    const queue = shared(QUEUE_KEY);
    const checking = Boolean(shared(CHECKING_KEY));
    const repos = queue?.repos ?? [];

    const quiet = muted();
    const startable = [];
    for (const repo of repos) {
      for (const item of repo.items) {
        if (item.state === "new" && !sessionFor(repo.name, item.number) && !quiet.has(`${repo.name}#${item.number}`)) {
          startable.push([repo, item]);
        }
      }
    }

    const header = h_flex().gap(10).items_center()
      // No title of its own: the tab and Herdr's pane header already say "Reviews".
      .child(this.button(t, "refresh", "Refresh", () => setShared(REFRESH_KEY, Date.now())))
      .child(div().id("checked").text_size(12).text_color(t.dim)
        .when(Boolean(queue?.checked_at), (el) => el.tooltip(`Checked at ${clock(queue.checked_at)}`))
        .child(checkedLine(queue, checking, shared(NEXT_KEY))))
      .child(div().flex_1())
      // Plain text, not a button: a setting, quieter than the actions beside it.
      .child(div().id("sort").flex_none().px(4).text_size(12).text_color(t.dim).cursor_pointer()
        .hover((st) => st.text_color(t.foreground))
        .on_click(() => openOverlay({
          mod: MOD_NAME, kind: "popup", width: 180, height: 10 + 31 * SORTS.length, props: { menu: { sort: true } },
        }))
        .child(`${sortOf().label} ▾`))
      .when(startable.length > 1, (el) => el.child(this.button(t, "review-all", `Review all ${startable.length}`,
        (cx) => { for (const [repo, item] of startable) this.start(repo, item, cx, { stay: true }); })));

    // One list across repos in the chosen order, muted PRs last.
    const sort = sortOf();
    const pairs = repos
      .flatMap((repo) => repo.items.map((item) => [repo, item]))
      .filter(([repo, item]) => listed(item, sessionFor(repo.name, item.number)))
      .sort(sort.compare);
    const isQuiet = ([repo, item]) => quiet.has(`${repo.name}#${item.number}`);
    const rows = pairs.filter((p) => !isQuiet(p)).map(([repo, item]) => this.row(t, repo, item));
    const mutedRows = pairs.filter(isQuiet).map(([repo, item]) => this.row(t, repo, item, { isMuted: true }));
    const mutedSection = mutedRows.length === 0 ? null : v_flex().gap(2)
      .child(div().px(10).pb(2).text_size(12).font_semibold().text_color(t.dim).child("Muted"))
      .children(mutedRows);

    const errors = repos.filter((repo) => repo.error).map((repo) => h_flex().id(`err-${repo.key}`).gap(8).px(10)
      .text_size(12).tooltip(repo.error)
      .child(div().text_color(t.muted).child(repo.name))
      .child(div().truncate().text_color(t.blocked).child("couldn't read the queue")));

    const empty = v_flex().gap(4).px(10).pt(8)
      .child(div().text_color(t.muted).child(
        queue ? "Nothing is waiting for your review." : checking ? "Checking the queue…" : "The queue hasn't been checked yet."))
      .when(repos.length > 0, (el) => el.child(div().text_size(12).text_color(t.dim)
        .child(`Watching ${repos.map((r) => r.name).join(", ")}`)));

    return v_flex().id("reviews").size_full().bg(t.background).p(16).gap(14).text_size(13)
      .overflow_y_scrollbar()
      .child(header)
      .when(errors.length > 0, (el) => el.child(v_flex().gap(4).children(errors)))
      .child(rows.length ? v_flex().gap(2).children(rows) : empty)
      .when(Boolean(mutedSection), (el) => el.child(mutedSection));
  }

  // --- Row menu ---------------------------------------------------------------------

  renderMenu() {
    const t = theme();
    const { key, url, sort } = this.menu;
    const done = () => closeOverlay(props()?.overlay);
    let items;
    if (sort) {
      const on = sortOf().id;
      items = SORTS.map((s) => [`${s.id === on ? "✓ " : "   "}${s.label}`, () => setShared(SORT_KEY, s.id)]);
    } else {
      const isMuted = muted().has(key);
      items = [
        [isMuted ? "Unmute" : "Mute", () => setMuted(key, !isMuted)],
        ["Open on GitHub", () => exec("open", [url])],
      ];
    }
    return v_flex().id("menu").track_focus(this.handle).w_full().min_h(0).p(5).bg(t.popover).text_size(12.8)
      .on_key_down((e, cx) => {
        if (e.key !== "escape") return;
        done();
        cx.stop_propagation();
      })
      .children(items.map(([label, action], i) => h_flex().id(`mi-${i}`).h(31).px(8).rounded(7).items_center()
        .text_color(t.foreground).hover((s) => s.bg(t.hover))
        .on_click(() => { done(); action(); })
        .child(label)));
  }
}
