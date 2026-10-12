import { extractCdnLiveTvM3u8, extractCdnLiveTvMeta } from "./cdnlivetv.js";
import { extractDaddy3M3u8, extractDaddy3Meta } from "./daddy3.js";
import { extractEpiembedsM3u8, extractEpiembedsMeta } from "./epiembeds.js";
import { buildHubPlayableUrl, decryptHubConfigFromHtml } from "./hub.js";
import { extractIgniteShipM3u8 } from "./igniteandship.js";
import { extractLivelive24Meta, extractLivelive24Webm } from "./livelive24.js";
import { extractTiestepM3u8, extractTiestepMeta } from "./tiestep.js";
import { extractWideiptvM3u8, extractWideiptvMeta } from "./wideiptv.js";

export type PlayableResult = {
  playableUrl: string;
  mimeType: "application/x-mpegURL" | "video/webm";
  meta: Record<string, string>;
};

export function htmlMayContainPlayable(html: string): boolean {
  return /#EXTM3U|SIGNED_URL|ENCRYPTED_CONFIG|window\._econfig|streamUrl:|var _\w+=\[|var\s+_gr\w+=\[|function \w+\(s\)\{[^}]*atob|<source[^>]+\/webm\/|player\.load\(\{source:|https:\/\/[^"'`\s]+\.m3u8|\/premium\d+\/index\.m3u8/.test(
    html,
  );
}

export function extractPlayableFromHtml(html: string): PlayableResult | null {
  const tiestepUrl = extractTiestepM3u8(html);
  if (tiestepUrl) {
    return {
      playableUrl: tiestepUrl,
      mimeType: "application/x-mpegURL",
      meta: { family: "tiestep", ...extractTiestepMeta(html) },
    };
  }
  const epiUrl = extractEpiembedsM3u8(html);
  if (epiUrl) {
    return {
      playableUrl: epiUrl,
      mimeType: "application/x-mpegURL",
      meta: { family: "epiembeds", ...extractEpiembedsMeta(html) },
    };
  }
  const hubConfig = decryptHubConfigFromHtml(html);
  if (hubConfig) {
    const playableUrl = buildHubPlayableUrl(hubConfig);
    if (playableUrl) {
      return {
        playableUrl,
        mimeType: "video/webm",
        meta: { family: "hub", streamId: hubConfig.streamId, baseUrl: hubConfig.baseUrl },
      };
    }
  }
  const live24 = extractLivelive24Webm(html);
  if (live24) {
    return {
      playableUrl: live24,
      mimeType: "video/webm",
      meta: { family: "livelive24", ...extractLivelive24Meta(html) },
    };
  }
  const wideUrl = extractWideiptvM3u8(html);
  if (wideUrl) {
    return {
      playableUrl: wideUrl,
      mimeType: "application/x-mpegURL",
      meta: { family: "wideiptv", ...extractWideiptvMeta(html) },
    };
  }
  const cdnUrl = extractCdnLiveTvM3u8(html);
  if (cdnUrl) {
    return {
      playableUrl: cdnUrl,
      mimeType: "application/x-mpegURL",
      meta: { family: "cdnlivetv", ...extractCdnLiveTvMeta(cdnUrl) },
    };
  }
  const igniteUrl = extractIgniteShipM3u8(html);
  if (igniteUrl) {
    return { playableUrl: igniteUrl, mimeType: "application/x-mpegURL", meta: { family: "ignite" } };
  }
  const daddyUrl = extractDaddy3M3u8(html);
  if (daddyUrl) {
    return {
      playableUrl: daddyUrl,
      mimeType: "application/x-mpegURL",
      meta: { family: "daddy3", ...extractDaddy3Meta(html) },
    };
  }
  return null;
}
