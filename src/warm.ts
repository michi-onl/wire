import { items, pages } from "./build";
import { renderAll } from "./page";
import { SOURCES, type Story } from "./rank";

// A Worker on the free plan has 10 ms of CPU for each request. V8 compiles a
// function and a regex on the first call, and a refresh in a new Worker
// costs about 3 times a warm one. The global scope runs before the first
// request and has its own limit of 1 second, so wire runs the full path once
// here on a tiny batch. V8 compiles a regex once for a one-byte string and
// again for a string with a character above U+00FF. A title that the parser
// cuts from a body with such a character is a two-byte string too, even when
// the title is plain ASCII. Thus the bodies hold a dash, except TS, which
// holds umlauts and no dash. Without a one-byte body, the first one-byte
// title of a real batch cost 1 to 2 ms.

const DATE = "2026-10-01T10:00:00Z";
const RSS = `<rss version="2.0"><channel>
<item><title>Lawmakers – Söder und die Parlamentswahl</title><link>https://example.com/a</link>
<description><![CDATA[<p>Points: 5</p><p># Comments: 2</p><a href="https://news.ycombinator.com/item?id=1">c</a>]]></description>
<pubDate>Wed, 01 Oct 2026 10:00:00 +0000</pubDate></item>
<item><title>A chip compiler for parliament</title><link>https://example.com/b</link>
<description>Points: 9</description><pubDate>Wed, 01 Oct 2026 09:00:00 +0000</pubDate></item>
</channel></rss>`;
const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Minister – Selenskyj trifft Merz</title><updated>${DATE}</updated>
<link href="https://www.reddit.com/r/worldnews/comments/1/x/"/>
<content type="html">&lt;span&gt;&lt;a href=&quot;https://example.org/x?a=1&amp;amp;utm_source=y&quot;&gt;[link]&lt;/a&gt;&lt;/span&gt;</content></entry>
<entry><title>Five reasons the election matters</title><updated>${DATE}</updated>
<link rel="alternate" href="https://www.reddit.com/r/news/comments/2/y/"/><content type="html">x</content></entry>
</feed>`;
const TS = `<rss version="2.0"><channel>
<item><title>Bundestag: Länder streiten über Niedrigwasser</title>
<link>https://www.tagesschau.de/inland/innenpolitik/a-100.html</link>
<pubDate>Wed, 01 Oct 2026 10:00:00 +0000</pubDate></item>
<item><title>Lettland wählt, Koalition unsicher</title>
<link>https://www.tagesschau.de/ausland/europa/b-100.html</link>
<pubDate>Wed, 01 Oct 2026 09:00:00 +0000</pubDate></item>
<item><title>tagesschau um 20 Uhr</title>
<link>https://www.tagesschau.de/video/video-1.html</link>
<pubDate>Wed, 01 Oct 2026 08:00:00 +0000</pubDate></item>
</channel></rss>`;
const SITEMAP = `<urlset>
<url><loc>https://www.reuters.com/world/a/</loc><news:news><news:publication_date>${DATE}</news:publication_date>
<news:title><![CDATA[Wahl – Koalition in Österreich]]></news:title></news:news></url>
<url><loc>https://www.reuters.com/world/b/</loc><news:news><news:publication_date>${DATE}</news:publication_date>
<news:title>Trump card for the mining appeal</news:title></news:news></url>
<url><loc>https://www.reuters.com/world/c/</loc><news:news><news:publication_date>${DATE}</news:publication_date>
<news:title>Leica – a webring of typefaces for the GOP</news:title></news:news></url>
</urlset>`;

export function warm() {
  const at = Date.parse("2026-10-01T12:00:00Z") / 1000;
  const stories: Story[] = [];
  for (const s of SOURCES) {
    const body = s.kind === "sitemap" ? SITEMAP : s.name === "Reddit" ? ATOM
      : s.name === "Tagesschau" ? TS : RSS;
    stories.push(...items(s, body, at));
  }
  return renderAll(pages(stories, at), { errors: ["HN (Error: warm)"], wall: "12:00", at,
    allowRefresh: true, origin: "https://example.com" });
}

// On a laptop, one pass takes the first request from 18 ms to 7 ms. Each
// further pass saves about 0.5 ms.
for (let i = 0; i < 3; i++) warm();
