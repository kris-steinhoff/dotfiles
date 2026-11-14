This plan is a local directory, usually `<main checkout>/.plans/<slug>`, which git ignores. Each document is a JSON file at `<plan>/<collection>/<id>.json`. Views and other tools may read these files, and people may edit them.

Read and write the plan only with the `plan-store` command, never by editing the files, so that writes are checked against versions and logged as yours. `plan-store --help` has the details:

- `plan-store get <plan> run/main` prints a document's `version` and `data`, and `plan-store list <plan> tasks` prints a collection.
- `plan-store set` and `plan-store update` write one document from `--file` or stdin, and `plan-store batch` writes several, all or none. Pass the version you read as `--if-version` (`if_version` in a batch); a refusal, exit 2, means someone changed it, so read it again and redo the write. In an update, a null removes a field.
- `plan-store journal <plan> "<text>"` adds an entry stamped with the clock and moves `run/main.updated_at` to match. Add `--question Q2` for each question it answers.
- `plan-store check <plan>` holds the plan to this guide. Run it after each round of writes and fix what it reports.

People answer questions in the session working the plan. Write the question here first, then ask it there with the harness's structured question tool, or, where there is none, as numbered multiple choice with your recommendation first. When the answer comes, record it on the question with `answered_by: owner` and journal it with the question's id. Ask several open questions in one batch.

A person can also change the plan outside the session, by hand or through a view. While you wait on anything else, such as an agent's report or a pull request, keep `plan-store wait <plan>` running as a background command. Its exit lists the documents someone else changed; read them, treat an answered question as an answer and any other change as a request, and start the wait again. What the user types in the session is a request too.

When nothing can move without people, ask what's open in the session and wait there for the answers.
