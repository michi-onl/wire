# AGENTS.md

- Write all prose in ASD-STE100 Simplified Technical English: short sentences with one idea each, active voice, simple present or imperative, and one word for one meaning.

## Design

wire is a Cloudflare Worker on the free plan, in TypeScript with Hono.
`src/rank.ts` holds the rules and the ranking. `src/parse.ts` reads the
feeds. `src/index.tsx` holds the routes, the fetch, and the cache.
`src/page.tsx` renders the page.

- `SOURCES` — one entry for each feed. Each entry has a `kind`: `feed`
  (RSS/Atom) or `sitemap`. Each entry also has a `prominence` mode (`points`,
  `position`, or `flat`), an `authority` multiplier, a `window`, and a `max`.
- The Verge uses the order of its feed. The Python version read the order of
  the homepage. That page is 1 MB of HTML, and its scrape alone cost more CPU
  than a Worker request may use. Do not add a homepage scrape.
- `fetchOne()` — gets one source. A failure stays in one source and becomes
  part of the `unavailable: …` line. `get()` retries a 429 after the time in
  `x-ratelimit-reset`, and gives up when that time is above `RETRY_MAX`. A
  Worker may work for 30 seconds after the answer, and Reddit can ask for
  minutes.
- `items()` — reads `window` items, applies `keep()`, and then caps at `max`.
  Keep that order. A cap before the filter empties a noisy source: 30 of the
  50 Reuters sitemap items are machine-written game recaps.
- `canonical()` — one address for one article. `parseFeed()` reads the
  outbound link of a Reddit post and of an HN item, so the row carries the
  address of the article, not of the aggregator. This is what lets two sources
  meet on one story, and it makes the row name the real publisher.
- `keep()` — drops an item before it reaches the list: the `DROP` pattern of
  its source, a live blog, or an age above `MAX_AGE`.
- `political()` — how sure wire is that a row is party politics, from 0 to 1.
  The section gives 0.4, one decisive word gives 0.6, and each word that also
  fits plain government news gives 0.25. `select()` drops a row at `POL_DROP`
  or above. `score()` charges `W_POL` for a row below it. The scope is party
  politics alone: an election, a party, a coalition, a campaign. An act of
  government stays. A reader opens wire for the court ruling and the export
  rule, so `lawmakers` and `minister` are weak words and cannot drop a row
  alone.
- The drop sits in `select()` and not in `keep()`. `keep()` reads one item,
  and all five sources carry politics, thus a drop there removes one copy and
  `cluster()` then builds the same row again from the other four. Sport works
  in `keep()` because `DROP` holds every source that carries sport.
- German builds a compound for each political word, thus no list of whole
  words holds them. A live batch gave `Parlamentswahl` and `Kremlpartei`, and
  both scored zero against such a list. `POL_STRONG` reads the stem of `wahl`
  and of `partei`, and names the exceptions: `Auswahl` is a selection and
  `wahlweise` means optionally.
- `POL_ALWAYS` — the names that the reader never wants to read. A match
  returns 1.0 at the top of `political()` and skips every other rule, thus the
  row always leaves the page. This is a reader rule and not a measurement: it
  removes an act of government too, which `POL_NAMES` is built to keep. Hold
  the two lists apart. A name in `POL_ALWAYS` must not also sit in
  `POL_NAMES`, because a tier cannot apply to it.
- A name in `POL_ALWAYS` needs a guard that a weak name does not. A weak name
  costs 0.25 and a wrong match is cheap. Here a wrong match removes a story,
  so the rule names the noun it must not read: a trump card is a card, and
  "battery life trumps raw speed" is a verb.
- `POL_NAMES` — the 24 politicians that the sources name most. A name is a
  weak word, not a decisive one. A name alone must never drop a row, because
  the same politician signs the export rule that the reader wants. A name and
  one decisive word reach `POL_DROP` together. This also makes a surname that
  is a common word cheap, such as Tusk.
