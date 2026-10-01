import { decode } from "html-entities";

// Python `\w` and `\b` read Unicode. JS `\w` and `\b` read ASCII alone, even
// with the `u` flag, and then split "Söder" into "s" and "der". Each rule
// below thus spells a word letter as W and a word edge as a lookaround.
// W is not `[\p{L}\p{N}_]`. V8 compiles a regex again for a string with a
// character above U+00FF, such as a dash, and with \p{L} that costs 7 ms for
// one rule. A Worker has 10 ms. W lists the letters and digits that Python
// `\w` reads in Latin, Greek, Cyrillic, kana, CJK, and Hangul, and nothing
// else, so a rule costs 0.5 ms. In other scripts a letter counts as a word
// edge. scripts/word-class.mjs writes the list.
const W_SET = "0-9A-Z_a-z\u00AA\u00B2-\u00B3\u00B5\u00B9-\u00BA\u00BC-\u00BE\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376-\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312F\u3131-\u318E\u3192-\u3195\u31A0-\u31BF\u31F0-\u31FF\u3220-\u3229\u3248-\u324F\u3251-\u325F\u3280-\u3289\u32B1-\u32BF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7A3";
const W = `[${W_SET}]`;
const START = `(?<!${W})`;
const END = `(?!${W})`;
const re = (src: string, flags = "") => new RegExp(src, flags + "u");
const words = (body: string, flags = "i") => re(`${START}(?:${body})${END}`, flags);

export type Prominence = "points" | "position" | "flat";
export type Kind = "feed" | "sitemap";

export interface Source {
  name: string;
  url: string;
  kind: Kind;
  max: number;
  window: number;
  prominence: Prominence;
  authority: number;
  home: string;
}

export interface Story {
  title: string;
  url: string;
  source: string;
  published: number;
  key: string;
  publisher: string;
  origin: string;
  points: number | null;
  comments: number | null;
  discuss: string | null;
  pos: number;
  n: number;
}

export interface Row {
  title: string;
  url: string;
  publisher: string;
  origin: string;
  source: string;
  sources: string[];
  members: Story[];
  published: number;
  points: number | null;
  comments: number | null;
  prom: number;
  topic?: string;
  pol?: number;
  score?: number;
  rank?: number;
}

export const now = () => Date.now() / 1000;

// Ranking constants. Each weight is a number of bits. The score is a sum, so
// you can read one weight as "how many times the age decay it cancels".
export const GRAVITY = 1.15; // bits of decay for each doubling of the age
// Hours added to the age before the decay. A wire republishes an item and the
// clock restarts, so a high floor keeps a trivial 5-minute item from beating a
// story that several sources carry.
export const AGE_FLOOR = 4.0;
export const MAX_AGE = 72.0; // hours; an older item leaves the list
export const SHOWN = 30; // rows on the page

export const W_PROM = 2.2; // standing inside its own source
export const W_CORR = 1.9; // independent sources on the same story
export const W_TOPIC = 1.0; // topic fit
export const W_PUB = 1.0; // publisher
export const W_POL = 1.8; // cost for party politics, at full confidence

export const SOURCE_SPREAD = 0.45; // cost for each earlier row from the same source
export const TOPIC_SPREAD = 0.28; // cost for each earlier row on the same topic
export const MAX_SPREAD = 0.9; // the largest cost a mixed page may charge one row
export const SOFT_FLOOR = 8; // soft news starts below this row, whatever it scores
export const SOFT_TOPICS = new Set(["soft", "celebrity"]);
export const POL_DROP = 0.6; // a row at this politics confidence or above leaves the list

