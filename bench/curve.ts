// Times refresh 1, 2, 3, ... of the saved batch in one process, as an isolate
// that lives across refreshes would run them.
import { readFileSync } from "node:fs";
import { FILES as F } from "./files";
import { items, pages } from "../src/build";
import { renderAll } from "../src/page";
import { SOURCES, type Story } from "../src/rank";
const dir = new URL("./bodies/", import.meta.url);
const bodies = SOURCES.map((s) => readFileSync(new URL(`${F[s.name]}.xml`, dir), "utf8"));
const at = Date.parse(readFileSync(new URL("fetched_at.txt", dir), "utf8").trim()) / 1000;
const out: number[] = [];
for (let i = 0; i < 12; i++) {
  const t = performance.now();
  const stories: Story[] = [];
  SOURCES.forEach((s, k) => stories.push(...items(s, bodies[k], at)));
  renderAll(pages(stories, at), { errors: [], wall: "00:00", at, allowRefresh: false, origin: "" });
  out.push(performance.now() - t);
}
console.log(out.map((x) => x.toFixed(1)).join(" "));