- `POL_NAMES` is the one part of `src/rank.ts` with a shelf life. Review it
  after an election. Each source spells a transliterated name its own way:
  SPIEGEL writes Selenskyj and Netanjahu, Reuters writes Zelenskiy and
  Netanyahu, and a wire writes Soeder for Söder. Give each spelling its own
  entry. This is the alias list that TODO.md asks for, but it serves the
  politics filter and not `cluster()`.
- Measure a live batch before you add a word to `POL_STRONG`. The filter takes
  rows out of the pool after `cluster()`, so a wider rule shrinks the pool
  below `SHOWN` and nothing warns you. The batch of 2026-09-21 dropped 6 rows
  of 54 and left 48 for a page of 30.
- `cluster()` — joins the items that tell one story, on a shared address or on
  shared rare title words. `idf()` adds 1 to every weight, because in a small
  batch a shared word appears in every document and a pure count then calls it
  worthless. `sameStory()` needs three shared words, or two shared words
  inside `PAIR_WINDOW`; two alone join two unrelated reports about one person.
  Measure before you move `SIM_MIN`: on a live batch the true pairs sit above
  0.5 and the false pairs below 0.24.
- `score()` — a sum of bits: prominence, agreement between sources, topic,
  publisher, minus `GRAVITY * log2(age_hours + AGE_FLOOR)`. Keep it
  additive. A reader can then weigh one part against another.
- `AGE_FLOOR` is 4 hours on purpose. A wire republishes an item and the clock
  restarts. A low floor gives the page to whatever a wire posted last, which
  is how the first version filled its top ten with baseball recaps.
- `select()` — takes the best row, then charges the next row of the same
  source or topic. The charge stops at `MAX_SPREAD`, so a mixed page never
  costs more than a small loss of quality. `SOFT_FLOOR` keeps culture and
  celebrity off the head of the page.
- wire keeps no state between two refreshes. It had a `new` and a `rising`
  mark from a dict of the last counts. Those marks left on 2026-10-01: a host
  that starts a new process for each request cannot keep the dict.

## Regex rules

- JS reads `\w` and `\b` as ASCII, also with the `u` flag. Python reads them
  as Unicode. A rule with `\w` or `\b` splits "Söder" into "s" and "der". Do
  not use `\w` or `\b` in a rule that reads a title. Use `W`, `START`, and
  `END` in `src/rank.ts`, or the `words()` helper.
- Do not use `\p{L}` or `\p{N}` either. V8 compiles a regex again for a string
  with a character above U+00FF, such as a dash. With `\p{L}`, one rule then
  costs 7 ms, and a request has 10 ms. `W_SET` lists the letters and digits of
  Latin, Greek, Cyrillic, kana, CJK, and Hangul. `scripts/word-class.mjs`
  writes it. Add a block there, not a property class in a rule.
- A rule with the `g` flag keeps a position between two calls of `test()`.
  Keep the exported rules without `g`. `POL_WEAK_ALL` and `POL_NAMES_ALL` are
  the copies with `g` for `findall()`.

## CPU

- The free plan gives 10 ms of CPU to each request. A network wait does not
  count. Parsing, ranking, and rendering count. Measure a change with the
  bench before you commit it. SELFHOST.md lists the commands.
- A refresh usually runs in a new Worker, where V8 compiles each function and
  each regex on the first call. Measure the first run, not only the median.
- `src/warm.ts` runs the full path three times in the global scope, on a tiny
  batch. The global scope has its own limit of 1 second. On a laptop, this
  takes the first request from 18 ms to 7 ms. When you add a rule, give the
  warm batch a title that reaches it.
- `src/parse.ts` reads RSS and Atom with regexes. Do not add an XML library.
  `@rowanmanning/feed-parser` cost 4 ms warm and about 20 ms cold.
