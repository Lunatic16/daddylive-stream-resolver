import type { ResolvedStream } from "../decrypt/types.js";
import { UA } from "../http.js";
import { serverProfile } from "../servers/index.js";
import type { ServerKind } from "../servers/kinds.js";
import { needsRefresh } from "./rules.js";

export type LiveSession = {
  channelId: number;
  server: ServerKind;
  playableUrl: string;
  referer: string;
  embedUrl: string;
  mimeType: ResolvedStream["mimeType"];
  meta: Record<string, string>;
  family?: string;
  variants: string[];
  updatedAt: number;
};

export type ResolveFns = {
  full: () => Promise<ResolvedStream>;
  fromEmbed?: (embedUrl: string) => Promise<ResolvedStream>;
};

const REFRESH_LEAD_SEC = 45;
const sessions = new Map<string, LiveSession>();
const inflight = new Map<string, Promise<LiveSession>>();

function keyOf(channelId: number, server: ServerKind): string {
  return `${channelId}:${server}`;
}

export function livePlaylistUrl(channelId: number, server: ServerKind, origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/live?channel=${channelId}&server=${server}`;
}

export function streamReferer(resolved: ResolvedStream): string {
  const profile = serverProfile(resolved.server);
  if (profile.transport.refererMode === "omit") return "";
  if (profile.transport.refererMode === "required") {
    return profile.transport.refererOrigin ?? resolved.embedUrl;
  }
  return resolved.embedUrl;
}

function pathMeta(playableUrl: string, embedUrl: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const embedId = embedUrl.match(/\/e\/([a-z0-9]+)/i)?.[1];
  if (embedId) meta.embedId = embedId;
  try {
    const u = new URL(playableUrl);
    const hlsId = u.pathname.match(/\/hls\/([a-z0-9]+)\.m3u8/i)?.[1];
    if (hlsId) meta.hlsId = hlsId;
    const premiumId = u.pathname.match(/\/premium(\d+)\//i)?.[1];
    if (premiumId) meta.premiumId = premiumId;
    const e = u.searchParams.get("e");
    if (e) meta.expiresAt = e;
  } catch {
    return meta;
  }
  return meta;
}

function fromResolved(resolved: ResolvedStream): LiveSession {
  const token = resolved.playableUrl.match(/[?&]token=([^&]+)/)?.[1];
  const meta = { ...resolved.meta, ...pathMeta(resolved.playableUrl, resolved.embedUrl) };
  if (token) meta.token = decodeURIComponent(token);
  return {
    channelId: resolved.channelId,
    server: resolved.server,
    playableUrl: resolved.playableUrl,
    referer: streamReferer(resolved),
    embedUrl: resolved.embedUrl,
    mimeType: resolved.mimeType,
    meta,
    family: resolved.meta.family,
    variants: [],
    updatedAt: Date.now(),
  };
}

export function sessionToResolved(session: LiveSession): ResolvedStream {
  return {
    channelId: session.channelId,
    server: session.server,
    embedUrl: session.embedUrl,
    playableUrl: session.playableUrl,
    mimeType: session.mimeType,
    meta: session.meta,
  };
}

async function refreshWideiptv(session: LiveSession): Promise<LiveSession | null> {
  const slug = session.meta.slug;
  const token = session.meta.token;
  if (!slug || !token) return null;
  const res = await fetch("https://wideiptv.top/api/refresh_token.php", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": UA,
      Referer: session.embedUrl || "https://wideiptv.top/",
    },
    body: JSON.stringify({ channel: slug, current_token: token }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    success?: boolean;
    token?: string;
    expires_in?: number;
  };
  if (!data.success || !data.token) return null;
  const playableUrl = session.playableUrl.replace(/([?&]token=)[^&]+/, `$1${data.token}`);
  const expiresAt =
    typeof data.expires_in === "number"
      ? String(Math.floor(Date.now() / 1000) + data.expires_in)
      : session.meta.expiresAt;
  return {
    ...session,
    playableUrl,
    meta: {
      ...session.meta,
      ...pathMeta(playableUrl, session.embedUrl),
      token: data.token,
      ...(expiresAt ? { expiresAt } : {}),
      ...(data.expires_in != null ? { refreshMs: String(data.expires_in * 1000) } : {}),
    },
    variants: [],
    updatedAt: Date.now(),
  };
}

async function storeResolved(resolved: ResolvedStream): Promise<LiveSession> {
  const session = fromResolved(resolved);
  sessions.set(keyOf(resolved.channelId, resolved.server), session);
  return session;
}

export async function putResolvedSession(resolved: ResolvedStream): Promise<LiveSession> {
  return storeResolved(resolved);
}

async function refreshSession(cur: LiveSession | undefined, fns: ResolveFns): Promise<LiveSession> {
  if (cur?.family === "wideiptv") {
    const refreshed = await refreshWideiptv(cur).catch(() => null);
    if (refreshed && !needsRefresh(refreshed.meta, REFRESH_LEAD_SEC)) {
      sessions.set(keyOf(refreshed.channelId, refreshed.server), refreshed);
      return refreshed;
    }
  }
  if (cur?.embedUrl && fns.fromEmbed) {
    const viaEmbed = await fns.fromEmbed(cur.embedUrl).catch(() => null);
    if (viaEmbed?.playableUrl) return storeResolved(viaEmbed);
  }
  return storeResolved(await fns.full());
}

export async function ensureFreshSession(
  channelId: number,
  server: ServerKind,
  fns: ResolveFns,
  force = false,
): Promise<LiveSession> {
  const key = keyOf(channelId, server);
  const existing = sessions.get(key);
  if (!force && existing && !needsRefresh(existing.meta, REFRESH_LEAD_SEC)) {
    return existing;
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const work = refreshSession(sessions.get(key), fns).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, work);
  return work;
}
