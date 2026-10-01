"""Tests for the ranking. No test makes a network request.

Run it with:  .venv/bin/python -m unittest discover -s test -p 'test_*.py'
"""
import os
import sys
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app  # noqa: E402


def item(title, source, url, **kw):
    kw.setdefault("pos", 0)
    kw.setdefault("n", 10)
    hours = kw.pop("hours", 1.0)
    s = app.story(title, url, source, time.time() - hours * 3600, **kw)
    s["origin"] = kw.get("origin", url)
    return s


class Canonical(unittest.TestCase):
    def test_strips_tracking_and_host_noise(self):
        a = app.canonical("https://www.example.com/a/b/?utm_source=x&id=7")
        b = app.canonical("http://example.com/a/b?id=7")
        self.assertEqual(a, b)

    def test_strips_amp_and_mobile(self):
        self.assertEqual(app.canonical("https://m.example.com/a/amp"),
                         app.canonical("https://example.com/a"))

    def test_keeps_a_meaningful_query(self):
        self.assertIn("id=7", app.canonical("https://example.com/p?id=7"))


class Keep(unittest.TestCase):
    def test_drops_reuters_sports(self):
        s = item("Packers sink Jets in OT", "Reuters",
                 "https://www.reuters.com/sports/nfl/packers-sink-jets/")
        self.assertFalse(app.keep(s))

    def test_drops_a_translated_wire(self):
        s = item("Allemagne-L'AfD en tete", "Reuters",
                 "https://www.reuters.com/fr/allemagne-afd/")
        self.assertFalse(app.keep(s))

    def test_drops_spiegel_sport(self):
        s = item("Real Madrid verliert", "SPIEGEL",
                 "https://www.spiegel.de/sport/fussball/real-madrid-a-1/")
        self.assertFalse(app.keep(s))

    def test_drops_an_evergreen_item(self):
        s = item("Rente: So kommen Sie auf 2000 Euro", "SPIEGEL",
                 "https://www.spiegel.de/wirtschaft/rente-a-1/", hours=235 * 24)
        self.assertFalse(app.keep(s))

    def test_drops_a_live_blog(self):
        s = item("Wahl 2026 im Liveblog", "SPIEGEL",
                 "https://www.spiegel.de/politik/deutschland/wahl-a-1/")
        self.assertFalse(app.keep(s))

    def test_keeps_real_news(self):
        s = item("Far-left party wins Berlin election", "Reuters",
                 "https://www.reuters.com/world/europe/berlin-election/")
        self.assertTrue(app.keep(s))


class Cluster(unittest.TestCase):
    def test_one_article_on_two_sources_becomes_one_row(self):
        url = "https://www.reuters.com/business/altman-un/"
        rows = app.cluster([item("Altman to brief UN", "Reuters", url),
                            item("Altman to Brief UN", "HN", url, points=99)])
        self.assertEqual(len(rows), 1)
        self.assertEqual(set(rows[0]["sources"]), {"Reuters", "HN"})

    def test_three_shared_rare_words_merge(self):
        rows = app.cluster([
            item("AfD leads as Merz rues disaster in state election", "Reuters",
                 "https://www.reuters.com/world/europe/afd-1/"),
            item("Germany far-right AfD leads race in state, exit poll", "Reuters",
                 "https://www.reuters.com/world/europe/afd-2/")])
        self.assertEqual(len(rows), 1)

    def test_two_shared_words_in_one_news_cycle_merge(self):
        rows = app.cluster([
            item("Selenskyj kuendigt Treffen mit Trump in New York an", "SPIEGEL",
                 "https://www.spiegel.de/ausland/selenskyj-a-1/", hours=1),
            item("Zelenskiy says he and Trump agree to meet in New York", "Reuters",
                 "https://www.reuters.com/world/zelenskiy-1/", hours=2)])
        self.assertEqual(len(rows), 1, "a cross-language pair should join")

    def test_one_shared_name_does_not_merge_two_reports(self):
        rows = app.cluster([
            item("Selenskyj kuendigt Treffen mit Donald Trump in New York an",
                 "SPIEGEL", "https://www.spiegel.de/ausland/selenskyj-a-2/", hours=1),
            item("Donald Trump will aus seinem Triumphbogen einen Militaerkomplex",
                 "SPIEGEL", "https://www.spiegel.de/ausland/trump-a-3/", hours=8)])
        self.assertEqual(len(rows), 2, "'Donald Trump' alone is not one story")

    def test_two_elections_stay_apart(self):
        rows = app.cluster([
            item("Far-left party wins Berlin election", "Reuters",
                 "https://www.reuters.com/world/europe/berlin-1/"),
            item("Russia ruling party on track to win wartime election", "Reuters",
                 "https://www.reuters.com/world/europe/russia-1/")])
        self.assertEqual(len(rows), 2)


