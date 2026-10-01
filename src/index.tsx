import { Hono } from "hono";
import { items, rank } from "./build";
import { MANIFEST, render } from "./page";
import { now, SOURCES, type Story } from "./rank";

// Phase 1 entry: enough to bundle and run the path once. The cache, the 429
// retry, and the error line come in the full port.
const app = new Hono();

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
  + "(KHTML, like Gecko) Chrome/126 Safari/537.36";

app.get("/manifest.webmanifest", (c) =>
  c.body(JSON.stringify(MANIFEST), 200, { "content-type": "application/manifest+json" }));

app.get("/", async (c) => {
  const bodies = await Promise.all(SOURCES.map((s) => fetch(s.url, { headers: { "User-Agent": UA } }).then((r) => r.text())));
  const at = now();
  const stories: Story[] = [];
  SOURCES.forEach((s, i) => stories.push(...items(s, bodies[i], at)));
  return c.html(render({ rows: rank(stories, at), errors: [], wall: "", at,
    allowRefresh: false, canonical: new URL("/", c.req.url).href }));
});

export default app;
