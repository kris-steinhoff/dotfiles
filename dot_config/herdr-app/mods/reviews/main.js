// The GitHub review queue, from `~/.local/bin/github-review-queue --all`, for
// every GitHub repo a Herdr space on this computer is in.
//
// One mod in a few places, told apart by props:
// - `{ sidebar: true }`, the `reviews` block under Agents in the personal
//   layout's sidebar: polls the queue, publishes it in shared state, lists it in
//   two-line rows, notifies when a session needs me, puts the count of those
//   on the Dock icon, and closes finished sessions. The block fits its list
//   until its divider is dragged, then keeps the dragged height. In the
//   sidebar's narrow rail it shows just the count; a click unfolds it.
// - `{ menu: { key, url } }`, a row's right-click popup: Mute / Unmute, and
//   Open on GitHub. `{ menu: { list: true } }`: the ⋯ menu, the sorts and
//   Review all.
// - no props: a Reviews tab left open from before the list moved to the
//   sidebar. It only says to close it, and neither polls nor acts.
//
// Each review's Claude session (`/github-pr review <n>`) runs as a herdr-core
// terminal with no tab of its own, labeled with its repo and PR number. The
// queue keeps no state of its own (a PR is done when my review is at its head),
// so finding a session by its labels is what stops a second one starting for
// the same PR. Clicking a row, or a notification about its session, peeks at
// the session over the current tab with `terminal.peek`.
import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import {
  checking, closeOverlay, exec, focused, hc, home, layout, notify, openOverlay, panes, props, run,
  setBadge, setShared, shared, spaces, terminals, theme,
} from "herdr";

// Test data: true lists the made-up PRs in demoScan() instead of running the
// queue. Sessions are real Claude sessions either way.
const DEMO = false;

const QUEUE_KEY = "reviews.queue"; // { checked_at, repos: [...] }
const CHECKING_KEY = "reviews.checking";
const REFRESH_KEY = "reviews.refresh"; // a time; the poller checks when it's newer than its last check
const SORT_KEY = "reviews.sort"; // an id from SORTS
const MUTED_KEY = "reviews.muted"; // ["owner/repo#n"]: set aside until unmuted or gone from the queue
// { "owner/repo#n": still muted for that reason }: PRs muted once because
// someone else reviewed them, never again; false once I mute or unmute by hand.
const AUTO_MUTED_KEY = "reviews.automuted";
const POLL_MS = 5 * 60_000;
const NEXT_KEY = "reviews.next"; // when the poller checks next, for the countdown
const TICK_MS = 10_000; // how often the poller looks at the clock and redraws its times
// A time; the sidebar copy starts every startable PR when it's newer than the
// last one it handled. Set by the ⋯ menu, which can't start sessions itself.
const START_ALL_KEY = "reviews.startAll";
const SIDEBAR_ID = "reviews";
const SIDEBAR_MIN = 41; // just the header
const SIDEBAR_MAX = 360; // fitting the list stops here, and it scrolls
// The block's height in px once its divider is dragged; null while it fits its
// list. Shared, since Herdr keeps the dragged size across restarts and the
// sidebar copy must not fit over it then.
const HEIGHT_KEY = "reviews.height";
const RAIL_PX = 28; // the block in the sidebar's narrow rail: just the count
const LAND_MS = 2_000; // a resize not shown by then was held where it was
const MOD_NAME = "reviews";
// Keys the mod no longer reads, cleared from shared state, which outlives restarts.
const STALE_KEYS = ["reviews.show", "reviews.shown"];

// Session labels.
const L_REPO = "herdr-reviews.repo";
const L_PR = "herdr-reviews.pr";
const L_TITLE = "herdr-reviews.title";

