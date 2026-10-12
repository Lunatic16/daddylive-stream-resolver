const STREAM_URL_RE = /streamUrl:\s*"((?:\\\/|[^"])+)"/;
const EXPIRES_IN_RE = /tokenExpiresIn:\s*(\d+)/;

export function extractWideiptvM3u8(html: string): string | null {
  const raw = html.match(STREAM_URL_RE)?.[1];
  if (!raw) return null;
  return raw.replace(/\\\//g, "/");
}

export function extractWideiptvMeta(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const slug = html.match(/channelSlug:\s*"([^"]+)"/)?.[1];
  if (slug) meta.slug = slug;
  const expiresIn = html.match(EXPIRES_IN_RE)?.[1];
  if (expiresIn) meta.refreshMs = String(Number(expiresIn) * 1000);
  const url = extractWideiptvM3u8(html);
  const token = url?.match(/[?&]token=([^&]+)/)?.[1];
  if (token) {
    meta.token = decodeURIComponent(token);
    try {
      const payload = Buffer.from(meta.token.split(".")[0] ?? "", "base64").toString("utf8");
      const unix = payload.split("|").pop();
      if (unix && /^\d{10}$/.test(unix)) meta.expiresAt = unix;
    } catch {}
  }
  return meta;
}
