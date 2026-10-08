import type { Child } from "hono/jsx";
import { age, HOMES, PAGES, SOURCES, type Row } from "./rank";

export const SKY_500 = "#0ea5e9";
export const SKY_50 = "#f0f9ff";

export const CSS = `
:root {
  --sky-50:  #f0f9ff;
  --sky-500: #0ea5e9;
  --sky-600: #0284c7;
  --sky-950: #082f49;
}
body  { font-family:Verdana, Geneva, sans-serif; font-size:10pt; color:var(--sky-600); }
td    { font-family:Verdana, Geneva, sans-serif; font-size:10pt; color:var(--sky-600); }

a:link    { color:var(--sky-950); text-decoration:none; }
a:visited { color:var(--sky-600); text-decoration:none; }

.title   { font-family:Verdana, Geneva, sans-serif; font-size: 10pt; color:var(--sky-600); overflow:hidden; }
.subtext { font-family:Verdana, Geneva, sans-serif; font-size:  7pt; color:var(--sky-600); }
.yclinks { font-family:Verdana, Geneva, sans-serif; font-size:  8pt; color:var(--sky-600); }
.pagetop { font-family:Verdana, Geneva, sans-serif; font-size: 10pt; color:var(--sky-950); line-height:12px; }
.comhead { font-family:Verdana, Geneva, sans-serif; font-size:  8pt; color:var(--sky-600); }
.hnname  { margin-left: 1px; margin-right: 5px; }

#hnmain { width: 85%; min-width: 796px; margin: 0 auto; background: var(--sky-50); }

.title a { word-break: break-word; }

.pagetop a:visited { color:var(--sky-950); }
.topsel a:link, .topsel a:visited { color:#ffffff; }

.subtext a:link, .subtext a:visited { color:var(--sky-600); }
.subtext a:hover { text-decoration:underline; }

.comhead a:link, .comhead a:visited { color:var(--sky-600); }
.comhead a:hover { text-decoration:underline; }

/* The width of the HN vote arrow: 10px and a margin of 2px on each side. */
.votelinks { width: 14px; }
.corro { font-weight: bold; color: var(--sky-950); }

/* mobile device */
@media only screen
and (min-width : 300px)
and (max-width : 750px) {
  #hnmain { width: 100%; min-width: 0; }
  body { padding: 0; margin: 0; width: 100%; -webkit-text-size-adjust: none; }
  td { height: inherit !important; }
  .title { font-size: inherit; }
  span.pagetop { display: block; margin: 3px 5px; font-size: 12px; line-height: normal; }
  span.pagetop b { display: block; font-size: 15px; }
  .title { font-size: 11pt; line-height: 14pt; }
  .subtext { font-size: 9pt; }
  .itemlist { padding-right: 5px; }
  .votelinks { width: 18px; }
}
`;

