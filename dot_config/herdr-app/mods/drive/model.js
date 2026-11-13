// What the Drive mod knows: the terminals carrying `drive.*` labels grouped into
// plans, and the records written at launch. No rendering and no launching here.
//
// Labels and names follow PROTOCOL.md (the rules the agents follow), which
// defines them; keep the two in step.
import { panes, shared, spaces } from "herdr";

// Shared state, written at launch (see launch.js).
export const PLANS_KEY = "drive.plans"; // { <artifact id>: { url, repo_root, repo_name, checkout, space_id, started_at } }
export const PRS_KEY = "drive.prs"; // { "owner/name#n": { repo, repo_root, repo_name, number, worktree, space_id, started_at } }

// Labels (PROTOCOL.md section 6).
export const L = {
  role: "drive.role",
  plan: "drive.plan",
  url: "drive.url",
  phase: "drive.phase",
  title: "drive.title",
  repo: "drive.repo",
  prNumber: "drive.pr_number",
  status: "drive.status",
  needsYou: "drive.needs_you",
};

export const plansRecord = () => shared(PLANS_KEY) ?? {};
export const prsRecord = () => shared(PRS_KEY) ?? {};
export const prKey = (repo, number) => `${repo}#${number}`;

// --- Names (PROTOCOL.md section 2) ----------------------------------------------

export const NAME_MAX = 32;

// A plan's key: the first 8 characters of its artifact id, lowercased.
export const planKey = (id) => String(id).slice(0, 8).toLowerCase();

export const driverName = (key) => `drive-${key}`;

const cleanName = (s) => String(s).toLowerCase().replace(/[^a-z0-9_-]/g, "-");

// An hc name `<prefix>-<rest>`: lowercased, every character outside a-z 0-9 - _
// a hyphen. Over 32 characters, `rest` is shortened and the prefix kept. When
// the name is in `taken` (names of live terminals), -2, -3, ... is added, still
// within 32. An agent's name is hcName(key, agentName); a lone PR's is
// hcName(`pr-${n}`, repoName).
export function hcName(prefix, rest, taken = []) {
  const used = new Set(taken);
  const head = cleanName(prefix);
  const tail = cleanName(rest);
  const build = (suffix) => {
    const room = NAME_MAX - head.length - 1 - suffix.length;
    return `${head}-${tail.slice(0, Math.max(room, 1))}${suffix}`;
  };
  let name = build("");
  for (let n = 2; used.has(name); n++) name = build(`-${n}`);
  return name;
}

// The names of live terminals, which an hc name must not repeat. An ended
// terminal's name is free again at once.
export const liveNames = (terms) => terms.filter((t) => t.state === "live" && t.name).map((t) => t.name);

// --- Terminals ------------------------------------------------------------------

// One terminal as the panel shows it. Running means live with its agent still
// there, not just a shell left after the agent exited.
export function entry(t) {
  const running = t.state === "live" && Boolean(t.program?.agent);
  return {
    address: t.address,
    name: t.name ?? null,
    running,
    status: running ? (t.status ?? "idle") : null, // working, blocked, idle, or done
    labels: t.labels ?? {},
  };
}

// Plans and single PRs. Each plan: { id, key, url, title, driver, agents, record }.
// `driver` is the plan's running driver, else an ended one, else null; `agents`
// are its task and PR sub-agents. A plan the shared record knows of but no
// terminal carries still appears, driverless. `prs` are drive.role=pr
// terminals with no drive.plan.
export function groupPlans(terms = [], records = plansRecord()) {
  const plans = new Map();
  const get = (id) => {
    if (!plans.has(id)) {
      plans.set(id, { id, key: planKey(id), url: null, title: null, driver: null, agents: [], record: records[id] ?? null });
    }
    return plans.get(id);
  };
  for (const id of Object.keys(records)) get(id).url = records[id].url ?? null;

  const prs = [];
  for (const t of terms) {
    const labels = t.labels ?? {};
    const role = labels[L.role];
    if (!role) continue;
    const e = entry(t);
    const id = labels[L.plan];
    if (!id) {
      if (role === "pr") prs.push(e);
      continue;
    }
    const plan = get(id);
    if (role === "driver") {
      plan.url ??= labels[L.url] ?? null;
      // A running driver replaces an ended one; otherwise the first seen stays.
      if (!plan.driver || (e.running && !plan.driver.running)) plan.driver = e;
    } else if (role === "task" || role === "pr") {
      plan.agents.push(e);
    }
  }
  for (const p of plans.values()) p.title = p.driver?.labels[L.title] ?? null;
  return { plans: [...plans.values()], prs };
}

// A plan's running driver, or null.
export function runningDriver(id, terms) {
  const driver = groupPlans(terms, {}).plans.find((p) => p.id === id)?.driver;
  return driver?.running ? driver : null;
}

// A lone PR's running agent, or null.
export function runningPR(repo, number, terms) {
  return groupPlans(terms, {}).prs.find((e) => e.running
    && e.labels[L.repo] === repo && e.labels[L.prNumber] === String(number)) ?? null;
}

// --- Spaces and tabs ------------------------------------------------------------

// Where a space is now: its first terminal's live folder, else where it was made.
export function place(s, all = panes()) {
  if (!s) return null;
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return all.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder || null;
}

export function spaceOfTab(tabId) {
  for (const s of spaces()) for (const t of s.tabs) if (t.id === tabId) return { space: s, tab: t };
  return null;
}

// The space and tab holding a terminal, if it has a pane.
export function whereIs(address) {
  const pane = panes().find((p) => p.terminal === address);
  return pane ? spaceOfTab(pane.tab) : null;
}

// A plan's or PR's space: the one holding its terminal, else the one the record
// names if it still exists, else the one whose first pane is in `folder`.
export function homeSpace(terminal, record, folder) {
  const held = terminal ? whereIs(terminal.address)?.space : null;
  if (held) return held;
  const list = spaces();
  const named = record?.space_id ? list.find((s) => s.id === record.space_id) : null;
  if (named) return named;
  if (!folder) return null;
  const all = panes();
  return list.find((s) => !s.machine && place(s, all) === folder) ?? null;
}
