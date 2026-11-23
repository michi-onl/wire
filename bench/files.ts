import { readFileSync } from "node:fs";
import { SOURCES } from "../src/rank";

// The file in bench/bodies/ that holds the saved body of each source.
export const FILES: Record<string, string> = {
  HN: "hn", Reddit: "reddit", SPIEGEL: "spiegel", "The Verge": "verge", Reuters: "reuters",
  Tagesschau: "tagesschau",
  "Creative Review": "creativereview", "Creative Boom": "creativeboom", Abduzeedo: "abduzeedo",
  "Design Milk": "designmilk", "It's Nice That": "itsnicethat",
  "Web Design Museum": "webdesignmuseum", PetaPixel: "petapixel", Fstoppers: "fstoppers",
  "35mmc": "35mmc", "Bear Blog": "bearblog", "404 Media": "404media",
  "Ars Technica": "arstechnica", "Kagi Liked": "kagiliked", "Kagi Comics": "kagicomic",
  "Math with Bad Drawings": "mathwithbaddrawings",
  "Kagi YouTube": "kagiyt", "Kagi GitHub": "kagigh",
};

const dir = new URL("./bodies/", import.meta.url);
/** The saved body of each source, in the order of SOURCES. */
export const BODIES = SOURCES.map((s) => readFileSync(new URL(`${FILES[s.name]}.xml`, dir), "utf8"));
// The batch was saved at one moment. Rank it at that moment, so no item ages
// out of MAX_AGE between two runs of the bench.
export const AT = Date.parse(readFileSync(new URL("fetched_at.txt", dir), "utf8").trim()) / 1000;