export const MANIFEST = {
  name: "wire",
  short_name: "wire",
  description: "A minimal, read-only news reader with Hacker News' design.",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: SKY_50,
  theme_color: SKY_500,
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    { src: "/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

const Icons = () => (
  <>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="theme-color" content={SKY_500} />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="wire" />
  </>
);

function subline(c: Row, at: number): Child[] {
  const bits: Child[] = [];
  if (c.sources.length > 1) bits.push(<span class="corro">{c.sources.length} sources</span>, " ");
  if (c.points !== null) bits.push(<span class="score">{c.points} points</span>, " ");
  bits.push("by ", <a href={HOMES[c.source]} class="hnuser">{c.source}</a>, " ",
    <span class="age">{age(c.published, at)}</span>);
  if (c.comments !== null) bits.push(" | ", `${c.comments} comments`);
  // Every source that carried the story, so the reader can compare accounts.
  for (const m of c.members) {
    const link = m.discuss || m.url;
    if (link !== c.url || m.source !== c.source) {
      bits.push(" | ", <a href={link}>{m.source.toLowerCase()}</a>);
    }
  }
  return bits;
}

const StoryRow = ({ c, n, at }: { c: Row; n: number; at: number }) => (
  <>
    <tr class="athing">
      <td align="right" valign="top" class="title"><span class="rank">{n}.</span></td>
      <td valign="top" class="votelinks"></td>
      <td class="title">
        <span class="titleline">
          <a href={c.url}>{c.title}</a>
          <span class="sitebit comhead"> (<a href={c.url}><span class="sitestr">{c.publisher}</span></a>)</span>
        </span>
      </td>
    </tr>
    <tr>
      <td colspan={2}></td>
      <td class="subtext"><span class="subline">{subline(c, at)}</span></td>
    </tr>
    <tr class="spacer" style="height:5px"></tr>
  </>
);

function nav(path: string): Child[] {
  const links: Child[] = [];
  for (const p of PAGES) {
    if (links.length) links.push(" | ");
    const link = <a href={p.path}>{p.name}</a>;
    links.push(p.path === path ? <span class="topsel">{link}</span> : link);
  }
  return links;
}

function sources(): Child[] {
  const links: Child[] = [];
  for (const src of SOURCES) {
    if (links.length) links.push(" | ");
    links.push(<a href={src.home}>{src.name}</a>);
  }
  return links;
}

export interface PageData {
  rows: Row[];
  errors: string[];
  wall: string;
  at: number;
  allowRefresh: boolean;
  origin: string;
  path: string; // "/" or the path of an entry of PAGES
}

export function render(p: PageData): string {
  const name = PAGES.find((q) => q.path === p.path)?.name;
  const page = (
    <html>
      <head>
        <title>{name ? `${name} | wire` : "wire"}</title>
        <link rel="canonical" href={p.origin + p.path} />
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <Icons />
      </head>
      <body>
        <table cellspacing={0} cellpadding={0} border={0} id="hnmain">
          <tr>
            <td style="background:var(--sky-500)">
              <table width="100%" cellspacing={0} cellpadding={0} border={0} style="padding:2px">
                <tr>
                  <td style="width:18px;padding-right:4px">
                    <a href="/">
                      <img src="/favicon.svg" width={18} height={18} style="border:1px white solid;display:block" />
                    </a>
                  </td>
                  <td style="line-height:12pt;height:10px">
                    <span class="pagetop"><b class="hnname"><a href="/">wire</a></b>{nav(p.path)}</span>
                  </td>
                  {p.allowRefresh && (
                    <td style="text-align:right;padding-right:4px">
                      <span class="pagetop"><a href={`${p.path}?refresh=1`}>refresh</a></span>
                    </td>
                  )}
                </tr>
              </table>
            </td>
          </tr>
          <tr style="height:10px"></tr>
          {p.errors.length ? (
            <tr>
              <td style="padding:0 0 8px 8px">
                <span class="subtext">unavailable: {p.errors.join("; ")}</span>
              </td>
            </tr>
          ) : <tr></tr>}
          <tr>
            <td>
              <table cellspacing={0} cellpadding={0} border={0} width="100%" class="itemlist">
                {p.rows.map((c, i) => <StoryRow c={c} n={i + 1} at={p.at} />)}
              </table>
            </td>
          </tr>
          <tr>
            <td>
              <div style="height:10px"></div>
              <div style="height:2px;background:var(--sky-500)"></div>
              <br />
              <div style="text-align:center;padding-bottom:16px">
                <span class="yclinks">
                  {sources()} | updated {p.wall}
                </span>
              </div>
            </td>
          </tr>
        </table>
      </body>
    </html>
  );
  return "<!doctype html>" + page.toString();
}

/** The HTML of every page of one refresh, by path. */
export function renderAll(rows: Map<string, Row[]>, p: Omit<PageData, "rows" | "path">) {
  return new Map([...rows].map(([path, r]) => [path, render({ ...p, rows: r, path })]));
}
