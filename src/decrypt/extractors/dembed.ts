export type DembedStream = {
  playableUrl: string;
  edge: string;
  slug: string;
};

const SRC_RE = /const\s+SRC\s*=\s*"(https?:\/\/[^"\s]+\.m3u8)"/;
const EDGE_RE = /const\s+EDGE\s*=\s*"(https?:\/\/[^"\s]+)"/;
const CHANNEL_RE = /const\s+CHANNEL\s*=\s*"([^"\s]+)"/;

/**
 * dembed.st premiumtv player page: the edge CDN only serves a playlist
 * (index.m3u8) to requests carrying a short-lived token minted from
 * `{EDGE}/api/playlist-token?slug={CHANNEL}` with Origin set to the embed
 * origin. The playable URL alone is NOT directly playable.
 */
export function extractDembedStream(html: string): DembedStream | null {
  const playableUrl = html.match(SRC_RE)?.[1];
  const edge = html.match(EDGE_RE)?.[1];
  const slug = html.match(CHANNEL_RE)?.[1];
  if (!playableUrl || !edge || !slug) return null;
  try {
    if (new URL(playableUrl).hostname !== new URL(edge).hostname) return null;
  } catch {
    return null;
  }
  return { playableUrl, edge, slug };
}
