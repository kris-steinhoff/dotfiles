// What the Drive panel shows, worked out from terminals and records, and what its
// buttons do. No rendering here (panel.js draws it).
import { exec, hc, home, run, setShared, terminals } from "herdr";
import { reveal } from "./launch.js";
import {
  L, PLANS_KEY, PRS_KEY, groupPlans, homeSpace, plansRecord, prKey, prsRecord,
} from "./model.js";

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

// Every plan and every single PR, each with the space it lives in (or null).
// `spaceOf(terminal, record, folder)` finds that space.
export function derive(terms, planRecords, prRecords, spaceOf = homeSpace) {
  const { plans, prs } = groupPlans(terms, planRecords);

  const planItems = plans.map((p) => {
    const labels = p.driver?.labels ?? {};
    return {
      kind: "plan",
      key: p.id,
      id: p.id,
      title: p.title,
      url: p.url,
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

  // One entry per PR: a live terminal beats an ended one.
  const byKey = new Map();
  for (const term of prs) {
    const key = prKey(term.labels[L.repo], term.labels[L.prNumber]);
    const seen = byKey.get(key);
    if (!seen || (term.live && !seen.live)) byKey.set(key, term);
  }
  for (const key of Object.keys(prRecords)) if (!byKey.has(key)) byKey.set(key, null);

  const prItems = [...byKey].map(([key, term]) => {
    const record = prRecords[key] ?? null;
    const labels = term?.labels ?? {};
    const number = labels[L.prNumber] ?? record?.number ?? null;
    return {
      kind: "pr",
      key,
      number,
      title: labels[L.title] ?? null,
      repo: labels[L.repo] ?? record?.repo ?? null,
      record,
      term,
      stopped: !term?.live,
      status: labels[L.status] ?? null,
      waiting: labels[LB.waitingOn] ?? null,
      url: labels[LB.prUrl] ?? null,
      needs: labels[L.needsYou] ?? null,
      branch: labels[LB.branch] ?? null,
      working: countWorking([term]),
      space: spaceOf(term?.live ? term : null, record, record?.worktree),
    };
  });
  // A stopped one with no record can't be started again, so it isn't listed.
  const startable = (i) => !i.stopped || i.record;
  return { plans: planItems.filter(startable), prs: prItems.filter(startable) };
}

export const live = () => derive(terminals(), plansRecord(), prsRecord());

// The plan or PR whose space is `spaceId`, or null.
export function inSpace(data, spaceId) {
  if (!spaceId) return null;
  return [...data.plans, ...data.prs].find((i) => i.space?.id === spaceId) ?? null;
}

export const planName = (p) => p.title ?? p.id;

// A single PR is finished once its agent reports it merged or closed.
export const prFinished = (p) => p.status === "merged" || p.status === "closed";

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

const wtCommand = () => `${home()}/.local/bin/wt`;
const lastLines = (s, n = 3) => (s ?? "").trim().split("\n").slice(-n).join("\n");

// Ends a single PR's agent, then removes its worktree with wt, which never
// forces: a dirty worktree stays, and wt says so. When the worktree folder is
// already gone, only the agent and the record go. Returns { ok, message }.
export async function closePR(item) {
  const record = item.record;
  const root = record?.repo_root;
  if (!root) throw new Error("No record of this PR's repo, so its worktree can't be found.");
  const gone = await missing(record.worktree);

  // The recorded head branch first, then the agent's label, then what the folder is on.
  let branch = record.branch ?? item.branch;
  if (!gone && !branch && record.worktree) {
    const r = await exec("git", ["-C", record.worktree, "branch", "--show-current"]).catch(() => null);
    branch = r?.code === 0 ? r.stdout.trim() : null;
  }
  if (!gone && !branch) throw new Error("Can't tell which branch this PR's worktree is on.");

  const address = item.term?.address;
  if (address) {
    if (item.term.live) {
      const kill = await hc(["kill", address]);
      if (kill.code !== 0) throw new Error(lastLines(kill.stderr, 1) || `hc kill exited ${kill.code}`);
    }
    const rm = await hc(["rm", address]);
    if (rm.code !== 0 && !/no such|not found/i.test(rm.stderr)) throw new Error(lastLines(rm.stderr, 1) || `hc rm exited ${rm.code}`);
  }

  const dropRecord = () => {
    const { [item.key]: _gone, ...rest } = prsRecord();
    setShared(PRS_KEY, rest);
  };
  if (gone) {
    dropRecord();
    return { ok: true, message: "Ended the agent; its worktree was already gone." };
  }
  const wt = await exec(wtCommand(), ["remove", branch], { cwd: root, timeout: 120_000 });
  const message = lastLines(`${wt.stdout}\n${wt.stderr}`) || `wt remove exited ${wt.code}`;
  if (wt.code === 0) dropRecord();
  return { ok: wt.code === 0, message };
}

// --- Records that outlive their checkout ----------------------------------------

// Drops the plans and PRs whose checkout or worktree folder is gone, unless one
// of their terminals is still live. Only `test -d` failing with 1 counts as gone.
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
  const planFolders = Object.entries(plansRecord()).map(([id, r]) => [id, r.checkout]);
  const prFolders = Object.entries(prsRecord()).map(([key, r]) => [key, r.worktree]);
  const gonePlans = new Set();
  const gonePRs = new Set();
  for (const [id, folder] of planFolders) if (await missing(folder)) gonePlans.add(id);
  for (const [key, folder] of prFolders) if (await missing(folder)) gonePRs.add(key);
  if (!gonePlans.size && !gonePRs.size) return;

  // Look at the terminals only now, after the awaits, and at the records as they stand.
  const data = live();
  for (const p of data.plans) if (p.driver?.live || p.agents.some((a) => a.live)) gonePlans.delete(p.id);
  for (const p of data.prs) if (p.term?.live) gonePRs.delete(p.key);
  const dropped = (record, gone) => Object.fromEntries(Object.entries(record).filter(([k]) => !gone.has(k)));
  if (gonePlans.size) setShared(PLANS_KEY, dropped(plansRecord(), gonePlans));
  if (gonePRs.size) setShared(PRS_KEY, dropped(prsRecord(), gonePRs));
}
