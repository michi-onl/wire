# wire

A minimal, read-only news reader with Hacker News' design, recoloured with
Tailwind's sky palette. It merges the top stories from a handful of sources
into one ranked list.

No database, no profiles, no upvotes, no comments. Stories are fetched live,
cached in memory for 5 minutes, and thrown away on restart.

## Sources

| Source | Endpoint | Notes |
|---|---|---|
| Hacker News | `hnrss.org/frontpage` | Includes points and comment counts |
| Reddit | `reddit.com/r/worldnews+technology+news/.rss` | Rate-limited; retried automatically |
| SPIEGEL | `spiegel.de/schlagzeilen/index.rss` | German |
| The Verge | `theverge.com/rss/index.xml` | Atom |
| Reuters | `reuters.com/arc/outboundfeeds/news-sitemap/?outputType=xml` | Title/URL/date only, no summary |

Not included: ARTE (no feed on any path; its internal API 404s) and
The Wider Image (redirects to a Reuters page that returns 401). YouTube
subscriptions also need per-channel IDs or login cookies.

## Run

```sh
python3.13 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py
```

Open <http://localhost:5001>.

The server binds to `127.0.0.1` by default. Set `WIRE_HOST=0.0.0.0` to expose
it on the network, and `WIRE_PORT` to change the port.

`/?refresh=1` bypasses the 5-minute cache, which forces one upstream request
per source. It is disabled by default to avoid being used as an amplification
vector; set `WIRE_ALLOW_REFRESH=1` to re-enable it (and hide the refresh link
until then).

If a source fails, the page still renders the rest and shows an
`unavailable: …` line at the top.

## Design

- `SOURCES` — one entry per feed, with a `kind` of `feed` (RSS/Atom) or `sitemap`.
- `fetch_one()` — fetches and parses one source; failures are contained per source.
- `load()` — gathers all sources, caps each at 10 items, sorts by publish date, ranks.
- `_cache` — a dict and a monotonic timestamp. That is the entire persistence layer.
- `@rt("/")` — renders the HN table: sky-500 header bar, sky-50 body, 85% width.
- `CSS` — the HN stylesheet with the palette swapped, one `:root` variable per
  sky shade: `--sky-500` bar and footer rule, `--sky-50` page, `--sky-950`
  titles and header text, `--sky-600` muted meta, `--sky-300` vote arrow.
  Pico is disabled in `fast_app()`; nothing else styles the page.
