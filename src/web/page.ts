import { DLHD_BASE } from "../config.js";
import { PLAYERS } from "../servers/kinds.js";

const SITE_TITLE = "DaddyLive Stream Resolver";
const SITE_HOST = DLHD_BASE.replace(/^https?:\/\//, "");
const SITE_DESC = `Resolve ${SITE_HOST} player servers into direct HLS links. Play in the browser with automatic token refresh, or export for VLC and MPV.`;

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderPage(): string {
  const config = JSON.stringify({ players: PLAYERS, base: DLHD_BASE }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0b0b0d">
<meta name="description" content="${esc(SITE_DESC)}">
<meta name="robots" content="index,follow">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(SITE_TITLE)}">
<meta property="og:description" content="${esc(SITE_DESC)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(SITE_TITLE)}">
<meta name="twitter:description" content="${esc(SITE_DESC)}">
<title>${esc(SITE_TITLE)}</title>
<link rel="stylesheet" href="/style.css">
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js"></script>
</head>
<body>
<header class="bar">
<div class="bar__brand">
<span class="bar__logo" aria-hidden="true"></span>
<h1 class="bar__title">DaddyLive <span>Stream Resolver</span></h1>
</div>
<div class="bar__actions">
<a href="/api/channels.m3u8" download="daddylive.m3u8" class="btn btn--accent" id="download-m3u8-link">Download playlist</a>
<button type="button" id="btn-copy-m3u8" class="btn">Copy URL</button>
<a class="bar__host" href="${esc(DLHD_BASE)}/" target="_blank" rel="noopener noreferrer" title="Source site">${esc(SITE_HOST)} ↗</a>
</div>
</header>

<main class="shell">
<section class="stage" aria-label="Player">
<div class="player">
<video id="video" controls playsinline></video>
<div id="player-overlay" class="overlay" data-kind="empty">
<div id="overlay-spinner" class="spinner" hidden></div>
<p id="overlay-text" class="overlay__text">Pick a channel to start watching</p>
</div>
</div>

<div class="now">
<h2 id="stream-title" class="now__title">Nothing playing</h2>
<dl id="timing" class="timing" hidden>
<div class="timing__item">
<dt class="timing__label">Resolve</dt>
<dd id="timing-resolve" class="timing__value">—</dd>
</div>
<div class="timing__item">
<dt class="timing__label">First playback</dt>
<dd id="timing-playback" class="timing__value">—</dd>
</div>
</dl>
</div>

<div class="servers-wrap">
<h2 class="label">Server</h2>
<div id="servers" class="servers" role="group" aria-label="Available servers"></div>
</div>

<p id="error" class="msg--err" hidden role="alert"></p>

<ul id="stream-notes" class="stream-notes" hidden>
<li>
<span class="stream-notes__label">Direct link</span>
<span id="note-direct" class="stream-notes__text">—</span>
</li>
<li>
<span class="stream-notes__label">Live URL</span>
<span class="stream-notes__text">Refreshes on its own — this is what plays here</span>
</li>
</ul>

<details class="card export" id="export-card" hidden>
<summary>Share &amp; export</summary>
<ul class="exports">
<li id="proxy-row">
<div class="export__meta">
<span class="export__name">Our Live URL <em class="pill">recommended</em></span>
<span class="export__hint">Keeps working — token refresh is handled for you</span>
</div>
<div class="export__row">
<input id="proxy" readonly aria-label="Stable live stream URL">
<button type="button" data-copy="proxy">Copy</button>
</div>
</li>
<li id="m3u8-row">
<div class="export__meta">
<span class="export__name">M3U8 Stream URL</span>
<span class="export__hint">For IPTV players (TiviMate, OTT Navigator, etc.)</span>
</div>
<div class="export__row">
<input id="m3u8-url" readonly aria-label="M3U8 Stream URL">
<button type="button" data-copy="m3u8-url">Copy</button>
</div>
</li>
<li>
<div class="export__meta">
<span class="export__name">Direct URL</span>
<span class="export__hint">Raw link — expires (see the time above)</span>
</div>
<div class="export__row">
<input id="direct" readonly aria-label="Direct stream URL">
<button type="button" data-copy="direct">Copy</button>
</div>
</li>
<li>
<div class="export__meta">
<span class="export__name">VLC</span>
<span class="export__hint">Command to open in VLC</span>
</div>
<div class="export__row">
<input id="vlc" readonly aria-label="VLC command">
<button type="button" data-copy="vlc">Copy</button>
</div>
</li>
<li>
<div class="export__meta">
<span class="export__name">MPV</span>
<span class="export__hint">Command to open in MPV</span>
</div>
<div class="export__row">
<input id="mpv" readonly aria-label="MPV command">
<button type="button" data-copy="mpv">Copy</button>
</div>
</li>
</ul>
</details>
</section>

<aside class="channels" aria-label="Channels">
<div class="channels__tabs" role="tablist" aria-label="Browse">
<button type="button" id="tab-channels" class="tab tab--active" role="tab" aria-selected="true" aria-controls="panel-channels">Channels</button>
<button type="button" id="tab-events" class="tab" role="tab" aria-selected="false" aria-controls="panel-events">Events</button>
</div>

<div id="panel-channels" class="panel" role="tabpanel" aria-labelledby="tab-channels">
<form id="watch-form" class="channels__head" autocomplete="off">
<div class="channels__top">
<h2 class="label">Channels <span class="count">(<span id="channel-count">0</span>)</span></h2>
</div>
<div class="search">
<input id="channels-filter-input" type="search" placeholder="Search channels by name or number" aria-label="Search channels" autocomplete="off" spellcheck="false">
<kbd class="search__key" aria-hidden="true">/</kbd>
</div>
</form>

<div id="channels-grid" class="channels__list" role="list"></div>
</div>

<div id="panel-events" class="panel" role="tabpanel" aria-labelledby="tab-events" hidden>
<div class="events__head">
<input id="events-filter-input" type="search" placeholder="Search events, teams or channels" aria-label="Search events" autocomplete="off" spellcheck="false">
<p class="events__hint">Times are UK GMT converted to your local clock — hover a time to see the original. Channel chips play here; ones marked ↗ open on ${esc(SITE_HOST)} because that embed family isn't supported by the resolver yet.</p>
</div>
<div id="events-list" class="events__list"></div>
</div>
</aside>
</main>

<script type="application/json" id="app-config">${config}</script>
<script type="module" src="/app.js"></script>
</body>
</html>`;
}