export const SOURCES: Source[] = [
  { name: "HN", url: "https://hnrss.org/frontpage", kind: "feed",
    max: 12, window: 30, prominence: "points", authority: 1.0,
    home: "https://news.ycombinator.com/" },
  { name: "Reddit", url: "https://www.reddit.com/r/worldnews+technology+news/.rss",
    kind: "feed", max: 12, window: 30, prominence: "position", authority: 0.8,
    home: "https://www.reddit.com/r/worldnews+technology+news/" },
  { name: "SPIEGEL", url: "https://www.spiegel.de/schlagzeilen/tops/index.rss",
    kind: "feed", max: 12, window: 30, prominence: "position", authority: 0.95,
    home: "https://www.spiegel.de/" },
  // The feed order stands in for the homepage order. The homepage is 1 MB of
  // HTML, and a scrape of it costs more CPU than a Worker request may use.
  { name: "The Verge", url: "https://www.theverge.com/rss/index.xml", kind: "feed",
    max: 12, window: 30, prominence: "position", authority: 0.85,
    home: "https://www.theverge.com/" },
  { name: "Reuters",
    url: "https://www.reuters.com/arc/outboundfeeds/news-sitemap/?outputType=xml",
    kind: "sitemap", max: 12, window: 60, prominence: "flat", authority: 0.9,
    home: "https://www.reuters.com/" },
];

export const AUTHORITY: Record<string, number> =
  Object.fromEntries(SOURCES.map((s) => [s.name, s.authority]));
export const PROM_MODE: Record<string, Prominence> =
  Object.fromEntries(SOURCES.map((s) => [s.name, s.prominence]));
export const HOMES: Record<string, string> =
  Object.fromEntries(SOURCES.map((s) => [s.name, s.home]));

// A source drops an item when the URL matches. Reuters mirrors its wire in
// other languages and fills the sitemap with machine-written game recaps.
export const DROP: Record<string, RegExp> = {
  Reuters: re(String.raw`reuters\.com/(sports|lifestyle|fr|es|pt|de|it|ar|ja|ko|zh|cn|br)/`, "i"),
  SPIEGEL: re(String.raw`spiegel\.de/(sport|fussball|services|gutscheine|partnerschaften)/`, "i"),
  "The Verge": re(String.raw`theverge\.com/(deals|sponsored)/`, "i"),
};
export const DROP_TITLE = words("liveblog|live-?ticker|live updates|newsblog|im liveticker");

// The topic of a row. The first match wins. The user asked for world news,
// tech, science, and German news, so those carry a boost and soft news a cost.
export const TOPICS: [string, RegExp, number][] = [
  ["germany", re(String.raw`spiegel\.de/(politik/deutschland|wirtschaft)/`), 0.35],
  ["world", re(String.raw`reuters\.com/(world|legal)/|spiegel\.de/ausland/`
    + String.raw`|reddit\.com/r/(worldnews|news)/`), 0.35],
  ["science", re(String.raw`(arxiv\.org|nature\.com|science\.org|\.edu/)`
    + String.raw`|theverge\.com/science/`), 0.35],
  ["tech", re(String.raw`reddit\.com/r/technology/|theverge\.com/`
    + String.raw`(tech|ai-artificial-intelligence|cyber-security)/`), 0.35],
  ["business", re(String.raw`reuters\.com/(business|markets|technology)/`), 0.35],
  ["celebrity", re(String.raw`spiegel\.de/panorama/leute/|/celebrity/`), -2.5],
  ["soft", re(String.raw`spiegel\.de/(familie|stil|reise|gesundheit|auto|panorama`
    + String.raw`|kultur|literatur)/`
    + String.raw`|theverge\.com/(entertainment|podcast|column|games`
    + String.raw`|report/[^/]*(music|podcast))/`), -1.8],
];
export const TECH_WORDS = words(
  "ai|llm|gpu|chip|linux|rust|python|kernel|compiler|database|browser"
  + "|open ?source|encryption|protocol|api|semiconductor|quantum");
// A section name does not always mark soft news. The Verge files a music
// podcast under /report/, so the address itself gets a second look.
export const SOFT_SLUG = re(
  "/[^/]*(podcast|music|movie|film|tv-show|streaming-guide|trailer|recap"
  + "|best-deals|gift-guide|review-roundup|horoscope)[^/]*/?$", "i");

