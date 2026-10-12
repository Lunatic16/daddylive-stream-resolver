import { decryptEconfig, econfigPlayableUrl } from "../crypto/econfig.js";

const ECONFIG_RE = /window\._econfig\s*=\s*'([^']+)'/;

function extractTiestepEconfig(html: string): string | null {
  return html.match(ECONFIG_RE)?.[1] ?? null;
}

export function extractTiestepM3u8(html: string): string | null {
  const b64 = extractTiestepEconfig(html);
  if (!b64) return null;
  const config = decryptEconfig(b64);
  if (!config) return null;
  const url = econfigPlayableUrl(config);
  return url.includes(".m3u8") ? url : null;
}

export function extractTiestepMeta(html: string): Record<string, string> {
  const b64 = extractTiestepEconfig(html);
  if (!b64) return {};
  const config = decryptEconfig(b64);
  if (!config) return {};
  const meta: Record<string, string> = {};
  if (config.swarm_id) meta.swarmId = String(config.swarm_id);
  const url = econfigPlayableUrl(config);
  const expires = url.match(/[?&]e=(\d+)/)?.[1];
  if (expires) meta.expiresAt = expires;
  return meta;
}
