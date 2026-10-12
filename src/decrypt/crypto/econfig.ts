export type EconfigStream = {
  stream_url: string;
  stream_url_nop2p?: string;
  url_nop2p?: boolean;
  p2p?: boolean;
  swarm_id?: string;
  swarmcloud?: boolean;
  swarmcloud_token?: string;
  p2p_tracker?: string;
  domainlocked?: boolean;
  autoplay?: boolean;
  [key: string]: unknown;
};

const ORDER = [2, 0, 3, 1] as const;
const PARTS = 4;

function atobBinary(value: string): string {
  return Buffer.from(value, "base64").toString("binary");
}

export function decryptEconfig(b64: string): EconfigStream | null {
  if (!b64) return null;
  const raw = atobBinary(b64);
  const chunkSize = Math.ceil(raw.length / PARTS);
  const chunks: string[] = [];
  for (let i = 0, offset = 0; i < PARTS; i++, offset += chunkSize) {
    chunks.push(raw.slice(offset, offset + chunkSize));
  }
  const reordered: string[] = [];
  for (let i = 0; i < ORDER.length; i++) {
    const piece = chunks[i].slice(0, 3) + chunks[i].slice(4);
    reordered[ORDER[i]] = atobBinary(piece);
  }
  try {
    const json = Buffer.from(reordered.join(""), "base64").toString("utf8");
    const config = JSON.parse(json) as EconfigStream;
    if (!config.stream_url && !config.stream_url_nop2p) return null;
    return config;
  } catch {
    return null;
  }
}

export function econfigPlayableUrl(config: EconfigStream): string {
  if (config.p2p === false || config.url_nop2p) {
    return config.stream_url_nop2p || config.stream_url;
  }
  return config.stream_url || config.stream_url_nop2p || "";
}
