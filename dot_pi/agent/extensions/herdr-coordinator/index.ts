import type { ExtensionAPI, ExtensionContext, ExecResult } from "@earendil-works/pi-coding-agent";
import * as Type from "typebox";

// Herdr agent kinds accepted by `herdr agent start --kind`.
const AGENT_KINDS = [
  "pi", "claude", "codex", "gemini", "cursor", "devin", "agy", "cline", "omp",
  "mastracode", "opencode", "copilot", "kimi", "kiro", "droid", "amp", "grok",
  "hermes", "kilo", "qodercli", "qwen", "maki",
] as const;

// A Jira key looks like ABC-123; a bare number is a GitHub issue.
const JIRA_KEY = /^[A-Z][A-Z0-9]+-\d+$/;
const GH_ISSUE = /^\d+$/;

type AgentKind = (typeof AGENT_KINDS)[number];

// Turn a short model hint (e.g. "opus") into the CLI args for a given agent.
// Most agent CLIs accept `--model <hint>`, which is the default below. Add an
// entry only where a kind needs a different flag or value.
const MODEL_FLAGS: Partial<Record<AgentKind, (hint: string) => string[]>> = {
  gemini: (h) => ["-m", h], // gemini also accepts --model
  codex: (h) => ["-m", h], // codex also accepts --model
};

function modelArgsFor(kind: AgentKind, hint: string | undefined): string[] {
  if (!hint) return [];
  return (MODEL_FLAGS[kind] ?? ((h: string) => ["--model", h]))(hint);
}

// Flatten a Jira ADF description node into plain text.
function adfToText(node: any): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  const inner = Array.isArray(node.content) ? node.content.map(adfToText).join("") : "";
  const blockTypes = new Set(["paragraph", "heading", "blockquote", "listItem", "codeBlock", "rule"]);
  return blockTypes.has(node.type) ? `${inner}\n` : inner;
}

