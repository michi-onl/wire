import asyncio
import html
import json
import math
import os
import re
import shutil
import sys
import time
from datetime import datetime, timezone
from urllib.parse import urlsplit, parse_qsl, urlencode, urlunsplit

import feedparser
import httpx
from fasthtml.common import (
    A, B, Br, Div, Link, Meta, Response, Script, Span, Style, Table, Td, Tr,
    fast_app, serve,
)
from starlette.testclient import TestClient

TTL = 300
HOST = os.environ.get("WIRE_HOST", "127.0.0.1")
PORT = int(os.environ.get("WIRE_PORT", "5001"))
ALLOW_REFRESH = os.environ.get("WIRE_ALLOW_REFRESH", "0") == "1"
RELOAD = os.environ.get("WIRE_RELOAD", "0") == "1"
SEEN = os.environ.get("WIRE_SEEN", "seen.json")
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126 Safari/537.36")

# Ranking constants. Each weight is a number of bits. The score is a sum, so
# you can read one weight as "how many times the age decay it cancels".
GRAVITY = 1.15       # bits of decay for each doubling of the age
# Hours added to the age before the decay. A wire republishes an item and the
# clock restarts, so a high floor keeps a trivial 5-minute item from beating a
# story that several sources carry.
AGE_FLOOR = 4.0
MAX_AGE = 72.0       # hours; an older item leaves the list
SHOWN = 30           # rows on the page

W_PROM = 2.2         # standing inside its own source
W_CORR = 1.9         # independent sources on the same story
W_VEL = 1.2          # gain since the last refresh
W_TOPIC = 1.0        # topic fit
W_PUB = 1.0          # publisher
W_POL = 1.8          # cost for party politics, at full confidence

SOURCE_SPREAD = 0.45  # cost for each earlier row from the same source
TOPIC_SPREAD = 0.28   # cost for each earlier row on the same topic
MAX_SPREAD = 0.9      # the largest cost a mixed page may charge one row
SOFT_FLOOR = 8        # soft news starts below this row, whatever it scores
SOFT_TOPICS = {"soft", "celebrity"}
POL_DROP = 0.6        # a row at this politics confidence or above leaves the list