// Party politics: an election, a parliament, a minister, a campaign. An act of
// government is not party politics. A court ruling, a chip export rule, and a
// privacy law stay on the page, because they are why a reader opens wire.
// A section cannot decide alone. SPIEGEL files a coalition crisis and a pension
// debate under one politik/ path, and Reddit files both under r/worldnews. So
// the score reads the section and the title, and returns a confidence.
export const POL_SECTION = re(String.raw`spiegel\.de/politik/`, "i");
// One of these words settles the row on its own. German builds a compound for
// each of them, thus no list of whole words can hold them: one live batch gave
// Parlamentswahl and Kremlpartei, and both scored zero against such a list. The
// two German rules read the stem and name the exceptions. "Auswahl" is a
// selection and "wahlweise" means optionally. Neither is a vote.
export const POL_STRONG = words(
  "elections?|electoral|re-?elections?|ballots?|referendums?|primaries"
  + `|caucus|midterms?|runoffs?|impeach${W}*|gerrymander${W}*|no-confidence`
  + `|(?!aus|vor|an)${W}*wahl(?!weise)${W}*|${W}*partei${W}*|koalition${W}*`
  + "|misstrauensvotum");
// These words also fit plain government news, so one of them is not enough.
// "Lawmakers press a chip maker" must stay. "Lawmakers before the runoff" goes.
export const POL_WEAK = words(
  "candidates?|incumbents?|constituency|senators?|governor|lawmakers?"
  + `|parliament${W}*|coalition|cabinet|reshuffle|minister${W}*|chancellor`
  + `|presidential|bundestag|bundesrat|landtag|kanzler${W}*`
  + `|regierung${W}*|abgeordnete${W}*|fraktion${W}*`);

// A name that the reader never wants to read. A match sets the confidence to 1,
// thus the row always leaves the list, whatever the story tells. This is a
// reader rule and not a measurement. It removes an act of government too, and
// that is the point of it. Keep it apart from POL_NAMES: a name here obeys no
// tier and no threshold, so the two lists must not hold the same name.
// The rule reads the headline and the address. It must not read the noun: a
// trump card is a card, and "security trumps speed" is a verb.
export const POL_ALWAYS = re(`${START}trump(?:ism|ists?)?${END}(?!\\s+card)`, "i");

// The 24 politicians that the sources of wire name most. A name is a weak word
// on purpose. "Trump sanctions the court" is an act of government and stays.
// "Trump before the midterms" is a campaign and goes, because the name and the
// decisive word reach POL_DROP together. A name is also the one part of this
// file with a shelf life: review the list after an election. A surname that is
// also a common word, such as Tusk, costs little, because one weak word alone
// never drops a row.
// Each source spells a transliterated name its own way. SPIEGEL writes
// Selenskyj and Netanjahu, Reuters writes Zelenskiy and Netanyahu, so each
// spelling needs its own entry. An umlaut has the same problem: a German page
// writes Söder and a wire writes Soeder.
export const POL_NAMES = words(
  "merz|weidel|klingbeil|s(?:ö|oe|o)der|pistorius|scholz"
  + "|vance|rubio|hegseth|newsom"
  + "|macron|starmer|meloni|leyen|orb(?:a|á)n|tusk|s(?:a|á)nchez"
  + "|putin|selenskyj|zelensk(?:y|iy|yy)|netan(?:j|y)ahu|modi|jinping"
  + "|erdo(?:g|ğ)an|milei");

export const PUB_GOOD = re(
  String.raw`(^|\.)(reuters\.com|apnews\.com|bbc\.co\.uk|bbc\.com|ft\.com|economist\.com`
  + String.raw`|nature\.com|science\.org|arstechnica\.com|theverge\.com|spiegel\.de`
  + String.raw`|zeit\.de|faz\.net|github\.com|arxiv\.org|acm\.org|ieee\.org)$|\.(gov|edu)$`,
  "i");
export const PUB_POOR = re(
  String.raw`(^|\.)(msn\.com|dailymail\.co\.uk|the-sun\.com|nypost\.com|mirror\.co\.uk`
  + String.raw`|express\.co\.uk|dailystar\.co\.uk|newsweek\.com|zerohedge\.com)$`, "i");
export const CLICKBAIT = re(
  String.raw`^\p{Nd}+\s+(things|ways|reasons|signs)${END}`
  + `|${START}(you won'?t believe|here'?s why`
  + `|this is why|shocking|goes viral|slams|blasts|destroys)${END}`, "i");

export const TRACKING = re(
  `^(utm_${W}*|at_${W}*|fbclid|gclid|mc_${W}*|igshid|cmpid|ito|smid|icid`
  + "|ref|ref_src|referrer|share_id|taid)$", "i");
