// Times the CPU path of one refresh: parse, keep, cluster, score, select, and
// render, over the saved bodies in bench/bodies/. The fetch is not timed. A
// Worker does not count a network wait as CPU.
//
//   npx tsx bench/bench.ts          warm: many runs in one process, median
//   npx tsx bench/bench.ts --cold   one run in a fresh process, as a new isolate
import { readFileSync } from "node:fs";
import { FILES } from "./files";
import { items, rank } from "../src/build";
import { render } from "../src/page";
import { SOURCES, type Story } from "../src/rank";

const dir = new URL("./bodies/", import.meta.url);
const bodies = SOURCES.map((s) => readFileSync(new URL(`${FILES[s.name]}.xml`, dir), "utf8"));
// The batch was saved at one moment. Rank it at that moment, so no item ages
// out of MAX_AGE between two runs of the bench.
const at = Date.parse(readFileSync(new URL("fetched_at.txt", dir), "utf8").trim()) / 1000;

function once() {
  const t: Record<string, number> = {};
  let mark = performance.now();
  const lap = (name: string) => {
    const next = performance.now();
    t[name] = next - mark;
    mark = next;
  };
  const stories: Story[] = [];
  SOURCES.forEach((s, i) => {
    stories.push(...items(s, bodies[i], at));
    lap(s.name);
  });
  const rows = rank(stories, at);
  lap("rank");
  const html = render({ rows, errors: [], wall: "00:00", at, allowRefresh: false,
    canonical: "https://wire.michi.onl/" });
  lap("render");
  t.total = Object.values(t).reduce((a, b) => a + b, 0);
  return { t, rows: rows.length, bytes: html.length };
}

if (process.argv.includes("--cold")) {
  console.log(JSON.stringify(once().t));
} else {
  const runs = 200;
  const all: Record<string, number>[] = [];
  let last = once();
  for (let i = 0; i < runs; i++) all.push((last = once()).t);
  const median = (k: string) => {
    const v = all.map((t) => t[k]).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  console.log(`warm median of ${runs} runs, ${last.rows} rows, ${last.bytes} bytes of HTML`);
  for (const k of Object.keys(all[0])) console.log(`  ${k.padEnd(10)} ${median(k).toFixed(3)} ms`);
}
