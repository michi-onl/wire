import { parseFeed as readFeed } from "@rowanmanning/feed-parser";
import { now, story, type Story } from "./rank";

const POINTS = /Points:\s*(\d+)/u;
const COMMENTS = /#\s*Comments:\s*(\d+)/u;
const URL_BLOCK = /<url>(.*?)<\/url>/gsu;
const LOC = /<loc>(.*?)<\/loc>/su;
const NEWS_TITLE = /<news:title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/news:title>/su;
const NEWS_DATE = /<news:publication_date>(.*?)<\/news:publication_date>/su;
const RD_TARGET = /<span><a href="([^"]+)">\[link\]<\/a><\/span>/u;
const HN_ITEM = /href="(https:\/\/news\.ycombinator\.com\/item\?id=\d+)"/u;

/** Seconds since the epoch, or now when the text holds no date. */
export function parseDate(raw: string): number {
  const ms = Date.parse(raw.trim());
  return Number.isNaN(ms) ? now() : ms / 1000;
}

export function parseFeed(body: string, name: string): Story[] {
  const entries = readFeed(body).items;
  const stories: Story[] = [];
  const n = entries.length;
  entries.forEach((e, pos) => {
    const raw = e.description ?? "";
    const content = e.content || raw;
    const date = e.published ?? e.updated;
    const published = date ? date.getTime() / 1000 : now();
    const points = POINTS.exec(raw);
    const comments = COMMENTS.exec(raw);
    const title = (e.title ?? "").trim();
    const url = (e.url ?? "").trim();
    if (!(title && url)) return;
    // Reddit and HN point at an article somewhere else. That address is
    // what matches the same story on another source.
    let target: string | null = null;
    let discuss: string | null = null;
    if (name === "Reddit") {
      target = RD_TARGET.exec(content)?.[1] ?? null;
      discuss = url;
    } else if (name === "HN") {
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

export function parseSitemap(body: string, name: string): Story[] {
  const blocks = [...body.matchAll(URL_BLOCK)].map((m) => m[1]);
  const stories: Story[] = [];
  blocks.forEach((block, pos) => {
    const loc = LOC.exec(block);
    const title = NEWS_TITLE.exec(block);
    const date = NEWS_DATE.exec(block);
    if (!(loc && title)) return;
    stories.push(story(title[1], loc[1], name, date ? parseDate(date[1]) : now(),
      { pos, n: blocks.length }));
  });
  return stories;
}
