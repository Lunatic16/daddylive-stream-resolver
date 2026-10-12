const EPI_ARRAY_RE = /var\s+_gr\w+=\[([0-9,\s]+)\],_mz\d+=(\d+),_mz\d+=(\d+)/;
const PLUS_ARRAY_RE = /var\s+_\w+=\[([^\]]+)\],_\w+=(\d+),_\w+=(\d+)/;

function decodeXorArray(nums: number[], xor: number, sub: number): string {
  return nums.map((n) => String.fromCharCode(((n ^ xor) - sub + 256) & 255)).join("");
}

export function deobfuscateXorScript(html: string): string | null {
  const epi = html.match(EPI_ARRAY_RE);
  if (epi) {
    return decodeXorArray(
      epi[1].split(",").map((n) => Number(n.trim())),
      Number(epi[2]),
      Number(epi[3]),
    );
  }
  const plus = html.match(PLUS_ARRAY_RE);
  if (!plus) return null;
  return decodeXorArray(
    plus[1].split(",").map((n) => Number(n.trim())),
    Number(plus[2]),
    Number(plus[3]),
  );
}

function m3u8FromText(source: string): string | null {
  const signed = source.match(/SIGNED_URL\s*=\s*"([^"]+\.m3u8[^"]*)"/)?.[1];
  if (signed) return signed;
  const fromVar = source.match(/url\s*=\s*"([^"]+\.m3u8[^"]*)"/)?.[1];
  if (fromVar) return fromVar;
  return source.match(/https:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*/)?.[0] ?? null;
}

export function extractEpiembedsM3u8(html: string): string | null {
  return m3u8FromText(deobfuscateXorScript(html) ?? html);
}

export function extractEpiembedsMeta(html: string): Record<string, string> {
  const plain = deobfuscateXorScript(html) ?? "";
  const meta: Record<string, string> = {};
  const channelId = html.match(/data-id="([^"]+)"/)?.[1];
  if (channelId) meta.channelId = channelId;
  const url = extractEpiembedsM3u8(html) ?? "";
  const expires = url.match(/\/(1[0-9]{9})\//)?.[1];
  if (expires) meta.expiresAt = expires;
  const token = plain.match(/token:\s*"([^"]+)"/)?.[1];
  if (token) meta.token = token;
  return meta;
}