export const STOP = new Set(`
the a an and or of to in on for with from by at as is are was were be been it
its this that these those has have had will would can could not new says say
said after over into out up down more most than then when what who how why
der die das und oder von zu in im auf fur mit aus bei ist sind war waren wird
werden hat haben nach uber ein eine einen einem einer des dem den als am um so
sich nicht auch noch schon nur wie was wer wo mehr gegen vor beim zum zur
`.split(/\s+/).filter(Boolean));

export function age(ts: number, at = now()): string {
  const delta = Math.max(0, at - ts);
  for (const [step, unit] of [[86400, "d"], [3600, "h"], [60, "m"]] as const) {
    if (delta >= step) return `${Math.floor(delta / step)}${unit} ago`;
  }
  return "just now";
}

/** One address for one article, so two sources can match. */
export function canonical(url: string): string {
  let s: URL;
  try {
    s = new URL(url.trim());
  } catch {
    return url.trim().toLowerCase();
  }
  let host = s.hostname.toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  if (host.startsWith("m.")) host = host.slice(2);
  if (host.endsWith(".amp")) host = host.slice(0, -4);
  const path = s.pathname.replace(/\/amp\/?$/, "").replace(/\/+$/, "") || "/";
  // Python parse_qsl drops a key with a blank value, so this does too.
  const query = new URLSearchParams();
  for (const [k, v] of s.searchParams) {
    if (v && !TRACKING.test(k)) query.append(k, v);
  }
  const q = query.toString();
  return `https://${host}${path}${q ? "?" + q : ""}`;
}

export function publisher(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
  return host.startsWith("www.") ? host.slice(4) : host;
}

export interface StoryExtra {
  origin?: string;
  points?: number | null;
  comments?: number | null;
  discuss?: string | null;
  pos?: number;
  n?: number;
}

/** One row before ranking. `url` is where the reader goes. `origin` is the
 * address on the source itself, which carries the section and the subreddit. */
export function story(title: string, url: string, source: string, published: number,
                      kw: StoryExtra = {}): Story {
  url = url.trim();
  return {
    title: decode(title.trim(), { level: "html5" }), url, source, published,
    key: canonical(url), publisher: publisher(url),
    origin: kw.origin ?? url,
    points: kw.points ?? null, comments: kw.comments ?? null,
    discuss: kw.discuss ?? null, pos: kw.pos ?? 0, n: kw.n ?? 1,
  };
}

/** False for an item that must not reach the list at all. */
export function keep(s: Story, at = now()): boolean {
  const rule = DROP[s.source];
  if (rule && rule.test(s.origin)) return false;
  if (DROP_TITLE.test(s.title)) return false;
  return (at - s.published) / 3600 <= MAX_AGE;
}

/** How high the item stands inside its own source, from 0 to 1. */
export function prominence(s: Story): number {
  const mode = PROM_MODE[s.source];
  if (mode === "points") return Math.min(1.0, (Math.max(0, s.points ?? 0) / 200) ** 0.6);
  if (mode === "position") return 1.0 - 0.7 * (s.pos / Math.max(1, s.n - 1));
  // A wire in publication order. No editor chose a top item, so no item may
  // claim one. A story that matters here reaches the top by agreement.
  return 0.32;
}

const NOT_WORD = new RegExp(`[^${W_SET}\\s]`, "gu");

export function tokens(title: string): Set<string> {
  const out = new Set<string>();
  for (const w of title.toLowerCase().replace(NOT_WORD, " ").split(/\s+/u)) {
    // Python counts code points, and JS counts UTF-16 units.
    if (w.length > 2 && [...w].length > 2 && !STOP.has(w)) out.add(w);
  }
  return out;
}

/** Weight for each word: rare in this batch means heavy. Every word keeps
 * a weight of 1, because in a small batch a shared word appears in every
 * document and a pure count would then call it worthless. */
export function idf(docs: Set<string>[]): Map<string, number> {
  const n = docs.length || 1;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d) df.set(t, (df.get(t) ?? 0) + 1);
  const out = new Map<string, number>();
  for (const [t, c] of df) out.set(t, 1.0 + Math.log(n / c));
  return out;
}

