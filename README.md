# wire

wire reads the feeds of news sites and of design, photography, and small-web
sites, and puts their stories in one list. Graphic design, photography, and
the Neocities world come first. Politics comes last.

wire keeps no database and no profile. It refreshes the list every five
minutes. The page uses the Hacker News stylesheet with the colors of the
Tailwind sky palette.

Open <https://wire.michi.onl>. You can add it to your home screen.

## Ranking

wire joins the items that tell one story and counts the sources. A story that
several independent editors chose at the same time goes up. A design,
photography, or small-web story gets a boost that outweighs about a day of
age. After wire picks a row, the next row from the same source costs more,
so one source cannot fill the page.

A political story moves down the list. wire drops a story about an election,
a party, or a campaign unless three sources carry it. It drops each story
that names the MAGA movement or its people and outlets, such as Trump or
Truth Social, at any count of sources.

Each row names the site that published the story. A Reddit post about a
Financial Times article shows `ft.com`. The line below the title links to
each source that carried the story. If a source fails, you see the other
sources and an `unavailable: …` line.

## Sources

- **Design:** Creative Review, Creative Boom, Abduzeedo, Design Milk,
  It's Nice That
- **Photography:** PetaPixel, Fstoppers, 35mmc
- **Small web:** Bear Blog, and Reddit for design, photography, and Neocities
- **News:** Hacker News, SPIEGEL, Tagesschau, Reuters, The Verge, 404 Media,
  Ars Technica

## Run it yourself

wire is a Cloudflare Worker. Read [SELFHOST.md](SELFHOST.md) for the setup
and the full ranking rules.

## License

[MIT](LICENSE)

The MIT license excludes `CSS` in `src/page.tsx`. That constant copies the
[Hacker News stylesheet](https://news.ycombinator.com/news.css), and Y
Combinator holds its rights.
