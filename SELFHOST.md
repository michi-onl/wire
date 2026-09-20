# Self-hosting wire

## Run

```sh
python3.13 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py
```

Open <http://localhost:5001>.

## Settings

| Variable            | Default     | Effect                                               |
| ------------------- | ----------- | ---------------------------------------------------- |
| `WIRE_HOST`         | `127.0.0.1` | Set to `0.0.0.0` to expose the server on the network |
| `WIRE_PORT`         | `5001`      | Changes the port                                     |
| `WIRE_ALLOW_REFRESH`| `0`         | Set to `1` to allow `/?refresh=1`                    |
| `WIRE_RELOAD`       | `0`         | Set to `1` to enable the dev reloader (watchfiles)   |

`/?refresh=1` bypasses the five-minute cache. It forces one upstream request
for each source. The function can amplify traffic, so wire disables it by
default and hides the refresh link until you set the variable.

## Sources

| Source      | Endpoint                                                     | Kind    | Prominence |
| ----------- | ------------------------------------------------------------ | ------- | ---------- |
| Hacker News | `hnrss.org/frontpage`                                        | feed    | points     |
| Reddit      | `reddit.com/r/worldnews+technology+news/.rss`                | feed    | position   |
| SPIEGEL     | `spiegel.de/schlagzeilen/tops/index.rss`                     | feed    | position   |
| The Verge   | `theverge.com/` homepage + `theverge.com/rss/index.xml`      | scrape  | position   |
| Reuters     | `reuters.com/arc/outboundfeeds/news-sitemap/?outputType=xml` | sitemap | flat       |

Reddit rate-limits its feed. wire retries it.

Each source has a `window` and a `max`. wire reads `window` items, drops what
`DROP` rejects, and keeps `max` of the rest. The order matters: a cap before
the filter empties a noisy source. The Reuters sitemap holds about 50 items
and 30 of them are machine-written game recaps, so its window is 60.

## Ranking

`load()` gets the sources, `cluster()` joins the items that tell one story,
`score()` values each row, and `select()` puts the rows in order.

### The score

`score()` returns a number of bits. Every part is a sum, so you can read one
weight as "how many hours of age it cancels".

| Part          | Weight   | Source of the value                              |
| ------------- | -------- | ------------------------------------------------- |
| Prominence    | `W_PROM` | `prominence()` × the `authority` of the source    |
| Agreement     | `W_CORR` | `log2(1 + sources on the story)`                  |
| Gain          | `W_VEL`  | the rise in points and comments since the last run |
| Topic         | `W_TOPIC`| the `TOPICS` table                                |
| Publisher     | `W_PUB`  | `PUB_GOOD`, `PUB_POOR`, and `CLICKBAIT`           |
| Age           | `GRAVITY`| `- GRAVITY * log2(age_hours + AGE_FLOOR)`         |

`AGE_FLOOR` is 4 hours. A wire republishes an item and its clock restarts, so
a low floor puts every trivial five-minute item at the top. With the floor,
agreement from a second source outweighs about three hours of age.

`prominence()` gives 0 to 1 for the standing of an item on its own front page.
HN uses the points. Reddit, SPIEGEL, and The Verge use the position. Reuters
publishes in time order, so no editor ranked it and every item gets a flat
0.32.

### Clustering

`cluster()` joins two items when they share one article address, or when their
titles share enough rare words. `idf()` weights a word by how rare it is in
the batch, and adds 1 so a small batch still works. Two items join when
`similar()` reaches `SIM_MIN` and they share three words, or share two words
inside `PAIR_WINDOW`. The second rule stops "Donald Trump" alone from joining
two unrelated reports. A shared name that survives translation, such as a
place, joins a German and an English report of one event. A German compound
does not, so wire misses some cross-language pairs.

Reddit and HN link to an article somewhere else. `parse_feed()` reads that
address, so a Reddit post and a Reuters article about one story become one
row, and the row names the real publisher.

### The order

`select()` takes the best row, then makes the next row of the same source or
the same topic cost more. `SOURCE_SPREAD` and `TOPIC_SPREAD` set the cost, and
it stops at `MAX_SPREAD`, so a weak row cannot climb over a much better one.
A row in `SOFT_TOPICS` starts below `SOFT_FLOOR`.

### Filters

`keep()` drops an item before it reaches the list. It drops the `DROP` pattern
of its source, a live blog, and anything older than `MAX_AGE`. This removes
Reuters sport and its translated wires, SPIEGEL sport, and an evergreen
service page that a top list sometimes holds.

### What wire remembers

`_seen` is a dict in memory. It holds the last point count and comment count
for each story address, so `observe()` can tell a gain from a level and mark a
row `rising` or `new`. It holds nothing about a reader. `prune()` drops an
entry after 24 hours and caps the dict at 5000 entries. A restart empties it,
and the first load after a restart marks no row `new`.

## Sources not included

ARTE has no feed, and its internal API gives a 404. The Wider Image redirects
to a Reuters page that gives a 401. YouTube subscriptions need per-channel IDs
or login cookies.

## Deploy

wire runs on a Proxmox container. The steps and the addresses are in
`DEPLOY.local.md`. Git ignores that file.

## Verify the userscript

```sh
.venv/bin/python -m unittest discover -s test -p 'test_*.py'
node --check static/patreon.user.js
node --test test/
curl -sS http://127.0.0.1:5001/patreon.user.js
```

The first command tests the ranking. It makes no network request. It covers
the address cleaner, the filters, the clustering rules, the order, and the
marks.

`node --test test/` is the mock check-in test. It mocks `/api/current_user` and
`/api/posts`, tests the caps and the account gate, and sends no request to
patreon.com.

A live test needs Firefox with Tampermonkey. Chromium browsers need a script
manager. Install the script from `http://127.0.0.1:5001/patreon.user.js`. Keep
the browser profile outside the repository.
