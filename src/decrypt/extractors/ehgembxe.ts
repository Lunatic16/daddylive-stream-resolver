import { UA } from "../../http.js";
import type { PlayableResult } from "./embed.js";

export function isEhgembxeEmbed(html: string, url = ""): boolean {
  return /ehgembxe\.cfd|tims-\d+\.sytes\.net/i.test(url) || (html.includes("tims-") && /var\s+\w+=\[\d+,\d+/i.test(html));
}

export function decodeEhgembxeScript(html: string): string | null {
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of scripts) {
    const s = match[1];
    const arrMatch = s.match(/var\s+(\w+)=\[([0-9,]+)\]/);
    const keysMatch = s.match(/,\s*\w+=(\d+),\s*\w+=(\d+),/);
    if (arrMatch && keysMatch) {
      const nums = arrMatch[2].split(",").map(Number);
      const xor = Number(keysMatch[1]);
      const sub = Number(keysMatch[2]);
      if (nums.length > 500) {
        return nums.map((n) => String.fromCharCode(((n ^ xor) - sub + 256) % 256)).join("");
      }
    }
  }
  return null;
}

export async function extractEhgembxePlayable(
  html: string,
  embedUrl: string,
): Promise<PlayableResult | null> {
  const decoded = decodeEhgembxeScript(html);
  if (!decoded) return null;
  const ticketUrl = decoded.match(/"ticketUrl"\s*:\s*"([^"]+)"/)?.[1];
  if (!ticketUrl) return null;

  try {
    const res = await fetch(ticketUrl, {
      headers: {
        "User-Agent": UA,
        Referer: embedUrl || "https://ehgembxe.cfd/",
      },
    });
    if (!res.ok) return null;
    const b = new Uint8Array(await res.arrayBuffer());
    if (b.length < 2) return null;
    const tk = ticketUrl.substring(ticketUrl.lastIndexOf("/") + 1);
    const seed = b[0];
    let streamUrl = "";
    for (let i = 1; i < b.length; i++) {
      streamUrl += String.fromCharCode(b[i] ^ tk.charCodeAt((i - 1) % tk.length) ^ ((seed + i - 1) & 255));
    }
    if (!streamUrl.startsWith("http")) return null;
    const expiresMatch = streamUrl.match(/\/(\d{10})\//);
    return {
      playableUrl: streamUrl,
      mimeType: "application/x-mpegURL",
      meta: {
        family: "ehgembxe",
        expiresAt: expiresMatch?.[1] ?? "",
      },
    };
  } catch {
    return null;
  }
}
