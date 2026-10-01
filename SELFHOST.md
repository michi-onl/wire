# Self-hosting wire

wire is a Cloudflare Worker. It uses TypeScript, Hono, and wrangler.

## Run

```sh
npm ci
npx wrangler dev
```

Open <http://localhost:8787>. `wrangler dev` runs the Worker in workerd, the
runtime of Cloudflare, on your computer. It needs no Cloudflare account.

## Settings

| Variable             | Default | Effect                            |
| -------------------- | ------- | --------------------------------- |
| `WIRE_ALLOW_REFRESH` | `0`     | Set to `1` to allow `/?refresh=1` |

`wrangler.jsonc` sets the variable under `vars`. For a local test, use
`npx wrangler dev --var WIRE_ALLOW_REFRESH:1`.

`/?refresh=1` bypasses the five-minute cache. It forces one upstream request
for each source. The function can amplify traffic, so wire disables it by
default and hides the refresh link until you set the variable.

## Sources

| Source      | Endpoint                                                     | Kind    | Prominence |
| ----------- | ------------------------------------------------------------ | ------- | ---------- |
| Hacker News | `hnrss.org/frontpage`                                        | feed    | points     |
| Reddit      | `reddit.com/r/worldnews+technology+news/.rss`                | feed    | position   |
| SPIEGEL     | `spiegel.de/schlagzeilen/tops/index.rss`                     | feed    | position   |
| The Verge   | `theverge.com/rss/index.xml`                                 | feed    | position   |
| Reuters     | `reuters.com/arc/outboundfeeds/news-sitemap/?outputType=xml` | sitemap | flat       |

Reddit rate-limits its feed. wire retries it after a 429 and waits for the
time in `x-ratelimit-reset`. If Reddit asks for more than 10 seconds, wire
does not wait, and the source fails for this refresh.

Each source has a `window` and a `max`. wire reads `window` items, drops what
`DROP` rejects, and keeps `max` of the rest. The order matters: a cap before
the filter empties a noisy source. The Reuters sitemap holds about 50 items
and 30 of them are machine-written game recaps, so its window is 60.

The Verge feed holds about 10 items, in order of time. The homepage of The
Verge has an editor order, but it is 1 MB of HTML, and a Worker cannot read
it within its CPU limit.

## The code

| File               | Content                                                       |
| ------------------ | ------------------------------------------------------------- |
| `src/index.tsx`    | The Worker: the routes, the fetch, and the cache              |
| `src/rank.ts`      | The sources, the rules, and the ranking                       |
| `src/parse.ts`     | The reader for RSS, Atom, and the Reuters sitemap             |
| `src/build.ts`     | The path from the bodies of the sources to the rows           |
| `src/page.tsx`     | The page, the CSS, and the webapp manifest, in Hono JSX       |
| `src/warm.ts`      | One run of the full path on a tiny batch, before the first request |
| `static/`          | The icons and the userscript. Cloudflare serves them as files |

## Ranking

`build()` gets the sources, `cluster()` joins the items that tell one story,
`score()` values each row, and `select()` puts the rows in order.

### The score

`score()` returns a number of bits. Every part is a sum, so you can read one
weight as "how many hours of age it cancels".

| Part          | Weight   | Source of the value                              |
| ------------- | -------- | ------------------------------------------------- |
| Prominence    | `W_PROM` | `prominence()` × the `authority` of the source    |
| Agreement     | `W_CORR` | `log2(1 + sources on the story)`                  |
| Topic         | `W_TOPIC`| the `TOPICS` table                                |
| Publisher     | `W_PUB`  | `PUB_GOOD`, `PUB_POOR`, and `CLICKBAIT`           |
| Politics      | `W_POL`  | `political()`                                     |
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

Reddit and HN link to an article somewhere else. `parseFeed()` reads that
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

`select()` drops a row of party politics. `political()` gives the confidence.

### What wire remembers

Nothing between two refreshes. wire keeps the last page for five minutes, in
the memory of the Worker and in the Cache API of the data center. After five
minutes, the next reader gets the old page at once, and the Worker builds a
new page after the answer. After one hour, wire builds the page before it
answers. wire keeps no count, no history, and nothing about a reader.

## CPU

The free plan of Cloudflare Workers gives 10 ms of CPU to each request. A
network wait does not count. Parsing, ranking, and rendering count. A refresh
runs at most once in five minutes, so it usually runs in a new Worker, where
V8 compiles each function and each regex on the first call.

`bench/` measures the path in Node, over bodies that you save from the live
sources into `bench/bodies/`. Git ignores that directory.

```sh
npx tsx bench/bench.ts            # warm: the median of 200 runs
npx tsx bench/bench.ts --cold     # one run in a new process
npx tsx bench/warmup.ts           # one run after src/warm.ts, as in a new Worker
npx tsx bench/curve.ts            # refresh 1 to 12 in one process
```

On a laptop, a refresh after the warm-up costs about 7 ms, and a warm refresh
costs about 4 ms. Inside a Worker, `performance.now()` does not advance during
CPU work, so the only real value is the CPU time metric in the Cloudflare
dashboard.

## Sources not included

ARTE has no feed, and its internal API gives a 404. The Wider Image redirects
to a Reuters page that gives a 401. YouTube subscriptions need per-channel IDs
or login cookies.

## Deploy

Cloudflare builds and deploys wire from the GitHub repository. A push to
`main` deploys. A push to another branch uploads a preview version.

| Setting                          | Value                       |
| -------------------------------- | --------------------------- |
| Build command                    | empty                       |
| Deploy command                   | `npx wrangler deploy`       |
| Non-production deploy command    | `npx wrangler versions upload` |
| Root directory                   | `/`                         |

The name of the Worker must be `wire`, the `name` in `wrangler.jsonc`.

The Cache API does not work on a `workers.dev` address. There, only the memory
of the Worker holds the page. Use a custom domain.

## Test

```sh
npm test
npm run check
curl -sS http://127.0.0.1:8787/patreon.user.js
```

`npm test` runs the ranking tests and the mock check-in test. No test makes a
network request. The ranking tests cover the address cleaner, the filters,
the clustering rules, the order, the Unicode word rules, and the reader.

The mock check-in test mocks `/api/current_user` and `/api/posts`, tests the
caps and the account gate, and sends no request to patreon.com.

`npm run check` checks the types and the syntax of the userscript. The `curl`
command needs `npx wrangler dev`. Cloudflare serves the file from `static/`.

A live test needs Firefox with Tampermonkey. Chromium browsers need a script
manager. Install the script from `http://127.0.0.1:8787/patreon.user.js`. Keep
the browser profile outside the repository.
