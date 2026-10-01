// Prototype: a regex reader for RSS and Atom, in the style of parseSitemap.
// It reads the five fields that wire uses and nothing else.
import { decode } from "html-entities";
import { now, story, type Story } from "../src/rank";

const ENTRY = /<(item|entry)[\s>]([\s\S]*?)<\/\1>/g;
const CDATA = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/;
const POINTS = /Points:\s*(\d+)/;
const COMMENTS = /#\s*Comments:\s*(\d+)/;
const RD_TARGET = /<span><a href="([^"]+)">\[link\]<\/a><\/span>/;
const HN_ITEM = /href="(https:\/\/news\.ycombinator\.com\/item\?id=\d+)"/;
const tag = (name: string) => new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`);
const TITLE = tag("title"), LINK = tag("link"), DESC = tag("description"), SUMMARY = tag("summary");
const CONTENT = tag("content"), ENCODED = tag("content:encoded"), PUB = tag("pubDate");
const PUBLISHED = tag("published"), UPDATED = tag("updated");
const ATOM_LINK = /<link\b([^>]*?)\/?>/g;

function text(rx: RegExp, block: string): string {
  const m = rx.exec(block);
  if (!m) return "";
  const c = CDATA.exec(m[1]);
  return c ? c[1].trim() : decode(m[1].trim());
}

function atomLink(block: string): string {
  let fallback = "";
  for (const m of block.matchAll(ATOM_LINK)) {
    const href = /\bhref="([^"]*)"/.exec(m[1])?.[1];
    if (!href) continue;
    const rel = /\brel="([^"]*)"/.exec(m[1])?.[1];
    if (rel === "alternate") return decode(href);
    if (!rel && !fallback) fallback = decode(href);
  }
  return fallback;
}

export function parseFeedLean(body: string, name: string): Story[] {
  const entries = [...body.matchAll(ENTRY)];
  const stories: Story[] = [];
  const n = entries.length;
  entries.forEach(([, kind, block], pos) => {
    const raw = text(DESC, block) || text(SUMMARY, block);
    const content = text(ENCODED, block) || text(CONTENT, block) || raw;
    const date = text(PUB, block) || text(PUBLISHED, block) || text(UPDATED, block);
    const ms = Date.parse(date);
    const published = Number.isNaN(ms) ? now() : ms / 1000;
    const title = decode(text(TITLE, block)).trim();
    const url = (kind === "entry" ? atomLink(block) : text(LINK, block)).trim();
    if (!(title && url)) return;
    let target: string | null = null, discuss: string | null = null;
    if (name === "Reddit") { target = RD_TARGET.exec(content)?.[1] ?? null; discuss = url; }
    else if (name === "HN") { target = url; discuss = HN_ITEM.exec(raw)?.[1] ?? null; }
    const p = POINTS.exec(raw), c = COMMENTS.exec(raw);
    stories.push(story(title, target || url, name, published, { origin: url, discuss,
      points: p ? Number(p[1]) : null, comments: c ? Number(c[1]) : null, pos, n }));
  });
  return stories;
}
