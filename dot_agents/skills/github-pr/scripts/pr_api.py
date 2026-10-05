"""GitHub calls shared by feedback.py and post.py.

Everything goes through `gh`, which infers the repository from the working
directory (or GH_REPO) and supplies the authenticated account. Inline review
threads come from GraphQL because REST has no thread object: only GraphQL knows
whether a thread is resolved and carries the node id that resolving needs.
"""

import json
import os
import subprocess
import sys

THREADS_QUERY = """
query($owner: String!, $name: String!, $pr: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          originalLine
          comments(first: 100) {
            nodes {
              databaseId
              author { __typename login }
              body
              createdAt
              url
            }
          }
        }
      }
    }
  }
}
"""

RESOLVE_MUTATION = """
mutation($id: ID!) {
  resolveReviewThread(input: {threadId: $id}) { thread { isResolved } }
}
"""


def gh(*args, input=None, check=True):
    """Run a gh command and return stdout; exit with its stderr on failure."""
    result = subprocess.run(["gh", *args], input=input, capture_output=True, text=True, check=False)
    if check and result.returncode != 0:
        sys.exit(f"gh {' '.join(args[:3])} failed: {result.stderr.strip()}")
    return result


def gh_out(*args):
    return gh(*args).stdout


def repo_slug():
    # gh's own PR commands honor GH_REPO, but `gh repo view` without an argument
    # reads only the checkout, so pass it through to keep them pointed alike.
    if os.environ.get("GH_REPO"):
        return gh_out("repo", "view", os.environ["GH_REPO"], "--json", "nameWithOwner", "-q", ".nameWithOwner").strip()
    return gh_out("repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner").strip()


def viewer_login():
    return gh_out("api", "user", "-q", ".login").strip()


def pr_view(pr):
    fields = ("number,url,title,author,baseRefName,headRefName,headRefOid,state,isDraft,"
              "additions,deletions,changedFiles")
    return json.loads(gh_out("pr", "view", str(pr), "--json", fields))


def rest_list(path):
    """Every item of a paginated REST array endpoint."""
    out = gh_out("api", path, "--paginate", "--jq", ".[] | tojson")
    return [json.loads(line) for line in out.splitlines() if line.strip()]


def review_threads(slug, pr):
    """Every inline review thread on the PR, oldest comment first in each."""
    owner, name = slug.split("/", 1)
    threads, after = [], None
    while True:
        args = ["api", "graphql", "-f", f"query={THREADS_QUERY}", "-f", f"owner={owner}",
                "-f", f"name={name}", "-F", f"pr={pr}"]
        if after:
            args += ["-f", f"after={after}"]
        page = json.loads(gh_out(*args))["data"]["repository"]["pullRequest"]["reviewThreads"]
        threads += page["nodes"]
        if not page["pageInfo"]["hasNextPage"]:
            return threads
        after = page["pageInfo"]["endCursor"]


def resolve_thread(thread_id):
    return gh("api", "graphql", "-f", f"query={RESOLVE_MUTATION}", "-f", f"id={thread_id}", check=False)


def pr_commits(slug, pr):
    return [c["sha"] for c in rest_list(f"repos/{slug}/pulls/{pr}/commits")]
