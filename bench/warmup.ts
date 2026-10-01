// A cold process runs the full path once on a tiny sample, as the global
// scope of a Worker would, and then times one refresh of the saved batch.
import { readFileSync } from "node:fs";
import { items, rank } from "../src/build";
import { render } from "../src/page";
import { SOURCES, type Story } from "../src/rank";

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title><item><title>Lawmakers – Söder und die Parlamentswahl</title><link>https://example.com/a</link><description><![CDATA[<p>Points: 5</p><p># Comments: 2</p><a href="https://news.ycombinator.com/item?id=1">c</a>]]></description><pubDate>Wed, 01 Oct 2026 10:00:00 +0000</pubDate></item><item><title>Plain ascii title about chips</title><link>https://example.com/b</link><description>x</description><pubDate>Wed, 01 Oct 2026 10:00:00 +0000</pubDate></item></channel></rss>`;
const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>t</title><entry><title>Minister – Selenskyj trifft Merz</title><link href="https://www.reddit.com/r/worldnews/comments/1/x/"/><updated>2026-10-01T10:00:00+00:00</updated><content type="html">&lt;span&gt;&lt;a href="https://example.org/x?a=1&amp;amp;utm_source=y"&gt;[link]&lt;/a&gt;&lt;/span&gt;</content></entry><entry><title>Plain ascii entry on parliament</title><link href="https://www.reddit.com/r/news/comments/2/y/"/><updated>2026-10-01T10:00:00+00:00</updated><content type="html">x</content></entry></feed>`;
const MAP = `<urlset><url><loc>https://www.reuters.com/world/a/</loc><news:news><news:publication_date>2026-10-01T10:00:00Z</news:publication_date><news:title><![CDATA[Election – Wahl in Österreich]]></news:title></news:news></url><url><loc>https://www.reuters.com/world/b/</loc><news:news><news:publication_date>2026-10-01T10:00:00Z</news:publication_date><news:title>Plain ascii wire item</news:title></news:news></url></urlset>`;

function refresh(bodies: string[], at: number) {
  const stories: Story[] = [];
  SOURCES.forEach((s, i) => stories.push(...items(s, bodies[i], at)));
  return render({ rows: rank(stories, at), errors: [], wall: "00:00", at, allowRefresh: false,
    canonical: "https://wire.michi.onl/" });
}

const sample = SOURCES.map((s) => (s.kind === "sitemap" ? MAP : s.name === "Reddit" ? ATOM : RSS));
let t = performance.now();
refresh(sample, Date.parse("2026-10-01T12:00:00Z") / 1000);
const warm = performance.now() - t;

const F: Record<string, string> = { HN: "hn", Reddit: "reddit", SPIEGEL: "spiegel", "The Verge": "verge", Reuters: "reuters" };
const dir = new URL("./bodies/", import.meta.url);
const bodies = SOURCES.map((s) => readFileSync(new URL(`${F[s.name]}.xml`, dir), "utf8"));
const at = Date.parse(readFileSync(new URL("fetched_at.txt", dir), "utf8").trim()) / 1000;
t = performance.now();
refresh(bodies, at);
console.log(JSON.stringify({ startup: warm, request: performance.now() - t }));
