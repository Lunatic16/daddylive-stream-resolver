import { UA } from "../../http.js";
import type { PlayableResult } from "./embed.js";

const PP_RE = /PP\s*=\s*"([^"]+)"/;
const CH_RE = /CH\s*=\s*"([^"]+)"/;

export function isMatchoraEmbed(html: string, url = ""): boolean {
  return /matchora\.(to|pro|me)/i.test(url) || (html.includes("matchora") && PP_RE.test(html));
}

export function extractMatchoraPass(html: string): string | null {
  return html.match(PP_RE)?.[1] ?? null;
}

export async function extractMatchoraPlayable(
  html: string,
  embedUrl: string,
): Promise<PlayableResult | null> {
  const pp = extractMatchoraPass(html);
  if (!pp) return null;
  const chMatch = html.match(CH_RE)?.[1] ?? embedUrl.match(/\/channel\/([^\/\?]+)/)?.[1];
  if (!chMatch) return null;

  const hosts = ["https://matchora.to", "https://matchora.pro"];
  for (const host of hosts) {
    try {
      const res = await fetch(`${host}/api/play/${encodeURIComponent(chMatch)}?pp=${encodeURIComponent(pp)}`, {
        headers: {
          Referer: embedUrl,
          Origin: host,
          "User-Agent": UA,
        },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        ready?: boolean;
        url?: string;
        expires_in?: number;
        pp?: string;
        reason?: string;
      };
      if (data.ready && data.url) {
        const expiresAt = String(Math.floor(Date.now() / 1000) + (data.expires_in ?? 600));
        return {
          playableUrl: data.url,
          mimeType: "application/x-mpegURL",
          meta: {
            family: "matchora",
            expiresAt,
            channel: chMatch,
            nextPp: data.pp ?? pp,
          },
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}
