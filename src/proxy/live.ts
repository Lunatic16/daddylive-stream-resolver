import type { ServerKind } from "../servers/kinds.js";
import { UA } from "../http.js";
import { buildProxyUrl } from "./links.js";
import {
  dembedPlaylistToken,
  invalidateDembedToken,
  withDembedParams,
} from "./dembed.js";
import { upstreamRuleFor } from "./rules.js";
import { coalesceSegment, putCachedSegment } from "./segment-cache.js";
import { ensureFreshSession, type LiveSession, type ResolveFns } from "./session.js";
import type { ProxyResult } from "./stream.js";
import { unwrapWebpMpegTs } from "./unwrap-webp-ts.js";

const CORS = { "Access-Control-Allow-Origin": "*" };
const TS_CACHE = { ...CORS, "Cache-Control": "public, max-age=3600, immutable" };
const PL_CACHE = { ...CORS, "Cache-Control": "no-cache" };

function upstreamHeaders(session: LiveSession, target: string): Record<string, string> {
  const rule = upstreamRuleFor(target);
  const headers: Record<string, string> = { "User-Agent": UA, Accept: "*/*" };
  if (rule.refererMode === "omit") return headers;
  if (rule.refererMode === "required") {
    const referer = rule.forceReferer ?? session.referer;
    headers.Referer = referer;
    headers.Origin = new URL(referer).origin;
    return headers;
  }
  if (session.referer) {
    headers.Referer = session.referer;
    if (URL.canParse(session.referer)) headers.Origin = new URL(session.referer).origin;
  }
  return headers;
}

function proxyReferer(abs: string, session: LiveSession): string {
  return upstreamRuleFor(abs).refererMode === "omit" ? "" : session.referer;
}

function liveChildUrl(
  channelId: number,
  server: ServerKind,
  origin: string,
  child: string,
  variant?: number,
): string {
  const params = new URLSearchParams({
    channel: String(channelId),
    server,
    u: child,
  });
  if (variant != null) params.set("v", String(variant));
  return `${origin.replace(/\/$/, "")}/api/live?${params}`;
}

function bustPlaylistUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.set("_", String(Date.now()));
  return u.href;
}

function rewriteLivePlaylist(
  playlist: string,
  playlistUrl: URL,
  session: LiveSession,
  origin: string,
): string {
  const baseDir = playlistUrl.href.slice(0, playlistUrl.href.lastIndexOf("/") + 1);
  const isMaster = /#EXT-X-STREAM-INF/i.test(playlist);
  let variantIdx = 0;
  if (isMaster) session.variants = [];

  return playlist
    .split("\n")
    .filter((line) => !/^#EXT-X-PROGRAM-DATE-TIME:/i.test(line.trim()))
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_m, uri: string) => {
          const abs = new URL(uri, baseDir).href;
          return `URI="${buildProxyUrl(abs, proxyReferer(abs, session), origin)}"`;
        });
      }
      const abs = new URL(trimmed, baseDir).href;
      if (isMaster || /\.m3u8(\?|$)/i.test(abs)) {
        const v = variantIdx++;
        if (isMaster) session.variants[v] = abs;
        return liveChildUrl(session.channelId, session.server, origin, abs, isMaster ? v : undefined);
      }
      return buildProxyUrl(abs, proxyReferer(abs, session), origin);
    })
    .join("\n");
}

function swapToken(url: string, session: LiveSession): string {
  const token = session.meta.token;
  if (!token || /[?&]token=/.test(url) === false) return url;
  return url.replace(/([?&]token=)[^&]+/, `$1${token}`);
}

function dembedOf(session: LiveSession): { edge: string; slug: string } | null {
  if (session.meta.family !== "dembed" || !session.meta.edge || !session.meta.slug) return null;
  return { edge: session.meta.edge, slug: session.meta.slug };
}

/**
 * Builds the upstream URL for a playlist fetch. dembed edges only serve
 * playlists with a freshly minted `t=` token, so re-mint per fetch; every
 * other family keeps the plain cache-busted URL.
 */
async function playlistFetchTarget(session: LiveSession, target: string): Promise<string> {
  const dembed = dembedOf(session);
  if (!dembed || !target.startsWith(dembed.edge)) return bustPlaylistUrl(target);
  const token = await dembedPlaylistToken(dembed.edge, dembed.slug, session.referer);
  return withDembedParams(target, token);
}

