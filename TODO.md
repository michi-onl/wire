# wire to-do

## Ship and correctness

- Add `@updateURL` and `@downloadURL` to the userscript header. Point both at
  `/patreon.user.js`, so Tampermonkey updates the script.
- Add a check-in test with mock answers. Mock `/api/current_user` and
  `/api/posts`. Test the caps. Send no request to patreon.com.

## Feature depth

- Add a "load older" action. `/api/posts` gives a cursor. The script ignores it.
  Walk the cursor on demand, with the same cap.
- Auto-sync from the wire page. Today only a patreon.com visit auto-syncs. The
  wire page can send `request_sync` once when the data is stale.
- Make the rows richer. Show the teaser, a thumbnail, and a locked mark. The
  fetch already reads `locked` and `is_nsfw`.
- Mix the Patreon items with the server list. Rank them with HN and Reddit by
  date. This needs a small change in `app.py`: one timestamp on each row.
- Add a stale hint and a clear sync result to the wire block. The button status
  shows on patreon.com alone today.

## Reuse

- Match the gopher limits. Add backoff after a 429 for each run. Add a daily
  cap. Today the script uses a flat 60-second cooldown.
- Add a second platform. The cross-tab pattern is not specific to Patreon. Make
  a design first.

## Order

1. Add the update addresses.
2. Add the mock test.
3. Add "load older" or the richer rows.
