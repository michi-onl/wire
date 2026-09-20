# wire to-do

## Ranking

Known limits of the current ranking. Measure a live batch before you change a
constant.

- Cross-language clustering catches a shared name that survives translation,
  such as a place or a person. It misses a German compound, so SPIEGEL and
  Reuters often keep two rows for one event. A small alias list for the common
  transliterations would help, for example Selenskyj and Zelenskiy.
- `SIM_MIN` has a thin margin. On the measured batch the worst false pair
  reached 0.236 and the limit is 0.25. The `PAIR_WINDOW` rule is the second
  guard. Re-measure both after any change to `idf()`.
- Reuters has no signal for its own quality. Every item gets a flat
  prominence, so a small wire item and a lead story start level, and only
  agreement separates them. A section-aware prior could help.
- The topic rules read the address. A story in r/technology about tax policy
  counts as `tech`. The rules cannot see the text.
- The politics filter reads the headline and one section, `spiegel.de/politik/`.
  Reuters, Reddit, and HN give no politics section, so the headline is the only
  signal there. A political story under a neutral headline stays on the page.
- `POL_ALWAYS` costs the most rows of any rule. One name took 7 rows of a
  batch of 55, and 42 rows stayed for a page of 30. A second name there can
  put the pool below `SHOWN`. Count a live batch before you add one, and raise
  `max` and `window` in `SOURCES` if the margin gets thin.
- `POL_NAMES` holds 24 names and ages with every election. A new head of
  government is the gap that hurts: a name that left office costs nothing, and
  a name that wire does not know scores zero. Review the list after an
  election, and count the names of a live batch to find who is missing.
- Party politics is where agreement is strongest, because all five sources
  carry one election. The filter thus removes rows with a high `W_CORR` term,
  and single-source rows take their place. Watch the source mix of the head of
  the page after a change to `POL_DROP`.
- `observe()` needs two refreshes before it can mark a row `rising`. After a
  restart the marks stay off for five minutes.
- The Verge scrape returns fewer items than its cap when the homepage layout
  changes. A failure there is silent: the source simply gets smaller.

## Feature depth

- Add a "load older" action. `/api/posts` gives a cursor. The script ignores it.
  Walk the cursor on demand, with the same cap.
- Auto-sync from the wire page. Today only a patreon.com visit auto-syncs. The
  wire page can send `request_sync` once when the data is stale.
- Make the rows richer. Show the teaser, a thumbnail, and a locked mark. The
  fetch already reads `locked` and `is_nsfw`.
- Mix the Patreon items with the server list. Rank them with HN and Reddit by
  date. The rows now carry a timestamp and a topic, so the script can place an
  item instead of holding a block of its own.
- Add a stale hint and a clear sync result to the wire block. The button status
  shows on patreon.com alone today.

## Reuse

- Match the gopher limits. Add backoff after a 429 for each run. Add a daily
  cap. Today the script uses a flat 60-second cooldown.
- Add a second platform. The cross-tab pattern is not specific to Patreon. Make
  a design first.

## Order

1. Add "load older" or the richer rows.
