import { parseFeed, parseSitemap } from "./parse";
import { cluster, keep, PAGES, score, select, SHOWN, type Row, type Source, type Story } from "./rank";

/** The items that one source gives to the list. Read a wide window, drop what
 * the source must not contribute, and cap after that. A cap before the
 * filter empties a noisy source. */
export function items(src: Source, body: string, at: number): Story[] {
  return parse(src, body).filter((s) => keep(s, at)).slice(0, src.max);
}

/** True for a body with no entry: a page that is not a feed. Such a page
 * throws no error, so the source would leave the page without a word. A
 * feed whose entries are all old is not empty: a slow blog is not broken. */
export const empty = (src: Source, body: string) => parse(src, body).length === 0;

const parse = (src: Source, body: string) =>
  (src.kind === "sitemap" ? parseSitemap : parseFeed)(body, src.name, src.window);

function scored(stories: Story[], at: number): Row[] {
  const clusters = cluster(stories);
  for (const c of clusters) c.score = score(c, at);
  return clusters;
}

/** The rows of the front page, in order, from the items of all sources. */
export const rank = (stories: Story[], at: number): Row[] => select(scored(stories, at), SHOWN);

/** The rows of each page by path: the front page and one page for each entry
 * of PAGES. wire scores the rows once for all pages. */
export function pages(stories: Story[], at: number): Map<string, Row[]> {
  const clusters = scored(stories, at);
  const out = new Map([["/", select(clusters, SHOWN)]]);
  for (const p of PAGES) {
    out.set(p.path, select(clusters.filter((c) => p.topics.has(c.topic!)), SHOWN));
  }
  return out;
}
