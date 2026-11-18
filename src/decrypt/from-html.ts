import { extractPlayableFromHtml, extractAsyncPlayable } from "./extractors/embed.js";
import type { ResolvedStream, ServerKind } from "./types.js";

export type ResolveContext = {
  channelId: number;
  server: ServerKind;
  embedUrl: string;
};

export async function resolveFromHtml(embedHtml: string, ctx: ResolveContext): Promise<ResolvedStream> {
  const resolved = extractPlayableFromHtml(embedHtml);
  if (resolved) {
    return { ...ctx, ...resolved };
  }
  const asyncResolved = await extractAsyncPlayable(embedHtml, ctx.embedUrl);
  if (asyncResolved) {
    return { ...ctx, ...asyncResolved };
  }
  throw new Error(`no playable stream in ${ctx.server} embed`);
}
