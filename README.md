<div align="center">

# 📺 DaddyLive Stream Resolver

**Turn [dlive.sx](https://dlive.sx/) (DaddyLive / DLHD) player pages into direct HLS (`.m3u8`) or WebM links.**

Decrypt the embed in pure TypeScript, play live in the browser with [hls.js](https://github.com/video-dev/hls.js/),
or copy ready **VLC** / **MPV** commands. Signed tokens refresh on a stable live URL, so a shared link
keeps working after the raw CDN URL expires.

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-ESM%20strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![hls.js](https://img.shields.io/badge/Player-hls.js-E5387A)](https://github.com/video-dev/hls.js/)
[![Dependencies](https://img.shields.io/badge/runtime%20deps-0-brightgreen)](#-configuration)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](#-contributing)
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

[Features](#-features) · [Quick Start](#-quick-start) · [Docker](#-docker) · [Usage](#-usage) · [IPTV Playlist](#-iptv-playlist) · [Players](#-players) · [How It Works](#-how-it-works) · [API](#-http-api) · [Disclaimer](#-disclaimer)

<p><img src="docs/Screenshot.png" alt="App screenshot" width="800" /></p>

</div>

## ✨ Features

- 🔓 **Pure-TypeScript decrypt layer** — reads HTML strings only, never calls `fetch`, unit-testable against saved pages
- 📺 **Six player servers wired** — each with its own transport profile (referer rules, tool flags, UA handling)
- 🔁 **Stable share links** — the **Our Live URL** refreshes signed tokens so links outlive the raw CDN URL
- 🚰 **Smart proxy** — rewrites playlists, mints short-lived playlist tokens for token-gated edges (dembed family), and unwraps WebP / PNG polyglot segments into MPEG-TS on the fly
- 💾 **Session cache** — one in-memory entry per `channel:server`; no repeat upstream fetches while the signed URL is valid
- 📋 **One-click export** — VLC and MPV shell commands with the correct flags per server
- 📡 **IPTV playlist export** — an M3U8 playlist of every channel for VLC, TiviMate and similar apps, grouped by content type and region with English-speaking groups first
- 📅 **Events browser** — the homepage schedule (main schedule plus every Extra section) with per-event channel chips; UK GMT times convert to your local clock, and channel chips reuse the same resolve + fallback flow as the grid
- 📦 **Library mode** — import `resolveFromHtml`, `buildVlcCommand`, and friends from `daddylive-stream-resolver`
- 🧱 **Zero runtime dependencies** — TypeScript and `@types/node` are devDependencies only

## 🚀 Quick Start

### Requirements

- **Node.js 20** or newer
- npm

### Install & run

```bash
git clone https://github.com/Lunatic16/daddylive-stream-resolver.git
cd daddylive-stream-resolver
npm install
npm start
```

Open **http://localhost:3000**. Set `PORT` if you need another port.

| Command | What it does |
| --- | --- |
| `npm start` | Free the port, build, serve API + web UI |
| `npm run build` | Compile to `dist/` and copy `style.css` |
| `npm run typecheck` | `tsc --noEmit` |

`npm start` rebuilds TypeScript into `dist/` and serves the API plus the web UI from there.

## 🐳 Docker

You can run the resolver in a container with Docker Compose or the Docker CLI.

### Using Docker Compose (Recommended)

A multi-stage `Dockerfile` and `docker-compose.yaml` ship with the repo — no local Node toolchain needed.

```bash
docker compose up -d --build
```

Open **http://localhost:3000** (change the left side of `ports:` in `docker-compose.yaml` to move it).

What the image does:

- **Build stage** — `npm ci` + `npm run build` on `node:22-alpine`, with the npm cache mounted.
- **Runtime stage** — only `dist/` and `package.json` (zero runtime deps means no `node_modules` ship); runs as the non-root `node` user with a `HEALTHCHECK` polling `/`.
- **Configuration** — `PORT` (default `3000`) and `DLHD_BASE` pass through as environment variables; see [Configuration](#%EF%B8%8F-configuration).
- **`restart: unless-stopped`** — the container comes back after reboots and crashes.

The container bypasses the `lsof`/`kill` port-clearing in `npm start` (a host dev convenience) and runs `node dist/api/index.js` directly. Logs: `docker logs -f daddylive`.

## 🎮 Usage

The home page is one flow:

1. Pick a channel: browse the **Channels** grid, type a numeric ID, or open the **Events** tab and click a channel chip on a scheduled event.
2. Click a **PLAYER** badge.
3. Wait for resolve time and first playback time next to the title.
4. Watch in the built-in player, or copy an export row below.

Only one server resolves at a time — switching badges cancels the previous run's UI updates. Notes under the video show how long the direct link lasts and remind you that **Our Live URL** is what the page actually plays for HLS.

> [!NOTE]
> The **Events** tab scrapes the upstream homepage schedule on demand — the main schedule plus every Extra section (lazy `schedule-api.php` sources included) — and caches it server-side for two minutes. Times are UK GMT converted to your local clock; hover a time to see the original. Channels that only exist on extra schedules (Extra Streams, embed.st backups, live-live mirrors) show a ↗ chip that opens the upstream page, since those embed families have no extractor here yet.

<p><img src="docs/events.png" alt="Events tab" width="800" /></p>

## 🔗 Export Links

After a successful resolve, the export card shows four fields:

| Field | Meaning |
| --- | --- |
| **Our Live URL** | `/api/live?channel=…&server=…` — stable share link; refreshes tokens and rewrites HLS through this app |
| **Direct URL** | Upstream `.m3u8` or WebM from the embed — often time-signed and will expire |
| **VLC** | Shell line with optional `--http-referrer` and `--http-user-agent` |
| **MPV** | Shell line with optional `--referrer`, `--user-agent`, and a media title |

> [!TIP]
> Which URL each tool line uses depends on the server profile — VLC and MPV can differ (direct vs Our Live URL) when one player demuxes the CDN and the other does not, or when the edge only serves playlists to token-minted requests (PLAYER 1 / 3). For long sessions and sharing, prefer **Our Live URL**.

## 📡 IPTV Playlist

The resolver can generate an `.m3u8` playlist of every channel in `channels.json`, ready for IPTV apps such as VLC or TiviMate. Each entry points back at this host, so it plays through the same live sessions and proxy as the web UI:

```text
#EXTM3U
#EXTINF:-1 tvg-id="44" tvg-name="ESPN USA" group-title="Sports - USA",ESPN USA
http://localhost:3000/api/stream/44.m3u8
```

Add `?server={kind}` to the stream URLs to pick a [player](#-players) (see `server` in [`/api/resolve`](#get-apiresolvechannelidserverkind)). Quotes in channel names are replaced so the attributes stay valid.

### Categories

Every channel gets a `group-title` from its name: a content type first, then a region where grouping by country helps.

| Type | Groups |
| --- | --- |
| **Sports** | By region (`Sports - UK & Ireland`, `Sports - Germany & Austria`, …), plus `Sports - USA Regional` and global sport groups: Cricket, Motorsport, Tennis, Golf, Combat & Wrestling, Horse Racing, Club TV |
| **Entertainment** | `Entertainment - USA Broadcast`, `Entertainment - USA Cable`, then by region; small regions fold into `Entertainment - Other` |
| **Movies** | `Movies - USA`, `Movies - UK & Ireland`, `Movies - Italy`, `Movies - Poland`; the rest go to `Movies - International` |
| **Global groups** | `News & Weather`, `Kids`, `Documentary & Lifestyle`, `Music` |
| **Special** | `Live Cams - Big Brother`, `18+ Adult` |

### Order

The playlist is sorted so English-speaking content comes first:

1. **English-speaking regions** — USA, then UK & Ireland, Canada, Australia & NZ (Sports, then Entertainment, then Movies within each)
2. **Global groups** — sport-specific groups, News & Weather, Kids, Documentary & Lifestyle, Music
3. **Other regions** — everything else, grouped by language/region
4. **Live Cams**, then **18+ Adult** last

Channels inside a group use natural numeric order (`Sport 2` before `Sport 10`).

### Customising

Classification lives in `m3u8.ts` and is all regular expressions plus a few lists:

| To change | Edit |
| --- | --- |
| Which region a channel belongs to | `REGION_RULES` (first match wins) |
| Content type (sport, news, kids, …) | The pattern constants such as `SPORT_GENERAL`, `NEWS`, `KIDS`, `MOVIES` |
| Which small regions get their own Movies / Entertainment group | `MOVIE_REGIONS`, `ENTERTAINMENT_REGIONS` |
| Playlist order | `ENGLISH_REGIONS`, `NON_ENGLISH_REGIONS`, `GROUP_ORDER` |

Anything unmatched falls back to `Entertainment - USA Cable`, so add a rule when a new channel lands in the wrong group.

## 📺 Players

Six DaddyLive player routes are wired. Each maps to a path like `/{server}/stream-{id}.php` on the upstream site (dlive.sx / thedaddy.pk):

| Badge | Server ID | Path |
| --- | --- | --- |
| PLAYER 1 | `stream` | `/stream/stream-{id}.php` |
| PLAYER 2 | `cast` | `/cast/stream-{id}.php` |
| PLAYER 3 | `watch` | `/watch/stream-{id}.php` |
| PLAYER 4 | `plus` | `/plus/stream-{id}.php` |
| PLAYER 5 | `casting` | `/casting/stream-{id}.php` |
| PLAYER 6 | `player` | `/player/stream-{id}.php` |

> [!NOTE]
> Not every channel exposes every embed. If a page has no iframe, resolve fails with a clear error for that badge only — failed resolves stay errors, nothing is invented for missing embeds.

Embed families the decrypt layer knows include dembed (premiumtv playlist-token edges, PLAYER 1 / 3), tiestep (`_econfig`), epiembeds (XOR arrays), wideiptv, cdnlivetv, daddy3, hub / livelive24 WebM, and related hop pages (wikisport, blogger-player). Transport rules per server live under `src/servers/` (referer required / optional / omitted, separate VLC/MPV flags for direct CDN vs Our Live URL, optional browser User-Agent for tools).

### Transport at a glance

| Badge | Direct CDN play | Extra headers | Notes |
| --- | --- | --- | --- |
| PLAYER 1 (`stream`) | ❌ token-gated | — | Edge serves playlists only with a minted `t=` token; tools use **Our Live URL** |
| PLAYER 2 (`cast`) | ✅ | Browser UA + embed-page Referer | `_econfig` family on rotating hosts |
| PLAYER 3 (`watch`) | ❌ stock tools | — | Same dembed edge as PLAYER 1, plus PNG-wrapped TS on TikTok CDN |
| PLAYER 4 (`plus`) | ❌ | — | Embed family changed upstream; resolve fails until a new extractor lands |
| PLAYER 5 (`casting`) | ✅ | None | Bare requests OK; some channels lack the embed upstream |
| PLAYER 6 (`player`) | ✅ | None | Bare requests OK; some channels lack the embed upstream |

<details>
<summary><b>PLAYER 1 — <code>stream</code> (dembed premiumtv playlist-token edge)</b></summary>

Embed is `dembed.st/premiumtv/daddy.php?id={N}`. The player page declares the whole chain in plaintext consts — `const SRC` (the playlist URL, `edge.cowedd…/premium{N}/index.m3u8`), `const EDGE`, and `const CHANNEL` — which the dembed extractor captures. The bare playlist URL is **not playable**: without the right `Origin` the edge answers `403 forbidden`, and with it `403 token required`. Playback needs a short-lived token minted from `{EDGE}/api/playlist-token?slug={CHANNEL}` (the `Origin` header must be exactly the embed host's origin — anything else, including the top-level site's, is rejected). The proxy mints a token per playlist fetch, attaches it as `t=` with a `_=` cache-buster to **manifest requests only**, renews in the background from halfway through the ~120 s TTL, and on a 403 invalidates and re-mints before force-re-resolving. Segments are absolute PNG-wrapped MPEG-TS on TikTok CDN — no token, plain UA, no Referer. Stock VLC/MPV cannot mint tokens, so their export lines point at **Our Live URL**.

</details>

<details>
<summary><b>PLAYER 2 — <code>cast</code> (<code>_econfig</code> family, rotating hosts)</b></summary>

Same `_econfig` family as earlier rounds on a rotated host: the embed currently lives at `tossequip.net` and resolves to HLS on `7odxv0l067ka.net` (hosts rotate per round — `tiestep.top` served earlier ones, and PLAYER 1 has left this family entirely, see above). Direct play works with browser UA + embed-page Referer. Proxy not required for PLAYER 2 tools.

</details>

<details>
<summary><b>PLAYER 3 — <code>watch</code> (PNG-wrapped TS on TikTok CDN)</b></summary>

Upstream is the same dembed premiumtv edge as PLAYER 1 — a sliding live window (`edge.cowedd…/premium{N}/index.m3u8`) whose playlists are token-gated (the proxy mints them, see PLAYER 1) and whose media lines are PNG-wrapped MPEG-TS on TikTok CDN (`TIKTIKPX`). Stock VLC/MPV on the CDN URL fail. Our Live URL must **not** append `#EXT-X-ENDLIST` (that turned live into VOD and stopped after a few seconds). Match the embed player: strip `#EXT-X-PROGRAM-DATE-TIME`, unwrap segments in the proxy, cache immutable TikTok URLs (coalesced, max 2 upstream fetches), and use the embed hls.js live buffer settings (`lowLatencyMode: false`, `liveSyncDurationCount: 4`).

</details>

<details>
<summary><b>PLAYER 4 — <code>plus</code> (embed changed upstream — currently unresolvable)</b></summary>

The old WebP-EXIF family no longer serves this badge. The embed now 302-redirects to a JWT-path player (`…/play/eyJhbG…`) that none of the extractors match, so resolve returns `no playable stream in plus embed` on every channel tried. The WebP-EXIF unwrapper is still in the proxy for any source that returns that shape. A new extractor is needed once the family settles.

</details>

<details>
<summary><b>PLAYER 5 — <code>casting</code> (cdnlivetv)</b></summary>

Embed is `api.cdnlivetv.tv` (base64-chunk playlist URL + token). Playlist and `.ts` segments accept bare requests (no Referer). VLC's default UA and browser UA both fetch segments as `video/mp2t` (sync `0x47`). **VLC** and **MPV** play the direct CDN `.m3u8` with no extra headers. Proxy not required for PLAYER 5 tools. Some channels' casting iframe points at an upstream embed that 404s (channel 51 at the time of writing) — a site gap surfaced as an error, not a silent success.

</details>

<details>
<summary><b>PLAYER 6 — <code>player</code> (wideiptv → bluetier)</b></summary>

Embed is `wideiptv.top` (e.g. `daddy.php?stream=ESPN`) → `bluetier.top` HLS (plain `.ts`, signed `token=` parameter with a wideiptv refresh API). Playlist and segments accept bare requests (no Referer); VLC/libmpv UAs fetch TS. **VLC** and **MPV** play the direct CDN `.m3u8` with no extra headers. Proxy not required for PLAYER 6 tools. Some channels route through a Blogger hop page (`tv-bu1.blogspot.com`) that currently yields no target (channel 51) — again a site gap surfaced as an error.

</details>

## 🧠 How It Works

DaddyLive exposes several player servers per channel. Each server wraps the real stream in a different embed. This resolver:

1. Loads the player page for one server and one channel ID.
2. Follows the embed chain until the HTML holds a playable marker.
3. Decrypts that HTML **offline** — no network inside the decrypt layer.
4. Returns a direct stream URL, plus a stable **Our Live URL** that rewrites playlists, sends the right referer, refreshes signed tokens when needed, mints playlist tokens for token-gated edges, and unwraps special segment wrappers when they appear.

You watch in the page, or paste a command into VLC or MPV.

Two layers stay separate on purpose:

| Layer | Where | Role |
| --- | --- | --- |
| **Decrypt (pure)** | `src/decrypt/` | Only reads HTML strings — never calls `fetch`. Unit-test extractors against saved pages. Output is a `ResolvedStream`: channel ID, server, embed URL, playable URL, MIME type, and small metadata (family, expiry, tokens when present). |
| **Live path (network)** | `src/api/`, `src/http.ts` | Loads watch/player pages and walks iframe hops. After decrypt, `src/proxy/` serves the proxy, live sessions, and live playlists. |

After decrypt, `src/proxy/` serves:

- **Proxy** — one-shot fetch of a URL with the right headers; rewrites `.m3u8` lines back through `/api/proxy`; unwraps WebP polyglot segments into MPEG-TS when needed.
- **Playlist tokens (dembed)** — token-gated edges get a short-lived token minted per playlist fetch (`src/proxy/dembed.ts`), renewed in the background from halfway through its TTL, and invalidated + re-minted on a 403 before the forced re-resolve.
- **Live session** — one memory entry per `channel:server`. While `expiresAt` is still valid, resolve and live reuse that entry with **no upstream fetch**. On expiry (or force after 401/403): wideiptv uses its token API; otherwise refresh from the **cached embed URL** first (player page skipped), then fall back to a full player → embed resolve. Session meta keeps stable path ids when present (`embedId`, `hlsId`, `premiumId`).
- **Live playlist** — entry point for the browser player and for tool commands that must go through this host.

```text
channel ID + server
        │
        ▼
   session fresh? ──yes──► reuse playable URL
        │ no
        ▼
  embed known? ──yes──► fetch embed only ──┐
        │ no                               │
        ▼                                  │
  fetch player page ──► embed chain ───────┤
                                           ▼
                                    decrypt (pure)
                                           │
                                           ▼
                              direct URL + session
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
              hls.js player    /api/live URL     VLC / MPV
              (via live)       (share / tools)   (direct or live)
```

<details>
<summary><b>Token rotation & session subtleties</b></summary>

For the `_econfig` family (PLAYER 2 today; PLAYER 1 in earlier rounds), the embed path id and `/hls/{id}` stay fixed; only `?s=` and `?e=` rotate (about six hours). Tokens are **not** shared across channels. Streams without an expiry (the dembed premium paths, PLAYER 1 / 3) stay cached until a forced refresh — their playlist tokens are minted at fetch time and never stored in the session.

</details>

## 🌐 HTTP API

All routes are `GET`.

### `GET /api/resolve?channel={id}&server={kind}`

Resolves one player through the live session (cache hit when the signed URL is still valid). JSON includes `direct`, `live`, `vlc`, `mpv`, `isHls`, `resolveMs`, and optional `expiresAt`. On failure: `502` with `{ error, server, label, resolveMs }`.

`server` must be one of: `stream`, `cast`, `watch`, `plus`, `casting`, `player`.

### `GET /api/live?channel={id}&server={kind}`

Stable HLS playlist for the browser (and for tools when the profile is not direct-playable). Optional `u` and `v` query params follow rewritten child playlists and variants. Reuses or refreshes the same session as `/api/resolve`, mints playlist tokens for token-gated edges, and unwraps segments when they arrive as WebP-wrapped MPEG-TS.

### `GET /api/stream/{id}.m3u8?server={kind}`

Per-channel stream URL used by the [IPTV playlist](#-iptv-playlist). `server` is optional.

### `GET /api/events`

The upstream homepage schedule as JSON: `sections → days → categories → events`, each event carrying its UK GMT `time`, `title`, and `channels`. Numeric channels are playable through [`/api/resolve`](#get-apiresolvechannelidserverkind); extra-schedule families (`watchextra`, `watchstreamed`, `watchlivelive`) carry their upstream `path` for link-out. Days also include a parsed `date` so clients can convert times out of GMT. Cached server-side for 2 minutes.

### `GET /api/proxy?url={upstream}&referer={embed}`

Fetches one upstream URL with browser-like headers. Playlists are rewritten so every media line points back here. Used by live rewrite and by older one-shot proxy flows.

### Static

`/`, `/style.css`, and `/app.js` serve the UI.

## 📦 Library API

Package name: `daddylive-stream-resolver`. Main entry: `src/index.ts` (built as `dist/index.js`).

```typescript
import {
  resolveFromHtml,
  extractPlayableFromHtml,
  extractEmbedUrl,
  PLAYERS,
  PLAYER_IDS,
  buildProxyUrl,
  buildVlcCommand,
  buildMpvCommand,
  livePlaylistUrl,
  serverProfile,
} from "daddylive-stream-resolver";
```

### `ResolvedStream`

```typescript
type ResolvedStream = {
  channelId: number;
  server: ServerKind;
  embedUrl: string;
  playableUrl: string;
  mimeType: "application/x-mpegURL" | "video/webm";
  meta: Record<string, string>;
};
```

### Offline vs live

| Goal | Call |
| --- | --- |
| Decrypt saved HTML | `extractPlayableFromHtml(html)` or `resolveFromHtml(html, ctx)` |
| Build watch / player URLs | `watchUrl(id)`, `playerPageUrl(server, id)` |
| Build tool strings | `buildVlcCommand`, `buildMpvCommand` |
| Build proxy or live URLs | `buildProxyUrl`, `livePlaylistUrl` |

> [!NOTE]
> Live HTTP resolve used by the server lives in `src/api/resolve.ts` (`resolveLive`, `handleResolveOne`) and is started with `npm start`, not as a separate published binary.

## ⚙️ Configuration

| Variable | Default | Role |
| --- | --- | --- |
| `PORT` | `3000` | HTTP listen port |
| `DLHD_BASE` | `https://dlive.sx` | Origin for watch and player page URLs |

> [!NOTE]
> The upstream origin rotates (dlive.sx, thedaddy.pk, …). The shipped `docker-compose.yaml` pins `DLHD_BASE=https://thedaddy.pk/`; override it when the player pages move again.

> [!NOTE]
> No runtime packages are required — TypeScript and `@types/node` are devDependencies only.

## 📁 Project Structure

```text
src/
  api/          HTTP server, resolve + live handlers, embed fetch chain
  channels/     watch.php and player page URL builders
  events/       homepage schedule scrape + parse (sections, days, categories, events)
  decrypt/      crypto helpers + embed extractors (no fetch)
  proxy/        playlist rewrite, live session, links, dembed playlist-token minting, WebP→TS unwrap
  servers/      six player profiles (referer / tools behavior)
  web/          HTML shell, CSS, browser app (hls.js)
  config.ts     DLHD_BASE
  http.ts       shared User-Agent and HTML fetch
  index.ts      public library exports
```

Build output goes to `dist/`.

## 🧰 Tech Stack

| Piece | Choice |
| --- | --- |
| Language | TypeScript (ESM, strict, small modules) |
| Runtime | Node.js 20+ (image: `node:22-alpine`) |
| Decrypt layer | Pure functions over HTML strings — zero network calls, unit-testable |
| Sessions | In-memory, one entry per `channel:server` |
| Player | hls.js |
| Runtime dependencies | None |

## ⚠️ Limitations

- A channel may omit some player iframes; that is a site gap, not a silent success. Failed resolves stay errors — nothing is invented for missing embeds.
- Direct CDN links are often signed, and token-gated edges (dembed, PLAYER 1 / 3) cannot be played directly at all — the proxy mints their tokens server-side. Prefer **Our Live URL** for long sessions and sharing. The in-memory session avoids repeat player fetches until expiry; restarting the process clears that cache.
- The Events tab lists every homepage schedule section, but only numeric channel ids play here. Extra-schedule families (`watchextra.php` → embedsports.me, `watchstreamed.php` → embed.st, `watchlivelive.php` mirrors) have no extractor yet — their chips link to the upstream page instead of pretending to play. Event channels are frequently offline outside their slot; the player falls through servers and reports the failure honestly.
- Embed chains and CDN rules are third-party and can change without notice — a broken player usually means the upstream embed changed.

## 🤝 Contributing

PRs are welcome! For anything non-trivial, please open an issue first. Match the style of nearby files: ESM, strict TypeScript, small modules, no comments in application code. Run `npm run typecheck` before submitting.

## 📄 License

Released under the [MIT License](LICENSE).

## ⚖️ Disclaimer

This project is for educational purposes only. It shows how live stream pages, HLS links, and related decrypt steps can be studied in code.

Respect copyright holders, the terms of any site you visit, and the laws where you live. Do not use this work to access or share content you are not allowed to use. The authors take no responsibility for how others use this code.

## 🙏 Acknowledgements

- [dlive.sx](https://dlive.sx/) — upstream player pages (DaddyLive / DLHD)
- [hls.js](https://github.com/video-dev/hls.js/) — browser playback
