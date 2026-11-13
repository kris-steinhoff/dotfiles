// Starting a plan's driver or a single PR's agent, and going back to one that is
// already running instead of starting a second. Checkout locations, names, and
// labels are the ones PROTOCOL.md defines.
//
// Everything here throws an Error with a message a person can read; the dialog
// shows it inline.
import { appHome, exec, hc, home, run, setShared, spaces, terminals } from "herdr";
import {
  L, PLANS_KEY, PRS_KEY, driverName, hcName, homeSpace, liveNames, place, plansRecord, planKey,
  prKey, prsRecord, runningDriver, runningPR, whereIs,
} from "./model.js";

const protocolFile = () => `${appHome()}/mods/drive/PROTOCOL.md`;
const checkoutsRoot = () => `${home()}/.herdr/worktrees`;
const wtCommand = () => `${home()}/.local/bin/wt`;

const lastLine = (s) => (s ?? "").trim().split("\n").pop();
const shorten = (s, max) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);
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

// owner/name from a GitHub remote URL.
const githubName = (url) => /github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(url ?? "")?.[1] ?? null;

// The repo a space is in: its main checkout, found through the git common dir,
// and its name from the origin remote (the folder's name without one).
async function repoOf(space) {
  const folder = place(space);
  if (!folder) throw new Error("This space has no folder to find a repo from.");
  const r = await git(folder, ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir"]);
  const [top, common] = r.ok ? r.out.split("\n") : [];
  if (!top || !common) throw new Error(`${folder} is not in a git repo.`);
  const root = common.endsWith("/.git") ? common.slice(0, -5) : top;
  const origin = (await git(root, ["remote", "get-url", "origin"])).out;
  const full = githubName(origin);
  const name = (full ?? origin).split("/").pop()?.replace(/\.git$/, "") || root.split("/").pop();
  return { root, name, full };
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

// Starts (or, when one is running, shows) the driver of a plan. `repo` is
// { root, name }. Returns { existing, address }.
async function drivePlan(id, url, repo, record) {
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
    "--append-system-prompt-file", shq(protocolFile()), "--", shq(`/drive-implementation ${url}`),
  ].join(" ");
  const address = await startTab({
    name: driverName(key), cwd: checkout, command, space,
    newSpaceId: driverName(key), spaceName: `Plan ${key}`,
    labels: { [L.role]: "driver", [L.plan]: id, [L.url]: url, [L.phase]: "starting" },
    record: (spaceId) => setShared(PLANS_KEY, {
      ...plansRecord(),
      [id]: {
        url, repo_root: repo.root, repo_name: repo.name, checkout,
        space_id: spaceId, started_at: new Date().toISOString(),
      },
    }),
  });
  return { existing: false, address };
}

export async function launchPlan(url, fromSpace) {
  const id = parseArtifact(url);
  if (!id) throw new Error("Not a plan page link: expected claude.ai/artifact/<id>.");
  const running = runningDriver(id, terminals());
  if (running) {
    revealLive(running, `Plan ${planKey(id)}'s driver`);
    return { existing: true, address: running.address };
  }
  const space = typeof fromSpace === "string" ? spaceById(fromSpace) : fromSpace;
  const repo = await repoOf(space);
  return drivePlan(id, cleanUrl(url), repo, plansRecord()[id]);
}

// Starts a plan's driver again from its record, for a plan whose driver is gone.
export async function relaunchPlan(id) {
  const record = plansRecord()[id];
  if (!record) throw new Error("No record of that plan.");
  const repo = { root: record.repo_root, name: record.repo_name };
  return drivePlan(id, record.url, repo, record);
}

// --- Single PRs -----------------------------------------------------------------

// The worktree of a PR's head branch: an existing one, else a new one from wt.
async function prWorktree(repo, branch) {
  const wt = async (args) => {
    try {
      return await exec(wtCommand(), args, { cwd: repo.root, timeout: 300_000 });
    } catch (e) {
      return { code: 1, stdout: "", stderr: String(e?.message ?? e) };
    }
  };
  // Match the branch exactly: `wt switch` also matches a folder name, and the main checkout.
  const list = await wt(["list", "--json"]);
  if (list.code === 0) {
    for (const line of list.stdout.split("\n")) {
      try {
        const record = JSON.parse(line);
        if (record.branch === branch && record.path) return record.path;
      } catch {}
    }
  }
  const added = await wt(["add", branch]);
  // wt refuses a folder that already exists, and git a branch checked out elsewhere.
  if (added.code !== 0) throw new Error(lastLine(added.stderr) || lastLine(added.stdout) || `wt add exited ${added.code}`);
  return lastLine(added.stdout);
}

// Starts (or shows) the agent for one PR, which gets a space of its own.
export async function launchPR(number, fromSpace) {
  const n = String(number ?? "").trim().replace(/^#/, "");
  if (!/^[1-9][0-9]*$/.test(n)) throw new Error("Enter a PR number.");
  const space = typeof fromSpace === "string" ? spaceById(fromSpace) : fromSpace;
  const repo = await repoOf(space);
  if (!repo.full) throw new Error("This repo's origin isn't on GitHub.");
  return drivePR(n, repo);
}

// Starts a single PR's agent again from its record, in the repo the record names
// (never one found from a space).
export async function relaunchPR(record) {
  if (!record?.repo || !record.repo_root) throw new Error("No record of that PR's repo.");
  const name = record.repo_name ?? record.repo.split("/").pop();
  return drivePR(String(record.number), { root: record.repo_root, name, full: record.repo });
}

// `repo` is { root, name, full }.
async function drivePR(n, repo) {
  const running = runningPR(repo.full, n, terminals());
  if (running) {
    revealLive(running, `PR ${n}'s agent`);
    return { existing: true, address: running.address };
  }

  const view = await exec("gh", ["pr", "view", n, "--json", "headRefName,title,isCrossRepository"], { cwd: repo.root, timeout: 60_000 });
  if (view.code !== 0) throw new Error(lastLine(view.stderr) || `gh pr view exited ${view.code}`);
  let pr;
  try {
    pr = JSON.parse(view.stdout);
  } catch {
    throw new Error(`gh pr view ${n} gave output that isn't JSON: ${lastLine(view.stdout).slice(0, 120)}`);
  }
  const { headRefName, title } = pr;
  if (!headRefName) throw new Error(`gh pr view ${n} gave no head branch.`);
  if (pr.isCrossRepository) throw new Error(`PR ${n} comes from a fork; wt would cut its branch from the default branch, not the PR's code. Check it out by hand.`);
  const worktree = await prWorktree(repo, headRefName);

  const key = prKey(repo.full, n);
  const record = prsRecord()[key];
  const target = homeSpace(running, record, worktree);
  const spaceId = hcName(`drive-pr-${n}`, repo.name);
  const command = [
    "exec claude", "--name", `pr-${n}`, "--append-system-prompt-file", shq(protocolFile()),
    "--", shq(`/drive-pr ${n}`),
  ].join(" ");
  const address = await startTab({
    name: hcName(`pr-${n}`, repo.name, liveNames(terminals())), cwd: worktree, command, space: target,
    newSpaceId: spaceId, spaceName: shorten(`#${n} ${title}`, 40),
    labels: { [L.role]: "pr", [L.repo]: repo.full, [L.prNumber]: n, [L.title]: String(title).slice(0, 120), "drive.branch": headRefName },
    record: (id) => setShared(PRS_KEY, {
      ...prsRecord(),
      [key]: {
        repo: repo.full, repo_root: repo.root, repo_name: repo.name, number: Number(n), worktree, branch: headRefName,
        space_id: id, started_at: new Date().toISOString(),
      },
    }),
  });
  return { existing: false, address };
}
