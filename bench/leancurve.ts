import { readFileSync } from "node:fs";
import { parseSitemap } from "../src/parse";
import { render } from "../src/page";
import { rank as rankAll } from "../src/build";
import { keep, SOURCES, type Story } from "../src/rank";
import { parseFeedLean } from "./lean";
const F: Record<string, string> = { HN: "hn", Reddit: "reddit", SPIEGEL: "spiegel", "The Verge": "verge", Reuters: "reuters" };
const dir = new URL("./bodies/", import.meta.url);
const bodies = SOURCES.map((s) => readFileSync(new URL(`${F[s.name]}.xml`, dir), "utf8"));
const at = Date.parse(readFileSync(new URL("fetched_at.txt", dir), "utf8").trim()) / 1000;
const out: number[] = [];
let parse = 0, rk = 0, rd = 0;
for (let i = 0; i < 12; i++) {
  const t0 = performance.now();
  const stories: Story[] = [];
  SOURCES.forEach((s, k) => stories.push(...(s.kind === "sitemap" ? parseSitemap : parseFeedLean)(bodies[k], s.name)
    .slice(0, s.window).filter((x) => keep(x, at)).slice(0, s.max)));
  const t1 = performance.now();
  const rows = rankAll(stories, at);
  const t2 = performance.now();
  render({ rows, errors: [], wall: "00:00", at, allowRefresh: false, canonical: "/" });
  const t3 = performance.now();
  if (i === 0) { parse = t1 - t0; rk = t2 - t1; rd = t3 - t2; }
  out.push(t3 - t0);
}
console.log(out.map((x) => x.toFixed(1)).join(" "), ` | first: parse ${parse.toFixed(1)} rank ${rk.toFixed(1)} render ${rd.toFixed(1)}`);
