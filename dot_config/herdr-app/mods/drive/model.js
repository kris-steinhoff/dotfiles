// What the Drive mod knows: the terminals carrying `drive.*` labels grouped into
// plans, and the records written at launch. No rendering and no launching here.
//
// Labels and names follow PROTOCOL.md (the rules the agents follow), which
// defines them; keep the two in step.
import { panes, shared, spaces } from "herdr";

// Shared state, written at launch (see launch.js). `url` is what the driver was
// given: a plan page's link, or a local plan's folder.
export const PLANS_KEY = "drive.plans"; // { <plan id>: { url, repo_root, repo_name, checkout, space_id, started_at } }

// Labels (PROTOCOL.md section 6).
export const L = {
  role: "drive.role",
  plan: "drive.plan",
  url: "drive.url",
  key: "drive.key",
  phase: "drive.phase",
  title: "drive.title",
  prNumber: "drive.pr_number",
  status: "drive.status",
  needsYou: "drive.needs_you",
};

export const plansRecord = () => shared(PLANS_KEY) ?? {};

// --- Names (PROTOCOL.md section 2) ----------------------------------------------

// A plan's id: a plan page's artifact id, or a local plan's folder (an
// absolute path, which no artifact id looks like).
export const isLocal = (id) => String(id).startsWith("/");

// 32-bit FNV-1a, as 8 hex characters.
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

// A plan's key: the first 8 characters of its artifact id, lowercased, or for a
// local plan a hash of its folder, since slugs can repeat across repos and
// their first 8 characters often do within one.
export const planKey = (id) => (isLocal(id) ? fnv(String(id)) : String(id).slice(0, 8).toLowerCase());

export const driverName = (key) => `drive-${key}`;

// --- Terminals ------------------------------------------------------------------

// One terminal as the panel shows it. Running means live with its agent still
// there, not just a shell left after the agent exited.
export function entry(t) {
  const running = t.state === "live" && Boolean(t.program?.agent);
  return {
    address: t.address,
    name: t.name ?? null,
    live: t.state === "live",
    running,
    status: running ? (t.status ?? "idle") : null, // working, blocked, idle, or done
    labels: t.labels ?? {},
  };
}

// Plans. Each plan: { id, key, url, title, driver, agents, record }. `driver` is
// the plan's running driver, else an ended one, else null; `agents` are its task
// and PR sub-agents. A plan the shared record knows of but no terminal carries
// still appears, driverless. Terminals with no drive.plan are ignored.
export function groupPlans(terms = [], records = plansRecord()) {
  const plans = new Map();
  const get = (id) => {
    if (!plans.has(id)) {
      plans.set(id, { id, key: planKey(id), url: null, title: null, driver: null, agents: [], record: records[id] ?? null });
    }
    return plans.get(id);
  };
  for (const id of Object.keys(records)) get(id).url = records[id].url ?? null;

  for (const t of terms) {
    const labels = t.labels ?? {};
    const role = labels[L.role];
    const id = labels[L.plan];
    if (!role || !id) continue;
    const e = entry(t);
    const plan = get(id);
    if (role === "driver") {
      plan.url ??= labels[L.url] ?? null;
      // A running driver replaces an ended one; otherwise the first seen stays.
      if (!plan.driver || (e.live && !plan.driver.live)) plan.driver = e;
    } else if (role === "task" || role === "pr") {
      plan.agents.push(e);
    }
  }
  for (const p of plans.values()) p.title = p.driver?.labels[L.title] ?? null;
  return [...plans.values()];
}

// A plan's live driver, or null. Live, not `running`: one still starting has no
// agent yet, and a second launch then would start a duplicate.
export function runningDriver(id, terms) {
  const driver = groupPlans(terms, {}).find((p) => p.id === id)?.driver;
  return driver?.live ? driver : null;
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

// A plan's space: the one holding its terminal, else the one the record
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