SOURCES = [
    dict(name="HN", url="https://hnrss.org/frontpage", kind="feed",
         max=12, window=30, prominence="points", authority=1.0,
         home="https://news.ycombinator.com/"),
    dict(name="Reddit", url="https://www.reddit.com/r/worldnews+technology+news/.rss",
         kind="feed", max=12, window=30, prominence="position", authority=0.80,
         home="https://www.reddit.com/r/worldnews+technology+news/"),
    dict(name="SPIEGEL", url="https://www.spiegel.de/schlagzeilen/tops/index.rss",
         kind="feed", max=12, window=30, prominence="position", authority=0.95,
         home="https://www.spiegel.de/"),
    dict(name="The Verge", url="https://www.theverge.com/", kind="scrape",
         max=12, window=30, prominence="position", authority=0.85,
         rss="https://www.theverge.com/rss/index.xml",
         home="https://www.theverge.com/"),
    dict(name="Reuters",
         url="https://www.reuters.com/arc/outboundfeeds/news-sitemap/?outputType=xml",
         kind="sitemap", max=12, window=60, prominence="flat", authority=0.90,
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
RD_TARGET = re.compile(r'<span><a href="([^"]+)">\[link\]</a></span>')
HN_ITEM = re.compile(r'href="(https://news\.ycombinator\.com/item\?id=\d+)"')

# A source drops an item when the URL matches. Reuters mirrors its wire in
# other languages and fills the sitemap with machine-written game recaps.
DROP = {
    "Reuters": re.compile(
        r"reuters\.com/(sports|lifestyle|fr|es|pt|de|it|ar|ja|ko|zh|cn|br)/", re.I),
    "SPIEGEL": re.compile(
        r"spiegel\.de/(sport|fussball|services|gutscheine|partnerschaften)/", re.I),
    "The Verge": re.compile(r"theverge\.com/(deals|sponsored)/", re.I),
}
DROP_TITLE = re.compile(
    r"\b(liveblog|live-?ticker|live updates|newsblog|im liveticker)\b", re.I)

# The topic of a row. The first match wins. The user asked for world news,
# tech, science, and German news, so those carry a boost and soft news a cost.
TOPICS = [
    ("germany", re.compile(r"spiegel\.de/(politik/deutschland|wirtschaft)/"), 0.35),
    ("world", re.compile(r"reuters\.com/(world|legal)/|spiegel\.de/ausland/"
                         r"|reddit\.com/r/(worldnews|news)/"), 0.35),
    ("science", re.compile(r"(arxiv\.org|nature\.com|science\.org|\.edu/)"
                           r"|theverge\.com/science/"), 0.35),
    ("tech", re.compile(r"reddit\.com/r/technology/|theverge\.com/"
                        r"(tech|ai-artificial-intelligence|cyber-security)/"), 0.35),
    ("business", re.compile(r"reuters\.com/(business|markets|technology)/"), 0.35),
    ("celebrity", re.compile(r"spiegel\.de/panorama/leute/|/celebrity/"), -2.5),
    ("soft", re.compile(r"spiegel\.de/(familie|stil|reise|gesundheit|auto|panorama"
                        r"|kultur|literatur)/"
                        r"|theverge\.com/(entertainment|podcast|column|games"
                        r"|report/[^/]*(music|podcast))/"), -1.8),
]
TECH_WORDS = re.compile(
    r"\b(ai|llm|gpu|chip|linux|rust|python|kernel|compiler|database|browser"
    r"|open ?source|encryption|protocol|api|semiconductor|quantum)\b", re.I)
# A section name does not always mark soft news. The Verge files a music
# podcast under /report/, so the address itself gets a second look.
SOFT_SLUG = re.compile(
    r"/[^/]*(podcast|music|movie|film|tv-show|streaming-guide|trailer|recap"
    r"|best-deals|gift-guide|review-roundup|horoscope)[^/]*/?$", re.I)

# Party politics: an election, a parliament, a minister, a campaign. An act of
# government is not party politics. A court ruling, a chip export rule, and a
# privacy law stay on the page, because they are why a reader opens wire.
# A section cannot decide alone. SPIEGEL files a coalition crisis and a pension
# debate under one politik/ path, and Reddit files both under r/worldnews. So
# the score reads the section and the title, and returns a confidence.
POL_SECTION = re.compile(r"spiegel\.de/politik/", re.I)
# One of these words settles the row on its own. German builds a compound for
# each of them, thus no list of whole words can hold them: one live batch gave
# Parlamentswahl and Kremlpartei, and both scored zero against such a list. The
# two German rules read the stem and name the exceptions. "Auswahl" is a
# selection and "wahlweise" means optionally. Neither is a vote.
POL_STRONG = re.compile(
    r"\b(elections?|electoral|re-?elections?|ballots?|referendums?|primaries"
    r"|caucus|midterms?|runoffs?|impeach\w*|gerrymander\w*|no-confidence"
    r"|(?!aus|vor|an)\w*wahl(?!weise)\w*|\w*partei\w*|koalition\w*"
    r"|misstrauensvotum)\b", re.I)
# These words also fit plain government news, so one of them is not enough.
# "Lawmakers press a chip maker" must stay. "Lawmakers before the runoff" goes.
POL_WEAK = re.compile(
    r"\b(candidates?|incumbents?|constituency|senators?|governor|lawmakers?"
    r"|parliament\w*|coalition|cabinet|reshuffle|minister\w*|chancellor"
    r"|presidential|bundestag|bundesrat|landtag|kanzler\w*"
    r"|regierung\w*|abgeordnete\w*|fraktion\w*)\b", re.I)

# A name that the reader never wants to read. A match sets the confidence to 1,
# thus the row always leaves the list, whatever the story tells. This is a
# reader rule and not a measurement. It removes an act of government too, and
# that is the point of it. Keep it apart from POL_NAMES: a name here obeys no
# tier and no threshold, so the two lists must not hold the same name.
# The rule reads the headline and the address. It must not read the noun: a
# trump card is a card, and "security trumps speed" is a verb.
POL_ALWAYS = re.compile(r"\btrump(?:ism|ists?)?\b(?!\s+card)", re.I)

# The 24 politicians that the sources of wire name most. A name is a weak word
# on purpose. "Trump sanctions the court" is an act of government and stays.
# "Trump before the midterms" is a campaign and goes, because the name and the
# decisive word reach POL_DROP together. A name is also the one part of this
# file with a shelf life: review the list after an election. A surname that is
# also a common word, such as Tusk, costs little, because one weak word alone
# never drops a row.
# Each source spells a transliterated name its own way. SPIEGEL writes
# Selenskyj and Netanjahu, Reuters writes Zelenskiy and Netanyahu, so each
# spelling needs its own entry. An umlaut has the same problem: a German page
# writes Söder and a wire writes Soeder.
POL_NAMES = re.compile(
    r"\b(merz|weidel|klingbeil|s(?:ö|oe|o)der|pistorius|scholz"
    r"|vance|rubio|hegseth|newsom"
    r"|macron|starmer|meloni|leyen|orb(?:a|á)n|tusk|s(?:a|á)nchez"
    r"|putin|selenskyj|zelensk(?:y|iy|yy)|netan(?:j|y)ahu|modi|jinping"
    r"|erdo(?:g|ğ)an|milei)\b", re.I)

PUB_GOOD = re.compile(
    r"(^|\.)(reuters\.com|apnews\.com|bbc\.co\.uk|bbc\.com|ft\.com|economist\.com"
    r"|nature\.com|science\.org|arstechnica\.com|theverge\.com|spiegel\.de"
    r"|zeit\.de|faz\.net|github\.com|arxiv\.org|acm\.org|ieee\.org)$|\.(gov|edu)$",
    re.I)
PUB_POOR = re.compile(
    r"(^|\.)(msn\.com|dailymail\.co\.uk|the-sun\.com|nypost\.com|mirror\.co\.uk"
    r"|express\.co\.uk|dailystar\.co\.uk|newsweek\.com|zerohedge\.com)$", re.I)
CLICKBAIT = re.compile(
    r"^\d+\s+(things|ways|reasons|signs)\b|\b(you won'?t believe|here'?s why"
    r"|this is why|shocking|goes viral|slams|blasts|destroys)\b", re.I)

TRACKING = re.compile(
    r"^(utm_\w*|at_\w*|fbclid|gclid|mc_\w*|igshid|cmpid|ito|smid|icid"
    r"|ref|ref_src|referrer|share_id|taid)$", re.I)
STOP = set("""
the a an and or of to in on for with from by at as is are was were be been it
its this that these those has have had will would can could not new says say
said after over into out up down more most than then when what who how why
der die das und oder von zu in im auf fur mit aus bei ist sind war waren wird
werden hat haben nach uber ein eine einen einem einer des dem den als am um so
sich nicht auch noch schon nur wie was wer wo mehr gegen vor beim zum zur
""".split())

CSS = """
:root {
  --sky-50:  #f0f9ff;
  --sky-300: #7dd3fc;
  --sky-500: #0ea5e9;
  --sky-600: #0284c7;
  --sky-950: #082f49;
}
body { font-family: Verdana, Geneva, sans-serif; font-size: 10pt; color: var(--sky-600);
       background: #fff; margin: 0; padding: 0; }
td { font-family: Verdana, Geneva, sans-serif; font-size: 10pt; color: var(--sky-600); }
#hnmain { width: 85%; min-width: 796px; margin: 0 auto; background: var(--sky-50); }

a:link    { color: var(--sky-950); text-decoration: none; }
a:visited { color: var(--sky-600); text-decoration: none; }

.logo { width: 16px; height: 16px; border: 1px solid #fff; background: var(--sky-500);
        color: #fff; text-align: center;
        font: bold 12px/16px Verdana, Geneva, sans-serif; }
.pagetop { font-size: 10pt; color: var(--sky-950); line-height: 12px; }
.pagetop a:visited { color: var(--sky-950); }
.hnname { margin-left: 1px; margin-right: 5px; }

.title { font-size: 10pt; color: var(--sky-600); overflow: hidden; }
.title a { word-break: break-word; }

.subtext { font-size: 7pt; color: var(--sky-600); }
.subtext a:link, .subtext a:visited { color: var(--sky-600); }
.subtext a:hover { text-decoration: underline; }

.comhead { font-size: 8pt; color: var(--sky-600); }
.comhead a:link, .comhead a:visited { color: var(--sky-600); }
.comhead a:hover { text-decoration: underline; }

.yclinks { font-size: 8pt; color: var(--sky-600); }
.votearrow { width: 0; height: 0; margin: 3px 2px 6px;
             border-left: 5px solid transparent; border-right: 5px solid transparent;
             border-bottom: 9px solid var(--sky-300); }
.spacer { height: 5px; }
.badge { font-size: 7pt; margin-left: 5px; padding: 0 3px;
         border: 1px solid var(--sky-300); border-radius: 3px; }
.badge.rising { background: var(--sky-300); color: var(--sky-950); }
.corro { font-weight: bold; color: var(--sky-950); }

/* mobile device */
@media only screen and (min-width: 300px) and (max-width: 750px) {
  body { width: 100%; margin: 0; padding: 0; }
  td { height: inherit !important; }
  #hnmain { width: 100%; min-width: 0; }
  span.pagetop { display: block; margin: 3px 5px; font-size: 12px; line-height: normal; }
  span.pagetop b { display: block; font-size: 15px; }
  .title { font-size: 11pt; line-height: 14pt; }
  .subtext { font-size: 9pt; }
  .votearrow { transform: scale(1.3, 1.3); margin-right: 6px; }
  .votelinks { min-width: 18px; }
}
"""

SKY_500 = "#0ea5e9"
SKY_50 = "#f0f9ff"

ICONS = (
    Link(rel="icon", type="image/svg+xml", href="/favicon.svg"),
    Link(rel="icon", type="image/png", sizes="192x192", href="/icon-192.png"),
    Link(rel="apple-touch-icon", sizes="180x180", href="/apple-touch-icon.png"),
    Link(rel="manifest", href="/manifest.webmanifest"),
    Meta(name="theme-color", content=SKY_500),
    Meta(name="apple-mobile-web-app-capable", content="yes"),
    Meta(name="apple-mobile-web-app-status-bar-style", content="default"),
    Meta(name="apple-mobile-web-app-title", content="wire"),
)

MANIFEST = {
    "name": "wire",
    "short_name": "wire",
    "description": "A minimal, read-only news reader with Hacker News' design.",
    "start_url": "/",
    "scope": "/",
    "display": "standalone",
    "background_color": SKY_50,
    "theme_color": SKY_500,
    "icons": [
        {"src": "/icon-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"},
        {"src": "/maskable-512.png", "sizes": "512x512", "type": "image/png",
         "purpose": "maskable"},
    ],
}


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


# A static build serves one page for many minutes, so the browser counts the
# age again. The rule is the rule of age().
AGES = """
function wireAges() {
  var now = Date.now() / 1000;
  document.querySelectorAll(".age[data-ts]").forEach(function (e) {
    var d = Math.max(0, now - e.dataset.ts), t = "just now";
    [[86400, "d"], [3600, "h"], [60, "m"]].some(function (s) {
      if (d >= s[0]) { t = Math.floor(d / s[0]) + s[1] + " ago"; return true; }
    });
    e.textContent = t;
  });
}
wireAges();
setInterval(wireAges, 60000);
"""


def canonical(url):
    """One address for one article, so two sources can match."""
    try:
        s = urlsplit(url.strip())
    except ValueError:
        return url.strip().lower()
    host = (s.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    if host.startswith("m."):
        host = host[2:]
    if host.endswith(".amp"):
        host = host[:-4]
    path = re.sub(r"/amp/?$", "", s.path).rstrip("/") or "/"
    query = urlencode([(k, v) for k, v in parse_qsl(s.query)
                       if not TRACKING.match(k)])
    return urlunsplit(("https", host, path, query, ""))


def publisher(url):
    host = (urlsplit(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def story(title, url, source, published, **kw):
    """One row before ranking. `url` is where the reader goes. `origin` is the
    address on the source itself, which carries the section and the subreddit."""
    url = url.strip()
    return dict(title=html.unescape(title.strip()), url=url, source=source,
                published=published, key=canonical(url), publisher=publisher(url),
                origin=kw.get("origin", url),
                points=kw.get("points"), comments=kw.get("comments"),
                discuss=kw.get("discuss"), pos=kw.get("pos", 0), n=kw.get("n", 1))


def parse_feed(body, name):
    feed = feedparser.parse(body)
    stories, n = [], len(feed.entries)
    for pos, e in enumerate(feed.entries):
        raw = e.get("description", "") or e.get("summary", "")
        content = (e.get("content") or [{}])[0].get("value", "") or raw
        parsed = e.get("published_parsed") or e.get("updated_parsed")
        published = epoch(datetime(*parsed[:6], tzinfo=timezone.utc)) if parsed else time.time()
        points = POINTS.search(raw)
        comments = COMMENTS.search(raw)
        title = e.get("title", "").strip()
        url = (e.get("link") or "").strip()
        if not (title and url):
            continue
        # Reddit and HN point at an article somewhere else. That address is
        # what matches the same story on another source.
        target, discuss = None, None
        if name == "Reddit":
            hit = RD_TARGET.search(content)
            target, discuss = (hit.group(1) if hit else None), url
        elif name == "HN":
            hit = HN_ITEM.search(raw)
            target, discuss = url, (hit.group(1) if hit else None)
        stories.append(story(
            title, target or url, name, published, origin=url, discuss=discuss,
            points=int(points.group(1)) if points else None,
            comments=int(comments.group(1)) if comments else None, pos=pos, n=n))
    return stories


def parse_sitemap(body, name):
    blocks = URL_BLOCK.findall(body)
    stories = []
    for pos, block in enumerate(blocks):
        loc = LOC.search(block)
        title = NEWS_TITLE.search(block)
        date = NEWS_DATE.search(block)
        if not (loc and title):
            continue
        stories.append(story(
            title.group(1), loc.group(1), name,
            parse_date(date.group(1)) if date else time.time(),
            pos=pos, n=len(blocks)))
    return stories


def keep(s):
    """False for an item that must not reach the list at all."""
    rule = DROP.get(s["source"])
    if rule and rule.search(s["origin"]):
        return False
    if DROP_TITLE.search(s["title"]):
        return False
    return (time.time() - s["published"]) / 3600 <= MAX_AGE


def parse_homepage(body, name, rss_body):
    by_url = {}
    for item in parse_feed(rss_body, name):
        by_url.setdefault(item["url"].rstrip("/"), item)
    ordered, seen = [], set()
    for url in VERGE_ARTICLE.findall(body):
        url = url.rstrip("/")
        if url in seen or url not in by_url:
            continue
        seen.add(url)
        ordered.append(by_url[url])
    # The homepage order replaces the feed order for the standing signal.
    for pos, item in enumerate(ordered):
        item.update(pos=pos, n=len(ordered))
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
        # Read a wide window, drop what the source must not contribute, and
        # cap after that. A cap before the filter empties a noisy source.
        items = [i for i in items[:src["window"]] if keep(i)]
        return src["name"], items[:src["max"]], None
    except Exception as e:
        return src["name"], [], f"{type(e).__name__}: {e}"


_cache = {"at": 0.0, "wall": "", "stories": [], "errors": []}
# What wire saw on the last refresh, so it can tell a gain from a level. It
# holds public counts for stories, never anything about a reader. It is a dict
# in memory: a restart empties it.
_seen = {}
_boot = True

AUTHORITY = {s["name"]: s["authority"] for s in SOURCES}
PROM_MODE = {s["name"]: s["prominence"] for s in SOURCES}


def prominence(s):
    """How high the item stands inside its own source, from 0 to 1."""
    mode = PROM_MODE[s["source"]]
    if mode == "points":
        return min(1.0, (max(0, s["points"] or 0) / 200) ** 0.6)
    if mode == "position":
        return 1.0 - 0.7 * (s["pos"] / max(1, s["n"] - 1))
    # A wire in publication order. No editor chose a top item, so no item may
    # claim one. A story that matters here reaches the top by agreement.
    return 0.32


def tokens(title):
    words = re.sub(r"[^\w\s]", " ", title.lower()).split()
    return {w for w in words if len(w) > 2 and w not in STOP}


def idf(docs):
    """Weight for each word: rare in this batch means heavy. Every word keeps
    a weight of 1, because in a small batch a shared word appears in every
    document and a pure count would then call it worthless."""
    n = len(docs) or 1
    df = {}
    for d in docs:
        for t in d:
            df[t] = df.get(t, 0) + 1
    return {t: 1.0 + math.log(n / c) for t, c in df.items()}


SIM_MIN = 0.25       # shared rare-word mass needed to call it one story
PAIR_WINDOW = 6 * 3600  # two shared words also need the same news cycle


def similar(a, b, weight):
    """Shared weight over the smaller title. A word that is rare in this batch
    counts most, so a shared name beats a shared common word."""
    shared = a & b
    if len(shared) < 2:
        return 0.0
    mass = sum(weight.get(t, 1.0) for t in shared)
    floor = min(sum(weight.get(t, 1.0) for t in a),
                sum(weight.get(t, 1.0) for t in b)) or 1.0
    return mass / floor


def same_story(a, b, ta, tb, weight):
    """Three shared rare words are enough on their own. Two are ambiguous:
    'Donald Trump' alone joins two unrelated reports, so those also need a
    close publication time."""
    shared = len(a & b)
    if shared < 2 or similar(a, b, weight) < SIM_MIN:
        return False
    return shared >= 3 or abs(ta - tb) <= PAIR_WINDOW


def cluster(stories):
    """Group the items that tell the same story. Two items join on the same
    article address, or on an overlap of rare title words."""
    groups = []
    by_key = {}
    for s in stories:
        if s["key"] in by_key:
            by_key[s["key"]].append(s)
        else:
            by_key[s["key"]] = [s]
            groups.append(by_key[s["key"]])
    bags = [tokens(g[0]["title"]) for g in groups]
    when = [min(s["published"] for s in g) for g in groups]
    weight = idf(bags)
    merged, out = set(), []
    for i, g in enumerate(groups):
        if i in merged:
            continue
        members, bag, at = list(g), set(bags[i]), when[i]
        for j in range(i + 1, len(groups)):
            if j in merged or not same_story(bag, bags[j], at, when[j], weight):
                continue
            merged.add(j)
            members += groups[j]
            bag |= bags[j]
        out.append(members)
    return [summarise(m) for m in out]


def summarise(members):
    """One row from the items that tell the same story. The item with the
    highest standing gives the headline and the link."""
    best = max(members, key=lambda s: prominence(s) * AUTHORITY[s["source"]])
    sources = list(dict.fromkeys(s["source"] for s in members))
    return dict(
        title=best["title"], url=best["url"], publisher=best["publisher"],
        origin=best["origin"], source=best["source"], sources=sources,
        members=members, published=min(s["published"] for s in members),
        points=max((s["points"] or 0) for s in members) or None,
        comments=max((s["comments"] or 0) for s in members) or None,
        # The lowest address, not the address of the best item. The best item
        # changes when the counts move, and the row would then lose its
        # history and claim to be new again.
        key=min(s["key"] for s in members),
        prom=max(prominence(s) * AUTHORITY[s["source"]] for s in members))


def topic(c):
    text = c["origin"] + " " + c["url"]
    for name, rule, w in TOPICS:
        if rule.search(text):
            return name, w
    if SOFT_SLUG.search(text):
        return "soft", -1.8
    if TECH_WORDS.search(c["title"]):
        return "tech", 0.35
    # The HN front page is already a tech and science filter, so an item that
    # matches no section rule still belongs to that side of the list.
    if "HN" in c["sources"]:
        return "tech", 0.35
    return "other", 0.0


def political(c):
    """How sure wire is that the row is party politics, from 0 to 1. The
    section gives 0.4, one decisive word gives 0.6, and each weak word gives
    0.25. A weak word is a word that also fits plain government news, or the
    name of a politician. A row at POL_DROP or above leaves the list. A row
    below it stays and pays W_POL for the part it scores. A name in
    POL_ALWAYS skips the count and takes the row off the page."""
    if POL_ALWAYS.search(c["title"] + " " + c["url"]):
        return 1.0
    pol = 0.4 if POL_SECTION.search(c["origin"] + " " + c["url"]) else 0.0
    if POL_STRONG.search(c["title"]):
        pol += 0.6
    weak = {w.lower() for w in POL_WEAK.findall(c["title"])}
    weak |= {n.lower() for n in POL_NAMES.findall(c["title"])}
    pol += 0.25 * len(weak)
    return min(1.0, pol)


def observe(c):
    """Compare the row with the last refresh. Returns the gain and two marks."""
    now = time.time()
    prev = _seen.get(c["key"])
    signal = (c["points"] or 0) + 2 * (c["comments"] or 0) + 40 * c["prom"]
    fresh, rising = False, False
    vel = 0.0
    if prev is None:
        fresh = not _boot
        _seen[c["key"]] = dict(first=now, at=now, signal=signal)
    else:
        hours = max(TTL / 3600.0, (now - prev["at"]) / 3600.0)
        vel = max(0.0, (signal - prev["signal"]) / hours)
        rising = vel >= 25.0
        fresh = not _boot and (now - prev["first"]) < 2 * TTL
        prev.update(at=now, signal=signal)
    c["first_seen"] = _seen[c["key"]]["first"]
    return min(1.0, vel / 120.0), fresh, rising


def prune():
    cut = time.time() - 86400
    for k in [k for k, v in _seen.items() if v["at"] < cut]:
        del _seen[k]
    if len(_seen) > 5000:
        for k in sorted(_seen, key=lambda k: _seen[k]["at"])[:len(_seen) - 5000]:
            del _seen[k]


def load_seen(path):
    """Read the counts of the last build. Each build is a new process."""
    global _boot
    try:
        with open(path) as f:
            _seen.update(json.load(f))
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    prune()
    # With no count to compare, every row would qualify as new.
    _boot = not _seen


def save_seen(path):
    with open(path, "w") as f:
        json.dump(_seen, f)


def score(c):
    """The value of one row, in bits. Every term is a sum, so the page can
    explain itself: standing, agreement, gain, topic, publisher, minus age."""
    vel, fresh, rising = observe(c)
    name, tw = topic(c)
    pol = political(c)
    pub = 0.45 if PUB_GOOD.search(c["publisher"]) else \
        -0.8 if PUB_POOR.search(c["publisher"]) else 0.0
    if CLICKBAIT.search(c["title"]):
        pub -= 0.8
    hours = max(0.0, time.time() - c["published"]) / 3600
    c.update(topic=name, new=fresh, rising=rising, vel=vel, pol=pol)
    return (W_PROM * c["prom"]
            + W_CORR * math.log2(1 + len(c["sources"]))
            + W_VEL * vel
            + W_TOPIC * tw
            + W_PUB * pub
            - W_POL * pol
            - GRAVITY * math.log2(hours + AGE_FLOOR))


def select(clusters, n):
    """Take the best row, then make the next row of the same source or topic
    cost more. The page stays mixed instead of one source in a block. A row
    that reads as party politics does not reach the page at all."""
    # The drop sits here and not in keep(). keep() reads one item, and all five
    # sources carry politics, thus a drop there removes one copy and cluster()
    # then builds the same row again from the other four.
    pool = sorted((c for c in clusters if c["pol"] < POL_DROP),
                  key=lambda c: c["score"], reverse=True)
    picked, used_src, used_top = [], {}, {}
    while pool and len(picked) < n:
        # Culture and celebrity stay off the head of the page. They keep their
        # place further down, where they cost the reader nothing.
        hold = len(picked) < SOFT_FLOOR
        room = [i for i, c in enumerate(pool)
                if not (hold and c["topic"] in SOFT_TOPICS)]
        if not room:                      # only soft rows are left
            room = range(len(pool))
        best, best_at, best_adj = None, 0, None
        for i in room:
            c = pool[i]
            # The cost grows with each repeat but levels off, and it stops at
            # MAX_SPREAD. A mixed page is worth a small loss of quality, never
            # a large one, so a weak row cannot climb over a much better row.
            spread = (SOURCE_SPREAD * math.log2(1 + used_src.get(c["source"], 0))
                      + TOPIC_SPREAD * math.log2(1 + used_top.get(c["topic"], 0)))
            adj = c["score"] - min(MAX_SPREAD, spread)
            if best is None or adj > best_adj:
                best, best_at, best_adj = c, i, adj
        pool.pop(best_at)
        used_src[best["source"]] = used_src.get(best["source"], 0) + 1
        used_top[best["topic"]] = used_top.get(best["topic"], 0) + 1
        picked.append(best)
    return picked


async def load(force=False):
    global _boot
    now = time.monotonic()
    if not force and _cache["stories"] and now - _cache["at"] < TTL:
        return _cache["stories"], _cache["errors"]
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(*(fetch_one(client, s) for s in SOURCES))
    stories, errors = [], []
    for name, items, err in results:
        stories += items
        if err:
            errors.append(f"{name} ({err})")
    clusters = cluster(stories)
    for c in clusters:
        c["score"] = score(c)
    _boot = False
    prune()
    ranked = select(clusters, SHOWN)
    for rank, c in enumerate(ranked, 1):
        c["rank"] = rank
    _cache.update(at=now, wall=datetime.now().strftime("%H:%M"),
                  stories=ranked, errors=errors)
    return ranked, errors


HOMES = {s["name"]: s["home"] for s in SOURCES}


def subline(c):
    bits = []
    if len(c["sources"]) > 1:
        bits += [Span(f"{len(c['sources'])} sources", cls="corro"), " "]
    if c["points"] is not None:
        bits += [Span(f"{c['points']} points", cls="score"), " "]
    bits += ["by ", A(c["source"], href=HOMES[c["source"]], cls="hnuser"), " ",
             Span(age(c["published"]), cls="age", data_ts=int(c["published"]))]
    if c["comments"] is not None:
        bits += [" | ", f"{c['comments']} comments"]
    # Every source that carried the story, so the reader can compare accounts.
    for m in c["members"]:
        link = m["discuss"] or m["url"]
        if link != c["url"] or m["source"] != c["source"]:
            bits += [" | ", A(m["source"].lower(), href=link)]
    return bits


def story_row(c):
    # A gain says more than an arrival, so one mark is enough.
    marks = []
    if c["rising"]:
        marks.append(Span("rising", cls="badge rising"))
    elif c["new"]:
        marks.append(Span("new", cls="badge"))
    return (
        Tr(
            Td(Span(f"{c['rank']}.", cls="rank"), align="right", valign="top",
               cls="title"),
            Td(Div(cls="votearrow"), valign="top", cls="votelinks",
               style="text-align:center"),
            Td(
                Span(
                    A(c["title"], href=c["url"]),
                    Span(" (", A(Span(c["publisher"], cls="sitestr"),
                                 href=c["url"]), ")", cls="sitebit comhead"),
                    *marks,
                    cls="titleline",
                ),
                cls="title", valign="top",
            ),
            cls="athing",
        ),
        Tr(Td(colspan="2"), Td(Span(*subline(c), cls="subline"), cls="subtext")),
        Tr(cls="spacer", style="height:5px"),
    )


app, rt = fast_app(title="wire", hdrs=(Style(CSS), *ICONS),
                   static_path="static", pico=False, surreal=False, htmx=False,
                   canonical=False)


@rt("/manifest.webmanifest")
def manifest():
    return Response(json.dumps(MANIFEST), media_type="application/manifest+json")


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
                Td(Span(B(A("wire", href="/"), cls="hnname"), *nav(),
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
    return (Table(header, pagespace, status, body, footer,
                  id="hnmain", cellspacing="0", cellpadding="0", border="0"),
            Script(AGES))


def build(out, seen=SEEN):
    """Write the page as static files, for a host that runs no Python."""
    load_seen(seen)
    with TestClient(app) as client:
        page = client.get("/")
        manifest = client.get("/manifest.webmanifest")
    page.raise_for_status()
    manifest.raise_for_status()
    # With no row, the host keeps the last page and not an empty one.
    if not _cache["stories"]:
        raise SystemExit("no stories: " + "; ".join(_cache["errors"]))
    shutil.copytree("static", out, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns(".*"))
    with open(os.path.join(out, "index.html"), "w") as f:
        f.write(page.text)
    with open(os.path.join(out, "manifest.webmanifest"), "w") as f:
        f.write(manifest.text)
    save_seen(seen)
    # One line for the log of the scheduler.
    print(f"{len(_cache['stories'])} rows; unavailable: "
          + ("; ".join(_cache["errors"]) or "none"))


if __name__ == "__main__":
    if sys.argv[1:2] == ["build"]:
        build(sys.argv[2] if len(sys.argv) > 2 else "dist")
    else:
        serve(host=HOST, port=PORT, reload=RELOAD)
