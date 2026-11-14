// A stand-in for the claude.ai artifact runtime, so assets/plan-page.html runs unmodified on a local server.
// It serves one fixture's documents through claude.use("db"), and holds writes in memory: a reload starts over.
//
// URL parameters:
//   role=owner|editor|viewer  who is looking. Editors get the answer forms; only the owner claims `by: "owner"` entries.
//   session=none              no Claude session is watching, so answering shows the page's "no session was told" note.
//   theme=light|dark          sets the page's theme, as claude.ai does.
(() => {
  const fixture = window.__FIXTURE__;
  const params = new URLSearchParams(location.search);
  const role = params.get("role") || "owner";
  const watched = params.get("session") !== "none";
  if (params.get("theme")) document.documentElement.dataset.theme = params.get("theme");

  // This page load's errors, which a test reads through measure.js.
  const errors = [];
  window.addEventListener("error", (e) => errors.push(e.message));
  window.addEventListener("unhandledrejection", (e) => errors.push(String(e.reason)));
  const consoleError = console.error.bind(console);
  console.error = (...args) => { errors.push(args.join(" ")); consoleError(...args); };

  // Freeze "now" at the fixture's moment, so "3 h ago" reads the same however old the fixture gets.
  const realNow = Date.now.bind(Date);
  const skew = Date.parse(fixture.now) - realNow();
  Date.now = () => realNow() + skew;

  const docs = structuredClone(fixture.docs);
  const listeners = new Set();
  const notify = () => listeners.forEach((fire) => fire());
  const copy = (value) => structuredClone(value);
  const subscribe = (read, onNext) => {
    const fire = () => onNext(read());
    listeners.add(fire);
    setTimeout(fire, 0);
    return () => listeners.delete(fire);
  };

  function docRef(path) {
    return {
      onSnapshot: (onNext) => subscribe(() => ({ exists: path in docs, data: () => copy(docs[path]) }), onNext),
      set: async (data) => {
        docs[path] = copy(data);
        notify();
      },
      update: async (data) => {
        if (!(path in docs)) throw Object.assign(new Error("no such document: " + path), { code: "not_found" });
        Object.assign(docs[path], copy(data));
        notify();
      },
    };
  }

  function queryRef(collection, order, max) {
    const read = () => {
      let rows = Object.keys(docs)
        .filter((path) => path.startsWith(collection + "/"))
        .map((path) => ({ id: path.slice(collection.length + 1), value: docs[path] }));
      if (order) {
        const sign = order.dir === "desc" ? -1 : 1;
        rows.sort((a, b) => sign * String(a.value[order.field] ?? "").localeCompare(String(b.value[order.field] ?? "")));
      }
      if (max != null) rows = rows.slice(0, max);
      return { docs: rows.map((row) => ({ id: row.id, data: () => copy(row.value) })) };
    };
    return {
      orderBy: (field, dir) => queryRef(collection, { field, dir }, max),
      limit: (n) => queryRef(collection, order, n),
      onSnapshot: (onNext) => subscribe(read, onNext),
    };
  }

  const db = { doc: docRef, collection: (name) => queryRef(name) };

  const user = {
    canEdit: async () => role !== "viewer",
    id: async () => fixture.viewer,
    isOwner: async () => role === "owner",
    profiles: async (ids) => {
      const found = {};
      for (const id of ids) if (fixture.people[id]) found[id] = { name: fixture.people[id] };
      return found;
    },
  };

  const sent = [];
  const comments = {
    canSendToClaude: async () => (watched ? "available" : "no_session"),
    anchorFor: async (node) => ({ id: node.id }),
    sendToClaude: async (comment) => {
      sent.push(comment);
      console.info("stand-in: sent to Claude:", comment.text);
      return { threadId: "stand-in", commentId: String(sent.length) };
    },
  };

  const capabilities = { db, user, comments };
  window.claude = { use: async (name) => capabilities[name] ?? null };
  window.__standIn = { docs, sent, errors };
})();