class Score(unittest.TestCase):
    def test_agreement_beats_a_lone_report(self):
        url = "https://www.reuters.com/world/quake/"
        both = app.cluster([item("Quake hits the coast", "Reuters", url),
                            item("Quake hits the coast", "HN", url)])[0]
        lone = app.cluster([item("Minor firm repays investors", "Reuters",
                                 "https://www.reuters.com/world/firm/")])[0]
        self.assertGreater(app.score(both), app.score(lone))

    def test_a_fresh_trivial_wire_loses_to_an_older_agreed_story(self):
        url = "https://www.reuters.com/world/summit/"
        agreed = app.cluster([item("Leaders agree a summit date", "Reuters", url,
                                   hours=6),
                              item("Leaders agree a summit date", "SPIEGEL",
                                   url, hours=6)])[0]
        fresh = app.cluster([item("Small fund says it will repay holders",
                                  "Reuters",
                                  "https://www.reuters.com/world/fund/",
                                  hours=0.05)])[0]
        self.assertGreater(app.score(agreed), app.score(fresh))

    def test_prominence_stays_in_range(self):
        for s in (item("t", "HN", "https://e.com/1", points=100000),
                  item("t", "HN", "https://e.com/2", points=0),
                  item("t", "SPIEGEL", "https://e.com/3", pos=9, n=10),
                  item("t", "Reuters", "https://e.com/4")):
            self.assertTrue(0.0 <= app.prominence(s) <= 1.0)

    def test_hn_without_a_section_counts_as_tech(self):
        c = app.cluster([item("A curious compiler story", "HN",
                              "https://blog.example.com/x", points=50)])[0]
        self.assertEqual(app.topic(c)[0], "tech")

    def test_a_podcast_slug_counts_as_soft(self):
        c = app.cluster([item("No Dogs in Space is back", "The Verge",
                              "https://www.theverge.com/report/9/no-dogs-music/")])[0]
        self.assertEqual(app.topic(c)[0], "soft")


class Select(unittest.TestCase):
    def build(self, rows):
        out = app.cluster(rows)
        for c in out:
            c["score"] = app.score(c)
        return out

    # Each filler title uses different words. Similar titles would join into
    # one row and the test would then measure nothing.
    FILLER = ["Harbour tariff talks stall again", "Glacier survey finds thin ice",
              "Bond yields slip before auction", "Census counts fewer households",
              "Rail operator delays new timetable", "Court rejects mining appeal",
              "Wheat exports reach a record", "Vaccine trial enters last phase",
              "Currency board keeps rate steady", "Fishery quota cut agreed",
              "Airport expansion loses funding", "Telecom merger clears review"]

    def test_soft_news_never_leads_the_page(self):
        rows = [item("No Dogs in Space is back", "The Verge",
                     "https://www.theverge.com/report/9/no-dogs-music/", hours=0.1)]
        rows += [item(t, "Reuters", f"https://www.reuters.com/world/n-{i}/",
                      hours=30) for i, t in enumerate(self.FILLER)]
        picked = app.select(self.build(rows), 20)
        at = [i for i, c in enumerate(picked) if c["topic"] in app.SOFT_TOPICS]
        self.assertTrue(at and at[0] >= app.SOFT_FLOOR,
                        f"soft row landed at {at}")

    def test_one_source_does_not_own_the_head_of_the_page(self):
        rows = [item(t, "Reuters", f"https://www.reuters.com/world/w-{i}/",
                     hours=0.2) for i, t in enumerate(self.FILLER)]
        rows += [item(t.upper() + " feature", "SPIEGEL",
                      f"https://www.spiegel.de/ausland/f-{i}/", pos=i, n=6,
                      hours=3) for i, t in enumerate(self.FILLER[:6])]
        picked = app.select(self.build(rows), 10)
        self.assertLess(sum(c["source"] == "Reuters" for c in picked), 10,
                        "one source took the whole page")

    def test_it_returns_what_it_is_asked_for(self):
        rows = [item(t, "Reuters", f"https://www.reuters.com/world/{i}/")
                for i, t in enumerate(self.FILLER)]
        self.assertEqual(len(app.select(self.build(rows), 5)), 5)
        self.assertEqual(len(app.select(self.build(rows), 99)), len(self.FILLER))


