// Tests for the ranking. No test makes a network request.
//
//   npx vitest run
import { describe, expect, test } from "vitest";
import { parseFeed, parseSitemap } from "../src/parse";
import {
  cluster, keep, now, political, POL_DROP, POL_NAMES, POL_STRONG, POL_WEAK, prominence,
  score, select, SOFT_FLOOR, SOFT_TOPICS, story, tokens, topic, wall, canonical,
  type Row, type Story, type StoryExtra,
} from "../src/rank";

function item(title: string, source: string, url: string,
              kw: StoryExtra & { hours?: number } = {}): Story {
  const { hours = 1.0, ...extra } = kw;
  return story(title, url, source, now() - hours * 3600, { pos: 0, n: 10, ...extra });
}

const all = (rule: RegExp, text: string) =>
  [...text.matchAll(new RegExp(rule, "giu"))].map((m) => m[0]);

describe("canonical", () => {
  test("strips tracking and host noise", () => {
    expect(canonical("https://www.example.com/a/b/?utm_source=x&id=7"))
      .toBe(canonical("http://example.com/a/b?id=7"));
  });

  test("strips amp and mobile", () => {
    expect(canonical("https://m.example.com/a/amp")).toBe(canonical("https://example.com/a"));
  });

  test("keeps a meaningful query", () => {
    expect(canonical("https://example.com/p?id=7")).toContain("id=7");
  });
});

describe("keep", () => {
  test("drops Reuters sports", () => {
    expect(keep(item("Packers sink Jets in OT", "Reuters",
      "https://www.reuters.com/sports/nfl/packers-sink-jets/"))).toBe(false);
  });

  test("drops a translated wire", () => {
    expect(keep(item("Allemagne-L'AfD en tete", "Reuters",
      "https://www.reuters.com/fr/allemagne-afd/"))).toBe(false);
  });

  test("drops SPIEGEL sport", () => {
    expect(keep(item("Real Madrid verliert", "SPIEGEL",
      "https://www.spiegel.de/sport/fussball/real-madrid-a-1/"))).toBe(false);
  });

  test("drops an evergreen item", () => {
    expect(keep(item("Rente: So kommen Sie auf 2000 Euro", "SPIEGEL",
      "https://www.spiegel.de/wirtschaft/rente-a-1/", { hours: 235 * 24 }))).toBe(false);
  });

  test("drops a live blog", () => {
    expect(keep(item("Wahl 2026 im Liveblog", "SPIEGEL",
      "https://www.spiegel.de/politik/deutschland/wahl-a-1/"))).toBe(false);
  });

  test("keeps real news", () => {
    expect(keep(item("Far-left party wins Berlin election", "Reuters",
      "https://www.reuters.com/world/europe/berlin-election/"))).toBe(true);
  });
});

describe("cluster", () => {
  test("one article on two sources becomes one row", () => {
    const url = "https://www.reuters.com/business/altman-un/";
    const rows = cluster([item("Altman to brief UN", "Reuters", url),
      item("Altman to Brief UN", "HN", url, { points: 99 })]);
    expect(rows).toHaveLength(1);
    expect(new Set(rows[0].sources)).toEqual(new Set(["Reuters", "HN"]));
  });

  test("three shared rare words merge", () => {
    const rows = cluster([
      item("AfD leads as Merz rues disaster in state election", "Reuters",
        "https://www.reuters.com/world/europe/afd-1/"),
      item("Germany far-right AfD leads race in state, exit poll", "Reuters",
        "https://www.reuters.com/world/europe/afd-2/")]);
    expect(rows).toHaveLength(1);
  });

  test("two shared words in one news cycle merge", () => {
    const rows = cluster([
      item("Selenskyj kuendigt Treffen mit Trump in New York an", "SPIEGEL",
        "https://www.spiegel.de/ausland/selenskyj-a-1/", { hours: 1 }),
      item("Zelenskiy says he and Trump agree to meet in New York", "Reuters",
        "https://www.reuters.com/world/zelenskiy-1/", { hours: 2 })]);
    expect(rows, "a cross-language pair should join").toHaveLength(1);
  });

  test("one shared name does not merge two reports", () => {
    const rows = cluster([
      item("Selenskyj kuendigt Treffen mit Donald Trump in New York an",
        "SPIEGEL", "https://www.spiegel.de/ausland/selenskyj-a-2/", { hours: 1 }),
      item("Donald Trump will aus seinem Triumphbogen einen Militaerkomplex",
        "SPIEGEL", "https://www.spiegel.de/ausland/trump-a-3/", { hours: 8 })]);
    expect(rows, "'Donald Trump' alone is not one story").toHaveLength(2);
  });

  test("two elections stay apart", () => {
    const rows = cluster([
      item("Far-left party wins Berlin election", "Reuters",
        "https://www.reuters.com/world/europe/berlin-1/"),
      item("Russia ruling party on track to win wartime election", "Reuters",
        "https://www.reuters.com/world/europe/russia-1/")]);
    expect(rows).toHaveLength(2);
  });
});

