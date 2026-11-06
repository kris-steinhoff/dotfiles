// Measures the plan page it's loaded into, so that every test reports the same numbers the same way.
// From the viewer's server, in the page: (await import("/measure.js")).measure()
//
// Read `warnings` first. A number means nothing when the page didn't render or a check couldn't run.
// `errors` holds what has happened so far, so measure after the page has settled rather than right after loading.

const SAMPLE_PX = 2; // How far apart along an edge to test for passing behind a task.

function graph(warnings) {
  const wide = document.getElementById("graph-side")?.offsetParent != null;
  const root = (wide ? document.getElementById("graph-side") : document.getElementById("graph"))?.querySelector("svg");
  if (!root) return null;
  const tasks = [...root.querySelectorAll(".node")].map((node) => {
    const [, x, y] = node.getAttribute("transform").match(/translate\(([-\d.]+),([-\d.]+)\)/);
    const rect = node.querySelector("rect");
    return { x: +x, y: +y, width: +rect.getAttribute("width"), height: +rect.getAttribute("height") };
  });
  const edges = [...root.querySelectorAll(".edge")];
  // An edge touches its own two tasks at their borders, so a one-pixel inset leaves only the tasks it passes.
  const inside = (p) => tasks.some((t) => p.x > t.x + 1 && p.x < t.x + t.width - 1 && p.y > t.y + 1 && p.y < t.y + t.height - 1);
  let behindTasks = 0;
  for (const edge of edges) {
    const length = edge.getTotalLength();
    for (let s = SAMPLE_PX; s < length - SAMPLE_PX; s += SAMPLE_PX) {
      if (inside(edge.getPointAtLength(s))) { behindTasks++; break; }
    }
  }
  if (edges.length && edges.every((edge) => edge.getTotalLength() === 0)) warnings.push("graph edges have no length, so the graph isn't laid out");
  return { tasks: tasks.length, edges: edges.length, behindTasks, width: +root.getAttribute("width"), height: +root.getAttribute("height") };
}

// Runs fn with the page fully opened, the graph and every collapsed section, then puts it back. That's where
// a page is at its widest, so a width read with them closed could miss an overflow.
function withEverythingOpen(fn) {
  const toggle = document.getElementById("graph-toggle");
  const openGraph = toggle && toggle.offsetParent !== null && toggle.getAttribute("aria-expanded") === "false";
  const closed = [...document.querySelectorAll("details:not([open])")];
  if (openGraph) toggle.click();
  closed.forEach((d) => { d.open = true; });
  const result = fn();
  closed.forEach((d) => { d.open = false; });
  if (openGraph) toggle.click();
  return result;
}

function links(warnings) {
  const head = document.querySelector(".layout > .head");
  if (!head || getComputedStyle(head).position !== "sticky") return { notApplicable: "the header is only sticky on wide windows" };
  if (document.documentElement.style.getPropertyValue("--head-h") === "") {
    warnings.push("the sticky header is unmeasured, so links weren't checked. A hidden pane doesn't paint: take a screenshot, then measure again");
    return null;
  }
  const targets = new Set(
    [...document.querySelectorAll('a[href^="#"]')].map((a) => document.getElementById(a.getAttribute("href").slice(1))).filter((t) => t && t.offsetParent),
  );
  const before = scrollY;
  const clearances = [];
  let cannotScroll = 0;
  for (const target of targets) {
    target.scrollIntoView({ behavior: "instant" });
    // A target near the end of the page can't reach the top, which isn't the header's doing.
    if (Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight) { cannotScroll++; continue; }
    clearances.push(target.getBoundingClientRect().top - head.getBoundingClientRect().bottom);
  }
  scrollTo({ top: before, behavior: "instant" });
  if (!clearances.length) return { targets: targets.size, measured: 0, cannotScroll };
  return { targets: targets.size, measured: clearances.length, cannotScroll, behindHeader: clearances.filter((c) => c < 0).length, minClearance: Math.min(...clearances), maxClearance: Math.max(...clearances) };
}

// What the page made of the plan's text. Code belongs only in body text, and a plan's text must never become markup,
// so `injected` counts the elements that only parsed text could have put there. The page's own script sits outside .layout.
function code(warnings) {
  const layout = document.querySelector(".layout");
  if (!layout) return null;
  const spans = [...layout.querySelectorAll("code")];
  const injected = layout.querySelectorAll("img, script, iframe, object, embed, style, link").length + (window.__pwned ? 1 : 0);
  if (injected) warnings.push(`a plan's text became markup: ${injected} injected, so this page isn't safe`);
  return {
    count: spans.length,
    inPlainFields: spans.filter((span) => span.closest("h1, h3, summary, a, .graph")).length,
    injected,
    texts: [...new Set(spans.map((span) => span.textContent))],
  };
}

export function measure() {
  const warnings = [];
  const root = document.documentElement;
  const title = document.getElementById("title");
  const rendered = !!title && title.textContent !== "Plan";
  if (!rendered) warnings.push("the plan didn't render, so a pass here means nothing");
  const subtitle = document.querySelector(".subtitle");
  const taskCount = document.querySelectorAll("#tasks .card").length;
  const closedWidth = root.scrollWidth;
  const open = withEverythingOpen(() => ({ scrollWidth: root.scrollWidth, graph: rendered ? graph(warnings) : null }));
  return {
    warnings,
    rendered,
    status: document.getElementById("status")?.textContent,
    taskCount,
    // innerWidth grows with the page under mobile emulation, and hides overflow, so these two are the ones to compare.
    // scrollWidth is read with everything open, and closedScrollWidth as the page first appears.
    page: { scrollWidth: open.scrollWidth, closedScrollWidth: closedWidth, clientWidth: root.clientWidth, overflow: Math.max(open.scrollWidth, closedWidth) > root.clientWidth },
    subtitle: subtitle ? { height: subtitle.offsetHeight, wraps: subtitle.offsetHeight > parseFloat(getComputedStyle(subtitle).fontSize) * 2 } : null,
    graph: open.graph,
    links: rendered ? links(warnings) : null,
    code: code(warnings),
    errors: window.__standIn?.errors ?? null,
  };
}
