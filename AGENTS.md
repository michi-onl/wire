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