describe("score", () => {
  test("agreement beats a lone report", () => {
    const url = "https://www.reuters.com/world/quake/";
    const both = cluster([item("Quake hits the coast", "Reuters", url),
      item("Quake hits the coast", "HN", url)])[0];
    const lone = cluster([item("Minor firm repays investors", "Reuters",
      "https://www.reuters.com/world/firm/")])[0];
    expect(score(both)).toBeGreaterThan(score(lone));
  });

  test("a fresh trivial wire loses to an older agreed story", () => {
    const url = "https://www.reuters.com/world/summit/";
    const agreed = cluster([
      item("Leaders agree a summit date", "Reuters", url, { hours: 6 }),
      item("Leaders agree a summit date", "SPIEGEL", url, { hours: 6 })])[0];
    const fresh = cluster([item("Small fund says it will repay holders", "Reuters",
      "https://www.reuters.com/world/fund/", { hours: 0.05 })])[0];
    expect(score(agreed)).toBeGreaterThan(score(fresh));
  });

  test("prominence stays in range", () => {
    for (const s of [item("t", "HN", "https://e.com/1", { points: 100000 }),
      item("t", "HN", "https://e.com/2", { points: 0 }),
      item("t", "SPIEGEL", "https://e.com/3", { pos: 9, n: 10 }),
      item("t", "Reuters", "https://e.com/4")]) {
      expect(prominence(s)).toBeGreaterThanOrEqual(0);
      expect(prominence(s)).toBeLessThanOrEqual(1);
    }
  });

  test("HN without a section counts as tech", () => {
    const c = cluster([item("A curious compiler story", "HN",
      "https://blog.example.com/x", { points: 50 })])[0];
    expect(topic(c)[0]).toBe("tech");
  });

  test("a podcast slug counts as soft", () => {
    const c = cluster([item("No Dogs in Space is back", "The Verge",
      "https://www.theverge.com/report/9/no-dogs-music/")])[0];
    expect(topic(c)[0]).toBe("soft");
  });
});

function build(rows: Story[]): Row[] {
  const out = cluster(rows);
  for (const c of out) c.score = score(c);
  return out;
}

// Each filler title uses different words. Similar titles would join into
// one row and the test would then measure nothing.
const FILLER = ["Harbour tariff talks stall again", "Glacier survey finds thin ice",
  "Bond yields slip before auction", "Census counts fewer households",
  "Rail operator delays new timetable", "Court rejects mining appeal",
  "Wheat exports reach a record", "Vaccine trial enters last phase",
  "Currency board keeps rate steady", "Fishery quota cut agreed",
  "Airport expansion loses funding", "Telecom merger clears review"];

