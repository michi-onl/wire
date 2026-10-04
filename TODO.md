# wire to-do

Each check below waits for an event. None of them needs a fix today.

## CPU, after the first week in production

- Read the CPU time metric in the Cloudflare dashboard, at the median and at
  the 99th percentile. The bench runs on a laptop. On 2026-10-04 the first
  request after the warm-up cost about 4 to 5 ms there, and Cloudflare
  servers can be slower.
- Confirm that Cloudflare does not count the CPU of the global scope as CPU
  of the first request. If Cloudflare counts it, `src/warm.ts` saves nothing.
- If the 99th percentile comes near 10 ms, let a cron trigger build the page,
  and let the route read it. The Cache API is local to one data center, so
  that needs KV, and wire then keeps one stored page.

## After a large election

- Find the main result on the page. `POL_MAJOR` asks for three sources.
  Seven sources carry general news, but wire seldom joins a German and an
  English report of one event, so a major story can miss the page.
- Count the sources of the top 10 rows. Each news source carries the
  election, so the filter removes the rows with the highest `W_CORR` term,
  and rows from one source take their place.
- Look in a saved batch for politician names that `POL_NAMES` lacks. It holds
  22 people. A new head of government scores zero until you add the name.
  Give each spelling its own entry.

## Each week

Read the top 10 rows on a few days. Look for:
- A focus title word in a story outside the field, such as `poster` or
  `logo`. The row then gets `W_FOCUS`.
- Reddit questions, such as "any artists?", above the magazines.
- A section rule that misreads a story. The rules read the address, not the
  text.

## Parked

- Join a German and an English report of one event, with an alias list in
  `tokens()`. The alias list changes `idf()`, so `SIM_MIN` and `PAIR_WINDOW`
  need a new measurement. Start this when duplicate news rows bother you on
  the page.
