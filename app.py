import asyncio
import html
import os
import re
import time
from datetime import datetime, timezone

import feedparser
import httpx
from fasthtml.common import (
    A, B, Br, Div, Span, Style, Table, Td, Tr,
    fast_app, serve,
)

TTL = 300
HOST = os.environ.get("WIRE_HOST", "127.0.0.1")
PORT = int(os.environ.get("WIRE_PORT", "5001"))
ALLOW_REFRESH = os.environ.get("WIRE_ALLOW_REFRESH", "0") == "1"
RELOAD = os.environ.get("WIRE_RELOAD", "0") == "1"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126 Safari/537.36")

GRAVITY = 1.8

SOURCES = [
    dict(name="HN", url="https://hnrss.org/frontpage", kind="feed", max=10,
         quality_mode="points", home="https://news.ycombinator.com/"),
    dict(name="Reddit", url="https://www.reddit.com/r/worldnews+technology+news/.rss",
         kind="feed", max=10, quality_mode="position",
         home="https://www.reddit.com/r/worldnews+technology+news/"),
    dict(name="SPIEGEL", url="https://www.spiegel.de/schlagzeilen/tops/index.rss",
         kind="feed", max=10, quality_mode="position",
         home="https://www.spiegel.de/"),
    dict(name="The Verge", url="https://www.theverge.com/", kind="scrape", max=10,
         quality_mode="position", rss="https://www.theverge.com/rss/index.xml",
         home="https://www.theverge.com/"),
    dict(name="Reuters",
         url="https://www.reuters.com/arc/outboundfeeds/news-sitemap/?outputType=xml",
         kind="sitemap", max=10, quality_mode="none",
         home="https://www.reuters.com/"),
]

POINTS = re.compile(r"Points:\s*(\d+)")
COMMENTS = re.compile(r"#\s*Comments:\s*(\d+)")
URL_BLOCK = re.compile(r"<url>(.*?)</url>", re.S)
LOC = re.compile(r"<loc>(.*?)</loc>", re.S)
NEWS_TITLE = re.compile(r"<news:title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</news:title>", re.S)
NEWS_DATE = re.compile(r"<news:publication_date>(.*?)</news:publication_date>", re.S)
VERGE_ARTICLE = re.compile(
    r"https://www\.theverge\.com/[a-z0-9-]+/\d{6,}/[a-z0-9-]+", re.I)

CSS = """
:root {
  --sky-50:  #f0f9ff;
  --sky-300: #7dd3fc;
  --sky-500: #0ea5e9;
  --sky-600: #0284c7;
  --sky-950: #082f49;
}
body { font-family: Verdana, Geneva, sans-serif; font-size: 10pt; color: var(--sky-600);
       background: var(--sky-50); margin: 0; padding: 0; }
#hnmain { width: 85%; margin: 0 auto; background: var(--sky-50); }
#hnmain td { font-family: Verdana, Geneva, sans-serif; font-size: 10pt; color: var(--sky-600); }
a { color: var(--sky-600); text-decoration: none; }
a:hover { text-decoration: underline; }
a:hover .logo { text-decoration: none; }
.logo { width: 16px; height: 16px; border: 1px solid #fff; background: var(--sky-500);
        color: #fff; text-align: center;
        font: bold 12px/16px Verdana, Geneva, sans-serif; }
.pagetop { font-size: 10pt; color: var(--sky-950); }
.pagetop a { color: var(--sky-950); }
.hnname a { font-weight: bold; }
.title { font-size: 10pt; color: var(--sky-600); }
.title a { color: var(--sky-950); }
.title a:visited { color: var(--sky-600); }
.rank { color: var(--sky-600); }
.votearrow { width: 0; height: 0; margin: 3px 2px 6px;
             border-left: 5px solid transparent; border-right: 5px solid transparent;
             border-bottom: 7px solid var(--sky-300); }
.sitebit, .sitestr { font-size: 8pt; color: var(--sky-600); }
.subtext, .subtext a { font-size: 7pt; color: var(--sky-600); }
.yclinks, .yclinks a { font-size: 8pt; color: var(--sky-600); }
.spacer { height: 5px; }
"""


