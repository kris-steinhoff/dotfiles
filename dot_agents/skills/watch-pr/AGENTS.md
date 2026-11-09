# watch-pr

`watch-pr` is the one wait primitive for a pull request: it blocks until the PR's CI finishes, someone responds, its head moves, or it merges, and exits with one JSON line, so an agent runs it in the background and is woken by its exit.

It exists so that agents stop writing their own watches, which repeated the same bugs without shared code. Each rule below answers one of those bugs:

- A review watch keys on _unanswered_ activity (someone else's review or comment newer than the owner's own latest) rather than a count. Agents post as the owner's account, and GitHub records each thread reply as a new review, so a count-based watch fires on the agent's own replies.
- The same rule makes re-arming after a restart safe with no remembered baseline: a review that landed while nothing watched still reads as unanswered.
- A CI watch pins one commit, waits for its checks to appear, and needs two finished polls in a row, so a late-starting suite is not missed.
- Failed calls are retried and never read as the event. A `gh pr checks --watch` piped through another command hides its exit status, and once reported success after a network error killed it mid-run.

Other skills reimplement parts of these rules rather than sharing code: `github-pr`'s `feedback.py` flags activity with the unanswered-activity rule, and `summarize-github-pr` skips the empty reviews GitHub records for thread replies. A change to either rule here should be carried to them.
