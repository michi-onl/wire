// Prints the ranked rows of the saved batch as JSON, for the parity check
// with the Python version. app.py is in the history before commit d5c5fba.
import { readFileSync } from "node:fs";
import { items, rank } from "../src/build";
import { cluster, POL_DROP, score, SOURCES, type Story } from "../src/rank";

const FILES: Record<string, string> = {
  HN: "hn", Reddit: "reddit", SPIEGEL: "spiegel", "The Verge": "verge", Reuters: "reuters",
};
const dir = new URL("./bodies/", import.meta.url);
const at = Date.parse(readFileSync(new URL("fetched_at.txt", dir), "utf8").trim()) / 1000;
const stories: Story[] = [];
for (const s of SOURCES) {
  stories.push(...items(s, readFileSync(new URL(`${FILES[s.name]}.xml`, dir), "utf8"), at));
}
const cl = cluster(stories);
for (const c of cl) c.score = score(c, at);
const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
console.log(JSON.stringify({
  pool: cl.length, dropped: cl.filter((c) => c.pol! >= POL_DROP).length,
  rows: rank(stories, at).map((c) => ({ url: c.url, title: c.title, score: round(c.score!, 4),
    sources: c.sources, topic: c.topic, pol: c.pol })),
  all: cl.map((c) => [c.url, round(c.score!, 4), round(c.pol!, 2), c.topic, c.members.length])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
}));
