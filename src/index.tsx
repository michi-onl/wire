import { Hono } from "hono";
import "./warm";
import { empty, items, pages } from "./build";
import { MANIFEST, renderAll } from "./page";
import { now, PAGES, SOURCES, wall, type Source, type Story } from "./rank";

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

// Two layers, by path. `memory` lives as long as this Worker. The Cache API
// copy serves a new Worker in the same data center. wire keeps nothing else.
// One build writes every page, so a topic page costs no fetch of its own.
const memory = new Map<string, Page>();
let building: Promise<void> | null = null;

const keyOf = (origin: string, path: string) => origin + "/__wire/page" + path;

async function cached(origin: string, path: string): Promise<Page | null> {
  const known = memory.get(path);
  if (known) return known;
  const hit = await caches.default.match(keyOf(origin, path));
  if (!hit) return null;
  const page = { html: await hit.text(), at: Number(hit.headers.get("x-wire-built")) };
  memory.set(path, page);
  return page;
}

async function build(origin: string, allowRefresh: boolean): Promise<void> {
  const results = await Promise.all(SOURCES.map(fetchOne));
  const at = now();
  const stories: Story[] = [];
  const errors: string[] = [];
  SOURCES.forEach((src, i) => {
    const { body, error } = results[i];
    if (error) errors.push(error);
    if (body === null) return;
    const got = items(src, body, at);
    stories.push(...got);
    // A second parse only for a source that gave nothing, so it costs no CPU
    // on a normal refresh.
    if (!got.length && empty(src, body)) errors.push(`${src.name} (0 items)`);
  });
  if (errors.length) console.log(`unavailable: ${errors.join("; ")}`);
  const puts: Promise<void>[] = [];
  const all = renderAll(pages(stories, at), { errors, wall: wall(at * 1000), at, allowRefresh,
    origin });
  for (const [path, html] of all) {
    memory.set(path, { html, at });
    puts.push(caches.default.put(keyOf(origin, path), new Response(html, {
      headers: {
        "content-type": "text/html; charset=UTF-8",
        "cache-control": `max-age=${STALE_MAX}`,
        "x-wire-built": String(at),
      },
    })));
  }
  await Promise.all(puts);
}

/** One build at a time in this Worker. */
function rebuild(origin: string, allowRefresh: boolean): Promise<void> {
  building ??= build(origin, allowRefresh).finally(() => (building = null));
  return building;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/manifest.webmanifest", (c) =>
  c.body(JSON.stringify(MANIFEST), 200, { "content-type": "application/manifest+json" }));

for (const path of ["/", ...PAGES.map((p) => p.path)]) app.get(path, async (c) => {
  const allowRefresh = c.env.WIRE_ALLOW_REFRESH === "1";
  // `refresh` is any value but "0". It forces one request to each source, so
  // it stays off unless WIRE_ALLOW_REFRESH is "1".
  const force = allowRefresh && (c.req.query("refresh") ?? "0") !== "0";
  const origin = new URL(c.req.url).origin;
  let page = force ? null : await cached(origin, path);
  const age = page ? now() - page.at : Infinity;
  if (!page || age > STALE_MAX) {
    await rebuild(origin, allowRefresh);
    page = memory.get(path)!;
  } else if (age > TTL) {
    // Show the stale page now, and build the next one after the answer.
    c.executionCtx.waitUntil(rebuild(origin, allowRefresh).catch(console.error));
  }
  return c.html(page.html);
});

export default app;