describe("select", () => {
  test("soft news never leads the page", () => {
    const rows = [item("No Dogs in Space is back", "The Verge",
      "https://www.theverge.com/report/9/no-dogs-music/", { hours: 0.1 })];
    FILLER.forEach((t, i) =>
      rows.push(item(t, "Reuters", `https://www.reuters.com/world/n-${i}/`, { hours: 30 })));
    const picked = select(build(rows), 20);
    const at = picked.flatMap((c, i) => (SOFT_TOPICS.has(c.topic!) ? [i] : []));
    expect(at.length > 0 && at[0] >= SOFT_FLOOR, `soft row landed at ${at}`).toBe(true);
  });

  test("one source does not own the head of the page", () => {
    const rows = FILLER.map((t, i) =>
      item(t, "Reuters", `https://www.reuters.com/world/w-${i}/`, { hours: 0.2 }));
    FILLER.slice(0, 6).forEach((t, i) => rows.push(item(t.toUpperCase() + " feature",
      "SPIEGEL", `https://www.spiegel.de/ausland/f-${i}/`, { pos: i, n: 6, hours: 3 })));
    const picked = select(build(rows), 10);
    expect(picked.filter((c) => c.source === "Reuters").length,
      "one source took the whole page").toBeLessThan(10);
  });

  test("it returns what it is asked for", () => {
    const rows = FILLER.map((t, i) => item(t, "Reuters", `https://www.reuters.com/world/${i}/`));
    expect(select(build(rows), 5)).toHaveLength(5);
    expect(select(build(rows), 99)).toHaveLength(FILLER.length);
  });
});

// Party politics leaves the list. An act of government stays, because a
// court ruling and an export rule are why a reader opens wire.
describe("politics", () => {
  const pol = (title: string, source = "Reddit",
               url = "https://www.reddit.com/r/worldnews/a/") =>
    political(cluster([item(title, source, url)])[0]);

  test("one decisive word drops the row", () => {
    expect(pol("Voters reject the plan in a referendum")).toBeGreaterThanOrEqual(POL_DROP);
  });

  test("a German compound drops the row", () => {
    // Both words come from a live batch. A list of whole words missed them.
    expect(pol("Kremlpartei fuehrt bei der Parlamentswahl", "SPIEGEL",
      "https://www.spiegel.de/ausland/r/")).toBeGreaterThanOrEqual(POL_DROP);
  });

  test("a lookalike German word scores nothing", () => {
    // "Auswahl" holds the letters of "Wahl" but means a selection, and
    // "wahlweise" means optionally. Neither is a vote.
    expect(pol("Auswahl an neuen Modellen wahlweise in Blau", "SPIEGEL",
      "https://www.spiegel.de/wirtschaft/s/")).toBe(0);
  });

  test("government news is not party politics", () => {
    // One weak word alone. wire keeps this row: it is tech policy. The
    // word still scores, so the weak tier stays measurable.
    const p = pol("Lawmakers press a chip maker over export rules");
    expect(p > 0 && p < POL_DROP, String(p)).toBe(true);
  });

  test("a politician alone does not drop the row", () => {
    // An act of government. The name costs the row a little and no more.
    const p = pol("Merz government prepares sanctions against the court",
      "Reuters", "https://www.reuters.com/legal/icc-1/");
    expect(p > 0 && p < POL_DROP, String(p)).toBe(true);
  });

  test("a politician and a campaign word drop the row", () => {
    expect(pol("Newsom leads Vance in the primaries")).toBeGreaterThanOrEqual(POL_DROP);
  });

  test("a name on the always list drops every row", () => {
    // The reader asked for this one. It holds even when the story is an
    // act of government, which any other name would leave on the page.
    for (const [title, url] of [
      ["Trump administration prepares sanctions against the court",
        "https://www.reuters.com/legal/icc-1/"],
      ["Trump now says he wants to form an AI Force",
        "https://www.theverge.com/news/1/ai-force/"],
      ["Trumpism after the rally", "https://www.reuters.com/world/t/"]]) {
      expect(pol(title, "Reuters", url), title).toBe(1);
    }
  });

  test("the always list reads the address too", () => {
    expect(pol("White House orders a review of chip export rules", "Reuters",
      "https://www.reuters.com/world/us/trump-chips-1/")).toBe(1);
  });

  test("the always list is a name and not a noun", () => {
    // A trump card is a card, and "trumps" is a verb.
    for (const title of ["A trump card for the defence in the mining appeal",
      "Battery life trumps raw speed in the new handset"]) {
      expect(pol(title, "The Verge", "https://www.theverge.com/tech/1/x/"), title).toBe(0);
    }
  });

  test("both spellings of a name score", () => {
    // SPIEGEL writes Selenskyj and Netanjahu. Reuters writes Zelenskiy and
    // Netanyahu. A row must not depend on which source won the headline.
    for (const title of ["Selenskyj und Netanjahu treffen sich",
      "Zelenskiy and Netanyahu hold a meeting"]) {
      expect(all(POL_NAMES, title), title).toHaveLength(2);
    }
  });

  test("an umlaut name scores in both spellings", () => {
    for (const title of ["Söder fordert mehr Geld", "Soeder fordert mehr Geld"]) {
      expect(POL_NAMES.test(title), title).toBe(true);
    }
  });

  test("a surname that is a common word stays harmless", () => {
    // "Tusk" is a name and a tooth. The plural is only a tooth.
    expect(pol("Poachers seized 400 elephant tusks in transit")).toBe(0);
  });

  test("a court ruling stays", () => {
    expect(pol("Court voids a privacy ruling on ad tracking", "Reuters",
      "https://www.reuters.com/legal/ads-1/")).toBeLessThan(0.5);
  });

  test("the section alone does not drop the row", () => {
    // SPIEGEL files a pension debate under the same path as a coalition
    // crisis. The section damps the row. It does not remove it.
    const p = pol("Rente soll fruher steigen als geplant", "SPIEGEL",
      "https://www.spiegel.de/politik/deutschland/r/");
    expect(p > 0 && p < POL_DROP, String(p)).toBe(true);
  });

  test("a political row does not reach the page", () => {
    const hot = item("Governing bloc loses the runoff", "Reuters",
      "https://www.reuters.com/world/europe/vote-1/", { hours: 0.1 });
    const clusters = build([hot, ...FILLER.map((t, i) =>
      item(t, "Reuters", `https://www.reuters.com/world/n-${i}/`, { hours: 30 }))]);
    const best = clusters.reduce((a, b) => (b.score! > a.score! ? b : a));
    const picked = select(clusters, 20);
    expect(picked.map((c) => c.title)).not.toContain(hot.title);
    // The row was the best of the batch, so the drop, and not the age
    // decay, is what removed it.
    expect(best.title).toBe(hot.title);
  });
});

