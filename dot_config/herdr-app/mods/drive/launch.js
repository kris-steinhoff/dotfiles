// Starting a plan's driver, and going back to one that is already running
// instead of starting a second. Checkout locations, names, and
// labels are the ones PROTOCOL.md defines.
//
// Everything here throws an Error with a message a person can read; the dialog
// shows it inline.
import { appHome, exec, hc, home, readTextFile, run, setShared, spaces, terminals } from "herdr";
import * as fs from "fs/promises";
import {
  L, PLANS_KEY, driverName, homeSpace, place, plansRecord, planKey, runningDriver, whereIs,
} from "./model.js";

const protocolFile = () => `${appHome()}/mods/drive/PROTOCOL.md`;
const checkoutsRoot = () => `${home()}/.herdr/worktrees`;

const lastLine = (s) => (s ?? "").trim().split("\n").pop();
const rand = () => Math.random().toString(36).slice(2, 6);

// Safe inside single quotes in a shell command.
export const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

// The artifact id of a plan page link, or null. Two forms name the same page
// by different ids: claude.ai/artifact/<id> (how plan pages are published) and
// claude.ai/code/artifact/<uuid>. Each id is its own record.
export function parseArtifact(url) {
  const m = /^https?:\/\/(?:www\.)?claude\.ai\/(?:code\/)?artifact\/([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/.exec(String(url ?? "").trim());
  return m ? m[1] : null;
}

// The link without its query and fragment, which is what the record keeps.
export const cleanUrl = (url) => String(url).trim().replace(/[?#].*$/, "");

// --- git and the repo -----------------------------------------------------------

async function git(folder, args, timeout = 30_000) {
  try {
    const r = await exec("git", ["-C", folder, ...args], { timeout });
    return { ok: r.code === 0, out: r.stdout.trim(), err: lastLine(r.stderr) };
  } catch (e) {
    return { ok: false, out: "", err: String(e?.message ?? e) };
  }
}

// The repo a folder is in: its main checkout, found through the git common dir,
// and its name from the origin remote (the folder's name without one).
async function repoAt(folder) {
  const r = await git(folder, ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir"]);
  const [top, common] = r.ok ? r.out.split("\n") : [];
  if (!top || !common) throw new Error(`${folder} is not in a git repo.`);
  const root = common.endsWith("/.git") ? common.slice(0, -5) : top;
  const origin = (await git(root, ["remote", "get-url", "origin"])).out;
  const name = origin.split(/[/:]/).pop()?.replace(/\.git$/, "") || root.split("/").pop();
  return { root, name };
}

async function repoOf(space) {
  const folder = place(space);
  if (!folder) throw new Error("This space has no folder to find a repo from.");
  return repoAt(folder);
}

const spaceById = (id) => spaces().find((s) => s.id === id) ?? null;

// --- Going back to a running one ------------------------------------------------

// Shows a terminal's space and tab. False when it has no tab to show.
export function reveal(address) {
  const found = whereIs(address);
  if (!found) return false;
  if (!found.space.active) run("space.select", { id: found.space.id });
  run("tab.select", { id: found.tab.id });
  return true;
}

// Shows an already-live terminal, or says why it can't be.
function revealLive(found, what) {
  if (reveal(found.address)) return;
  throw new Error(`${what} is already running (${found.address}) but has no tab to show; end it with hc kill ${found.address} to start it again.`);
}

// --- Starting a terminal as a space's first tab ---------------------------------

// Runs `command` through a login shell, so claude is on the PATH it has in a
// terminal. Not --rm: one that dies at launch stays in `hc ls --all` to be
// inspected. Starts in `space` (the tab then moves to the front), or makes a
// space with the id `newSpaceId`. Returns the terminal's address.
// `record` runs once the terminal exists, before the cosmetic follow-ups, so a
// failure there still leaves a plan that can be resumed.
async function startTab({ name, cwd, command, labels, space, newSpaceId, spaceName, record }) {
  const spaceId = space?.id ?? newSpaceId;
  const tabId = `${spaceId}-${rand()}`;
  const args = [
    "run", "--bg", "--json", "--no-parent", "--keep", "--cwd", cwd, "--name", name,
    "--label", `herdr.space=${spaceId}`, "--label", `herdr.tab=${tabId}`,
  ];
  for (const [k, v] of Object.entries(labels)) args.push("--label", `${k}=${v}`);
  args.push("--", "/bin/zsh", "-lic", command);
  const r = await hc(args);
  if (r.code !== 0) throw new Error(lastLine(r.stderr) || lastLine(r.stdout) || `hc run exited ${r.code}`);
  let address = null;
  try {
    const out = JSON.parse(r.stdout);
    address = out.address ?? out.terminal?.address ?? null;
  } catch {}
  record?.(spaceId);
  try {
    if (space) run("tab.move", { id: tabId, index: 1 });
    else if (spaceName) run("space.rename", { id: spaceId, name: spaceName });
  } catch (e) {
    console.log(`drive: tab or space follow-up failed: ${e?.message ?? e}`);
  }
  return address;
}

// --- Local plans ----------------------------------------------------------------

// A local plan is a folder holding meta/guide.json, normally
// <main checkout>/.plans/<slug> (see plan-store).
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// The folder with symlinks resolved, or null when there is none.
async function realDir(folder) {
  try {
    const r = await exec("/bin/sh", ["-c", 'cd "$1" && pwd -P', "sh", folder]);
    return r.code === 0 ? r.stdout.trim() || null : null;
  } catch {
    return null;
  }
}

// The local plan `text` names: a folder (absolute or ~/), or the slug of a plan
// in the space's repo. Returns its real path.
async function localPlan(text, space) {
  let t = text.trim().replace(/\/+$/, "");
  if (t.startsWith("~/")) t = home() + t.slice(1);
  let folder;
  if (t.startsWith("/")) folder = t;
  else if (SLUG.test(t)) folder = `${(await repoOf(space)).root}/.plans/${t}`;
  else throw new Error("Not a plan: expected a plan page link, a plan's folder, or the slug of a plan in this repo's .plans folder.");
  const dir = await realDir(folder);
  if (!dir) throw new Error(`No plan at ${folder}.`);
  if ((await exec("test", ["-f", `${dir}/meta/guide.json`])).code !== 0) {
    throw new Error(`${dir} isn't a plan: it has no meta/guide.json.`);
  }
  return dir;
}

// The plans in the space's repo, most recently updated first: { dir, slug, title, status, updated_at }.
// For the dialog to offer; empty when the space isn't in a repo or has none.
export async function localPlans(space) {
  const root = (await repoOf(space)).root;
  let names = [];
  try {
    names = await fs.readdir(`${root}/.plans`);
  } catch {
    return [];
  }
  const plans = await Promise.all(names.filter((n) => SLUG.test(n)).map(async (slug) => {
    const dir = `${root}/.plans/${slug}`;
    let run = null;
    try { run = JSON.parse((await readTextFile(`${dir}/run/main.json`)) ?? "null"); } catch {}
    return { dir, slug, title: run?.title ?? slug, status: run?.status ?? null, updated_at: run?.updated_at ?? "" };
  }));
  return plans.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}

// --- Plans ----------------------------------------------------------------------

// The plan's detached checkout, made if it isn't there: it hosts the driver and
// nothing is built in it.
async function ensureCheckout(repo, key) {
  const checkout = `${checkoutsRoot()}/${repo.name}/plan-${key}`;
  if ((await git(checkout, ["rev-parse", "--git-dir"])).ok) return checkout;
  const fetch = await git(repo.root, ["fetch", "origin"], 300_000);
  if (!fetch.ok) throw new Error(`git fetch origin failed: ${fetch.err}`);
  const head = await git(repo.root, ["symbolic-ref", "refs/remotes/origin/HEAD"]);
  if (!head.ok) throw new Error(`Can't find ${repo.name}'s default branch (${head.err}); try git remote set-head origin -a.`);
  const base = head.out.replace(/^refs\/remotes\//, "");
  const add = await git(repo.root, ["worktree", "add", "--detach", checkout, base], 300_000);
  if (!add.ok) throw new Error(`git worktree add failed: ${add.err}`);
  return checkout;
}

// Starts (or, when one is running, shows) the driver of a plan. `ref` is what
// the driver is given: the page's link or the plan's folder. `repo` is
// { root, name }. Returns { existing, address }.
async function drivePlan(id, ref, repo, record) {
  const key = planKey(id);
  const running = runningDriver(id, terminals());
  if (running) {
    revealLive(running, `Plan ${key}'s driver`);
    return { existing: true, address: running.address };
  }

  const checkout = await ensureCheckout(repo, key);
  const space = homeSpace(running ?? null, record, checkout);
  const command = [
    "exec claude", "--name", driverName(key), "--add-dir", shq(repo.root),
    "--append-system-prompt-file", shq(protocolFile()), "--", shq(`/drive-implementation ${ref}`),
  ].join(" ");
  const address = await startTab({
    name: driverName(key), cwd: checkout, command, space,
    newSpaceId: driverName(key), spaceName: `Plan ${key}`,
    labels: { [L.role]: "driver", [L.plan]: id, [L.url]: ref, [L.key]: key, [L.phase]: "starting" },
    record: (spaceId) => setShared(PLANS_KEY, {
      ...plansRecord(),
      [id]: {
        url: ref, repo_root: repo.root, repo_name: repo.name, checkout,
        space_id: spaceId, started_at: new Date().toISOString(),
      },
    }),
  });
  return { existing: false, address };
}

// Starts the driver of the plan `text` names (a plan page's link, a local
// plan's folder, or its slug in the space's repo), or shows the running one.
export async function launchPlan(text, fromSpace) {
  const space = typeof fromSpace === "string" ? spaceById(fromSpace) : fromSpace;
  const page = parseArtifact(text);
  const id = page ?? await localPlan(text, space);
  const running = runningDriver(id, terminals());
  if (running) {
    revealLive(running, `Plan ${planKey(id)}'s driver`);
    return { existing: true, address: running.address };
  }
  const repo = page ? await repoOf(space) : await repoAt(id);
  return drivePlan(id, page ? cleanUrl(text) : id, repo, plansRecord()[id]);
}

// Starts a plan's driver again from its record, for a plan whose driver is gone.
export async function relaunchPlan(id) {
  const record = plansRecord()[id];
  if (!record) throw new Error("No record of that plan.");
  const repo = { root: record.repo_root, name: record.repo_name };
  return drivePlan(id, record.url, repo, record);
}
