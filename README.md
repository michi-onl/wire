# wire

wire reads the front pages of some news sites. It puts the stories in one
list. It puts the story that most sources carry at the top.

wire keeps no database and no profile. It stores no votes and no comments.
The list refreshes every five minutes.

The design comes from Hacker News. The colors come from the Tailwind sky
palette.

## How to use it

Open <https://wire.michi.onl>.

If a source fails, the page shows the other sources and an `unavailable: …`
line at the top.

## How wire picks the order

wire reads five front pages, so it knows one thing that no single site knows:
which story several independent editors chose at the same time. That is the
main signal.

- **Agreement.** wire joins the items that tell one story, then counts the
  sources. A row with `2 sources` beats a lone report. One story fills one
  row, not three.
- **Standing.** wire reads the position of an item on its own front page, and
  the points on Hacker News.
- **Age.** An old story goes down the list. A fresh story does not win on age
  alone, because a news wire republishes an item and the clock restarts.
- **Topic.** World news, technology, science, and German news come first.
  Culture and celebrity stay below the first rows. Sport does not appear.
- **Party politics.** An election, a party, a coalition, or a campaign does
  not appear. An act of government stays: a court ruling, an export rule, a
  privacy law, or a meeting between two heads of state. wire reads the
  headline, the section, and the names of 25 politicians. A name alone does
  not remove a story, because the same person signs the law that is news. A
  name with a campaign word does. One name is an exception: a story that
  names Donald Trump never appears, whatever it tells. A political story
  under a neutral headline can still reach the page.
- **A mixed page.** After wire picks a row, the next row from the same source
  or the same topic costs more. One source cannot take the whole page.

Each row names the site that published the story, not the site that linked
it. A Reddit post about a Financial Times article shows `ft.com`. The line
below the title links to every source that carried the story, so you can read
a second account or open the Hacker News comments.

## Sources

| Source      | Notes                                                    |
| ----------- | -------------------------------------------------------- |
| Hacker News | Points and comments. Links to the article                |
| Reddit      | Hot order. World news, technology, and news              |
| SPIEGEL     | German. Editorial top list                               |
| The Verge   | Feed order. The newest item comes first                  |
| Reuters     | A wire in publication order. No editor ranks it          |

Reuters publishes in time order, so no item there starts at the top. A Reuters
story reaches the top when another source carries it too. The Verge feed is in
time order too. Its first item is its newest item, and not always its most
important one.

## Patreon posts (optional)

A userscript shows the Patreon posts of your memberships. The posts stay on
your device. The wire server does not see them.

1. Install <https://wire.michi.onl/patreon.user.js>.
2. Sign in to patreon.com.
3. Click **Sync to wire**.
4. Open wire. A `patreon — this device` block shows the posts.

The script needs an open patreon.com tab. The first sync asks for your account
name, and each browser keeps its own list.

## Install as a webapp

You can add wire to your home screen. The icons live in `static/`.

## Run it yourself

wire is a Cloudflare Worker. See [SELFHOST.md](SELFHOST.md).

## License

[MIT](LICENSE)
