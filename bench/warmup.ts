// A fresh process loads src/warm.ts, as the global scope of a new Worker
// would, and then times one refresh of the saved batch. Run it in a loop:
//   for i in $(seq 1 15); do npx tsx bench/warmup.ts; done
import { AT as at, BODIES as bodies } from "./files";
import { items, pages } from "../src/build";
import { renderAll } from "../src/page";
import { SOURCES, type Story } from "../src/rank";

let t = performance.now();
await import("../src/warm");
const startup = performance.now() - t;

t = performance.now();
const stories: Story[] = [];
SOURCES.forEach((s, i) => stories.push(...items(s, bodies[i], at)));
renderAll(pages(stories, at), { errors: [], wall: "00:00", at, allowRefresh: false,
  origin: "https://wire.michi.onl" });
console.log(JSON.stringify({ startup, request: performance.now() - t }));
