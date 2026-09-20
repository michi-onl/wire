# AGENTS.md

- Write all prose in ASD-STE100 Simplified Technical English: short sentences with one idea each, active voice, simple present or imperative, and one word for one meaning.

## Design

- `SOURCES` — one entry for each feed. Each entry has a `kind`: `feed`
  (RSS/Atom), `sitemap`, or `scrape` (homepage order joined to its `rss=`
  feed). Each entry also has a `prominence` mode (`points`, `position`, or
  `flat`), an `authority` multiplier, a `window`, and a `max`.
- `fetch_one()` — gets and parses one source. A failure stays in one source.
  It reads `window` items, applies `keep()`, and then caps at `max`. Keep that
  order. A cap before the filter empties a noisy source: 30 of the 50 Reuters
  sitemap items are machine-written game recaps.
- `canonical()` — one address for one article. `parse_feed()` reads the
  outbound link of a Reddit post and of an HN item, so the row carries the
  address of the article, not of the aggregator. This is what lets two sources
  meet on one story, and it makes the row name the real publisher.
- `keep()` — drops an item before it reaches the list: the `DROP` pattern of
  its source, a live blog, or an age above `MAX_AGE`.
- `cluster()` — joins the items that tell one story, on a shared address or on
  shared rare title words. `idf()` adds 1 to every weight, because in a small
  batch a shared word appears in every document and a pure count then calls it
  worthless. `same_story()` needs three shared words, or two shared words
  inside `PAIR_WINDOW`; two alone join two unrelated reports about one person.
  Measure before you move `SIM_MIN`: on a live batch the true pairs sit above
  0.5 and the false pairs below 0.24.
- `score()` — a sum of bits: prominence, agreement between sources, gain,
  topic, publisher, minus `GRAVITY * log2(age_hours + AGE_FLOOR)`. Keep it
  additive. A reader can then weigh one part against another.
- `AGE_FLOOR` is 4 hours on purpose. A wire republishes an item and the clock
  restarts. A low floor gives the page to whatever a wire posted last, which
  is how the first version filled its top ten with baseball recaps.
- `select()` — takes the best row, then charges the next row of the same
  source or topic. The charge stops at `MAX_SPREAD`, so a mixed page never
  costs more than a small loss of quality. `SOFT_FLOOR` keeps culture and
  celebrity off the head of the page.
- `_cache` — a dict and a monotonic timestamp.
- `_seen` — a dict in memory with the last counts for each story address, so
  `observe()` can tell a gain from a level. It holds nothing about a reader.
  `prune()` drops an entry after 24 hours and caps it at 5000. The first load
  after a restart marks no row `new`, because every row would qualify.
- Test the ranking with
  `.venv/bin/python -m unittest discover -s test -p 'test_*.py'`. The tests
  make no network request. Add a test when you change a rule. Give each test
  headline different words: similar titles join into one row, and the test
  then measures nothing.
- `@rt("/")` — shows the HN table. The header bar is sky-500. The column is
  sky-50. The page behind the column is white. The width is 85%.
- `CSS` — a port of `news.ycombinator.com/news.css` with a different palette.
  It keeps the selectors, the sizes, and the mobile block of HN. It drops the
  rules for comments, forms, and the `.cNN` grey scale. wire has no such
  elements. Each sky shade has one `:root` variable: `--sky-500` bar and footer
  rule, `--sky-50` column, `--sky-950` titles and header text, `--sky-600`
  muted meta, `--sky-300` vote arrow. Pico is disabled in `fast_app()`. No
  other code styles the page.
- Style the cells with a bare `td` selector. Do not use `#hnmain td`. An id
  makes the rule stronger than `.subtext` and `.title`. Those rules then fail,
  and the subtext keeps the 10pt size of the cell.
- HN draws the vote arrow with `triangle.svg`. wire draws it with CSS borders.
  An SVG file cannot read a CSS variable, thus the file would hold a second
  copy of the arrow color.
- Only `.subtext a` and `.comhead a` get an underline on hover. This is the
  behavior of HN. Titles and header links get none.
- The media query at 750 px is the mobile block of HN. It makes the table full
  width, it makes the titles larger, and it stacks the header. Test it with an
  emulated device. A `--window-size` flag alone does not set the layout
  viewport, and the screenshot then shows a clipped desktop page.
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