export default function (pi: ExtensionAPI) {
  let coordinatorMode = false;

  // Deterministic ops live in tools below. Judgement (intent extraction, slug
  // synthesis, prompt injection) is left to the coordinator model, guided by
  // this system prompt. It is only injected while coordinator mode is on.
  const COORDINATOR_SYSTEM_PROMPT = `
You are in Herdr Coordinator mode. Your job is to launch a Herdr worktree and
an agent from a natural-language request such as "use claude opus to work on #123".

## Step 1 — extract intent (your judgement)
From the request, determine:
- task_id: a tracked-task id, without any leading '#'. GitHub issue (e.g. "123")
  or Jira key (e.g. "ABC-123"). null if none is mentioned.
- agent_kind: one of ${AGENT_KINDS.join(", ")}.
- model_hint: an optional model/variant, e.g. "opus". null if none.
- task_description: any freeform description of the work.

## Step 2 — gather metadata
If task_id is present, call herdr_fetch_task to get its title and summary.
Do not invent a title if the fetch fails; report the failure and ask the user.

## Step 3 — synthesize a slug (your judgement)
Produce a short branch slug from the title / task_description:
lowercase, dash-separated, <= ~20 chars, front-load the distinctive words,
and do NOT repeat the task_id inside the slug.

## Step 4 — apply naming rules
- git branch:  "<task_id>-<slug>" when task_id is present, else "<slug>".
- worktree dir name: same as the branch.
- herdr label: the slug with dashes turned back into spaces.
Call herdr_check_collision on the branch. If it exists, adjust the slug and retry.

## Step 5 — create the worktree
Call herdr_create_worktree with branch, label, and (optionally) path. It returns
workspace_id, path, and pane_id for the new shell pane.

## Step 6 — start the agent
Call herdr_start_agent with the pane_id from step 5, the agent_kind, a name
(use the label), and the raw model_hint. The tool maps the hint to the right CLI
flag for that agent. Report the branch, path, and agent back.

Use the registered Herdr tools for every deterministic step. Never spin up a
throwaway Herdr pane just to compute a slug or a name.
`.trim();

  // Run a subprocess with no shell (argv array), so task titles and slugs
  // cannot inject commands.
  async function run(command: string, args: string[], ctx: ExtensionContext): Promise<ExecResult> {
    return pi.exec(command, args, { cwd: ctx.cwd, signal: ctx.signal });
  }

  // Run a `herdr` command and return the `result` payload from its JSON envelope.
  async function herdrJson(args: string[], ctx: ExtensionContext): Promise<any> {
    const res = await run("herdr", args, ctx);
    if (res.code !== 0) {
      throw new Error(`herdr ${args.join(" ")} failed (${res.code}): ${res.stderr.trim() || res.stdout.trim()}`);
    }
    return JSON.parse(res.stdout).result;
  }

  const ok = (obj: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(obj) }], details: {} });
  const fail = (message: string) => ok({ error: message });

  // Tool: fetch task metadata (GitHub issue or Jira), to seed the slug.
  pi.registerTool({
    name: "herdr_fetch_task",
    label: "Fetch Task Metadata",
    description: "Fetch a task's title and summary. GitHub issues via gh; Jira keys via the Jira REST API. No Herdr pane.",
    parameters: Type.Object({
      task_id: Type.String({ description: "Task id, e.g. 123 (GitHub) or ABC-123 (Jira). No leading #." }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const taskId = params.task_id.replace(/^#/, "").trim();
      try {
        if (JIRA_KEY.test(taskId)) return ok(await fetchJira(taskId));
        if (GH_ISSUE.test(taskId)) return ok(await fetchGithub(taskId, ctx));
        return fail(`Unrecognized task id "${taskId}". Expected a GitHub number or a Jira key like ABC-123.`);
      } catch (e) {
        ctx.ui.notify(`Task fetch failed: ${e}`, "error");
        return fail(String(e instanceof Error ? e.message : e));
      }
    },
  });

  async function fetchGithub(id: string, ctx: ExtensionContext) {
    const res = await run("gh", ["issue", "view", id, "--json", "title,body"], ctx);
    if (res.code !== 0) throw new Error(`gh issue view ${id}: ${res.stderr.trim() || "failed"}`);
    const { title, body } = JSON.parse(res.stdout);
    return { source: "github", task_id: id, title, summary: body ?? "" };
  }

  async function fetchJira(key: string) {
    const base = process.env.JIRA_BASE_URL;
    const email = process.env.JIRA_EMAIL;
    const token = process.env.JIRA_API_TOKEN;
    if (!base || !email || !token) {
      throw new Error("Jira not configured. Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN.");
    }
    const auth = Buffer.from(`${email}:${token}`).toString("base64");
    const url = `${base.replace(/\/$/, "")}/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,description`;
    const resp = await fetch(url, { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } });
    if (!resp.ok) throw new Error(`Jira ${key}: HTTP ${resp.status}`);
    const data = (await resp.json()) as any;
    const rawDescription = data.fields?.description;
    const description = typeof rawDescription === "string"
      ? rawDescription
      : adfToText(rawDescription).trim();
    return { source: "jira", task_id: key, title: data.fields?.summary ?? key, summary: description };
  }

  // Tool: exact-match collision check against branches and worktrees.
  pi.registerTool({
    name: "herdr_check_collision",
    label: "Check Naming Collision",
    description: "Report whether a git branch or worktree with this exact name already exists.",
    parameters: Type.Object({
      branch: Type.String(),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      try {
        const branchRes = await run("git", ["branch", "--list", "--format=%(refname:short)", params.branch], ctx);
        const branchExists = branchRes.stdout.split("\n").map((l) => l.trim()).includes(params.branch);
        const wtRes = await run("git", ["worktree", "list", "--porcelain"], ctx);
        const worktreeExists = wtRes.stdout
          .split("\n")
          .some((l) => l === `branch refs/heads/${params.branch}`);
        return ok({ exists: branchExists || worktreeExists, branch: params.branch });
      } catch (e) {
        return fail(String(e instanceof Error ? e.message : e));
      }
    },
  });

  // Tool: create the git + Herdr worktree, then resolve its shell pane.
  pi.registerTool({
    name: "herdr_create_worktree",
    label: "Create Herdr Worktree",
    description: "Create a git worktree and Herdr workspace. Returns workspace_id, path, and the shell pane_id to start an agent in.",
    parameters: Type.Object({
      branch: Type.String(),
      label: Type.String(),
      path: Type.Optional(Type.String({ description: "Checkout path. Omit to let Herdr choose the default." })),
      base: Type.Optional(Type.String({ description: "Base ref for the new branch." })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      try {
        const args = ["worktree", "create", "--branch", params.branch, "--label", params.label, "--no-focus", "--cwd", ctx.cwd];
        if (params.path) args.push("--path", params.path);
        if (params.base) args.push("--base", params.base);
        const created = await herdrJson(args, ctx);
        const workspaceId: string | undefined = created?.workspace?.workspace_id;
        const path: string | undefined = created?.worktree?.path;
        if (!workspaceId) throw new Error("worktree create returned no workspace id");

        const paneList = await herdrJson(["pane", "list", "--workspace", workspaceId], ctx);
        const panes: any[] = paneList?.panes ?? [];
        // The freshly created workspace has one shell pane (no agent yet).
        const shell = panes.find((p) => !p.agent) ?? panes[0];
        if (!shell?.pane_id) throw new Error(`no pane found in workspace ${workspaceId}`);

        ctx.ui.notify(`Created worktree ${params.label}`, "info");
        return ok({ workspace_id: workspaceId, path, pane_id: shell.pane_id, branch: params.branch });
      } catch (e) {
        ctx.ui.notify(`Create worktree failed: ${e}`, "error");
        return fail(String(e instanceof Error ? e.message : e));
      }
    },
  });

  // Tool: start an agent in an existing shell pane.
  pi.registerTool({
    name: "herdr_start_agent",
    label: "Start Herdr Agent",
    description: "Start a supported agent in an existing shell pane, with optional CLI args after --.",
    parameters: Type.Object({
      name: Type.String(),
      kind: Type.Union(AGENT_KINDS.map((k) => Type.Literal(k))),
      pane_id: Type.String(),
      model_hint: Type.Optional(Type.String({ description: "Model name/variant, e.g. opus. Mapped to the agent's CLI flag." })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      try {
        const args = ["agent", "start", params.name, "--kind", params.kind, "--pane", params.pane_id];
        const modelArgs = modelArgsFor(params.kind, params.model_hint);
        if (modelArgs.length) args.push("--", ...modelArgs);
        const started = await herdrJson(args, ctx);
        ctx.ui.notify(`Started ${params.kind} agent ${params.name}`, "info");
        return ok({ name: params.name, kind: params.kind, argv: started?.argv });
      } catch (e) {
        ctx.ui.notify(`Start agent failed: ${e}`, "error");
        return fail(String(e instanceof Error ? e.message : e));
      }
    },
  });

  function setCoordinator(on: boolean, ctx: ExtensionContext) {
    coordinatorMode = on;
    ctx.ui.setStatus("herdr-coord", on ? "Coordinator mode" : undefined);
    ctx.ui.notify(`Herdr coordinator mode ${on ? "enabled" : "disabled"}`, on ? "info" : "warning");
  }

  // Command: toggle coordinator mode.
  pi.registerCommand("herdr-coordinator", {
    description: "Toggle Herdr coordinator mode",
    handler: async (_args, ctx) => setCoordinator(!coordinatorMode, ctx),
  });

  // Inject the coordinator instructions while the mode is active. Returning the
  // systemPrompt is what actually installs it (the event carries the base prompt).
  pi.on("before_agent_start", async (event) => {
    if (!coordinatorMode) return;
    return { systemPrompt: `${event.systemPrompt}\n\n${COORDINATOR_SYSTEM_PROMPT}` };
  });

  // Command: enable coordinator mode and hand the request to the agent.
  pi.registerCommand("herdr-launch", {
    description: "Launch a Herdr worktree + agent from a natural-language request",
    handler: async (args, ctx) => {
      const text = args.trim();
      if (!text) {
        ctx.ui.notify('Usage: /herdr-launch "use claude opus to work on #123"', "warning");
        return;
      }
      if (!coordinatorMode) setCoordinator(true, ctx);
      pi.sendUserMessage(text);
    },
  });
}
