// Prints the parsed items of the saved bodies as JSON, for the parity check.
import { readFileSync } from "node:fs";
import { parseFeed, parseSitemap } from "../src/parse";

const dir = new URL("./bodies/", import.meta.url);
const files: [string, string][] = [["HN", "hn"], ["Reddit", "reddit"], ["SPIEGEL", "spiegel"],
  ["The Verge", "verge"], ["Reuters", "reuters"]];
const out: Record<string, unknown> = {};
for (const [name, file] of files) {
  const body = readFileSync(new URL(`${file}.xml`, dir), "utf8");
  out[name] = (name === "Reuters" ? parseSitemap : parseFeed)(body, name);
}
console.log(JSON.stringify(out));
