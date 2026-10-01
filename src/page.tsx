import type { Child } from "hono/jsx";
import { age, HOMES, SOURCES, type Row } from "./rank";

export const SKY_500 = "#0ea5e9";
export const SKY_50 = "#f0f9ff";

export const CSS = `
:root {
  --sky-50:  #f0f9ff;
  --sky-300: #7dd3fc;
  --sky-500: #0ea5e9;
  --sky-600: #0284c7;
  --sky-950: #082f49;
}
body { font-family: Verdana, Geneva, sans-serif; font-size: 10pt; color: var(--sky-600);
       background: #fff; margin: 0; padding: 0; }
td { font-family: Verdana, Geneva, sans-serif; font-size: 10pt; color: var(--sky-600); }
#hnmain { width: 85%; min-width: 796px; margin: 0 auto; background: var(--sky-50); }

a:link    { color: var(--sky-950); text-decoration: none; }
a:visited { color: var(--sky-600); text-decoration: none; }

.logo { width: 16px; height: 16px; border: 1px solid #fff; background: var(--sky-500);
        color: #fff; text-align: center;
        font: bold 12px/16px Verdana, Geneva, sans-serif; }
.pagetop { font-size: 10pt; color: var(--sky-950); line-height: 12px; }
.pagetop a:visited { color: var(--sky-950); }
.hnname { margin-left: 1px; margin-right: 5px; }

.title { font-size: 10pt; color: var(--sky-600); overflow: hidden; }
.title a { word-break: break-word; }

.subtext { font-size: 7pt; color: var(--sky-600); }
.subtext a:link, .subtext a:visited { color: var(--sky-600); }
.subtext a:hover { text-decoration: underline; }

.comhead { font-size: 8pt; color: var(--sky-600); }
.comhead a:link, .comhead a:visited { color: var(--sky-600); }
.comhead a:hover { text-decoration: underline; }

.yclinks { font-size: 8pt; color: var(--sky-600); }
.votearrow { width: 0; height: 0; margin: 3px 2px 6px;
             border-left: 5px solid transparent; border-right: 5px solid transparent;
             border-bottom: 9px solid var(--sky-300); }
.spacer { height: 5px; }
.corro { font-weight: bold; color: var(--sky-950); }

/* mobile device */
@media only screen and (min-width: 300px) and (max-width: 750px) {
  body { width: 100%; margin: 0; padding: 0; }
  td { height: inherit !important; }
  #hnmain { width: 100%; min-width: 0; }
  span.pagetop { display: block; margin: 3px 5px; font-size: 12px; line-height: normal; }
  span.pagetop b { display: block; font-size: 15px; }
  .title { font-size: 11pt; line-height: 14pt; }
  .subtext { font-size: 9pt; }
  .votearrow { transform: scale(1.3, 1.3); margin-right: 6px; }
  .votelinks { min-width: 18px; }
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

const StoryRow = ({ c, at }: { c: Row; at: number }) => (
  <>
    <tr class="athing">
      <td align="right" valign="top" class="title"><span class="rank">{c.rank}.</span></td>
      <td valign="top" class="votelinks" style="text-align:center"><div class="votearrow"></div></td>
      <td valign="top" class="title">
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

function nav(): Child[] {
  const links: Child[] = [];
  for (const src of SOURCES) {
    if (links.length) links.push(" | ");
    links.push(<a href={src.home}>{src.name.toLowerCase()}</a>);
  }
  return links;
}

export interface PageData {
  rows: Row[];
  errors: string[];
  wall: string;
  at: number;
  allowRefresh: boolean;
  canonical: string;
}

export function render(p: PageData): string {
  const page = (
    <html>
      <head>
        <title>wire</title>
        <link rel="canonical" href={p.canonical} />
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
                    <a href="/"><div class="logo">W</div></a>
                  </td>
                  <td style="line-height:12pt;height:10px">
                    <span class="pagetop"><b class="hnname"><a href="/">wire</a></b>{nav()}</span>
                  </td>
                  {p.allowRefresh && (
                    <td style="text-align:right;padding-right:4px">
                      <span class="pagetop"><a href="/?refresh=1">refresh</a></span>
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
              <table cellspacing={0} cellpadding={0} border={0} width="100%">
                {p.rows.map((c) => <StoryRow c={c} at={p.at} />)}
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
                  {SOURCES.map((s) => s.name).join(" | ")} | updated {p.wall}
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
