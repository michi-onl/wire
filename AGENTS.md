# AGENTS.md

- Write all prose in ASD-STE100 Simplified Technical English: short sentences with one idea each, active voice, simple present or imperative, and one word for one meaning.

## Design

- `SOURCES` — one entry for each feed. Each entry has a `kind`: `feed`
  (RSS/Atom), `sitemap`, or `scrape` (homepage order joined to its `rss=`
  feed). Each entry also has a `quality_mode`: `points`, `position`, or `none`.
- `fetch_one()` — gets and parses one source. A failure stays in one source.
- `load()` — gets all sources. It caps each source at 10 items. It scores the
  items. It ranks the items.
- `assign_quality()` — makes a quality value from 0 to 1 for each story. For
  HN, it compares the points to the batch maximum. For Reddit, SPIEGEL, and The
  Verge, it uses the feed position or the homepage position. For sources with
  no popularity signal, it uses a neutral 0.5.
- `hot_score()` — `(quality + 1) / (age_hours + 2) ** GRAVITY`. A popular and
  fresh story ranks highest. An old story goes down the list. `GRAVITY`
  controls the speed.
- `_cache` — a dict and a monotonic timestamp. This is the full persistence
  layer.
- `@rt("/")` — shows the HN table. The header bar is sky-500. The body is
  sky-50. The width is 85%.
- `CSS` — the HN stylesheet with a different palette. Each sky shade has one
  `:root` variable: `--sky-500` bar and footer rule, `--sky-50` page,
  `--sky-950` titles and header text, `--sky-600` muted meta, `--sky-300` vote
  arrow. Pico is disabled in `fast_app()`. No other code styles the page.
- `ICONS` — the head links and metas for the favicon, the Apple touch icon, and
  the manifest. `MANIFEST` — the webapp manifest. `/manifest.webmanifest`
  returns `MANIFEST` as JSON. `static_path="static"` serves the icon files.
- `static/favicon.svg` — the HN icon with a white W on a sky-500 square. The W
  is the Verdana Regular glyph, kept as a path, not text. The PNG files come
  from this SVG.
- `static/patreon.user.js` — a userscript. It is optional. The wire server does
  not run it and does not store its data. It runs on patreon.com and on wire.
  On patreon.com it reads the posts of the memberships with the session of the
  page. The browser attaches the session. The script reads no password, cookie,
  or token. It keeps the posts in the storage of the userscript, so only that
  device shows them. On the wire page it adds a `patreon — this device` block.
  `PACE` holds the request limits: a gap of 900 ms and a random quantity, and a
  budget of 20 requests in 5 minutes. A run makes 9 requests at most. The script
  ships with no account name. The first sync asks for the account and stores it
  in the storage of the userscript, so each browser has its own list. The
  account list is advisory. It is not a security boundary, and the wire server
  has none. The script is a static file, thus `static_path="static"` serves it
  at `/patreon.user.js` and `app.py` stays unchanged.

## The Patreon account

- Put no account data in the repository. This includes the account name, the
  vanity, the account id, and the campaign ids. Keep them out of the source
  files, the documents, the commit messages, and the test output.
- The account name is per browser, and not in `app.py`. Each browser stores its
  own list in the userscript storage. Do not add a default name to the script.
- Make no request to patreon.com in a test. Mock the answers of `/api/posts` and
  `/api/current_user`. Run such a test in a separate browser profile.
- Do not send many requests and do not send them quickly. Read `PACE` before you
  add a request.

## Deploy

- wire runs on a Proxmox container. The steps and the addresses are in
  `DEPLOY.local.md`. Git ignores that file, because the addresses are local.
  Read it before you deploy. Never put the addresses in a file that Git
  contains.

## Verify the userscript

- `node --check static/patreon.user.js` — the syntax.
- `node --test test/` — the mock check-in test. It mocks `/api/current_user`
  and `/api/posts`. It tests the caps and the account gate. It sends no request
  to patreon.com. The test sets `__WIRE_TEST__`, so the script skips the DOM
  bootstrap and exports `sync` and its helpers on `globalThis.__wire`.
- `curl -sS http://127.0.0.1:5001/patreon.user.js` — the route. FastHTML serves
  the file, and `app.py` needs no route for it.
- A live test needs Firefox with Tampermonkey. Ungoogled Chromium has no Web
  Store. Install the script from `http://127.0.0.1:5001/patreon.user.js`. Keep
  the browser profile outside the repository.
