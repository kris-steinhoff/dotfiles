import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  // Natural language intent classification and extraction is handled by pi's model via prompts.
  // This extension provides tools for the deterministic parts.

  const INTENT_PROMPT = `
# Herdr Launch Intent Extraction

You are assisting with launching a Herdr worktree and agent.

Input: user's natural language request.

Extract:
1. task_id: optional identifier for a tracked task. Examples: "123", "ABC-123". Do NOT include leading #, just the id. If no task identifier found, return null.
2. agent_kind: Herdr agent kind to launch. Must be one of: pi, claude, codex, gemini, cursor, devin, agy, cline, omp, mastracode, opencode, copilot, kimi, kiro, droid, amp, grok, hermes, kilo, qodercli, qwen, maki
3. model_hint: optional model name/variant mentioned, e.g. "opus". Pass through as native args.
4. task_description: freeform description of work to do, if any.

Return JSON with keys task_id, agent_kind, model_hint, task_description.
`;

  const SLUG_PROMPT = `
# Slug Synthesis for Herdr Worktree

Input: task_id (optional), task metadata (title, summary), task_description (optional)

Goal: produce a short, descriptive slug for git branch/worktree naming.
Constraints: lowercase, dashes, max ~20 chars, front-load distinctive info, do NOT repeat task_id.

Return JSON { "slug": string }
`;

  // Tool: fetch task metadata to derive slug
  pi.registerTool({
    name: "herdr_fetch_task",
    label: "Fetch Task Metadata",
    description: "Fetch task details for a task_id to derive slug. Direct fetch via gh/curl, no Herdr pane.",
    parameters: Type.Object({
      task_id: Type.String({ description: "Task identifier, e.g. 123 or ABC-123" }),
      repo: Type.String({ description: "Repo path or remote, optional" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { task_id, repo } = params;
      const cwd = repo || process.cwd();
      try {
        // Try GitHub issue first
        const ghCmd = `cd "${cwd}" && gh issue view ${task_id} --json title,body --jq '{title:.title, summary:.body}' 2>/dev/null`;
        const { execSync } = await import("node:child_process");
        const out = execSync(ghCmd, { encoding: "utf-8" }).trim();
        if (out) {
          return { content: [{ type: "text", text: out }], details: {} };
        }
      } catch {}
      // Fallback: try Jira via curl if task_id matches Jira pattern
      try {
        const { execSync } = await import("node:child_process");
        const jiraCmd = `cd "${cwd}" && curl -s -H "Accept: application/json" "https://api.atlassian.com/" 2>/dev/null || echo '{}'`;
        // Stub for now
      } catch {}
      ctx.ui.notify(`Fetching task ${task_id} - using fallback`, "warn");
      return {
        content: [{ type: "text", text: JSON.stringify({ title: `task-${task_id}`, summary: "" }) }],
        details: {},
      };
    },
  });

  // Tool: check existing branches/worktrees for collision
  pi.registerTool({
    name: "herdr_check_collision",
    label: "Check Naming Collision",
    description: "Check if branch/worktree name exists",
    parameters: Type.Object({
      branch: Type.String(),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { execSync } = await import("node:child_process");
      try {
        const branches = execSync(`git branch --format='%(refname:short)'`, { encoding: "utf-8" });
        const worktrees = execSync(`git worktree list --porcelain`, { encoding: "utf-8" });
        const exists = branches.includes(params.branch) || worktrees.includes(params.branch);
        return {
          content: [{ type: "text", text: JSON.stringify({ exists, branch: params.branch }) }],
          details: {},
        };
      } catch (e) {
        return { content: [{ type: "text", text: JSON.stringify({ exists: false, error: String(e) }) }], details: {} };
      }
    },
  });

  // Tool: create herdr worktree
  pi.registerTool({
    name: "herdr_create_worktree",
    label: "Create Herdr Worktree",
    description: "Create git worktree and Herdr UI worktree",
    parameters: Type.Object({
      branch: Type.String(),
      path: Type.String(),
      label: Type.String(),
      base: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { execSync } = await import("node:child_process");
      try {
        const baseArg = params.base ? `--base ${params.base}` : "";
        const cmd = `herdr worktree create --branch "${params.branch}" --path "${params.path}" --label "${params.label}" --no-focus ${baseArg}`;
        execSync(cmd, { stdio: "inherit" });
        ctx.ui.notify(`Created worktree ${params.label}`, "info");
        return { content: [{ type: "text", text: JSON.stringify({ branch: params.branch, path: params.path }) }], details: {} };
      } catch (e) {
        ctx.ui.notify(`Failed to create worktree: ${e}`, "error");
        return { content: [{ type: "text", text: JSON.stringify({ error: String(e) }) }], details: {} };
      }
    },
  });

  // Tool: start agent in pane
  pi.registerTool({
    name: "herdr_start_agent",
    label: "Start Herdr Agent",
    description: "Start an agent in a Herdr pane with optional model args",
    parameters: Type.Object({
      name: Type.String(),
      kind: Type.String(),
      paneId: Type.String(),
      modelArgs: Type.Optional(Type.Array(Type.String())),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { execSync } = await import("node:child_process");
      try {
        const args = params.modelArgs?.length ? `-- ${params.modelArgs.map(a => `"${a}"`).join(" ")}` : "";
        const cmd = `herdr agent start "${params.name}" --kind "${params.kind}" --pane "${params.paneId}" ${args}`;
        execSync(cmd, { stdio: "inherit" });
        ctx.ui.notify(`Started ${params.kind} agent ${params.name}`, "info");
        return { content: [{ type: "text", text: JSON.stringify({ name: params.name, kind: params.kind }) }], details: {} };
      } catch (e) {
        ctx.ui.notify(`Failed to start agent: ${e}`, "error");
        return { content: [{ type: "text", text: JSON.stringify({ error: String(e) }) }], details: {} };
      }
    },
  });

  // Tool: synthesize slug using model judgement
  pi.registerTool({
    name: "herdr_synthesize_slug",
    label: "Synthesize Slug",
    description: "Use model judgement to synthesize slug from task metadata or description",
    parameters: Type.Object({
      task_id: Type.Optional(Type.String()),
      title: Type.Optional(Type.String()),
      summary: Type.Optional(Type.String()),
      task_description: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      // Model judgement placeholder: in real flow, pi would prompt with SLUG_PROMPT.
      // For now, deterministic fallback.
      const source = params.title || params.task_description || params.task_id || "work";
      const slug = source.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20);
      return {
        content: [{ type: "text", text: JSON.stringify({ slug }) }],
        details: {},
      };
    },
  });

  // Slash command
  pi.registerCommand("herdr-launch", {
    description: "Launch Herdr worktree + agent from natural language",
    handler: async (args, ctx) => {
      const prompt = args.join(" ");
      ctx.ui.notify(`Herdr launch: ${prompt}`, "info");
      // Model uses INTENT_PROMPT to extract task_id, agent_kind, model_hint, task_description
      // Then calls herdr_fetch_task if task_id present, herdr_synthesize_slug, etc.
    },
  });
}
