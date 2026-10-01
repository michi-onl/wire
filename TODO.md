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
  Reuters and HN give no politics section, so the headline is the only signal
  there. A political story under a neutral headline stays on the page.
- `POL_ALWAYS` misses the German genitive "Trumps", as in "Trumps Zölle". The
  rule cannot read it, because "trumps" is also an English verb. The SPIEGEL
  address usually holds `donald-trump`, so the rule catches most such rows.
  Count the leaks in a live batch.
- `POL_MAJOR` asks for three sources. Only four sources carry general news,
  and a German and an English report of one event often stay apart. Thus a
  major political story can still miss the page. Watch for that after a large
  election.
- The focus title rules read a few words, such as `poster` and `logo`. Such a
  word can appear in a story outside the field, and the row then gets
  `W_FOCUS`. Read the head of the page after a week.
- Many Reddit posts are questions of the community, such as "any artists?".
  The low `authority` keeps most of them below the magazines. Read the head of
  the page after a week.
- `POL_ALWAYS` once cost the most rows of any rule. One name took 7 rows of a
  batch of 55 news rows. The focus sources now fill the pool: the batch of
  2026-10-01 left 76 rows for a page of 30. Count a live batch after you add
  a term, and raise `max` and `window` in `SOURCES` if the margin gets thin.
- `POL_NAMES` holds 24 names and ages with every election. A new head of
  government is the gap that hurts: a name that left office costs nothing, and
  a name that wire does not know scores zero. Review the list after an
  election, and count the names of a live batch to find who is missing.
- Party politics is where agreement is strongest, because all news sources
  carry one election. The filter thus removes rows with a high `W_CORR` term,
  and single-source rows take their place. Watch the source mix of the head of
  the page after a change to `POL_DROP`.
- The Verge feed is in time order, so its position is not an editor signal.
  The feed also carries deals posts under `/gadgets/`, which `DROP` does not
  catch. On 2026-10-01 a Prime Day deals post reached row 2.
- A source that answers with a page that is not a feed gives zero items and no
  error. The source simply gets smaller. Count the items and show a line for
  an empty source.

## CPU

- The CPU margin is thin. On the laptop of 2026-10-01, the first request
  after the warm-up costs about 10 ms of the 10 ms that the free plan gives.
  The 5 sources before cost 9.6 ms on the same laptop, so the 11 sources cost
  about the same. Cloudflare servers can be slower. Read the CPU time metric in the dashboard after the first
  week, at the median and at the 99th percentile.
- Confirm that Cloudflare does not count the CPU of the global scope as CPU
  of the first request. `src/warm.ts` depends on it.
- If the metric is too high, split the work: a cron trigger can build the page
  and the route only reads it. The Cache API is local to one data center, so
  that needs KV, and wire then keeps one stored page.
- `W_SET` covers Latin, Greek, Cyrillic, kana, CJK, and Hangul. In another
  script, a letter counts as a word edge. Add a block when a source starts to
  carry such a script.
