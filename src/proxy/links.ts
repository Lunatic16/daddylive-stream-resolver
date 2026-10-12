function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildProxyUrl(directUrl: string, referer: string, origin: string): string {
  const params = new URLSearchParams({ url: directUrl });
  if (referer) params.set("referer", referer);
  return `${origin.replace(/\/$/, "")}/api/proxy?${params}`;
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