// JS reads \w and \b as ASCII. These cases break when a rule falls back to
// them: the word edge then sits at each umlaut.
describe("unicode words", () => {
  test("a name with an umlaut is one token", () => {
    expect(tokens("Söder trifft Selenskyj")).toEqual(new Set(["söder", "trifft", "selenskyj"]));
  });

  test("a sharp s and an accent stay inside the token", () => {
    expect(tokens("Straße für Orbán")).toEqual(new Set(["straße", "für", "orbán"]));
  });

  test("a German quote and a dash split tokens", () => {
    expect(tokens("„Wahlkampf“ – Merz’ Plan")).toEqual(new Set(["wahlkampf", "merz", "plan"]));
  });

  test("a weak word with an umlaut matches the whole word", () => {
    expect(all(POL_WEAK, "Ministerpräsidentin tritt zurück")).toEqual(["Ministerpräsidentin"]);
  });

  test("a compound with an umlaut matches the whole word", () => {
    expect(all(POL_STRONG, "Bürgermeisterwahl in Köln")).toEqual(["Bürgermeisterwahl"]);
  });

  test("a compound inside German quotes matches", () => {
    expect(POL_STRONG.test("„Parteitag“ beginnt")).toBe(true);
  });

  test("a name does not match inside a longer word", () => {
    // Södermalm is a part of Stockholm. An ASCII edge would sit after the
    // ö of "Ümerz" and find "merz" in it.
    expect(POL_NAMES.test("Södermalm bekommt eine Fähre")).toBe(false);
    expect(POL_NAMES.test("Ümerz")).toBe(false);
  });

  test("names with a breve or an accent match", () => {
    expect(all(POL_NAMES, "Erdoğan, Orbán und Sánchez")).toEqual(["Erdoğan", "Orbán", "Sánchez"]);
  });

  test("an umlaut name adds one weak word", () => {
    const p = political(cluster([item("Söder stellt neue Brücke vor", "SPIEGEL",
      "https://www.spiegel.de/wirtschaft/b/")])[0]);
    expect(p).toBe(0.25);
  });
});

