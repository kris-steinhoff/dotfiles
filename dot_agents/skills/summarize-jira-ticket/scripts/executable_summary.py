#!/usr/bin/env python3
"""Print one Jira issue's summary: its metadata as markdown, in the same shape every time.

  summary.py <key> --site <site>

  | <type> **<key>** <summary, cut at 60 characters> |
  | --- |
  | **<assignee>** · https://<site>/browse/<key> |

An epic follows with its status, a bar of its children by status category
(█ done, ▒ in progress, ░ to do) with their counts, and one bullet for each
child not yet done. Any other issue follows with its status and parent, then
one bullet for each linked PR and each unfinished issue blocking it, and a
count of its subtasks done.

Jira is read over its REST API with a scoped, read-only API token, which
Atlassian accepts only through its gateway, api.atlassian.com, addressed by the
site's cloud ID (from the site's public /_edge/tenant_info). The account's
email and the token come from the environment, as JIRA_EMAIL and
JIRA_API_TOKEN. PRs come from `gh pr list --search <key>` when the working
directory is a GitHub repository, since many teams link a PR only through its
branch name or title. Every read runs in parallel, whatever the issue's type,
rather than waiting on the type to choose them.
"""

import argparse
import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

TITLE_LIMIT = 60
PARENT_LIMIT = 40
CHILD_LIMIT = 50
BAR_CELLS = 20
CATEGORIES = [("done", "█", "done"), ("indeterminate", "▒", "in progress"), ("new", "░", "to do")]


def run(*args):
    """(returncode, stdout, stderr) of a command, never raising."""
    try:
        result = subprocess.run(args, capture_output=True, text=True, check=False)
    except FileNotFoundError:
        return 127, "", f"{args[0]} not found"
    return result.returncode, result.stdout, result.stderr


def credentials():
    email, token = os.environ.get("JIRA_EMAIL"), os.environ.get("JIRA_API_TOKEN")
    if not email or not token:
        sys.exit("JIRA_EMAIL and JIRA_API_TOKEN must be set to the Jira account's email and a read-only API token")
    return base64.b64encode(f"{email}:{token}".encode()).decode()


def cloud_id(site):
    try:
        with urllib.request.urlopen(f"https://{site}/_edge/tenant_info", timeout=20) as response:
            return json.load(response)["cloudId"]
    except (urllib.error.URLError, KeyError, ValueError) as e:
        sys.exit(f"couldn't find the cloud ID of {site}: {e}")


