# AGENTS.md

- Write all prose in ASD-STE100 Simplified Technical English: short sentences with one idea each, active voice, simple present or imperative, and one word for one meaning.
- This file holds the rules that the code cannot show: a rule that spans
  files, or a trap that no line of code reveals. Put the reason for one rule
  in a comment beside that rule. Put a measurement in the commit message.

## Design

wire ranks news for one reader. Graphic design, photography, and the small
web of Neocities and personal sites come first. The reader wants little
politics. wire is a Cloudflare Worker on the free plan, in TypeScript with
Hono. `src/rank.ts` holds the sources, the rules, and the ranking.
`src/parse.ts` reads the feeds. `src/build.ts` turns the bodies into rows.
`src/index.tsx` holds the routes, the fetch, and the cache. `src/page.tsx`
renders the page. `src/warm.ts` warms V8 before the first request.

- wire keeps no state between two refreshes. The host starts a new process
  for each request, so a dict of the last counts does not survive.
- `score()` is a sum of bits. Keep it additive, so a reader can weigh one
  part against another.
- Drop a political row in `select()`. A drop in `keep()` removes one copy,
  and `cluster()` builds the same row again from the other sources.
- Name the sections in a `TOPICS` rule. A rule for a whole host catches its
  games and culture sections before `SOFT_SLUG` reads them.
- Measure a saved batch before you change a weight, a threshold, or a rule
  list. SELFHOST.md tells how to save one.
  - The politics filter takes rows out after `cluster()`. A wider rule can
    shrink the pool below `SHOWN`, and nothing warns you. Count the pool after
    you add a term to `POL_STRONG` or `POL_ALWAYS`.
  - Measure `SIM_MIN` and `PAIR_WINDOW` again after a change to `idf()`. True
    pairs sit above 0.5. The worst false pair reached 0.236, and the limit is
    0.25.

## Add a source

1. Read a saved body of the feed. Give `position` only to a feed whose order
   is an editor order or a reader order. A feed in time order is `flat`,
   because `GRAVITY` already charges age.
2. Give `DROP` a rule for the noise of the feed: sport, video, podcasts, and
   sponsored posts. Set `window` wide enough that `max` items survive `DROP`.
3. Give the source a `topic` if it covers one focus field. Otherwise give
   `TOPICS` a rule for its sections.
4. Add the body to `bench/bodies/` and its name to `bench/files.ts`. Add a
   warm body to `src/warm.ts` when the feed format is new.
5. Measure the first request and a warm request (see CPU). Lower `max` and
   `window` when the first request grows.
6. Rank a saved batch. The source must put rows on the page. A source that
   puts no row there costs CPU for nothing.
7. Add the source to the list in README.md and to the table in SELFHOST.md.

You are done when the source is in `SOURCES`, `bench/files.ts`, the README
list, and the SELFHOST table.

- Reddit gets one request, because Reddit answers a third quick request with
  a 429. Add a subreddit to the one address. Leave out r/analog: its titles
  are camera specs, and it took 10 of 25 places.
- Read a feed, not a homepage. The homepage of The Verge is 1 MB of HTML, and
  its scrape alone costs more CPU than a request may use.

## Regex rules

- JS reads `\w` and `\b` as ASCII, also with the `u` flag, and splits
  "Söder" into "s" and "der". In a rule that reads a title, use `W`, `START`,
  and `END` from `src/rank.ts`, or the `words()` helper.
- Use `W_SET` for a letter, not `\p{L}` or `\p{N}`. V8 compiles a regex again
  for a string with a character above U+00FF, and with `\p{L}` one rule then
  costs 7 ms. `scripts/word-class.mjs` writes `W_SET`. Add a script block
  there when a source starts to carry a new script.
- Keep the exported rules without the `g` flag. A `g` rule keeps a position
  between two calls of `test()`. `POL_WEAK_ALL` and `POL_NAMES_ALL` are the
  `g` copies for `findall()`.

## CPU

- The free plan gives 10 ms of CPU to each request. Parsing, ranking, and
  rendering count. A network wait does not count.
- Measure a change before you commit it. `npx tsx bench/warmup.ts` measures
  the first request in a new Worker. That request hits the limit first.
  `npx tsx bench/bench.ts` measures a warm request. On 2026-10-04, with 16
  sources on a laptop, the first request cost about 4 to 5 ms and a warm
  request about 2 ms.
- `src/warm.ts` runs the full path in the global scope, which has its own
  limit of 1 second. When you add a rule, give the warm batch a title that
  reaches it.
- Keep one warm body with no character above U+00FF. V8 compiles a regex once
  for one-byte strings and once for two-byte strings, and a title cut from a
  two-byte body is two-byte too.
- Read RSS and Atom with the regexes in `src/parse.ts`. An XML library cost
  4 ms warm and 20 ms cold.
- Compute a time by hand, as `wall()` does. The first call of `Intl` is slow.

## The page

- The Cache API does not work on a `workers.dev` address. There, only
  `memory` holds the page.
- `CSS` in `src/page.tsx` is a copy of `news.ycombinator.com/news.css` with a
  sky palette. Keep the selectors, the values, and the order of HN. Change a
  color through its `:root` variable. No other code styles the page.
- Style the cells with a bare `td`. `#hnmain td` outranks `.subtext` and
  `.title`, and the subtext then keeps the 10pt size of the cell.
- Keep the empty `votelinks` cell. It holds the width of the HN vote arrow,
  so a title starts where HN starts it.
- Test the mobile block at 750 px with an emulated device. A `--window-size`
  flag alone does not set the layout viewport.
- `static/favicon.svg` is the source of the icons. The PNG files come from
  it. The W is the Verdana glyph as a path, not text.

## Test

- Add a test to `test/rank.test.ts` when you change a rule. Give each test
  headline different words. Similar titles join into one row, and the test
  then measures nothing.

## Deploy

- Cloudflare builds and deploys wire from GitHub, through the Git integration
  of the dashboard. A push to `main` deploys to production. Ask before every
  push.
- Use no Cloudflare API token and no GitHub Actions deploy.
- `DEPLOY.local.md` holds the state. Git ignores that file. Never put a local
  address, a token, or account data in a file that Git contains.
