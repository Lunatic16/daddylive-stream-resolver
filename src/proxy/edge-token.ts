import { UA } from "../http.js";

type TokenEntry = {
  value: string;
  renewAt: number;
  expiresAt: number;
};

type TokenResponse = {
  token?: string;
  ttl?: number;
};

const inflight = new Map<string, Promise<TokenEntry>>();
const tokens = new Map<string, TokenEntry>();

function entry(token: string, ttlSec: number): TokenEntry {
  const now = Date.now();
  const ttl = Math.max(20, ttlSec) * 1000;
  return { value: token, renewAt: now + ttl / 2, expiresAt: now + ttl - 2000 };
}

async function fetchToken(edge: string, slug: string, referer: string): Promise<TokenEntry> {
  const res = await fetch(`${edge}/api/playlist-token?slug=${encodeURIComponent(slug)}`, {
    headers: {
      "User-Agent": UA,
      Referer: referer,
      Origin: new URL(referer).origin,
      Accept: "*/*",
    },
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`playlist-token HTTP ${res.status}`);
  const data = (await res.json()) as TokenResponse;
  if (!data.token) throw new Error("playlist-token missing token");
  return entry(data.token, Number(data.ttl) || 120);
}

async function fetchAndStore(edge: string, slug: string, referer: string): Promise<TokenEntry> {
  const key = `${edge}|${slug}`;
  try {
    const fresh = await fetchToken(edge, slug, referer);
    tokens.set(key, fresh);
    return fresh;
  } finally {
    inflight.delete(key);
  }
}

export function invalidateEdgeToken(edge: string, slug: string): void {
  tokens.delete(`${edge}|${slug}`);
}

export async function edgePlaylistToken(
  edge: string,
  slug: string,
  referer: string,
): Promise<string> {
  const key = `${edge}|${slug}`;
  const cached = tokens.get(key);
  const now = Date.now();
  if (cached && now < cached.expiresAt) {
    if (now >= cached.renewAt && !inflight.has(key)) {
      void fetchAndStore(edge, slug, referer).catch(() => {});
    }
    return cached.value;
  }
  tokens.delete(key);
  const pending = inflight.get(key);
  if (pending) return (await pending).value;
  const work = fetchAndStore(edge, slug, referer);
  inflight.set(key, work);
  return (await work).value;
}

export function appendToken(url: string, token: string): string {
  const u = new URL(url);
  u.searchParams.delete("t");
  u.searchParams.delete("_");
  u.searchParams.set("t", token);
  u.searchParams.set("_", String(Date.now()));
  return u.href;
}
