import type { ServerResponse } from "node:http";

import { playerPageUrl, watchUrl, fetchChannelInfo } from "../channels/index.js";
import {
  extractEmbedUrl,
  htmlMayContainPlayable,
  resolveFromHtml,
  type ResolvedStream,
} from "../decrypt/index.js";
import { fetchHtml, UA } from "../http.js";
import { buildMpvCommand, buildVlcCommand } from "../proxy/links.js";
import { proxyLivePlaylist } from "../proxy/live.js";
import {
  ensureFreshSession,
  livePlaylistUrl,
  sessionToResolved,
  streamReferer,
  type ResolveFns,
} from "../proxy/session.js";
import { playerLabel, serverProfile, type ServerKind } from "../servers/index.js";
import { fetchEmbedHtmlChain } from "./fetch.js";

async function channelTitle(channelId: number): Promise<string> {
  try {
    const info = await fetchChannelInfo(channelId);
    return info.name;
  } catch {
    return `Channel ${channelId}`;
  }
}

export type ServerExport = {
  server: ServerKind;
  label: string;
  title: string;
  direct: string;
  live: string;
  vlc: string;
  mpv: string;
  isHls: boolean;
  resolveMs: number;
  expiresAt?: string;
};

function toServerExport(
  resolved: ResolvedStream,
  channelName: string,
  origin: string,
  resolveMs: number,
): ServerExport {
  const profile = serverProfile(resolved.server);
  const title = `${channelName} · ${playerLabel(resolved.server)}`;
  const direct = resolved.playableUrl;
  const referer = streamReferer(resolved);
  const live = livePlaylistUrl(resolved.channelId, resolved.server, origin);
  const t = profile.transport;
  // dembed edges require a per-request token minted server-side, so the
  // direct URL is not externally playable — external tools must use the relay.
  const directPlayable = resolved.meta.family !== "dembed";
  const vlcUrl = t.vlcDirectPlayable && directPlayable ? direct : live;
  const mpvUrl = t.mpvDirectPlayable && directPlayable ? direct : live;
  const vlcRef = t.vlcDirectPlayable && directPlayable ? referer || undefined : undefined;
  const mpvRef = t.mpvDirectPlayable && directPlayable ? referer || undefined : undefined;
  const vlcUa = t.vlcDirectPlayable && directPlayable && t.toolsUserAgent ? UA : undefined;
  const mpvUa = t.mpvDirectPlayable && directPlayable && t.toolsUserAgent ? UA : undefined;
  return {
    server: resolved.server,
    label: playerLabel(resolved.server),
    title,
    direct,
    live,
    vlc: buildVlcCommand(vlcUrl, vlcRef, vlcUa),
    mpv: buildMpvCommand(mpvUrl, mpvRef, title, mpvUa),
    isHls: resolved.mimeType === "application/x-mpegURL",
    resolveMs,
    expiresAt: resolved.meta.expiresAt,
  };
}

function resolveErrorMessage(err: unknown, server: ServerKind): string {
  const msg = err instanceof Error ? err.message : "failed";
  if (server === "cast" && msg.includes("403")) {
    return "cast embed blocked by CDN (HTTP 403)";
  }
  if (msg.startsWith("fetch failed (HTTP ")) {
    return msg.replace(/^fetch failed \(HTTP (\d+)\): https?:\/\/[^\s]+/, "upstream fetch failed (HTTP $1)");
  }
  return msg;
}

async function loadPlayableHtml(
  channelId: number,
  server: ServerKind,
  knownEmbedUrl?: string,
): Promise<{ html: string; embedUrl: string }> {
  const pageUrl = playerPageUrl(server, channelId);
  let embedUrl = knownEmbedUrl;
  if (!embedUrl) {
    const pageHtml = await fetchHtml(pageUrl, watchUrl(channelId));
    embedUrl = extractEmbedUrl(pageHtml) ?? undefined;
    if (!embedUrl) throw new Error(`no embed iframe on ${server} page`);
  }
  const { html, referer } = await fetchEmbedHtmlChain(
    embedUrl,
    await fetchHtml(embedUrl, pageUrl),
    htmlMayContainPlayable,
  );
  return { html, embedUrl: referer };
}

export async function resolveLive(
  channelId: number,
  server: ServerKind,
): Promise<ResolvedStream> {
  const { html, embedUrl } = await loadPlayableHtml(channelId, server);
  return resolveFromHtml(html, { channelId, server, embedUrl });
}

export async function resolveFromCachedEmbed(
  channelId: number,
  server: ServerKind,
  embedUrl: string,
): Promise<ResolvedStream> {
  const loaded = await loadPlayableHtml(channelId, server, embedUrl);
  return resolveFromHtml(loaded.html, { channelId, server, embedUrl: loaded.embedUrl });
}

function resolveFns(channelId: number, server: ServerKind): ResolveFns {
  return {
    full: () => resolveLive(channelId, server),
    fromEmbed: (embedUrl) => resolveFromCachedEmbed(channelId, server, embedUrl),
  };
}

export async function handleResolveOne(
  res: ServerResponse,
  channelId: number,
  server: ServerKind,
  origin: string,
) {
  const started = Date.now();
  try {
    const session = await ensureFreshSession(channelId, server, resolveFns(channelId, server));
    const title = await channelTitle(channelId);
    const body = JSON.stringify(
      toServerExport(sessionToResolved(session), title, origin, Date.now() - started),
    );
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch (err) {
    const body = JSON.stringify({
      server,
      label: playerLabel(server),
      error: resolveErrorMessage(err, server),
      resolveMs: Date.now() - started,
    });
    res.writeHead(502, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(body);
  }
}

export async function handleLivePlaylist(
  res: ServerResponse,
  channelId: number,
  server: ServerKind,
  origin: string,
  childUrl: string | null,
  variant: number | null,
) {
  const result = await proxyLivePlaylist(
    channelId,
    server,
    origin,
    resolveFns(channelId, server),
    childUrl,
    variant,
  );
  const buf = Buffer.isBuffer(result.body) ? result.body : Buffer.from(result.body);
  res.writeHead(result.status, {
    "Content-Type": result.type,
    "Content-Length": buf.byteLength,
    ...result.headers,
  });
  res.end(buf);
}
