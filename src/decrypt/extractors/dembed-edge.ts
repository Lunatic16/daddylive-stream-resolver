const SRC_RE = /const\s+SRC\s*=\s*"([^"]+\/(premium\d+)\/index\.m3u8)"/;
const EDGE_RE = /const\s+EDGE\s*=\s*"(https?:\/\/[^"]+)"/;

export function extractDembedEdgeM3u8(html: string): string | null {
  return html.match(SRC_RE)?.[1] ?? null;
}

export function extractDembedEdgeMeta(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const src = html.match(SRC_RE);
  const edge = html.match(EDGE_RE);
  if (!src) return meta;
  meta.slug = src[2];
  if (edge) meta.edge = edge[1];
  return meta;
}
