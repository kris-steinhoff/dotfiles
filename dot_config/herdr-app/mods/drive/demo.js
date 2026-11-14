// Made-up plans for trying the panel (DEMO in main.js): raw terminals and records
// in the shapes herdr and model.js give, so they go through the same code as
// real ones. Every phase and a stopped plan appear. The first is a local plan,
// and `demoPlan` is its documents, for its Plan tab.

const term = (address, name, status, labels, { live = true, agent = true } = {}) => ({
  address, name, state: live ? "live" : "ended", status, labels, program: { agent },
});

const ref = (id) => (id.startsWith("/") ? id : `https://claude.ai/artifact/${id}`);

const plan = (id, title, phase, extra = {}, driver = {}) => ({
  id,
  record: {
    url: ref(id), repo_root: "/demo/repo", repo_name: "widgets",
    checkout: `/demo/.herdr/worktrees/widgets/plan-${id.slice(0, 8)}`, space_id: `demo:${id}`,
  },
  driver: term(`d-${id.slice(0, 4)}`, `drive-${id.slice(0, 8)}`, "working", {
    "drive.role": "driver", "drive.plan": id, "drive.url": ref(id),
    "drive.phase": phase, ...(title ? { "drive.title": title } : {}), ...extra,
  }, driver),
});

const agent = (planId, address, role, labels, status = "working") =>
  term(address, `${planId.slice(0, 8)}-${address}`, status, { "drive.plan": planId, "drive.role": role, ...labels });

const A = "/demo/repo/.plans/wid-12-rate-limit-headers";
const B = "b2c3d4e5-demo";
const C = "c3d4e5f6-demo";
const D = "d4e5f6a7-demo";

const plans = [
  plan(A, "Rate limit headers", "building", { "drive.tasks": "3/6 merged", "drive.needs_you": "Answer a question in the driver's session" }),
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

export const demo = {
  terms: planTerms,
  plans: Object.fromEntries(plans.map((p) => [p.id, p.record])),
  // The fake space each plan lives in, by the record's space_id.
  space: (_term, record) => (record?.space_id ? { id: record.space_id, name: record.space_id.slice(5), active: false } : null),
};

// --- The local plan's documents (A), as plan.js's loadPlan returns them ----------

const at = (hoursAgo) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString().replace(/\.\d+Z$/, "Z");

export const demoPlan = {
  missing: false,
  run: {
    title: "Rate limit headers",
    slug: "wid-12-rate-limit-headers",
    status: "running",
    objective: "Tell API clients how close they are to their rate limit, so they can back off before they are refused.",
    source: "WID-12",
    approach: "Keep one limiter state per API key in the shared cache, and have every response read it on the way out. The headers follow the IETF draft names, so clients that already handle them need nothing new.\n\nThe limits themselves move into configuration first, so the headers and the limiter can never disagree about what the limit is.",
    delivery: "Two stacked PRs: the limiter and its headers first, then the documentation and the client examples. Only people merge.",
    done_check: [
      { text: "Every API response carries the limit, what remains, and when it resets", state: "met", note: "Checked on all 41 routes in the contract tests." },
      { text: "A refused request says when to try again", state: "unmet", note: "Waits on the Retry-After task." },
      { text: "The public docs describe the headers", state: "unchecked" },
    ],
    out_of_scope: ["Changing the limits themselves", "Per-route limits"],
    risks: ["The shared cache adds a round trip to every request; the budget is 2 ms at the 99th percentile."],
    started_at: at(70),
    updated_at: at(0.3),
  },
  tasks: [
    { id: "T1", order: 1, title: "Shared limiter state", status: "merged", goal: "Keep each API key's request count where every server can see it.",
      approach: "A sliding window per key in the shared cache, written with one atomic increment per request.", touches: ["api/limits/window.go"],
      verify: "Load test with four servers agrees with the single-server count to within one request.", pr: "P1",
      branch: "wid-12-rate-limit-headers-t1-limiter-state", outcome: "Landed as planned." },
    { id: "T2", order: 2, title: "Limits in configuration", status: "merged", goal: "Read each plan tier's limit from configuration instead of code.",
      touches: ["config/limits.yaml", "api/limits/config.go"], verify: "Changing the file changes the limit without a deploy.", pr: "P1",
      branch: "wid-12-rate-limit-headers-t2-limits-config" },
    { id: "T3", order: 3, title: "Count requests per key", status: "merged", goal: "Count every request against its key's window.", depends_on: ["T1"], pr: "P1",
      branch: "wid-12-rate-limit-headers-t3-count-requests" },
    { id: "T4", order: 4, title: "Header parser", status: "in_progress", goal: "Write the limit headers on every response.", depends_on: ["T2", "T3"],
      approach: "Middleware that reads the window after the handler runs, so the count includes this request.", touches: ["api/middleware/ratelimit.go"],
      verify: "Contract tests see the three headers on every route.", pr: "P1", branch: "wid-12-rate-limit-headers-t4-header-parser" },
    { id: "T5", order: 5, title: "Retry-After support", status: "in_progress", goal: "Tell a refused client when it can try again.", depends_on: ["T4", "Q2"],
      approach: "Seconds until the window frees a slot, from the server clock.", pr: "P1", branch: "wid-12-rate-limit-headers-t5-retry-after" },
    { id: "T6", order: 6, title: "Document the headers", status: "blocked", goal: "Describe the headers in the public API docs, with client examples.",
      blocked_on: "The platform team's API style guide, due next week", depends_on: ["T4", "Q1"], pr: "P2" },
  ],
  prs: [
    { id: "P1", order: 1, title: "Rate limit headers", status: "open", url: "https://github.com/demo/widgets/pull/412",
      branch: "wid-12-rate-limit-headers-p1-limiter", base: "main", waiting_on: "A review from the platform team" },
    { id: "P2", order: 2, title: "Document the rate limit headers", status: "planned", branch: "wid-12-rate-limit-headers-p2-docs", base: "P1" },
  ],
  questions: [
    { id: "Q1", title: "Should every response show the remaining quota?", status: "open", task: "T6", blocks: "the documentation",
      context: "Showing it everywhere is what the draft standard expects, but it tells anyone with a key how busy that key is.",
      options: [
        { label: "On every response", cost: "Simplest for clients; exposes usage to anyone holding the key." },
        { label: "Only near the limit", cost: "Hides usage; clients can't plan ahead." },
      ],
      recommendation: "On every response", asked_at: at(5) },
    { id: "Q2", title: "Which clock does Retry-After use?", status: "answered", answer: "The server clock, in seconds.", answered_at: at(20), answered_by: "owner" },
  ],
  journal: [
    { id: at(70), at: at(70), text: "Started from WID-12 and read the API middleware.", by: "agent" },
    { id: at(66), at: at(66), text: "Planned six tasks in two stacked PRs.", by: "agent" },
    { id: at(20), at: at(20), text: "Retry-After uses the server clock, as answered.", by: "agent", questions: ["Q2"] },
    { id: at(2), at: at(2), text: "T3 merged into P1; started T4 and T5.", by: "agent" },
  ],
};
