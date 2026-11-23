// Prints the ranked rows of the saved batch as JSON, for the parity check
// with the Python version. app.py is in the history before commit d5c5fba.
import { AT as at, BODIES } from "./files";
import { items, rank, scored } from "../src/build";
import { allowed, SOURCES } from "../src/rank";

const stories = SOURCES.flatMap((s, i) => items(s, BODIES[i], at));
const cl = scored(stories, at);
const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
console.log(JSON.stringify({
  pool: cl.length, dropped: cl.filter((c) => !allowed(c)).length,
  rows: rank(stories, at).map((c) => ({ url: c.url, title: c.title, score: round(c.score!, 4),
    sources: c.sources, topic: c.topic, pol: c.pol })),
  all: cl.map((c) => [c.url, round(c.score!, 4), round(c.pol!, 2), c.topic, c.members.length])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
}));
