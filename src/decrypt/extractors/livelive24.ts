const SOURCE_RE = /<source[^>]+src="(https:\/\/[^"]+\/webm\/[^"]*)"/i;
const STREAM_ID_RE = /var\s+streamId\s*=\s*"(\d+)"/;
const BASE_URL_RE = /var\s+baseUrl\s*=\s*"((?:\\\/|[^"])+)"/;
const API_URL_RE = /var\s+apiUrl\s*=\s*"((?:\\\/|[^"])+)"/;
const REFRESH_RE = /REFRESH_MS\s*=\s*(\d+)/;

function unescapeJsonUrl(value: string): string {
  return value.replace(/\\\//g, "/");
}

export function extractLivelive24Webm(html: string): string | null {
  return html.match(SOURCE_RE)?.[1] ?? null;
}

export function extractLivelive24Meta(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const streamId = html.match(STREAM_ID_RE)?.[1];
  const baseUrl = html.match(BASE_URL_RE)?.[1];
  const apiUrl = html.match(API_URL_RE)?.[1];
  const refreshMs = html.match(REFRESH_RE)?.[1];
  if (streamId) meta.streamId = streamId;
  if (baseUrl) meta.baseUrl = unescapeJsonUrl(baseUrl);
  if (apiUrl) meta.apiUrl = unescapeJsonUrl(apiUrl);
  if (refreshMs) meta.refreshMs = refreshMs;
  return meta;
}
