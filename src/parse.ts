import { decode } from "html-entities";
import { now, story, type Story } from "./rank";

// wire reads five fields of an RSS item or an Atom entry: the title, the link,
// the date, the description, and the content. A regex reads them. An XML
// library costs 4 ms on a warm run and about 20 ms on the first run of a new
// Worker, and the free plan gives 10 ms for the whole request.
const ENTRY = /<(item|entry)[\s>]([\s\S]*?)<\/\1>/g;
const CDATA = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/;
const tag = (name: string) => new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`);
const TITLE = tag("title");
const LINK = tag("link");
const DESCRIPTION = tag("description");
const SUMMARY = tag("summary");
const CONTENT = tag("content");
const ENCODED = tag("content:encoded");
const DATES = ["pubDate", "published", "dc:date", "updated"].map(tag);
const ATOM_LINK = /<link\b([^>]*?)\/?>/g;
const HREF = /\bhref="([^"]*)"/;
const REL = /\brel="([^"]*)"/;

const POINTS = /Points:\s*(\d+)/;
const COMMENTS = /#\s*Comments:\s*(\d+)/;
const URL_BLOCK = /<url>(.*?)<\/url>/gs;
const LOC = /<loc>(.*?)<\/loc>/s;
const NEWS_TITLE = /<news:title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/news:title>/s;
const NEWS_DATE = /<news:publication_date>(.*?)<\/news:publication_date>/s;
const RD_TARGET = /<span><a href="([^"]+)">\[link\]<\/a><\/span>/;
// The same link in the escaped HTML of a Reddit entry. The rule reads it
// there, because a decode of the whole content costs more than the rest of
// the entry.
const RD_ESCAPED =
  /&lt;span&gt;&lt;a href=(?:"|&quot;)((?:(?!&quot;)[^"<])+)(?:"|&quot;)&gt;\[link\]&lt;\/a&gt;&lt;\/span&gt;/;
// An image, a video, or a gallery on Reddit itself. The thread is the story.
const RD_MEDIA = /^https?:\/\/([a-z]+\.)?(redd\.it|reddit\.com)\//i;
const HN_ITEM = /href="(https:\/\/news\.ycombinator\.com\/item\?id=\d+)"/;

/** Seconds since the epoch, or now when the text holds no date. */
export function parseDate(raw: string): number {
  const ms = Date.parse(raw.trim());
  return Number.isNaN(ms) ? now() : ms / 1000;
}

/** The text of the first element that the rule finds: CDATA as it is, any
 * other text with its entities decoded. */
function text(rule: RegExp, block: string): string {
  const m = rule.exec(block);
  if (!m) return "";
  const cdata = CDATA.exec(m[1]);
  return cdata ? cdata[1].trim() : decode(m[1].trim(), { level: "xml" });
}

/** The link of an Atom entry: rel="alternate" first, then a link with no rel. */
function atomLink(block: string): string {
  let plain = "";
  for (const m of block.matchAll(ATOM_LINK)) {
    const href = HREF.exec(m[1])?.[1];
    if (!href) continue;
    const rel = REL.exec(m[1])?.[1];
    if (rel === "alternate") return decode(href, { level: "xml" });
    if (rel === undefined && !plain) plain = decode(href, { level: "xml" });
  }
  return plain;
}

/** The article that a Reddit entry links to, or null for a post on Reddit. */
function redditTarget(block: string): string | null {
  // The content is HTML inside XML, so an `&` in the address reads `&amp;amp;`.
  const escaped = RD_ESCAPED.exec(block);
  let target: string | null = null;
  if (escaped) target = decode(decode(escaped[1], { level: "xml" }), { level: "html5" });
  else {
    const content = text(ENCODED, block) || text(CONTENT, block);
    const hit = RD_TARGET.exec(content);
    if (hit) target = decode(hit[1], { level: "html5" });
  }
  return target && !RD_MEDIA.test(target) ? target : null;
}

/** The items of an RSS or Atom feed. Only the first `limit` entries are read.
 * The others still count for `n`, so the position keeps its meaning. */
export function parseFeed(body: string, name: string, limit = Infinity): Story[] {
  const entries = [...body.matchAll(ENTRY)];
  const stories: Story[] = [];
  const n = entries.length;
  entries.slice(0, limit).forEach(([, kind, block], pos) => {
    const date = DATES.map((rule) => text(rule, block)).find(Boolean);
    const published = date ? parseDate(date) : now();
    const title = text(TITLE, block);
    const url = (kind === "entry" ? atomLink(block) : text(LINK, block)).trim();
    if (!(title && url)) return;
    // Reddit and HN point at an article somewhere else. That address is
    // what matches the same story on another source. Only HN gives points
    // and comments, so only HN reads the description.
    let target: string | null = null;
    let discuss: string | null = null;
    let points: RegExpExecArray | null = null;
    let comments: RegExpExecArray | null = null;
    if (name === "Reddit") {
      target = redditTarget(block);
      discuss = url;
    } else if (name === "HN") {
      const raw = text(DESCRIPTION, block) || text(SUMMARY, block);
      points = POINTS.exec(raw);
      comments = COMMENTS.exec(raw);
      target = url;
      discuss = HN_ITEM.exec(raw)?.[1] ?? null;
    }
    stories.push(story(title, target || url, name, published, {
      origin: url, discuss,
      points: points ? Number(points[1]) : null,
      comments: comments ? Number(comments[1]) : null, pos, n,
    }));
  });
  return stories;
}

export function parseSitemap(body: string, name: string, limit = Infinity): Story[] {
  const blocks = [...body.matchAll(URL_BLOCK)].map((m) => m[1]);
  const stories: Story[] = [];
  blocks.slice(0, limit).forEach((block, pos) => {
    const loc = LOC.exec(block);
    const title = NEWS_TITLE.exec(block);
    const date = NEWS_DATE.exec(block);
    if (!(loc && title)) return;
    stories.push(story(title[1], loc[1], name, date ? parseDate(date[1]) : now(),
      { pos, n: blocks.length }));
  });
  return stories;
}
