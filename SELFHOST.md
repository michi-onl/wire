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

| Source      | Endpoint                                                     | Kind    | Quality mode |
| ----------- | ------------------------------------------------------------ | ------- | ------------ |
| Hacker News | `hnrss.org/frontpage`                                        | feed    | points       |
| Reddit      | `reddit.com/r/worldnews+technology+news/.rss`                | feed    | position     |
| SPIEGEL     | `spiegel.de/schlagzeilen/tops/index.rss`                     | feed    | position     |
| The Verge   | `theverge.com/` homepage + `theverge.com/rss/index.xml`      | scrape  | position     |
| Reuters     | `reuters.com/arc/outboundfeeds/news-sitemap/?outputType=xml` | sitemap | none         |

Reddit rate-limits its feed. wire retries it.

## Ranking

`hot_score()` is `(quality + 1) / (age_hours + 2) ** GRAVITY`. A popular and
fresh story ranks highest. An old story goes down the list. `GRAVITY` controls
the speed.

`assign_quality()` makes a quality value from 0 to 1 for each story. For HN,
it compares the points to the batch maximum. For Reddit, SPIEGEL, and The
Verge, it uses the feed position or the homepage position. Reuters has no
popularity count, and a failed source has none, so both get a neutral 0.5.

## Sources not included

ARTE has no feed, and its internal API gives a 404. The Wider Image redirects
to a Reuters page that gives a 401. YouTube subscriptions need per-channel IDs
or login cookies.

## Deploy

wire runs on a Proxmox container. The steps and the addresses are in
`DEPLOY.local.md`. Git ignores that file.

## Verify the userscript

```sh
node --check static/patreon.user.js
curl -sS http://127.0.0.1:5001/patreon.user.js
```

A live test needs Firefox with Tampermonkey. Chromium browsers need a script
manager. Install the script from `http://127.0.0.1:5001/patreon.user.js`. Keep
the browser profile outside the repository.