class Politics(unittest.TestCase):
    """Party politics leaves the list. An act of government stays, because a
    court ruling and an export rule are why a reader opens wire."""

    def pol(self, title, source="Reddit",
            url="https://www.reddit.com/r/worldnews/a/"):
        return app.political(app.cluster([item(title, source, url)])[0])

    def test_one_decisive_word_drops_the_row(self):
        self.assertGreaterEqual(
            self.pol("Voters reject the plan in a referendum"), app.POL_DROP)

    def test_a_german_compound_drops_the_row(self):
        # Both words come from a live batch. A list of whole words missed them.
        self.assertGreaterEqual(
            self.pol("Kremlpartei fuehrt bei der Parlamentswahl", "SPIEGEL",
                     "https://www.spiegel.de/ausland/r/"), app.POL_DROP)

    def test_a_lookalike_german_word_scores_nothing(self):
        # "Auswahl" holds the letters of "Wahl" but means a selection, and
        # "wahlweise" means optionally. Neither is a vote.
        self.assertEqual(
            self.pol("Auswahl an neuen Modellen wahlweise in Blau", "SPIEGEL",
                     "https://www.spiegel.de/wirtschaft/s/"), 0.0)

    def test_government_news_is_not_party_politics(self):
        # One weak word alone. wire keeps this row: it is tech policy. The
        # word still scores, so the weak tier stays measurable.
        pol = self.pol("Lawmakers press a chip maker over export rules")
        self.assertTrue(0.0 < pol < app.POL_DROP, pol)

    def test_a_politician_alone_does_not_drop_the_row(self):
        # An act of government. The name costs the row a little and no more.
        pol = self.pol("Merz government prepares sanctions against the court",
                       "Reuters", "https://www.reuters.com/legal/icc-1/")
        self.assertTrue(0.0 < pol < app.POL_DROP, pol)

    def test_a_politician_and_a_campaign_word_drop_the_row(self):
        self.assertGreaterEqual(
            self.pol("Newsom leads Vance in the primaries"), app.POL_DROP)

    def test_a_name_on_the_always_list_drops_every_row(self):
        # The reader asked for this one. It holds even when the story is an
        # act of government, which any other name would leave on the page.
        for title, url in (
                ("Trump administration prepares sanctions against the court",
                 "https://www.reuters.com/legal/icc-1/"),
                ("Trump now says he wants to form an AI Force",
                 "https://www.theverge.com/news/1/ai-force/"),
                ("Trumpism after the rally", "https://www.reuters.com/world/t/")):
            self.assertEqual(self.pol(title, "Reuters", url), 1.0, title)

    def test_the_always_list_reads_the_address_too(self):
        self.assertEqual(
            self.pol("White House orders a review of chip export rules",
                     "Reuters", "https://www.reuters.com/world/us/trump-chips-1/"),
            1.0)

    def test_the_always_list_is_a_name_and_not_a_noun(self):
        # A trump card is a card, and "trumps" is a verb.
        for title in ("A trump card for the defence in the mining appeal",
                      "Battery life trumps raw speed in the new handset"):
            self.assertEqual(self.pol(title, "The Verge",
                                      "https://www.theverge.com/tech/1/x/"),
                             0.0, title)

    def test_both_spellings_of_a_name_score(self):
        # SPIEGEL writes Selenskyj and Netanjahu. Reuters writes Zelenskiy and
        # Netanyahu. A row must not depend on which source won the headline.
        for title in ("Selenskyj und Netanjahu treffen sich",
                      "Zelenskiy and Netanyahu hold a meeting"):
            self.assertEqual(len(app.POL_NAMES.findall(title)), 2, title)

    def test_an_umlaut_name_scores_in_both_spellings(self):
        for title in ("Söder fordert mehr Geld", "Soeder fordert mehr Geld"):
            self.assertTrue(app.POL_NAMES.search(title), title)

    def test_a_surname_that_is_a_common_word_stays_harmless(self):
        # "Tusk" is a name and a tooth. The plural is only a tooth.
        self.assertEqual(
            self.pol("Poachers seized 400 elephant tusks in transit"), 0.0)

    def test_a_court_ruling_stays(self):
        self.assertLess(self.pol("Court voids a privacy ruling on ad tracking",
                                 "Reuters",
                                 "https://www.reuters.com/legal/ads-1/"), 0.5)

    def test_the_section_alone_does_not_drop_the_row(self):
        # SPIEGEL files a pension debate under the same path as a coalition
        # crisis. The section damps the row. It does not remove it.
        pol = self.pol("Rente soll fruher steigen als geplant", "SPIEGEL",
                       "https://www.spiegel.de/politik/deutschland/r/")
        self.assertTrue(0.0 < pol < app.POL_DROP, pol)

    def test_a_political_row_does_not_reach_the_page(self):
        hot = item("Governing bloc loses the runoff", "Reuters",
                   "https://www.reuters.com/world/europe/vote-1/", hours=0.1)
        rows = [hot] + [item(t, "Reuters", f"https://www.reuters.com/world/n-{i}/",
                             hours=30) for i, t in enumerate(Select.FILLER)]
        clusters = app.cluster(rows)
        for c in clusters:
            c["score"] = app.score(c)
        best = max(clusters, key=lambda c: c["score"])
        picked = app.select(clusters, 20)
        self.assertNotIn(hot["title"], [c["title"] for c in picked])
        # The row was the best of the batch, so the drop, and not the age
        # decay, is what removed it.
        self.assertEqual(best["title"], hot["title"])


class Parse(unittest.TestCase):
    def test_reddit_row_points_at_the_article(self):
        body = """<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom"><entry>
          <title>Trump on Iran</title>
          <link href="https://www.reddit.com/r/worldnews/comments/1a/trump_on_iran/"/>
          <updated>2026-09-20T10:00:00+00:00</updated>
          <content type="html">&lt;span&gt;&lt;a href="https://thehill.com/news/6100347-trump/"&gt;[link]&lt;/a&gt;&lt;/span&gt;</content>
        </entry></feed>"""
        rows = app.parse_feed(body, "Reddit")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["publisher"], "thehill.com")
        self.assertIn("reddit.com", rows[0]["discuss"])
        self.assertIn("reddit.com", rows[0]["origin"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