def epoch(dt):
    return dt.astimezone(timezone.utc).timestamp()


def parse_date(raw):
    try:
        return epoch(datetime.fromisoformat(raw.replace("Z", "+00:00")))
    except ValueError:
        return time.time()


def age(ts):
    delta = max(0.0, time.time() - ts)
    for step, unit in ((86400, "d"), (3600, "h"), (60, "m")):
        if delta >= step:
            return f"{int(delta // step)}{unit} ago"
    return "just now"


def parse_feed(body, name):
    feed = feedparser.parse(body)
    stories = []
    for e in feed.entries:
        raw = e.get("description", "") or e.get("summary", "")
        parsed = e.get("published_parsed") or e.get("updated_parsed")
        published = epoch(datetime(*parsed[:6], tzinfo=timezone.utc)) if parsed else time.time()
        points = POINTS.search(raw)
        comments = COMMENTS.search(raw)
        title = e.get("title", "").strip()
        url = (e.get("link") or "").strip()
        if title and url:
            stories.append(dict(
                title=title, url=url, source=name, published=published,
                points=int(points.group(1)) if points else None,
                comments=int(comments.group(1)) if comments else None,
                quality=None,
            ))
    return stories


def parse_sitemap(body, name):
    stories = []
    for block in URL_BLOCK.findall(body):
        loc = LOC.search(block)
        title = NEWS_TITLE.search(block)
        date = NEWS_DATE.search(block)
        if not (loc and title):
            continue
        stories.append(dict(
            title=html.unescape(title.group(1).strip()), url=loc.group(1).strip(),
            source=name, published=parse_date(date.group(1)) if date else time.time(),
            points=None, comments=None, quality=None,
        ))
    return stories


def parse_homepage(body, name, rss_body):
    by_url = {}
    for story in parse_feed(rss_body, name):
        by_url.setdefault(story["url"], story)
    ordered, seen = [], set()
    for url in VERGE_ARTICLE.findall(body):
        url = url.rstrip("/")
        if url in seen or url not in by_url:
            continue
        seen.add(url)
        ordered.append(by_url[url])
    return ordered


async def fetch_one(client, src):
    last = None

    async def get(url):
        nonlocal last
        for attempt in range(3):
            try:
                r = await client.get(url, headers={"User-Agent": UA},
                                     follow_redirects=True, timeout=20)
                if r.status_code == 429:
                    wait = int(r.headers.get("x-ratelimit-reset", 1)) + 1
                    raise httpx.HTTPStatusError(
                        f"429 Too Many Requests (retry in {wait}s)", request=r.request, response=r)
                r.raise_for_status()
                return r.text
            except httpx.HTTPStatusError as e:
                last = e
                if e.response.status_code != 429 or attempt == 2:
                    raise
                await asyncio.sleep(int(e.response.headers.get("x-ratelimit-reset", 1)) + 1)
        raise last

    try:
        if src["kind"] == "scrape":
            body = await get(src["url"])
            rss_body = await get(src["rss"])
            items = parse_homepage(body, src["name"], rss_body)
        else:
            parse = parse_sitemap if src["kind"] == "sitemap" else parse_feed
            items = parse(await get(src["url"]), src["name"])
        return src["name"], items[:src["max"]], None
    except Exception as e:
        return src["name"], [], f"{type(e).__name__}: {e}"


_cache = {"at": 0.0, "wall": "", "stories": [], "errors": []}


def assign_quality(results):
    for src in SOURCES:
        items = next((i for n, i, _ in results if n == src["name"]), [])
        mode = src["quality_mode"]
        if mode == "points":
            top = max((s["points"] or 0) for s in items) if items else 0
            for story in items:
                story["quality"] = (story["points"] or 0) / top if top else 0.0
        elif mode == "position":
            span = max(1, len(items) - 1)
            for pos, story in enumerate(items):
                story["quality"] = 1 - pos / span
        else:
            for story in items:
                story["quality"] = 0.5


