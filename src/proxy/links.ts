import { createHash } from "node:crypto";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}`;
}

function segmentFileName(directUrl: string): string {
  const hash = createHash("sha256").update(directUrl).digest("base64url").slice(0, 20);
  return `${hash}.ts`;
}

export function buildProxyUrl(directUrl: string, referer: string, origin: string, isSegment = false): string {
  const path = isSegment ? `/api/proxy/${segmentFileName(directUrl)}` : "/api/proxy";
  const params = new URLSearchParams({ url: directUrl });
  if (referer) params.set("referer", referer);
  return `${origin.replace(/\/$/, "")}${path}?${params}`;
}

export function buildVlcCommand(playUrl: string, referer?: string, userAgent?: string): string {
  const parts = ["vlc", shellQuote(playUrl)];
  if (userAgent) parts.push(`:http-user-agent=${shellQuote(userAgent)}`);
  if (referer) parts.push(`:http-referrer=${shellQuote(referer)}`);
  return parts.join(" ");
}

export function buildMpvCommand(
  playUrl: string,
  referer?: string,
  title?: string,
  userAgent?: string,
): string {
  const parts = ["mpv"];
  if (title) parts.push(`--force-media-title=${shellQuote(title)}`);
  if (userAgent) parts.push(`--user-agent=${shellQuote(userAgent)}`);
  if (referer) parts.push(`--referrer=${shellQuote(referer)}`);
  parts.push(shellQuote(playUrl));
  return parts.join(" ");
}
