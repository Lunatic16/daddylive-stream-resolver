import { extractPlayableFromHtml } from "./extractors/embed.js";
import type { ResolvedStream, ServerKind } from "./types.js";

export type ResolveContext = {
  channelId: number;
  server: ServerKind;
  embedUrl: string;
};

export function resolveFromHtml(embedHtml: string, ctx: ResolveContext): ResolvedStream {
  const resolved = extractPlayableFromHtml(embedHtml);
  if (!resolved) {
    throw new Error(`no playable stream in ${ctx.server} embed`);
  }
  return { ...ctx, ...resolved };
}