def hot_score(story):
    hours = max(0.0, time.time() - story["published"]) / 3600
    return (story["quality"] + 1) / (hours + 2) ** GRAVITY


async def load(force=False):
    now = time.monotonic()
    if not force and _cache["stories"] and now - _cache["at"] < TTL:
        return _cache["stories"], _cache["errors"]
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(*(fetch_one(client, s) for s in SOURCES))
    assign_quality(results)
    stories, errors = [], []
    for name, items, err in results:
        stories += items
        if err:
            errors.append(f"{name} ({err})")
    stories.sort(key=hot_score, reverse=True)
    for rank, story in enumerate(stories, 1):
        story["rank"] = rank
    _cache.update(at=now, wall=datetime.now().strftime("%H:%M"),
                  stories=stories, errors=errors)
    return stories, errors


HOMES = {s["name"]: s["home"] for s in SOURCES}


def subline(story):
    bits = []
    if story["points"] is not None:
        bits += [Span(f"{story['points']} points", cls="score"), " "]
    bits += ["by ", A(story["source"], href=HOMES[story["source"]], cls="hnuser"), " ",
             Span(age(story["published"]), cls="age")]
    if story["comments"] is not None:
        bits += [" | ", f"{story['comments']} comments"]
    return bits


def story_row(story):
    return (
        Tr(
            Td(Span(f"{story['rank']}.", cls="rank"), align="right", valign="top",
               cls="title"),
            Td(Div(cls="votearrow"), valign="top", cls="votelinks",
               style="text-align:center"),
            Td(
                Span(
                    A(story["title"], href=story["url"]),
                    Span(" (", A(Span(story["source"], cls="sitestr"),
                                 href=HOMES[story["source"]]), ")",
                         cls="sitebit comhead"),
                    cls="titleline",
                ),
                cls="title", valign="top",
            ),
            cls="athing",
        ),
        Tr(Td(colspan="2"), Td(Span(*subline(story), cls="subline"), cls="subtext")),
        Tr(cls="spacer", style="height:5px"),
    )


app, rt = fast_app(title="wire", hdrs=(Style(CSS),),
                   pico=False, surreal=False, htmx=False)


def nav():
    links = []
    for src in SOURCES:
        if links:
            links.append(" | ")
        links.append(A(src["name"].lower(), href=src["home"]))
    return links


@rt("/")
async def index(refresh: int = 0):
    stories, errors = await load(force=bool(refresh) and ALLOW_REFRESH)
    header = Tr(Td(
        Table(
            Tr(
                Td(A(Div("W", cls="logo"), href="/"),
                   style="width:18px;padding-right:4px"),
                Td(Span(B(A("wire", href="/"), cls="hnname"), " ", *nav(),
                        cls="pagetop"),
                   style="line-height:12pt;height:10px"),
                Td(Span(A("refresh", href="/?refresh=1"), cls="pagetop"),
                   style="text-align:right;padding-right:4px") if ALLOW_REFRESH else "",
            ),
            width="100%", cellspacing="0", cellpadding="0", border="0",
            style="padding:2px",
        ),
        style="background:var(--sky-500)",
    ))
    pagespace = Tr(style="height:10px")
    status = Tr(Td(
        Span("unavailable: " + "; ".join(errors), cls="subtext"),
        style="padding:0 0 8px 8px",
    )) if errors else Tr()
    body = Tr(Td(Table(*(story_row(s) for s in stories),
                       cellspacing="0", cellpadding="0", border="0", width="100%")))
    footer = Tr(Td(
        Div(style="height:10px"),
        Div(style="height:2px;background:var(--sky-500)"),
        Br(),
        Div(Span(" | ".join(s["name"] for s in SOURCES),
                 " | updated " + _cache["wall"], cls="yclinks"),
            style="text-align:center;padding-bottom:16px"),
    ))
    return Table(header, pagespace, status, body, footer,
                 id="hnmain", cellspacing="0", cellpadding="0", border="0")


if __name__ == "__main__":
    serve(host=HOST, port=PORT, reload=RELOAD)