export const SIM_MIN = 0.25; // shared rare-word mass needed to call it one story
export const PAIR_WINDOW = 6 * 3600; // two shared words also need the same news cycle

function shared(a: Set<string>, b: Set<string>): string[] {
  const out: string[] = [];
  for (const t of a) if (b.has(t)) out.push(t);
  return out;
}

function mass(bag: Iterable<string>, weight: Map<string, number>): number {
  let sum = 0;
  for (const t of bag) sum += weight.get(t) ?? 1.0;
  return sum;
}

/** Shared weight over the smaller title. A word that is rare in this batch
 * counts most, so a shared name beats a shared common word. */
export function similar(a: Set<string>, b: Set<string>, weight: Map<string, number>): number {
  const both = shared(a, b);
  if (both.length < 2) return 0.0;
  const floor = Math.min(mass(a, weight), mass(b, weight)) || 1.0;
  return mass(both, weight) / floor;
}

/** Three shared rare words are enough on their own. Two are ambiguous:
 * 'Donald Trump' alone joins two unrelated reports, so those also need a
 * close publication time. */
export function sameStory(a: Set<string>, b: Set<string>, ta: number, tb: number,
                          weight: Map<string, number>): boolean {
  const count = shared(a, b).length;
  if (count < 2 || similar(a, b, weight) < SIM_MIN) return false;
  return count >= 3 || Math.abs(ta - tb) <= PAIR_WINDOW;
}

/** Group the items that tell the same story. Two items join on the same
 * article address, or on an overlap of rare title words. */
export function cluster(stories: Story[]): Row[] {
  const groups: Story[][] = [];
  const byKey = new Map<string, Story[]>();
  for (const s of stories) {
    const g = byKey.get(s.key);
    if (g) g.push(s);
    else {
      const fresh = [s];
      byKey.set(s.key, fresh);
      groups.push(fresh);
    }
  }
  const bags = groups.map((g) => tokens(g[0].title));
  const when = groups.map((g) => Math.min(...g.map((s) => s.published)));
  const weight = idf(bags);
  const merged = new Set<number>();
  const out: Story[][] = [];
  groups.forEach((g, i) => {
    if (merged.has(i)) return;
    const members = [...g];
    const bag = new Set(bags[i]);
    const at = when[i];
    for (let j = i + 1; j < groups.length; j++) {
      if (merged.has(j) || !sameStory(bag, bags[j], at, when[j], weight)) continue;
      merged.add(j);
      members.push(...groups[j]);
      for (const t of bags[j]) bag.add(t);
    }
    out.push(members);
  });
  return out.map(summarise);
}

const standing = (s: Story) => prominence(s) * AUTHORITY[s.source];

/** One row from the items that tell the same story. The item with the
 * highest standing gives the headline and the link. */
export function summarise(members: Story[]): Row {
  let best = members[0];
  for (const s of members) if (standing(s) > standing(best)) best = s;
  const points = Math.max(...members.map((s) => s.points ?? 0));
  const comments = Math.max(...members.map((s) => s.comments ?? 0));
  return {
    title: best.title, url: best.url, publisher: best.publisher,
    origin: best.origin, source: best.source,
    sources: [...new Set(members.map((s) => s.source))],
    members, published: Math.min(...members.map((s) => s.published)),
    points: points || null, comments: comments || null,
    prom: Math.max(...members.map(standing)),
  };
}

export function topic(c: Row): [string, number] {
  const text = c.origin + " " + c.url;
  for (const [name, rule, w] of TOPICS) if (rule.test(text)) return [name, w];
  if (SOFT_SLUG.test(text)) return ["soft", -1.8];
  if (TECH_WORDS.test(c.title)) return ["tech", 0.35];
  // The HN front page is already a tech and science filter, so an item that
  // matches no section rule still belongs to that side of the list.
  if (c.sources.includes("HN")) return ["tech", 0.35];
  return ["other", 0.0];
}

/** How sure wire is that the row is party politics, from 0 to 1. The
 * section gives 0.4, one decisive word gives 0.6, and each weak word gives
 * 0.25. A weak word is a word that also fits plain government news, or the
 * name of a politician. A row at POL_DROP or above leaves the list. A row
 * below it stays and pays W_POL for the part it scores. A name in
 * POL_ALWAYS skips the count and takes the row off the page. */
