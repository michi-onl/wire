import { parseFeed, parseSitemap } from "./parse";
import { cluster, keep, score, select, SHOWN, type Row, type Source, type Story } from "./rank";

/** The items that one source gives to the list. Read a wide window, drop what
 * the source must not contribute, and cap after that. A cap before the
 * filter empties a noisy source. */
export function items(src: Source, body: string, at: number): Story[] {
  const parse = src.kind === "sitemap" ? parseSitemap : parseFeed;
  return parse(body, src.name, src.window).filter((s) => keep(s, at)).slice(0, src.max);
}

/** The rows of the page, in order, from the items of all sources. */
export function rank(stories: Story[], at: number): Row[] {
  const clusters = cluster(stories);
  for (const c of clusters) c.score = score(c, at);
  const ranked = select(clusters, SHOWN);
  ranked.forEach((c, i) => (c.rank = i + 1));
  return ranked;
}