async function fetchUpstream(
  target: string,
  session: LiveSession,
): Promise<{ status: number; body: Buffer; type: string }> {
  const res = await fetch(target, {
    headers: upstreamHeaders(session, target),
    redirect: "follow",
  });
  return {
    status: res.status,
    body: Buffer.from(await res.arrayBuffer()),
    type: res.headers.get("content-type") || "",
  };
}

function mediaLineCount(playlist: string): number {
  let n = 0;
  for (const line of playlist.split("\n")) {
    const t = line.trim();
    if (t && !t.startsWith("#")) n++;
  }
  return n;
}

async function fetchPlaylist(
  target: string,
  session: LiveSession,
): Promise<{ status: number; body: Buffer; type: string }> {
  const first = await fetchUpstream(bustPlaylistUrl(target), session);
  if (first.status >= 400) return first;
  const firstText = first.body.toString("utf8");
  if (!firstText.startsWith("#EXTM3U")) return first;
  const firstSegs = mediaLineCount(firstText);
  if (firstSegs >= 6) return first;
  const second = await fetchUpstream(bustPlaylistUrl(target), session);
  if (second.status >= 400) return first;
  const secondText = second.body.toString("utf8");
  if (!secondText.startsWith("#EXTM3U")) return first;
  return mediaLineCount(secondText) > firstSegs ? second : first;
}

async function fetchUnwrappedSegment(target: string, session: LiveSession): Promise<Buffer> {
  return coalesceSegment(target, async () => {
    const upstream = await fetchUpstream(target, session);
    if (upstream.status >= 400) {
      throw new Error(`segment HTTP ${upstream.status}`);
    }
    const ts = unwrapWebpMpegTs(upstream.body);
    if (ts) return ts;
    if (upstream.body[0] === 0x89) throw new Error("PNG unwrap failed");
    return upstream.body;
  });
}

export async function proxyLivePlaylist(
  channelId: number,
  server: ServerKind,
  origin: string,
  resolve: ResolveFns,
  childUrl?: string | null,
  variant?: number | null,
): Promise<ProxyResult> {
  let session = await ensureFreshSession(channelId, server, resolve);

  let target = session.playableUrl;
  if (variant != null && Number.isFinite(variant) && session.variants[variant]) {
    target = swapToken(session.variants[variant], session);
  } else if (childUrl) {
    target = swapToken(childUrl, session);
  }

  const isPlaylistReq =
    !childUrl || /\.m3u8(\?|$)/i.test(target) || target === session.playableUrl;

  if (!isPlaylistReq) {
    const body = await fetchUnwrappedSegment(target, session);
    const isTs = body[0] === 0x47;
    return {
      status: 200,
      body,
      type: isTs ? "video/mp2t" : "application/octet-stream",
      headers: isTs ? TS_CACHE : PL_CACHE,
    };
  }

  let upstream = await fetchPlaylist(await playlistFetchTarget(session, target), session);
  if (upstream.status === 401 || upstream.status === 403) {
    const staleDembed = dembedOf(session);
    if (staleDembed) invalidateDembedToken(staleDembed.edge, staleDembed.slug);
    session = await ensureFreshSession(channelId, server, resolve, true);
    target = session.playableUrl;
    if (variant != null && session.variants[variant]) {
      target = swapToken(session.variants[variant], session);
    } else if (childUrl) {
      target = swapToken(childUrl, session);
    }
    upstream = await fetchPlaylist(await playlistFetchTarget(session, target), session);
  }

  if (upstream.status >= 400) {
    return {
      status: upstream.status,
      body: upstream.body,
      type: upstream.type || "text/plain",
      headers: { ...CORS, "Cache-Control": "no-store" },
    };
  }

  const text = upstream.body.toString("utf8");
  if (text.startsWith("#EXTM3U")) {
    return {
      status: 200,
      body: rewriteLivePlaylist(text, new URL(target), session, origin),
      type: "application/vnd.apple.mpegurl",
      headers: PL_CACHE,
    };
  }

  const mpegTs = unwrapWebpMpegTs(upstream.body);
  if (mpegTs) {
    putCachedSegment(target, mpegTs);
    return { status: 200, body: mpegTs, type: "video/mp2t", headers: TS_CACHE };
  }

  return {
    status: upstream.status,
    body: upstream.body,
    type: upstream.type || "application/octet-stream",
    headers: PL_CACHE,
  };
}