// Python findall(). matchAll() would be shorter, but it clones the regex on
// each call, and V8 then compiles the Unicode classes again for every row.
// One global copy keeps one compiled program. The g flag makes test() keep a
// position, thus the exported rules stay without it.
const POL_WEAK_ALL = new RegExp(POL_WEAK, "giu");
const POL_NAMES_ALL = new RegExp(POL_NAMES, "giu");

function findall(rule: RegExp, text: string, into: Set<string>) {
  rule.lastIndex = 0;
  for (let m = rule.exec(text); m; m = rule.exec(text)) into.add(m[0].toLowerCase());
}

export function political(c: Row): number {
  if (POL_ALWAYS.test(c.title + " " + c.url)) return 1.0;
  let pol = POL_SECTION.test(c.origin + " " + c.url) ? 0.4 : 0.0;
  if (POL_STRONG.test(c.title)) pol += 0.6;
  const weak = new Set<string>();
  findall(POL_WEAK_ALL, c.title, weak);
  findall(POL_NAMES_ALL, c.title, weak);
  pol += 0.25 * weak.size;
  return Math.min(1.0, pol);
}

/** The value of one row, in bits. Every term is a sum, so the page can
 * explain itself: standing, agreement, topic, publisher, minus age. */
export function score(c: Row, at = now()): number {
  const [name, tw] = topic(c);
  const pol = political(c);
  let pub = PUB_GOOD.test(c.publisher) ? 0.45 : PUB_POOR.test(c.publisher) ? -0.8 : 0.0;
  if (CLICKBAIT.test(c.title)) pub -= 0.8;
  const hours = Math.max(0.0, at - c.published) / 3600;
  c.topic = name;
  c.pol = pol;
  return (W_PROM * c.prom
    + W_CORR * Math.log2(1 + c.sources.length)
    + W_TOPIC * tw
    + W_PUB * pub
    - W_POL * pol
    - GRAVITY * Math.log2(hours + AGE_FLOOR));
}

/** Take the best row, then make the next row of the same source or topic
 * cost more. The page stays mixed instead of one source in a block. A row
 * that reads as party politics does not reach the page at all. */
export function select(clusters: Row[], n: number): Row[] {
  // The drop sits here and not in keep(). keep() reads one item, and all five
  // sources carry politics, thus a drop there removes one copy and cluster()
  // then builds the same row again from the other four.
  const pool = clusters.filter((c) => c.pol! < POL_DROP)
    .sort((a, b) => b.score! - a.score!);
  const picked: Row[] = [];
  const usedSrc = new Map<string, number>();
  const usedTop = new Map<string, number>();
  while (pool.length && picked.length < n) {
    // Culture and celebrity stay off the head of the page. They keep their
    // place further down, where they cost the reader nothing.
    const hold = picked.length < SOFT_FLOOR;
    let room = pool.flatMap((c, i) => (hold && SOFT_TOPICS.has(c.topic!) ? [] : [i]));
    if (!room.length) room = pool.map((_, i) => i); // only soft rows are left
    let bestAt = -1;
    let bestAdj = -Infinity;
    for (const i of room) {
      const c = pool[i];
      // The cost grows with each repeat but levels off, and it stops at
      // MAX_SPREAD. A mixed page is worth a small loss of quality, never
      // a large one, so a weak row cannot climb over a much better row.
      const spread = SOURCE_SPREAD * Math.log2(1 + (usedSrc.get(c.source) ?? 0))
        + TOPIC_SPREAD * Math.log2(1 + (usedTop.get(c.topic!) ?? 0));
      const adj = c.score! - Math.min(MAX_SPREAD, spread);
      if (bestAt < 0 || adj > bestAdj) {
        bestAt = i;
        bestAdj = adj;
      }
    }
    const [best] = pool.splice(bestAt, 1);
    usedSrc.set(best.source, (usedSrc.get(best.source) ?? 0) + 1);
    usedTop.set(best.topic!, (usedTop.get(best.topic!) ?? 0) + 1);
    picked.push(best);
  }
  return picked;
}
