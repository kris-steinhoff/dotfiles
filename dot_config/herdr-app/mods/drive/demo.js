// Made-up plans and PRs for trying the panel (DEMO in main.js): raw terminals and
// records in the shapes herdr and model.js give, so they go through the same
// code as real ones. Every phase, a stopped plan and each kind of PR appear.

const term = (address, name, status, labels, { live = true, agent = true } = {}) => ({
  address, name, state: live ? "live" : "ended", status, labels, program: { agent },
});

const plan = (id, title, phase, extra = {}, driver = {}) => ({
  id,
  record: {
    url: `https://claude.ai/artifact/${id}`, repo_root: "/demo/repo", repo_name: "widgets",
    checkout: `/demo/.herdr/worktrees/widgets/plan-${id.slice(0, 8)}`, space_id: `demo:${id}`,
  },
  driver: term(`d-${id.slice(0, 4)}`, `drive-${id.slice(0, 8)}`, "working", {
    "drive.role": "driver", "drive.plan": id, "drive.url": `https://claude.ai/artifact/${id}`,
    "drive.phase": phase, ...(title ? { "drive.title": title } : {}), ...extra,
  }, driver),
});

const agent = (planId, address, role, labels, status = "working") =>
  term(address, `${planId.slice(0, 8)}-${address}`, status, { "drive.plan": planId, "drive.role": role, ...labels });

const A = "a1b2c3d4-demo";
const B = "b2c3d4e5-demo";
const C = "c3d4e5f6-demo";
const D = "d4e5f6a7-demo";

const plans = [
  plan(A, "Rate limit headers", "building", { "drive.tasks": "3/8 merged" }),
  plan(B, "Rewrite the importer", "blocked", { "drive.tasks": "5/6 merged", "drive.needs_you": "Answer 2 questions on the plan page" }),
  plan(C, "Retire the v1 API", "done", { "drive.tasks": "4/4 merged" }),
  plan(D, null, "starting", {}),
  // Stopped: recorded, no terminal at all.
  {
    id: "e5f6a7b8-demo",
    record: {
      url: "https://claude.ai/artifact/e5f6a7b8-demo", repo_root: "/demo/repo", repo_name: "widgets",
      checkout: "/demo/.herdr/worktrees/widgets/plan-e5f6a7b8", space_id: "demo:e5f6a7b8-demo",
    },
    driver: null,
  },
  // Stopped: its driver ended, with its labels left behind.
  plan("f6a7b8c9-demo", "Move billing to the new ledger", "reviewing", { "drive.tasks": "2/5 merged" }, { live: false }),
];

const planTerms = [
  ...plans.filter((p) => p.driver).map((p) => p.driver),
  agent(A, "t-a1", "task", { "drive.task": "T4", "drive.title": "Header parser", "drive.branch": "a1-t4-header-parser", "drive.status": "implementing" }),
  agent(A, "t-a2", "task", { "drive.task": "T5", "drive.title": "Retry-After support", "drive.branch": "a1-t5-retry-after", "drive.status": "reviewing" }, "idle"),
  agent(A, "t-a3", "pr", {
    "drive.pr": "P1", "drive.title": "Rate limit headers", "drive.branch": "rate-limit-headers", "drive.status": "open",
    "drive.pr_number": "412", "drive.pr_url": "https://github.com/demo/widgets/pull/412", "drive.waiting_on": "Waiting for a review from the platform team",
  }),
  agent(B, "t-b1", "pr", {
    "drive.pr": "P1", "drive.title": "Importer rewrite", "drive.branch": "importer-rewrite", "drive.status": "changes-requested",
    "drive.pr_number": "97", "drive.pr_url": "https://github.com/demo/widgets/pull/97", "drive.waiting_on": "Reply to 3 review comments",
  }, "blocked"),
  agent(C, "t-c1", "pr", {
    "drive.pr": "P1", "drive.title": "Remove v1 routes", "drive.branch": "remove-v1", "drive.status": "merged",
    "drive.pr_number": "88", "drive.pr_url": "https://github.com/demo/widgets/pull/88",
  }, "done"),
];

const pr = (n, title, status, extra = {}, { live = true, state = "working" } = {}) => ({
  key: `demo/widgets#${n}`,
  record: {
    repo: "demo/widgets", repo_root: "/demo/repo", repo_name: "widgets", number: n,
    worktree: `/demo/repo/.worktrees/pr-${n}`, space_id: `demo:pr-${n}`,
  },
  term: live ? term(`p-${n}`, `pr-${n}-widgets`, state, {
    "drive.role": "pr", "drive.repo": "demo/widgets", "drive.pr_number": String(n), "drive.title": title,
    "drive.status": status, "drive.pr_url": `https://github.com/demo/widgets/pull/${n}`, ...extra,
  }) : null,
});

const prs = [
  pr(130, "Cache the feature flags", "ci-failing", { "drive.waiting_on": "Fix the failing lint check" }),
  pr(131, "Bump the SDK", "approved", { "drive.waiting_on": "Waiting for you to merge" }, { state: "blocked" }),
  pr(132, "Drop the legacy flag", "merged", {}, { state: "done" }),
  pr(133, "Fix the pager", "open", {}, { live: false }),
];

export const demo = {
  terms: [...planTerms, ...prs.filter((p) => p.term).map((p) => p.term)],
  plans: Object.fromEntries(plans.map((p) => [p.id, p.record])),
  prs: Object.fromEntries(prs.map((p) => [p.key, p.record])),
  // The fake space each plan or PR lives in, by the record's space_id.
  space: (_term, record) => (record?.space_id ? { id: record.space_id, name: record.space_id.slice(5), active: false } : null),
};
