import type { RefererMode } from "../servers/types.js";

export type UpstreamRule = {
  refererMode: RefererMode;
  forceReferer?: string;
  rewritePlaylist: boolean;
};

export function upstreamRuleFor(playableUrl: string): UpstreamRule {
  let host = "";
  try {
    host = new URL(playableUrl).hostname;
  } catch {
    return { refererMode: "optional", rewritePlaylist: true };
  }
  if (/7odxv0l067ka|tiestep|assetrage/i.test(host)) {
    return { refererMode: "required", rewritePlaylist: true };
  }
  if (/bluetier|wideiptv|cdnlivetv/i.test(host)) {
    return { refererMode: "omit", rewritePlaylist: true };
  }
  if (/dreamstream|livelive24/i.test(host)) {
    return { refererMode: "optional", rewritePlaylist: false };
  }
  if (/tiktokcdn/i.test(host)) {
    return { refererMode: "omit", rewritePlaylist: true };
  }
  return { refererMode: "optional", rewritePlaylist: true };
}

export function needsRefresh(
  meta: Record<string, string>,
  leadSec = 45,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  const expiresAt = Number(meta.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return false;
  return nowSec >= expiresAt - leadSec;
}
