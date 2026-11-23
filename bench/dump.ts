// Prints the parsed items of the saved bodies as JSON, for the parity check.
import { parseFeed, parseSitemap } from "../src/parse";
import { SOURCES } from "../src/rank";
import { BODIES } from "./files";

const out: Record<string, unknown> = {};
SOURCES.forEach((s, i) => {
  out[s.name] = (s.kind === "sitemap" ? parseSitemap : parseFeed)(BODIES[i], s.name);
});
console.log(JSON.stringify(out));
