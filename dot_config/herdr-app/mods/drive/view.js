// What the Drive panel shows, worked out from terminals and records, and what its
// buttons do. No rendering here (panel.js draws it).
import { exec, panes, run, setShared, terminals } from "herdr";
import { reveal } from "./launch.js";
import { L, PLANS_KEY, groupPlans, homeSpace, isLocal, plansRecord } from "./model.js";

// Labels beyond the ones model.js names (PROTOCOL.md section 6).
export const LB = {
  tasks: "drive.tasks",
  branch: "drive.branch",
  task: "drive.task",
  pr: "drive.pr",
  prUrl: "drive.pr_url",
  waitingOn: "drive.waiting_on",
};

// --- What there is --------------------------------------------------------------

const countWorking = (list) => list.filter((e) => e?.live && e.status === "working").length;

// Every plan, each with the space it lives in (or null). `spaceOf(terminal,
// record, folder)` finds that space.
export function derive(terms, planRecords, spaceOf = homeSpace) {
  const plans = groupPlans(terms, planRecords).map((p) => {
    const labels = p.driver?.labels ?? {};
    return {
      key: p.id,
      id: p.id,
      title: p.title,
      url: p.url, // a plan page's link, or a local plan's folder
      local: isLocal(p.id),
      repo: p.record?.repo_name ?? null,
      record: p.record,
      driver: p.driver,
      agents: p.agents,
      stopped: !p.driver?.live,
      phase: labels[L.phase] ?? null,
      tasks: labels[LB.tasks] ?? null,
      needs: labels[L.needsYou] ?? null,
      working: countWorking([p.driver, ...p.agents]),
      space: spaceOf(p.driver, p.record, p.record?.checkout),
    };
  });
  // A stopped one with no record can't be started again, so it isn't listed.
  return plans.filter((p) => !p.stopped || p.record);
}

export const live = () => derive(terminals(), plansRecord());

// The plan whose space is `spaceId`, or null.
export function inSpace(plans, spaceId) {
  if (!spaceId) return null;
  return plans.find((p) => p.space?.id === spaceId) ?? null;
}

// Before the driver has set a title: a local plan's slug, or a page's artifact id.
export const planName = (p) => p.title ?? (p.local ? p.id.split("/").pop() : p.id);

// --- Actions --------------------------------------------------------------------

export function peek(address) {
  run("terminal.peek", { terminal: address });
}

// A driver has a tab; a sub-agent has none, so it is peeked at.
export function show(address) {
  if (!reveal(address)) peek(address);
}

export function goTo(space) {
  if (!space.active) run("space.select", { id: space.id });
}

// Shows a local plan in a Plan tab of its space: the space's tab holding a
// Drive pane if it has one (a space holds one plan), else a new one.
// `extra` goes into the new pane's props (`demo` in DEMO).
export function openPlanTab(space, dir, extra = {}) {
  goTo(space);
  const all = panes();
  const tab = (space.tabs ?? []).find((t) => all.some((p) => p.tab === t.id && p.mod === "drive"));
  if (tab) run("tab.select", { id: tab.id });
  else run("tab.new", { name: "Plan", space: space.id, mod: "drive", props: { plan: dir, ...extra } });
}

// --- Records that outlive their checkout ----------------------------------------

// Drops the plans whose checkout folder is gone, unless one of their terminals
// is still live. Only `test -d` failing with 1 counts as gone.
async function missing(folder) {
  if (!folder) return false;
  try {
    return (await exec("test", ["-d", folder])).code === 1;
  } catch {
    return false;
  }
}

// Shared by every copy of the panel, so the check runs at most once a minute.
let lastPrune = 0;
const PRUNE_EVERY_MS = 55_000;

export async function prune() {
  if (Date.now() - lastPrune < PRUNE_EVERY_MS) return;
  lastPrune = Date.now();
  const gone = new Set();
  for (const [id, r] of Object.entries(plansRecord())) if (await missing(r.checkout)) gone.add(id);
  if (!gone.size) return;

  // Look at the terminals only now, after the awaits, and at the records as they stand.
  for (const p of live()) if (p.driver?.live || p.agents.some((a) => a.live)) gone.delete(p.id);
  if (gone.size) setShared(PLANS_KEY, Object.fromEntries(Object.entries(plansRecord()).filter(([k]) => !gone.has(k))));
}