describe("parse", () => {
  test("a Reddit row points at the article", () => {
    const body = `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom"><entry>
        <title>Trump on Iran</title>
        <link href="https://www.reddit.com/r/worldnews/comments/1a/trump_on_iran/"/>
        <updated>2026-09-20T10:00:00+00:00</updated>
        <content type="html">&lt;span&gt;&lt;a href="https://thehill.com/news/6100347-trump/"&gt;[link]&lt;/a&gt;&lt;/span&gt;</content>
      </entry></feed>`;
    const rows = parseFeed(body, "Reddit");
    expect(rows).toHaveLength(1);
    expect(rows[0].publisher).toBe("thehill.com");
    expect(rows[0].discuss).toContain("reddit.com");
    expect(rows[0].origin).toContain("reddit.com");
  });

  test("an ampersand in the Reddit target is decoded", () => {
    const body = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Fees rise</title>
      <link href="https://www.reddit.com/r/worldnews/comments/1b/fees/"/>
      <content type="html">&lt;span&gt;&lt;a href="https://example.com/a?x=1&amp;amp;y=2"&gt;[link]&lt;/a&gt;&lt;/span&gt;</content>
      </entry></feed>`;
    expect(parseFeed(body, "Reddit")[0].url).toBe("https://example.com/a?x=1&y=2");
  });

  test("an HN row reads the points, the comments, and the thread", () => {
    const body = `<rss version="2.0"><channel><item>
      <title>A small compiler</title><link>https://example.com/cc</link>
      <pubDate>Sat, 20 Sep 2026 10:00:00 +0000</pubDate>
      <description><![CDATA[<p>Article URL: <a href="https://example.com/cc">x</a></p>
      <p>Comments URL: <a href="https://news.ycombinator.com/item?id=42">y</a></p>
      <p>Points: 120</p><p># Comments: 33</p>]]></description>
      </item></channel></rss>`;
    const [row] = parseFeed(body, "HN");
    expect(row).toMatchObject({ url: "https://example.com/cc", points: 120, comments: 33,
      discuss: "https://news.ycombinator.com/item?id=42",
      published: Date.parse("2026-09-20T10:00:00Z") / 1000 });
  });

  test("an entity in a title is decoded", () => {
    const body = `<rss><channel><item><title>Fish &amp;amp; chips</title>
      <link>https://example.com/f</link></item></channel></rss>`;
    expect(parseFeed(body, "SPIEGEL")[0].title).toBe("Fish & chips");
  });

  test("the sitemap reads the address, the title, and the date", () => {
    const body = `<urlset><url><loc>https://www.reuters.com/world/a-1/</loc><news:news>
      <news:publication_date>2026-09-20T10:00:00Z</news:publication_date>
      <news:title><![CDATA[Quake hits the coast]]></news:title></news:news></url></urlset>`;
    expect(parseSitemap(body, "Reuters")[0]).toMatchObject({
      title: "Quake hits the coast", url: "https://www.reuters.com/world/a-1/",
      published: Date.parse("2026-09-20T10:00:00Z") / 1000, pos: 0, n: 1 });
  });
});

describe("wall", () => {
  test("Berlin is two hours ahead in summer and one in winter", () => {
    expect(wall(Date.parse("2026-07-01T10:05:00Z"))).toBe("12:05");
    expect(wall(Date.parse("2026-12-01T10:05:00Z"))).toBe("11:05");
  });

  test("the clock changes at 01:00 UTC on the last Sunday", () => {
    // 2026-10-25 and 2026-03-29 are the last Sundays of October and March.
    expect(wall(Date.parse("2026-10-25T00:59:00Z"))).toBe("02:59");
    expect(wall(Date.parse("2026-10-25T01:00:00Z"))).toBe("02:00");
    expect(wall(Date.parse("2026-03-29T00:59:00Z"))).toBe("01:59");
    expect(wall(Date.parse("2026-03-29T01:00:00Z"))).toBe("03:00");
  });
});
