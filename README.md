# wire

wire reads the front pages of some news sites and of some design,
photography, and small-web sites. It puts the stories in one list. Graphic
design, photography, and the Neocities world come first. Politics comes last.

wire keeps no database and no profile. It stores no votes and no comments.
The list refreshes every five minutes.

The design comes from Hacker News. The colors come from the Tailwind sky
palette.

## How to use it

Open <https://wire.michi.onl>.

If a source fails, the page shows the other sources and an `unavailable: …`
line at the top.

## How wire picks the order

wire reads eleven sources, so it knows one thing that no single site knows:
which story several independent editors chose at the same time. That is one
signal. The field of the story is the other.

- **Agreement.** wire joins the items that tell one story, then counts the
  sources. A row with `2 sources` beats a lone report. One story fills one
  row, not three.
- **Standing.** wire reads the position of an item on its own front page, and
  the points on Hacker News.
- **Age.** An old story goes down the list. A fresh story does not win on age
  alone, because a news wire republishes an item and the clock restarts.
- **Focus.** Graphic design, photography, and the small web of Neocities and
  personal sites get a large boost. A story from a design or photography
  magazine, from Bear Blog, or from a design, photography, or Neocities
  subreddit is in focus. A story from another source is in focus when its
  headline names the field, for example a typeface, a camera, or a webring.
- **Topic.** After the focus fields, world news, technology, science, and
  German news get a small boost. Culture and celebrity stay below the first
  rows. Sport does not appear.
- **Politics.** Politics goes down the list. A word of plain government news,
  such as a minister, a sanction, or a tariff, costs a story much of its
  place. An election, a party, a coalition, or a campaign removes the story,
  unless three sources carry it. That is news that the mainstream knows. A
  political story under a neutral headline can still reach the page.
- **MAGA.** A story that names the MAGA movement never appears, whatever it
  tells and however many sources carry it. wire reads the headline and the
  address for its names, slogans, groups, and media, for example Trump,
  Vance, Hegseth, Truth Social, and Project 2025.
- **A mixed page.** After wire picks a row, the next row from the same source
  or the same topic costs more. One source cannot take the whole page.

Each row names the site that published the story, not the site that linked
it. A Reddit post about a Financial Times article shows `ft.com`. The line
below the title links to every source that carried the story, so you can read
a second account or open the Hacker News comments.

## Sources

| Source          | Notes                                                        |
| --------------- | ------------------------------------------------------------ |
| Hacker News     | Points and comments. Links to the article                    |
| Reddit          | Hot order. Graphic design, typography, photography, Neocities, and the small web |
| SPIEGEL         | German. Editorial top list                                   |
| The Verge       | Feed order. The newest item comes first                      |
| Reuters         | A wire in publication order. No editor ranks it              |
| Creative Review | Graphic design and branding                                  |
| Creative Boom   | Graphic design, illustration, and branding                   |
| Abduzeedo       | Graphic design, type, and packaging                          |
| PetaPixel       | Photography news                                             |
| Fstoppers       | Photography gear and technique                               |
| Bear Blog       | Trending posts of the small web                              |

Reuters and the design and photography magazines publish in time order, so no
item there starts at the top. The Verge feed is in time order too. Its first
item is its newest item, and not always its most important one.

No Neocities feed carries daily news. The Neocities blog posts about once a
year. r/neocities and Bear Blog are the closest daily sources.

## Install as a webapp

You can add wire to your home screen. The icons live in `static/`.

## Run it yourself

wire is a Cloudflare Worker. See [SELFHOST.md](SELFHOST.md).

## License

[MIT](LICENSE)
