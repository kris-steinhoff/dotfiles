// Finding local plans, and showing one in a Plan tab. A local plan is a folder
// holding meta/guide.json, normally <main checkout>/.plans/<slug> (see
// plan-store). Everything here that can fail throws an Error a person can read.
import { exec, focused, home, panes, readTextFile, run, spaces } from "herdr";
import * as fs from "fs/promises";

const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// Where the focused space is: the focused terminal's folder, else the space's
// first terminal's, else the folder it was made in.
export function here() {
  const f = focused();
  if (f?.cwd) return f.cwd;
  const s = spaces().find((x) => x.id === f?.space);
  if (!s) return null;
  const tabs = new Set((s.tabs ?? []).map((t) => t.id));
  return panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder || null;
}

// The main checkout of the repo `folder` is in, found through the git common dir
// so a linked worktree finds the same plans.
async function mainCheckout(folder) {
  let r;
  try {
    r = await exec("git", ["-C", folder, "rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir"]);
  } catch {
    r = { code: 1 };
  }
  const [top, common] = r.code === 0 ? r.stdout.trim().split("\n") : [];
  if (!top || !common) throw new Error(`${folder} isn't in a git repo.`);
  return common.endsWith("/.git") ? common.slice(0, -5) : top;
}

// The folder with symlinks resolved, or null when there is none.
async function realDir(folder) {
  try {
    const r = await exec("/bin/sh", ["-c", 'cd "$1" && pwd -P', "sh", folder]);
    return r.code === 0 ? r.stdout.trim() || null : null;
  } catch {
    return null;
  }
}

// The plans in the repo `folder` is in, most recently updated first:
// [{ dir, slug, title, status, updated_at }]. Empty when it has none.
export async function localPlans(folder) {
  const root = await mainCheckout(folder);
  let names = [];
  try {
    names = await fs.readdir(`${root}/.plans`);
  } catch {
    return [];
  }
  const plans = await Promise.all(names.filter((n) => SLUG.test(n)).map(async (slug) => {
    const dir = (await realDir(`${root}/.plans/${slug}`)) ?? `${root}/.plans/${slug}`;
    let main = null;
    try { main = JSON.parse((await readTextFile(`${dir}/run/main.json`)) ?? "null"); } catch {}
    return { dir, slug, title: main?.title ?? slug, status: main?.status ?? null, updated_at: main?.updated_at ?? "" };
  }));
  return plans.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}

// The plan `text` names: a folder (absolute or ~/), or the slug of a plan in
// the repo `folder` is in. Returns its real path.
export async function localPlan(text, folder) {
  let t = text.trim().replace(/\/+$/, "");
  if (t.startsWith("~/")) t = home() + t.slice(1);
  let dir;
  if (t.startsWith("/")) dir = t;
  else if (SLUG.test(t)) {
    if (!folder) throw new Error("No folder to find this space's repo from; give the plan's folder instead.");
    dir = `${await mainCheckout(folder)}/.plans/${t}`;
  } else throw new Error("Not a plan: give a plan's folder, or the slug of a plan in this repo's .plans folder.");
  const real = await realDir(dir);
  if (!real) throw new Error(`No plan at ${dir}.`);
  if ((await exec("test", ["-f", `${real}/meta/guide.json`])).code !== 0) {
    throw new Error(`${real} isn't a plan: it has no meta/guide.json.`);
  }
  return real;
}

// Shows the plan in `dir` in a Plan tab: the tab already showing it, in any
// space, else a new one in the focused space. A Plan tab is named for its plan's
// folder and found again by that name, since panes() doesn't give a mod pane's
// props. `extra` goes into a new pane's props (`demo` in DEMO).
export function openPlanTab(dir, extra = {}) {
  const name = dir.split("/").pop();
  const all = panes();
  for (const s of spaces()) {
    const tab = (s.tabs ?? []).find((t) => t.name === name && all.some((p) => p.tab === t.id && p.mod === "plan"));
    if (!tab) continue;
    if (!s.active) run("space.select", { id: s.id });
    run("tab.select", { id: tab.id });
    return;
  }
  run("tab.new", { name, space: focused()?.space, mod: "plan", props: { plan: dir, ...extra } });
}
