import { UA } from "../http.js";

type EdgeToken = {
  value: string;
  renewAt: number;
  expiresAt: number;
  inflight: Promise<string | null> | null;
};

const tokens = new Map<string, EdgeToken>();

function keyOf(edge: string, slug: string): string {
  return `${edge}|${slug}`;
}

function trackInflight(entry: EdgeToken, p: Promise<string | null>): Promise<string | null> {
  entry.inflight = p;
  p.then(
    () => {},
    () => {},
  ).finally(() => {
    if (entry.inflight === p) entry.inflight = null;
  });
  return p;
}

async function mint(edge: string, slug: string, referer: string): Promise<string | null> {
  let origin: string;
  try {
    origin = new URL(referer).origin;
  } catch {
    return null;
  }
  const res = await fetch(`${edge}/api/playlist-token?slug=${encodeURIComponent(slug)}`, {
    headers: { "User-Agent": UA, Origin: origin, Referer: referer },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { token?: string; ttl?: number } | null;
  if (!data?.token) return null;
  const ttl = Math.max(20, Number(data.ttl) || 120);
  const now = Date.now();
  tokens.set(keyOf(edge, slug), {
    value: data.token,
    renewAt: now + ttl * 500,
    expiresAt: now + ttl * 1000 - 2000,
    inflight: null,
  });
  return data.token;
}

/**
 * Returns a playlist token for the dembed edge, mirroring the embed page's
 * own policy: serve the cached token until it expires, renew in the
 * background from halfway through its TTL. `null` when minting fails — the
 * caller then fetches without a token (the edge answers 403 and the normal
 * error/retry paths apply).
 */
export async function dembedPlaylistToken(
  edge: string,
  slug: string,
  referer: string,
): Promise<string | null> {
  const key = keyOf(edge, slug);
  const cur = tokens.get(key);
  const now = Date.now();
  if (cur && now < cur.expiresAt) {
    if (now >= cur.renewAt && !cur.inflight) {
      trackInflight(cur, mint(edge, slug, referer).catch(() => null));
    }
    return cur.value;
  }
  if (cur?.inflight) return cur.inflight;
  const p = mint(edge, slug, referer).catch(() => null);
  if (cur) trackInflight(cur, p);
  return p;
}

export function invalidateDembedToken(edge: string, slug: string): void {
  tokens.delete(keyOf(edge, slug));
}

/** Rebuilds a playlist URL with a fresh cache-buster and the minted token (`t=`). */
export function withDembedParams(target: string, token: string | null): string {
  const u = new URL(target);
  u.searchParams.delete("t");
  u.searchParams.delete("_");
  if (token) u.searchParams.set("t", token);
  u.searchParams.set("_", String(Date.now()));
  return u.href;
}
