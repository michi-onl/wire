# wire

wire reads the front pages of some news sites. It puts the stories in one
list. It ranks the stories by popularity and age.

wire keeps no database and no profile. It stores no votes and no comments.
The list refreshes every five minutes.

The design comes from Hacker News. The colors come from the Tailwind sky
palette.

## How to use it

Open <https://wire.michi.onl>.

If a source fails, the page shows the other sources and an `unavailable: …`
line at the top.

## Sources

| Source      | Notes                                             |
| ----------- | ------------------------------------------------- |
| Hacker News | Ranked by points and comments                     |
| Reddit      | Hot order. World news, technology, and news       |
| SPIEGEL     | German. Editorial top list                        |
| The Verge   | Homepage order                                    |
| Reuters     | Title, URL, and date only. No popularity signal   |

Reuters has no popularity count, so only its age moves it up the list.

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

See [SELFHOST.md](SELFHOST.md).

## License

[MIT](LICENSE)