// `--all`, not `--ready`: the mod needs reviewed PRs too. One stays listed while
// its session is working or waiting on me, and keeps its mute until it leaves
// the queue (see listed() and pruneMuted()).
const queueCommand = () => `${home()}/.local/bin/github-review-queue`;

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, as the agents mod's does: Herdr folds
// the sidebar below 160px, and dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// The reviews block's height in the layout, as Herdr has it now.
const blockPx = () => find(layout(), SIDEBAR_ID)?.size?.px;

// Out of the rail, back to the width it had, as the agents mod's toggle does.
function unfoldSidebar() {
  setShared("sidebar.collapsed", false);
  run("layout.resize", { id: "sidebar", px: shared("sidebar.width") ?? 268 });
}

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

// What a session is doing, from the status its agent reports. Only a blocked
// one waits on me: a finished one has said its piece, and stays finished until
// it's closed, which for a PR that's still listed may be never.
function stage(t, session) {
  switch (session.status) {
    case "blocked": return { label: "needs you", color: t.blocked, waits: true };
    case "done": return { label: "finished", color: t.done };
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

// Over the current tab, with Herdr's bar to keep it as a tab or close it.
const peek = (address) => run("terminal.peek", { terminal: address });

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
      const r = await exec(queueCommand(), ["--all", "--repo", root], { timeout: 120_000 });
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
      items: [
        item("acme/web", 88, "Dark mode for settings page", "Sam Lee", [200, 45, 7]),
        item("acme/web", 91, "Fix footer links", "Sam Lee", [4, 2, 1], { other_reviewers: ["dortiz"] }),
        item("acme/web", 93, "Fix header links", "Sam Lee", [6, 2, 1], { other_reviewers: ["dortiz"], requested_directly: true }),
      ],
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
const autoMuted = () => shared(AUTO_MUTED_KEY) ?? {};

// By hand, from a row's menu. Either way the mute is no longer the automatic one.
function setMuted(key, on) {
  const keys = muted();
  if (on) keys.add(key);
  else keys.delete(key);
  setShared(MUTED_KEY, [...keys]);
  const auto = autoMuted();
  if (auto[key]) setShared(AUTO_MUTED_KEY, { ...auto, [key]: false });
}

// A PR someone else has already reviewed is muted the first time it's seen
// that way. It's muted only once, so an unmute sticks. A PR whose author asked
// me by name, not through a team, is never muted this way, and one muted this
// way before the request came is unmuted.
function autoMute(repos) {
  const auto = { ...autoMuted() };
  const keys = muted();
  let changed = false;
  for (const repo of repos) {
    for (const item of repo.items) {
      const key = `${repo.name}#${item.number}`;
      if (item.requested_directly) {
        if (auto[key]) {
          keys.delete(key);
          auto[key] = false;
          changed = true;
        }
        continue;
      }
      if (!item.other_reviewers?.length || key in auto) continue;
      // One I'd already muted by hand keeps that reason.
      auto[key] = !keys.has(key);
      keys.add(key);
      changed = true;
    }
  }
  if (!changed) return;
  setShared(AUTO_MUTED_KEY, auto);
  setShared(MUTED_KEY, [...keys]);
}

// Mutes last until undone, or until the PR leaves the queue of a repo that was
// read; a repo that failed or isn't watched now keeps its mutes. The record of
// automatic mutes is pruned the same way.
function pruneMuted(repos) {
  const read = new Set(repos.filter((r) => !r.error).map((r) => r.name));
  const queued = new Set(repos.flatMap((r) => r.items.map((i) => `${r.name}#${i.number}`)));
  const keep = (k) => queued.has(k) || !read.has(k.slice(0, k.lastIndexOf("#")));
  const keys = shared(MUTED_KEY) ?? [];
  const kept = keys.filter(keep);
  if (kept.length !== keys.length) setShared(MUTED_KEY, kept);
  const auto = Object.entries(autoMuted());
  const autoKept = auto.filter(([k]) => keep(k));
  if (autoKept.length !== auto.length) setShared(AUTO_MUTED_KEY, Object.fromEntries(autoKept));
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

// The listed PRs as [repo, item] pairs in the chosen order.
function listedPairs(repos) {
  return repos
    .flatMap((repo) => repo.items.map((item) => [repo, item]))
    .filter(([repo, item]) => listed(item, sessionFor(repo.name, item.number)))
    .sort(sortOf().compare);
}

// What the sidebar header and rail count: listed PRs that aren't muted.
function listedCount() {
  const quiet = muted();
  return listedPairs(shared(QUEUE_KEY)?.repos ?? [])
    .filter(([repo, item]) => !quiet.has(`${repo.name}#${item.number}`)).length;
}

// What Review all starts: new, unmuted PRs without a session.
function startablePairs() {
  const quiet = muted();
  const out = [];
  for (const repo of shared(QUEUE_KEY)?.repos ?? []) {
    for (const item of repo.items) {
      if (item.state === "new" && !sessionFor(repo.name, item.number) && !quiet.has(`${repo.name}#${item.number}`)) {
        out.push([repo, item]);
      }
    }
  }
  return out;
}

// A repo's name without its owner, unless two watched repos share that name.
function shortNamer(repos) {
  const short = (name) => name.slice(name.indexOf("/") + 1);
  const counts = new Map();
  for (const r of repos) counts.set(short(r.name), (counts.get(short(r.name)) ?? 0) + 1);
  return (name) => (counts.get(short(name)) > 1 ? name : short(name));
}

// The parts of a row's details: some on its second line, the rest in its tooltip.
function details(repo, item, isMuted) {
  const key = `${repo.name}#${item.number}`;
  const size = item.size ?? {};
  const others = item.other_reviewers?.join(", ") || null;
  // Why a muted row is muted, which for an automatic mute names who else reviewed it.
  const auto = Boolean(isMuted && others && autoMuted()[key]);
  return {
    others,
    auto,
    why: !isMuted ? null : auto ? `already reviewed by ${others}` : "muted by you",
    age: item.created_at ? age(item.created_at) : null,
    lines: `+${size.additions ?? 0} −${size.deletions ?? 0}`,
    files: plural(size.files ?? 0, "file"),
    stacked: item.stacked_on ? `stacked on #${item.stacked_on}` : null,
    // Says why a PR others reviewed isn't muted.
    asked: others && item.requested_directly ? "asked of you by name" : null,
    jira: item.jira_keys ?? [],
  };
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
    this.sidebar = Boolean(props()?.sidebar);
    // A Reviews tab left from before: it only says to close it.
    if (!this.sidebar) return;
    this.mutedOpen = false; // the sidebar's Muted group
    this.hovered = null; // the sidebar row under the pointer
    // Shared state outlives restarts, so only a Review all asked for after this
    // copy started counts; a leftover one would start every PR again.
    this.handledStartAll = Date.now();
    this.lastCheck = 0;
    this.statuses = new Map(); // session address -> last status seen, for notifications
    this.scanned = false; // whether this copy has read the queue itself since it started
    this.closing = new Set(); // sessions being closed
    this.selected = null; // "owner/repo#n"
    this.pendingPeek = null; // a new session to peek at once Herdr lists it
    this.shown = null; // the block's height when the copy last looked
    this.pending = []; // { px, at }: resizes asked for and not yet shown, oldest first
    this.kept = null; // a height asked for that Herdr held at another; not asked again
    if (this.polls()) {
      for (const key of STALE_KEYS) if (shared(key) != null) setShared(key, null);
      this.refresh(cx);
    }
    // The poller checks when the next check is due, so a check asked for by
    // hand starts the countdown again; a redraw keeps the header's times current.
    cx.timer.every(TICK_MS, (cx) => {
      if (this.polls() && Date.now() >= (shared(NEXT_KEY) ?? 0)) this.refresh(cx);
      cx.notify();
    });
  }

  // Only the sidebar copy, and never under `herdr-app check`, which runs init()
  // for real: a check would otherwise read the queue, write shared state, and
  // close sessions. Herdr keeps the copy running while the sidebar is folded or
  // hidden, but starts it only when its block first shows.
  polls() {
    return !checking() && this.sidebar;
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
        autoMute(repos);
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

  // Asks made through shared state reach the right copy here, since every copy
  // re-renders when shared state changes.
  handleShared(cx) {
    const asked = shared(REFRESH_KEY);
    if (this.polls() && typeof asked === "number" && asked > this.lastCheck) this.refresh(cx);
    // Review all from the ⋯ menu, which can't start sessions itself.
    const all = shared(START_ALL_KEY);
    if (this.sidebar && typeof all === "number" && all > this.handledStartAll) {
      this.handledStartAll = all;
      for (const [repo, item] of startablePairs()) this.start(repo, item, cx, { stay: true });
    }
    // A session just started is peeked at once Herdr lists it.
    const pending = this.pendingPeek;
    if (pending && terminals().some((t) => t.address === pending)) {
      this.pendingPeek = null;
      cx.spawn(async () => peek(pending));
    }
  }

  // Tells me when a session turns to needing me or finishes, since sessions
  // without a tab get none of Herdr's own attention cues, and keeps the count
  // of sessions waiting on me on the Dock icon.
  watchSessions(cx) {
    const seen = new Map();
    const waiting = sessions().filter((s) => s.status === "blocked").length;
    if (waiting !== this.dockCount) {
      this.dockCount = waiting;
      setBadge(waiting ? String(waiting) : null);
    }
    for (const s of sessions()) {
      const before = this.statuses.get(s.address);
      seen.set(s.address, s.status);
      if (!before || before === s.status || (s.status !== "blocked" && s.status !== "done")) continue;
      // Not while I'm looking at it: focused() names a peeked terminal too.
      if (focused()?.terminal === s.address) continue;
      const blocked = s.status === "blocked";
      cx.spawn(async () => notify({
        title: `#${s.labels[L_PR]} ${blocked ? "needs you" : "finished"}`,
        body: s.labels[L_TITLE] ?? "",
        level: blocked ? "warning" : "info",
        action: { name: "terminal.peek", args: { terminal: s.address } },
      }));
    }
    this.statuses = seen;
  }

  render(cx) {
    if (this.menu) return this.renderMenu();
    if (!this.sidebar) return this.renderLeftover();
    this.handleShared(cx);
    if (this.polls()) {
      this.watchSessions(cx);
      this.closeLeftovers(cx);
    }
    return narrow() ? this.renderRail(cx) : this.renderSidebar(cx);
  }

  // --- Actions ----------------------------------------------------------------------

  start(repo, item, cx, { stay = false } = {}) {
    if (!stay) this.selected = `${repo.name}#${item.number}`;
    cx.spawn(async (cx) => {
      try {
        const address = await startSession(repo, item);
        if (address && !stay) this.pendingPeek = address;
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

  // --- Sidebar ----------------------------------------------------------------------

  // A layout block can't size itself to its content, so the sidebar copy sets
  // its own block's height: what its content measures, a dragged height, or
  // the rail's height. Each resize joins `pending` until the block shows it,
  // and one asked while another is pending is sent even if the block shows
  // that height now, since the pending one lands first.
  sizeBlock(px, cx) {
    if (this.pending.length ? this.pending.at(-1).px === px : this.shown === px || this.kept === px) return;
    this.pending.push({ px, at: Date.now() });
    cx.spawn(async () => run("layout.resize", { id: SIDEBAR_ID, px }));
  }

  // Looks at the block's height on each render. A change while resizes are
  // pending is them landing, in order: at a pending height, or, when the room
  // in the column holds it short, at another, which is then kept rather than
  // asked for again. A change with none pending is a drag. Out of the rail it
  // becomes the dragged height in shared state, so the block stops fitting
  // its list; no dragged height is below the header, so the ⋯ menu stays
  // in reach. In the rail, whose height is always the
  // copy's, it only gets resized back.
  observe(dragsCount) {
    const px = blockPx();
    if (typeof px !== "number") return;
    const changed = this.shown != null && px !== this.shown;
    this.shown = px;
    if (changed) {
      const i = this.pending.findIndex((p) => p.px === px);
      if (i >= 0) {
        this.pending.splice(0, i + 1);
        this.kept = null;
      } else if (this.pending.length) {
        const held = this.pending.shift();
        if (!this.pending.length) this.kept = held.px;
      } else {
        this.kept = null;
        const height = Math.max(SIDEBAR_MIN, px);
        if (dragsCount && shared(HEIGHT_KEY) !== height) setShared(HEIGHT_KEY, height);
      }
    }
    // Resizes that changed nothing by now were held where the block was.
    if (this.pending.length && Date.now() - this.pending.at(-1).at > LAND_MS) {
      this.kept = this.pending.at(-1).px;
      this.pending = [];
    }
  }

  // The height out of the rail: the dragged one, else the content's.
  target() {
    const dragged = shared(HEIGHT_KEY);
    return typeof dragged === "number" ? dragged : this.fitted;
  }

  // From the measured content column plus the header and border outside it.
  // Kept, so leaving the rail restores it without waiting for a
  // new measurement. The render resizes, after looking for a drag.
  fitContent(size, cx) {
    const fitted = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.ceil(size.height + 1 + 41)));
    if (fitted === this.fitted) return;
    this.fitted = fitted;
    cx.notify();
  }

  // A small control in the sidebar header, in the agents header's quiet style.
  headerControl(t, id, glyph, tip, action, { on = false } = {}) {
    return div().id(id).flex_none().size(18).flex().items_center().justify_center().rounded(4)
      .text_size(12).text_color(on ? t.foreground : t.dim).cursor_pointer()
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .tooltip(tip)
      .on_click((_e, cx) => { action(); cx.notify(); })
      .child(glyph);
  }

  // What sits at a row's right end: a start button, the session's status dot,
  // or, while it needs me, the agents list's compact ! pill. Muted rows show a
  // session's status in grey and offer no start; unmute to review.
  rowEnd(t, repo, item, key, session, isMuted) {
    if (session) {
      const st = stage(t, session);
      const mark = st.waits && !isMuted
        ? div().size(14).rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked)
          .flex().items_center().justify_center().child("!")
        : div().size(7).rounded(4).bg(isMuted ? t.dim : st.color);
      return h_flex().id(`st-${key}`).size(18).flex_none().items_center().justify_center().tooltip(st.label).child(mark);
    }
    if (isMuted) return null;
    return div().id(`start-${key}`).size(18).flex_none().flex().items_center().justify_center().rounded(4)
      .text_size(9).cursor_pointer()
      .text_color(this.hovered === key ? t.foreground : t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.accent))
      .tooltip("Start a review")
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => {
        cx.stop_propagation();
        this.start(repo, item, cx);
        cx.notify();
      })
      .child("▶");
  }

  // Two lines, for the sidebar's width: number, author, title, and status;
  // then repo, age, and size. The rest is in the tooltip.
  sidebarRow(t, repo, item, shortName, { isMuted = false } = {}) {
    const key = `${repo.name}#${item.number}`;
    const session = sessionFor(repo.name, item.number);
    const selected = this.selected === key;
    const d = details(repo, item, isMuted);
    const author = item.author?.trim().split(/\s+/)[0];
    const line2 = [d.why, shortName(repo.name), d.age, isMuted ? null : d.lines].filter(Boolean).join(" · ");
    const tip = [
      item.title,
      repo.name,
      `${d.files} changed`,
      d.stacked,
      d.others ? `reviewed by ${d.others}` : null,
      d.asked,
      d.jira.join(", ") || null,
    ].filter(Boolean).join("\n");
    const end = this.rowEnd(t, repo, item, key, session, isMuted);

    return v_flex().id(`srow-${key}`).flex_none().px(8).py(5).gap(1).rounded(8)
      .tooltip(tip)
      .when(selected, (el) => el.bg(t.selected))
      .when(!selected, (el) => el.hover((s) => s.bg(t.hover)))
      .when(Boolean(session), (el) => el.cursor_pointer())
      .on_hover((on, cx) => {
        if (on) this.hovered = key;
        else if (this.hovered === key) this.hovered = null;
        cx.notify();
      })
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        openOverlay({ mod: MOD_NAME, kind: "popup", width: 200, height: 78, props: { menu: { key, url: item.url } } });
      })
      .on_click((_e, cx) => {
        this.selected = key;
        if (session) peek(session.address);
        cx.notify();
      })
      .child(h_flex().min_w(0).gap(6).items_center()
        .child(div().id(`snum-${key}`).flex_none().text_color(isMuted ? t.dim : t.accent).cursor_pointer()
          .tooltip("Open on GitHub")
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click((_e, cx) => { cx.stop_propagation(); exec("open", [item.url]); })
          .child(`#${item.number}`))
        .when(Boolean(author), (el) => el.child(div().flex_none().max_w(90).truncate().font_medium()
          .text_color(isMuted ? t.muted : t.foreground).child(author)))
        .child(div().flex_1().min_w(0).truncate().text_color(isMuted ? t.dim : t.muted).child(item.title))
        .when(Boolean(end), (el) => el.child(end)))
      .child(div().truncate().text_size(11.5).text_color(t.dim).child(line2));
  }

  renderSidebar(cx) {
    this.observe(true);
    const px = this.target();
    if (px != null) this.sizeBlock(px, cx);
    const t = theme();
    const queue = shared(QUEUE_KEY);
    const checking = Boolean(shared(CHECKING_KEY));
    const repos = queue?.repos ?? [];
    const shortName = shortNamer(repos);
    const quiet = muted();
    const count = listedCount();

    const header = h_flex().px(16).h(41).pt(14).pb(5).flex_none().gap(6).items_center()
      .child(div().text_size(11.5).font_medium().text_color(t.dim).child("Reviews"))
      .child(div().text_size(11.5).text_color(count ? t.foreground : t.dim).child(String(count)))
      .child(div().flex_1())
      .child(this.headerControl(t, "rv-refresh", "↻", checkedLine(queue, checking, shared(NEXT_KEY)),
        () => setShared(REFRESH_KEY, Date.now()), { on: checking }))
      .child(this.headerControl(t, "rv-more", "⋯", "Sort, or review all", () => {
        const items = SORTS.length * 31 + (startablePairs().length > 1 ? 9 + 31 : 0);
        openOverlay({ mod: MOD_NAME, kind: "popup", width: 200, height: 10 + items, props: { menu: { list: true } } });
      }));

    const pairs = listedPairs(repos);
    const isQuiet = ([repo, item]) => quiet.has(`${repo.name}#${item.number}`);
    const rows = pairs.filter((p) => !isQuiet(p)).map(([repo, item]) => this.sidebarRow(t, repo, item, shortName));
    const mutedPairs = pairs.filter(isQuiet);

    const errors = repos.filter((repo) => repo.error).map((repo) => div().id(`err-${repo.key}`).px(8).py(3).truncate()
      .text_size(11.5).text_color(t.dim).tooltip(repo.error)
      .child(`⚠ ${shortName(repo.name)}: couldn't read the queue`));

    // Before the first check, a line says so. After it, an empty queue is just
    // the header with its 0, so the block takes no more room than it needs.
    const note = queue ? null : div().px(8).py(3).text_size(11.5).text_color(t.dim)
      .child(checking ? "Checking the queue…" : "Not checked yet.");

    const mutedToggle = mutedPairs.length === 0 ? null : h_flex().id("rv-muted").flex_none().px(8).h(24).items_center()
      .text_size(11.5).text_color(t.dim).cursor_pointer()
      .hover((s) => s.text_color(t.foreground))
      .on_click((_e, cx) => { this.mutedOpen = !this.mutedOpen; cx.notify(); })
      .child(`${this.mutedOpen ? "▾" : "▸"} Muted (${mutedPairs.length})`);
    const mutedRows = this.mutedOpen
      ? mutedPairs.map(([repo, item]) => this.sidebarRow(t, repo, item, shortName, { isMuted: true }))
      : [];

    const filled = Boolean(note) || errors.length > 0 || rows.length > 0 || Boolean(mutedToggle);
    // The content column is what's measured: the scrolling area around it
    // takes the block's height, and measuring that would chase its own resize.
    const content = v_flex().id("rv-content").flex_none().px(8).when(filled, (el) => el.pb(8))
      .when(Boolean(note), (el) => el.child(note))
      .children(errors)
      .children(rows)
      .when(Boolean(mutedToggle), (el) => el.child(mutedToggle))
      .children(mutedRows)
      .on_size_change((size, cx) => this.fitContent(size, cx));

    return v_flex().size_full().min_h(0).bg(t.chrome).border_t(1).border_color(t.border).text_size(13)
      .child(header)
      .child(v_flex().id("rv-list").flex_1().min_h(0).overflow_y_scrollbar().child(content));
  }

  // In the sidebar's narrow rail: the count, or a dim R at zero, with a red dot
  // in front while a session needs me. A click unfolds the sidebar.
  renderRail(cx) {
    this.observe(false);
    this.sizeBlock(RAIL_PX, cx);
    const t = theme();
    const waits = sessions().some((s) => stage(t, s).waits);
    const count = listedCount();
    const tip = `${count ? plural(count, "review") : "No reviews"} waiting${waits ? "; a session needs you" : ""}`;
    return h_flex().id("rv-rail").size_full().justify_center().items_center().gap(4)
      .bg(t.chrome).border_t(1).border_color(t.border).text_size(11.5).cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .tooltip(tip)
      .on_click(() => unfoldSidebar())
      .when(waits, (el) => el.child(div().size(6).rounded(3).bg(t.blocked)))
      .child(div().text_color(count ? t.foreground : t.dim).child(count ? String(count) : "R"));
  }

  // A Reviews tab left open from before the list moved to the sidebar.
  renderLeftover() {
    const t = theme();
    return v_flex().size_full().justify_center().items_center().p(16).bg(t.background)
      .child(div().text_size(13).text_color(t.muted)
        .child("Reviews now show in the sidebar of the personal layout. Close this tab."));
  }

  // --- Menus ------------------------------------------------------------------------

  renderMenu() {
    const t = theme();
    const { key, url, list } = this.menu;
    const done = () => closeOverlay(props()?.overlay);
    let items;
    const actions = [];
    if (list) {
      const on = sortOf().id;
      items = SORTS.map((s) => [`${s.id === on ? "✓ " : "   "}${s.label}`, () => setShared(SORT_KEY, s.id)]);
      // Starting needs the sidebar copy, which handles the request.
      const startable = startablePairs().length;
      if (startable > 1) actions.push([`Review all ${startable}`, () => setShared(START_ALL_KEY, Date.now())]);
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
      .children(items.map(([label, act], i) => this.menuItem(t, `mi-${i}`, label, () => { done(); act(); })))
      .when(actions.length > 0, (el) => el.child(div().my(4).h(1).bg(t.border)))
      .children(actions.map(([label, act], i) => this.menuItem(t, `ma-${i}`, label, () => { done(); act(); })));
  }

  menuItem(t, id, label, onClick) {
    return h_flex().id(id).h(31).flex_none().px(8).rounded(7).items_center()
      .text_color(t.foreground).hover((s) => s.bg(t.hover))
      .on_click(onClick)
      .child(label);
  }
}
