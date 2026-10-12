export type { ResolvedStream, ServerKind, HubConfig } from "./types.js";
export type { PlayableResult } from "./extractors/embed.js";
export type { EconfigStream } from "./crypto/econfig.js";
export type { ResolveContext } from "./from-html.js";

export { decryptEconfig, econfigPlayableUrl } from "./crypto/econfig.js";
export { aesCbcDecrypt } from "./crypto/aes-cbc.js";
export { extractEmbedUrl } from "./extractors/dlhd-page.js";
export { extractPlayableFromHtml, htmlMayContainPlayable } from "./extractors/embed.js";
export { resolveFromHtml } from "./from-html.js";

export function extractInnerFrameUrl(html: string, baseUrl: string): string | null {
  const src = html.match(/<iframe[^>]+src="([^"]+)"/i)?.[1]?.trim();
  if (!src || /\+|'|window\.|javascript:|about:|data:/i.test(src)) return null;
  try {
    const url = new URL(src, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}