class Jira:
    def __init__(self, cloud, auth):
        self.base = f"https://api.atlassian.com/ex/jira/{cloud}/rest/api/3"
        self.auth = auth

    def call(self, path, body=None):
        request = urllib.request.Request(self.base + path, method="POST" if body is not None else "GET",
                                         data=json.dumps(body).encode() if body is not None else None,
                                         headers={"Authorization": f"Basic {self.auth}", "Accept": "application/json",
                                                  "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return json.load(response)
        except urllib.error.HTTPError as e:
            sys.exit(f"Jira {path.split('?')[0]} returned {e.code}: {e.read().decode(errors='replace')[:300]}")
        except urllib.error.URLError as e:
            sys.exit(f"couldn't reach Jira at {self.base}: {e.reason}")

    def issue(self, key):
        fields = "summary,issuetype,status,assignee,parent,issuelinks,subtasks"
        return self.call(f"/issue/{urllib.parse.quote(key)}?fields={fields}")

    def search(self, jql, fields):
        issues, token = [], None
        while True:
            body = {"jql": jql, "fields": fields, "maxResults": 100}
            if token:
                body["nextPageToken"] = token
            page = self.call("/search/jql", body)
            issues += page.get("issues", [])
            token = page.get("nextPageToken")
            if not token or page.get("isLast", True):
                return issues


def cut(text, limit):
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[:limit - 1].rstrip() + "…"


def cell(text):
    return text.replace("|", "\\|")


def category(fields):
    return ((fields.get("status") or {}).get("statusCategory") or {}).get("key")


def bar(counts):
    """Cells per category, largest remainder, with at least one for any nonzero count."""
    total = sum(counts)
    if not total:
        return [0] * len(counts)
    exact = [c * BAR_CELLS / total for c in counts]
    cells = [int(e) for e in exact]
    for i in sorted(range(len(counts)), key=lambda i: exact[i] - cells[i], reverse=True)[:BAR_CELLS - sum(cells)]:
        cells[i] += 1
    for i, c in enumerate(counts):
        if c and not cells[i]:
            cells[i] = 1
            cells[max(range(len(cells)), key=lambda j: cells[j])] -= 1
    return cells


def main():
    parser = argparse.ArgumentParser(description="Print one Jira issue's metadata summary as markdown.")
    parser.add_argument("key")
    parser.add_argument("--site", required=True, help="the Jira site's hostname, such as example.atlassian.net")
    args = parser.parse_args()
    key = args.key.upper()

    with ThreadPoolExecutor() as pool:
        prs = pool.submit(run, "gh", "pr", "list", "--state", "all", "--search", key,
                          "--json", "number,state,title")
        cloud = pool.submit(cloud_id, args.site)
        jira = Jira(cloud.result(), credentials())
        issue = pool.submit(jira.issue, key)
        children = pool.submit(jira.search, f"parent = {key}", ["summary", "status"])
        fields = issue.result()["fields"]

    kind = (fields.get("issuetype") or {}).get("name") or "Issue"
    assignee = (fields.get("assignee") or {}).get("displayName") or "Unassigned"
    status = (fields.get("status") or {}).get("name") or "?"
    lines = [f"| {cell(kind)} **{key}** {cell(cut(fields.get('summary'), TITLE_LIMIT))} |", "| --- |",
             f"| **{cell(assignee)}** · https://{args.site}/browse/{key} |", ""]
    bullets = []

    if kind.lower() == "epic":
        found = children.result()
        lines.append(status)
        if found:
            counts = [sum(1 for c in found if category(c["fields"]) == cat) for cat, _, _ in CATEGORIES]
            drawn = "".join(mark * n for (_, mark, _), n in zip(CATEGORIES, bar(counts)))
            told = " · ".join(f"{n} {label}" for (_, _, label), n in zip(CATEGORIES, counts))
            lines += ["", f"`{drawn}` {told}"]
            order = {"indeterminate": 0, "new": 1}
            for c in sorted((c for c in found if category(c["fields"]) != "done"),
                            key=lambda c: order.get(category(c["fields"]), 2)):
                bullets.append(f"- {c['fields']['status']['name']}: {c['key']} {cut(c['fields']['summary'], CHILD_LIMIT)}")
        else:
            lines += ["", "No children"]
    else:
        facts = [status]
        if parent := fields.get("parent"):
            facts.append(f"parent {parent['key']} {cut(parent['fields']['summary'], PARENT_LIMIT)}")
        lines.append(" · ".join(facts))
        code, out, _ = prs.result()
        for pr in (json.loads(out) if code == 0 and out.strip() else []):
            bullets.append(f"- #{pr['number']} {pr['state'].lower()}: {cut(pr['title'], CHILD_LIMIT)}")
        # On the issue's own record, an inward link reads as "<this> <inward> <that>",
        # so an inward "is blocked by" names an issue that blocks this one.
        for link in fields.get("issuelinks") or []:
            other = link.get("inwardIssue")
            if not other or "blocked by" not in (link.get("type") or {}).get("inward", "").lower():
                continue
            if category(other["fields"]) == "done":
                continue
            bullets.append(f"- blocked by {other['key']} ({other['fields']['status']['name']}): "
                           f"{cut(other['fields']['summary'], CHILD_LIMIT)}")
        if subtasks := fields.get("subtasks"):
            done = sum(1 for s in subtasks if category(s["fields"]) == "done")
            bullets.append(f"- subtasks: {done} of {len(subtasks)} done")

    if bullets:
        lines += [""] + bullets
    print("\n".join(lines))


if __name__ == "__main__":
    main()
