import { Hono } from "hono";
import "./warm";
import { items, rank } from "./build";
import { MANIFEST, render } from "./page";
import { now, SOURCES, wall, type Source, type Story } from "./rank";

type Env = { WIRE_ALLOW_REFRESH?: string };

const TTL = 300; // seconds before a page is stale
// A stale page stays on the screen while the next one builds. After this age
// wire builds the page before it answers.
const STALE_MAX = 3600;
// The longest wait for a 429. A Worker may keep working for 30 seconds after
// the answer, and Reddit can ask for several minutes.
const RETRY_MAX = 10;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
  + "(KHTML, like Gecko) Chrome/126 Safari/537.36";

class HTTPStatusError extends Error {
  name = "HTTPStatusError";
  constructor(message: string, readonly status: number, readonly wait = 0) {
    super(message);
  }
}

const sleep = (s: number) => new Promise((done) => setTimeout(done, s * 1000));

async function get(url: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, {
      headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(20_000),
    });
    if (r.ok) return r.text();
    const reset = Math.floor(Number(r.headers.get("x-ratelimit-reset") ?? 1));
    const wait = (Number.isFinite(reset) ? reset : 1) + 1;
    if (r.status !== 429) throw new HTTPStatusError(`${r.status} ${r.statusText}`, r.status);
    if (attempt === 2 || wait > RETRY_MAX) {
      throw new HTTPStatusError(`429 Too Many Requests (retry in ${wait}s)`, 429, wait);
    }
    await r.body?.cancel();
    await sleep(wait);
  }
}

/** One source. A failure stays in that source and becomes a line on the page. */
async function fetchOne(src: Source): Promise<{ body: string | null; error: string | null }> {
  try {
    return { body: await get(src.url), error: null };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return { body: null, error: `${src.name} (${err.name}: ${err.message})` };
  }
}

interface Page {
  html: string;
  at: number; // seconds since the epoch, when wire built the page
}

// Two layers. `memory` lives as long as this Worker. The Cache API copy
// serves a new Worker in the same data center. wire keeps nothing else.
let memory: Page | null = null;
let building: Promise<Page> | null = null;

async function cached(key: string): Promise<Page | null> {
  if (memory) return memory;
  const hit = await caches.default.match(key);
  if (!hit) return null;
  memory = { html: await hit.text(), at: Number(hit.headers.get("x-wire-built")) };
  return memory;
}

async function build(key: string, origin: string, allowRefresh: boolean): Promise<Page> {
  const results = await Promise.all(SOURCES.map(fetchOne));
  const at = now();
  const stories: Story[] = [];
  const errors: string[] = [];
  SOURCES.forEach((src, i) => {
    const { body, error } = results[i];
    if (body !== null) stories.push(...items(src, body, at));
    if (error) errors.push(error);
  });
  const html = render({ rows: rank(stories, at), errors, wall: wall(at * 1000), at,
    allowRefresh, canonical: origin + "/" });
  if (errors.length) console.log(`unavailable: ${errors.join("; ")}`);
  memory = { html, at };
  await caches.default.put(key, new Response(html, {
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cache-control": `max-age=${STALE_MAX}`,
      "x-wire-built": String(at),
    },
  }));
  return memory;
}

/** One build at a time in this Worker. */
function rebuild(key: string, origin: string, allowRefresh: boolean): Promise<Page> {
  building ??= build(key, origin, allowRefresh).finally(() => (building = null));
  return building;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/manifest.webmanifest", (c) =>
  c.body(JSON.stringify(MANIFEST), 200, { "content-type": "application/manifest+json" }));

app.get("/", async (c) => {
  const allowRefresh = c.env.WIRE_ALLOW_REFRESH === "1";
  // `refresh` is any value but "0". It forces one request to each source, so
  // it stays off unless WIRE_ALLOW_REFRESH is "1".
  const force = allowRefresh && (c.req.query("refresh") ?? "0") !== "0";
  const origin = new URL(c.req.url).origin;
  const key = origin + "/__wire/page";
  let page = force ? null : await cached(key);
  const age = page ? now() - page.at : Infinity;
  if (!page || age > STALE_MAX) {
    page = await rebuild(key, origin, allowRefresh);
  } else if (age > TTL) {
    // Show the stale page now, and build the next one after the answer.
    c.executionCtx.waitUntil(rebuild(key, origin, allowRefresh).catch(console.error));
  }
  return c.html(page.html);
});

export default app;
