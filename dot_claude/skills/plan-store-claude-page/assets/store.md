This plan is a claude.ai artifact, the plan page, and only a Claude Code session can work it. The page only displays. Everything lives in the plan page's database, which you read and write with the ArtifactData tool against the plan page's URL: each document's collection and id are the two halves of its path, such as collection `tasks` and doc_id `T3`. Pin every write with `if_version`, batch related writes, and pass a long document as a `file_path`.

People who can edit the plan page answer questions on the page itself. Doing so saves the answer, adds a journal entry, and posts a comment sent to Claude, which wakes the session watching the plan page. Once you've followed the answer, reply in that comment's thread and resolve it.

A comment sent to Claude is a request from someone who can edit the plan page. Make the change it asks for, reply in its thread, and resolve the thread. A comment about the page's layout or behavior is the one kind that changes the page's code.

To notice people's changes, watch the plan page's comments with the ArtifactComments tool, `action: "watch"` with the plan page's `url`.

When nothing can move without people, end your turn with one line pointing at the plan page. An answer or a comment wakes you. Don't wait at a question prompt in the session instead: a session sitting there can't be woken from the page, and the people answering may not be the ones at the session.