- Do not call `Intl` in the request path. Its first call is slow. `wall()`
  computes the time in Berlin by hand.

## The page

- `memory` and the Cache API hold the page. `TTL` is 300 s. After `TTL`, the
  route answers with the stale page and builds the next page in
  `waitUntil()`. After `STALE_MAX`, the route builds the page before it
  answers. `rebuild()` lets one build run at a time in one Worker.
- The Cache API does not work on a `workers.dev` address. There, only
  `memory` holds the page.
- `app.get("/")` — shows the HN table. The header bar is sky-500. The column
  is sky-50. The page behind the column is white. The width is 85%.
- `CSS` — a port of `news.ycombinator.com/news.css` with a different palette.
  It keeps the selectors, the sizes, and the mobile block of HN. It drops the
  rules for comments, forms, and the `.cNN` grey scale. wire has no such
  elements. Each sky shade has one `:root` variable: `--sky-500` bar and footer
  rule, `--sky-50` column, `--sky-950` titles and header text, `--sky-600`
  muted meta, `--sky-300` vote arrow. No other code styles the page.
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
- `Icons` — the head links and metas for the favicon, the Apple touch icon,
  and the manifest. `MANIFEST` — the webapp manifest. `/manifest.webmanifest`
  returns `MANIFEST` as JSON. The `assets` entry in `wrangler.jsonc` serves
  `static/`.
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
  has none. The script is a static file, thus Cloudflare serves it at
  `/patreon.user.js` and the Worker needs no route for it.

## Test

- `npm test` runs the ranking tests (vitest, `test/rank.test.ts`) and the mock
  check-in test (`node --test`, `test/*.mjs`). The tests make no network
  request. Add a test when you change a rule. Give each test headline
  different words: similar titles join into one row, and the test then
  measures nothing.
- `node --test` runs every `.js` and `.ts` file below `test/`. Thus vitest
  reads only `test/**/*.test.ts`, and `npm test` gives `node --test` the
  `.mjs` files alone.
- `npm run check` checks the types and the syntax of the userscript.
- `bench/parity.ts` prints the ranking of the saved batch as JSON. The Python
  version is in the history before commit d5c5fba. On 2026-10-01 both gave
  the same 57 rows with the same scores.

## The Patreon account

- Put no account data in the repository. This includes the account name, the
  vanity, the account id, and the campaign ids. Keep them out of the source
  files, the documents, the commit messages, and the test output.
- The account name is per browser, and not in the Worker. Each browser stores
  its own list in the userscript storage. Do not add a default name to the
  script.
- Make no request to patreon.com in a test. Mock the answers of `/api/posts` and
  `/api/current_user`. Run such a test in a separate browser profile.
- Do not send many requests and do not send them quickly. Read `PACE` before you
  add a request.

## Deploy

- Cloudflare builds and deploys wire from GitHub, through the Git integration
  of the dashboard. A push to `main` deploys to production. Ask before every
  push.
- Use no Cloudflare API token and no GitHub Actions deploy.
- `DEPLOY.local.md` holds the state. Git ignores that file. Never put a local
  address, a token, or account data in a file that Git contains.

## Verify the userscript

- `node --check static/patreon.user.js` — the syntax.
- `node --test "test/*.mjs"` — the mock check-in test. It mocks
  `/api/current_user` and `/api/posts`. It tests the caps and the account
  gate. It sends no request to patreon.com. The test sets `__WIRE_TEST__`, so
  the script skips the DOM bootstrap and exports `sync` and its helpers on
  `globalThis.__wire`.
- `curl -sS http://127.0.0.1:8787/patreon.user.js` — the route, with
  `npx wrangler dev` running. Cloudflare serves the file from `static/`.
- A live test needs Firefox with Tampermonkey. Ungoogled Chromium has no Web
  Store. Install the script from `http://127.0.0.1:8787/patreon.user.js`. Keep
  the browser profile outside the repository.
