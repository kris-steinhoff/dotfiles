// A local plan, read from its folder: the documents the plan guide defines
// (run/main, tasks/T<n>, prs/P<n>, questions/Q<n>, journal/<time>), one JSON
// file each, as plan-store writes them, and what the plan view works out from
// them. It follows the claude.ai plan page (plan-page.html in the
// plan-store-claude-page skill), so the two show a plan the same way. No
// rendering here (plan-view.js draws it).
import { exec, readTextFile } from "herdr";
import * as fs from "fs/promises";

const COLLECTIONS = ["run", "tasks", "prs", "questions", "journal"];

async function names(dir) {
  try {
    return await fs.readdir(dir);
  } catch {}
  // fs reads only under the home folder.
  try {
    const r = await exec("ls", ["-1", dir]);
    return r.code === 0 ? r.stdout.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

// Reads a plan's documents: { run, tasks, prs, questions, journal, missing }.
// Each document carries its id. `cache` maps a document's path to its last good
// parse, used when a file is caught half written by hand.
export async function loadPlan(dir, cache = new Map()) {
  const plan = { run: null, tasks: [], prs: [], questions: [], journal: [], missing: false };
  const lists = await Promise.all(COLLECTIONS.map((c) => names(`${dir}/${c}`)));
  await Promise.all(COLLECTIONS.flatMap((c, i) => lists[i].filter((n) => n.endsWith(".json")).map(async (n) => {
    const id = n.slice(0, -5);
    const path = `${c}/${id}`;
    let doc;
    try {
      doc = JSON.parse((await readTextFile(`${dir}/${path}.json`)) ?? "null");
    } catch {
      doc = cache.get(path) ?? null;
    }
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) return;
    cache.set(path, doc);
    if (c === "run") {
      if (id === "main") plan.run = doc;
    } else {
      plan[c].push({ ...doc, id });
    }
  })));
  plan.missing = !plan.run && COLLECTIONS.every((c, i) => !lists[i].length);
  return plan;
}

// --- Statuses -------------------------------------------------------------------

// [label, tone]. Tones: ok, run, attn, bad, idle (plan-view.js colors them).
export const RUN_STATUS = {
  pending: ["Pending", "idle"], running: ["Running", "run"], blocked: ["Blocked", "attn"],
  done: ["Done", "ok"], stopped: ["Stopped", "bad"],
};
export const TASK_STATUS = {
  pending: ["Pending", "idle"], in_progress: ["In Progress", "run"],
  blocked: ["Blocked", "attn"], merged: ["Done", "ok"], dropped: ["Dropped", "idle"],
};
export const PR_STATUS = {
  planned: ["Planned", "idle"], draft: ["Draft", "run"], open: ["Open", "run"], merged: ["Merged", "ok"], closed: ["Closed", "bad"],
};
export const CHECK_MARK = { met: ["✓", "ok"], unmet: ["✗", "bad"], unchecked: ["·", "idle"] };

export const arr = (v) => (Array.isArray(v) ? v : []);
const byTime = (field, dir = "asc") => (a, b) => (dir === "desc" ? -1 : 1) * String(a[field] || "").localeCompare(String(b[field] || ""));
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

export const sortedTasks = (plan) => [...plan.tasks].sort(byOrder);
export const sortedPrs = (plan) => [...plan.prs].sort(byOrder);
export const openQuestions = (plan) => plan.questions.filter((q) => q.status === "open").sort(byTime("asked_at"));

// A running plan is blocked when it has unfinished tasks and none of them is in
// progress or ready to start. "blocked" is never stored.
export function planBlocked(plan) {
  const byId = new Map(plan.tasks.map((t) => [t.id, t]));
  const open = new Set(plan.questions.filter((q) => q.status === "open").map((q) => q.id));
  const cleared = (dep) => !open.has(dep) && (!byId.has(dep) || ["merged", "dropped"].includes(byId.get(dep).status));
  const ready = (t) => t.status === "pending" && arr(t.depends_on).every(cleared);
  const left = plan.tasks.filter((t) => !["merged", "dropped"].includes(t.status));
  return left.length > 0 && !left.some((t) => t.status === "in_progress" || ready(t));
}

export function runStatus(plan) {
  const s = plan.run?.status;
  return s === "running" && planBlocked(plan) ? "blocked" : s;
}

// Tasks done and in progress, out of those not dropped.
export function progress(plan) {
  const count = { merged: 0, in_progress: 0, live: 0 };
  for (const t of plan.tasks) {
    if (t.status in count) count[t.status]++;
    if (t.status !== "dropped") count.live++;
  }
  return count;
}

// --- PRs ------------------------------------------------------------------------

// A PR's own number, from the end of its URL. A planned PR has none.
export function prNumber(p) {
  const m = String(p?.url || "").match(/(\d+)\/?$/);
  return m ? `#${m[1]}` : "";
}

export const prName = (p) => prNumber(p) || p.title || p.id;

// Several PRs stack in build order. When they form one chain from the base
// branch: { base, chain } from the bottom up, else null.
export function prChain(prs) {
  if (prs.length < 2) return null;
  const byId = new Map(prs.map((p) => [p.id, p]));
  const roots = prs.filter((p) => !byId.has(p.base));
  if (roots.length !== 1 || !roots[0].base) return null;
  const chain = [roots[0]];
  for (;;) {
    const next = prs.filter((p) => p.base === chain[chain.length - 1].id);
    if (next.length !== 1) break;
    chain.push(next[0]);
  }
  return chain.length === prs.length ? { base: roots[0].base, chain } : null;
}

// --- Tasks ----------------------------------------------------------------------

// What holds a task up, for its collapsed card: what a blocked task waits on
// outside the repository, and its open questions. [{ text, question? }]
export function waits(plan, t) {
  const qs = new Map(plan.questions.map((q) => [q.id, q]));
  const items = [];
  if (t.status === "blocked" && t.blocked_on) items.push({ text: t.blocked_on });
  for (const id of arr(t.depends_on)) {
    const q = qs.get(id);
    if (q?.status === "open") items.push({ text: `${id} · ${q.title || ""}`, question: id });
  }
  return items;
}

// What a task comes after: { tasks: [id], questions: [{ id, title, open }] }.
export function after(plan, t) {
  const qs = new Map(plan.questions.map((q) => [q.id, q]));
  const deps = arr(t.depends_on);
  return {
    tasks: deps.filter((d) => !qs.has(d)),
    questions: deps.filter((d) => qs.has(d)).map((id) => ({ id, title: qs.get(id).title || "", open: qs.get(id).status === "open" })),
  };
}

// --- Journal --------------------------------------------------------------------

// Entries newest first, each with the answered questions it names (`asked`). An
// answered question no entry names gets an entry of its own.
export function journal(plan) {
  const closed = new Map(plan.questions.filter((q) => q.status !== "open").map((q) => [q.id, q]));
  const named = new Set(plan.journal.flatMap((j) => arr(j.questions)));
  const items = [...plan.journal];
  for (const q of closed.values()) {
    if (named.has(q.id)) continue;
    const verb = q.status === "withdrawn" ? "Withdrew " : "Answered ";
    items.push({ id: `q-${q.id}`, at: q.answered_at, text: `${verb}${q.id}: ${q.title || ""}`, questions: [q.id], by: q.answered_by });
  }
  return items.sort(byTime("at", "desc"))
    .map((j) => ({ ...j, asked: arr(j.questions).map((id) => closed.get(id)).filter(Boolean) }));
}

// Who wrote an entry: "agent" ("claude" in plans written before stores
// existed), "owner", or a person's id.
export function byLine(by) {
  if (!by) return "";
  if (by === "agent" || by === "claude") return "by an agent";
  if (by === "owner") return "by the plan's owner";
  return `by ${by}`;
}

// --- Times ----------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Herdr's runtime ignores toLocaleDateString's options, so dates are spelled out here.
function shortDate(t, now) {
  const d = new Date(t);
  const day = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date(now).getFullYear() ? day : `${day}, ${d.getFullYear()}`;
}

export function ago(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!t) return "";
  const s = Math.round((now - t) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  return shortDate(t, now);
}

// --- The dependency graph -------------------------------------------------------

// Sizes, in px, as the plan page draws it: node width and height, gaps between
// columns, levels, and wrapped rows of one level, padding, the outer gutter,
// tasks per row, and the lanes edges from different tasks keep apart in.
export const G = { W: 128, H: 58, GX: 24, GY: 48, GW: 26, PAD: 8, SIDE: 18, MAX: 3, LANES: 4, LANE: 4 };

// A title in at most two lines of `max` characters, the second cut with "…".
export function wrapTitle(text, max) {
  const lines = [];
  let cur = "";
  for (const w of String(text || "").split(/\s+/).filter(Boolean)) {
    if (cur && `${cur} ${w}`.length > max) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  const out = lines.slice(0, 2);
  if (lines.length > 2) out[1] = lines.slice(1).join(" ");
  return out.map((l) => (l.length > max ? `${l.slice(0, max - 1).trimEnd()}…` : l));
}

// A path through right-angled points with rounded corners, as path commands:
// ["M", x, y], ["L", x, y], ["Q", x, y, cx, cy] (to, then control).
function rounded(points, radius) {
  const pts = points.filter((p, i) => !i || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
  const cmds = [["M", ...pts[0]]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1];
    const inLen = Math.hypot(x - px, y - py), outLen = Math.hypot(nx - x, ny - y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    cmds.push(["L", x + ((px - x) * r) / inLen, y + ((py - y) * r) / inLen]);
    cmds.push(["Q", x + ((nx - x) * r) / outLen, y + ((ny - y) * r) / outLen, x, y]);
  }
  cmds.push(["L", ...pts[pts.length - 1]]);
  return cmds;
}

// The page's portrait layout: one row per dependency level, so a row always
// waits on the rows above; a level wider than MAX wraps; each task sits under
// the tasks it waits on. With `selected`, the tasks in its chain (what it waits
// on, and what waits on it, all the way through) are marked `rel`.
// Returns { width, height, nodes: [{ task, x, y, rel, sel }], edges: [{ cmds, end: [x, y], rel }] }.
export function graphLayout(tasks, selected = null) {
  const { W, H, GX, GY, GW, PAD, SIDE, MAX, LANES, LANE } = G;
  if (!tasks.length) return { width: 0, height: 0, nodes: [], edges: [] };
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const depth = new Map();
  const layerOf = (t, seen) => {
    if (depth.has(t.id)) return depth.get(t.id);
    if (seen.has(t.id)) return 0;
    seen.add(t.id);
    let d = 0;
    for (const dep of arr(t.depends_on)) if (byId.has(dep)) d = Math.max(d, layerOf(byId.get(dep), seen) + 1);
    depth.set(t.id, d);
    return d;
  };
  for (const t of tasks) layerOf(t, new Set());
  const layers = [];
  for (const t of tasks) (layers[depth.get(t.id)] ||= []).push(t);

  const perRow = Math.min(MAX, Math.max(...layers.map((l) => (l ? l.length : 0))));
  const width = SIDE * 2 + perRow * W + (perRow - 1) * GX;
  const colX = (c) => SIDE + c * (W + GX);
  const pos = new Map();
  const rows = [];
  let y = PAD;
  for (const layer of layers) {
    if (!layer) continue;
    const under = (t) => {
      const cs = arr(t.depends_on).map((d) => pos.get(d)).filter(Boolean).map((p) => p.col);
      return cs.length ? cs.reduce((a, b) => a + b, 0) / cs.length : (perRow - 1) / 2;
    };
    const ordered = layer.map((t, i) => ({ t, k: under(t), i })).sort((a, b) => (a.k - b.k) || (a.i - b.i));
    for (let r = 0; r < ordered.length; r += MAX) {
      const free = Array.from({ length: perRow }, (_, c) => c);
      for (const { t, k } of ordered.slice(r, r + MAX)) {
        const col = free.reduce((best, c) => (Math.abs(c - k) < Math.abs(best - k) ? c : best));
        free.splice(free.indexOf(col), 1);
        pos.set(t.id, { x: colX(col), y, col, row: rows.length });
      }
      const gap = r + MAX < ordered.length ? GW : GY;
      rows.push(gap);
      y += H + gap;
    }
  }
  const height = y - rows[rows.length - 1] + PAD;

  // An edge to the next row stays in the gap between them. A longer one drops
  // into the gap below its task, runs to the nearest gutter, down it, and along
  // the gap above its target. Edges from one task share a lane.
  const gutterX = (g) => (g === 0 ? SIDE / 2 : g === perRow ? width - SIDE / 2 : colX(g) - GX / 2);
  const laneOf = new Map(tasks.map((t, i) => [t.id, ((i % LANES) - (LANES - 1) / 2) * LANE]));
  const edgeCmds = (dep, from, to) => {
    const x1 = from.x + W / 2, y1 = from.y + H, x2 = to.x + W / 2, y2 = to.y - 2;
    if (to.row === from.row + 1) {
      const my = (y1 + y2) / 2;
      return [["M", x1, y1], ["C", x2, y2, x1, my, x2, my]];
    }
    const off = laneOf.get(dep);
    let gx = gutterX(0);
    for (let g = 1; g <= perRow; g++) {
      const x = gutterX(g);
      if (Math.abs(x - x1) + Math.abs(x - x2) < Math.abs(gx - x1) + Math.abs(gx - x2)) gx = x;
    }
    gx += off;
    const ya = y1 + rows[from.row] / 2 + off, yb = to.y - rows[to.row - 1] / 2 + off;
    return rounded([[x1, y1], [x1, ya], [gx, ya], [gx, yb], [x2, yb], [x2, y2]], 6);
  };

  const sel = selected && byId.has(selected) ? selected : null;
  const kids = new Map();
  for (const t of tasks) for (const dep of arr(t.depends_on)) {
    if (!kids.has(dep)) kids.set(dep, []);
    kids.get(dep).push(t.id);
  }
  const walk = (start, next) => {
    const seen = new Set(), stack = [start];
    while (stack.length) for (const n of next(stack.pop())) if (byId.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); }
    return seen;
  };
  const up = sel ? walk(sel, (id) => arr(byId.get(id).depends_on)) : new Set();
  const down = sel ? walk(sel, (id) => kids.get(id) || []) : new Set();

  const edges = [];
  for (const t of tasks) {
    const to = pos.get(t.id);
    for (const dep of arr(t.depends_on)) {
      const from = pos.get(dep);
      if (!from) continue;
      const rel = Boolean(sel) && ((up.has(dep) && (t.id === sel || up.has(t.id))) || ((dep === sel || down.has(dep)) && down.has(t.id)));
      edges.push({ cmds: edgeCmds(dep, from, to), end: [to.x + W / 2, to.y - 2], rel });
    }
  }
  const nodes = tasks.map((task) => ({
    task, x: pos.get(task.id).x, y: pos.get(task.id).y,
    sel: task.id === sel, rel: Boolean(sel) && (task.id === sel || up.has(task.id) || down.has(task.id)),
  }));
  return { width, height, nodes, edges, selected: sel };
}
