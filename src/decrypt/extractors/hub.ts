import type { HubConfig } from "../types.js";
import { aesCbcDecrypt } from "../crypto/aes-cbc.js";

const ENCRYPTED_BLOCK_RE =
  /const ENCRYPTED_CONFIG = \{[\s\S]*?cipher:\s*'([^']+)'[\s\S]*?key:\s*'([^']+)'[\s\S]*?iv:\s*'([^']+)'/;

export function decryptHubConfigFromHtml(html: string): HubConfig | null {
  const match = html.match(ENCRYPTED_BLOCK_RE);
  if (!match) return null;
  const [, cipher, key, iv] = match;
  try {
    const config = JSON.parse(aesCbcDecrypt(cipher, key, iv)) as HubConfig;
    if (!config.baseUrl || !config.streamId) return null;
    return config;
  } catch {
    return null;
  }
}

export function buildHubPlayableUrl(config: HubConfig): string | null {
  if (config.initialVideoUrl) return config.initialVideoUrl;
  if (config.initialToken && config.initialCode && config.streamId) {
    return `${config.baseUrl}/${config.initialToken}/${config.initialCode}/${config.streamId}/webm/`;
  }
  return null;
}
