# wire

## About

wire is a small news reader. It reads news stories. It does not change the
stories. The design of wire comes from Hacker News. The colors of wire come
from the Tailwind sky palette.

wire collects the top stories from a group of sources. It makes one list. A
score puts the list in order. The score uses popularity and age.

wire has no database. It has no profiles. It has no votes. It has no comments.
wire gets the stories live. It keeps the stories in memory for 5 minutes. It
deletes the stories when it stops.

## Sources

| Source      | Endpoint                                                     | Notes                                                   |
| ----------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| Hacker News | `hnrss.org/frontpage`                                        | Ranked by points and comments                           |
| Reddit      | `reddit.com/r/worldnews+technology+news/.rss`                | Hot order. Rate-limited. wire tries again automatically |
| SPIEGEL     | `spiegel.de/schlagzeilen/tops/index.rss`                     | German. Editorial top list                              |
| The Verge   | `theverge.com/` homepage + `theverge.com/rss/index.xml`      | Homepage order. Joined to the feed for title and date   |
| Reuters     | `reuters.com/arc/outboundfeeds/news-sitemap/?outputType=xml` | Title, URL, and date only. No popularity signal         |

Some sources have no popularity count. These sources are Reuters and any source
that fails. These sources get a neutral score. Only their age moves them up the
list.

## Sources that are planned but not available

wire does not include ARTE. ARTE has no feed on any path. Its internal API gives
a 404. wire does not include The Wider Image. It redirects to a Reuters page.
That page gives a 401. YouTube subscriptions would need per-channel IDs or login
cookies.

## Run

```sh
python3.13 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py
```

Open <http://localhost:5001>.

The server binds to `127.0.0.1` by default. Set `WIRE_HOST=0.0.0.0` to expose
the server on the network. Set `WIRE_PORT` to change the port.

`/?refresh=1` bypasses the 5-minute cache. It forces one upstream request for
each source. wire disables this function by default. The function can amplify
traffic. Set `WIRE_ALLOW_REFRESH=1` to enable the function. wire hides the
refresh link until you enable the function.

The dev reloader (watchfiles) is off by default. Set `WIRE_RELOAD=1` while you
develop.

If a source fails, the page shows the other sources. It also shows an
`unavailable: …` line at the top.

## License

[MIT](LICENSE)
