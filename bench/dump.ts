// Prints the parsed items of the saved bodies as JSON, for the parity check.
import { readFileSync } from "node:fs";
import { parseFeed, parseSitemap } from "../src/parse";
import { SOURCES } from "../src/rank";
import { FILES } from "./files";

const dir = new URL("./bodies/", import.meta.url);
const out: Record<string, unknown> = {};
for (const s of SOURCES) {
  const body = readFileSync(new URL(`${FILES[s.name]}.xml`, dir), "utf8");
  out[s.name] = (s.kind === "sitemap" ? parseSitemap : parseFeed)(body, s.name);
}
console.log(JSON.stringify(out));
