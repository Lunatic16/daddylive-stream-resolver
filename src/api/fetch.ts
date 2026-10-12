import {
  extractBloggerZdecUrl,
  isBloggerPlayerPage,
} from "../decrypt/extractors/blogger-player.js";
import {
  buildWikiPhpUrl,
  extractWikiSportLiveId,
  isWikiSportPage,
} from "../decrypt/extractors/wikisport.js";
import { extractInnerFrameUrl } from "../decrypt/index.js";
import { fetchHtml, htmlHeaders } from "../http.js";

async function resolveRedirectUrl(url: string, referer: string): Promise<string> {
  const res = await fetch(url, { headers: htmlHeaders(referer), redirect: "manual" });
  const location = res.headers.get("location");
  if (res.status >= 300 && res.status < 400 && location) {
    return new URL(location, url).href;
  }
  return url;
}

async function nextScriptedUrl(
  html: string,
  pageUrl: string,
  referer: string,
): Promise<string | null> {
  if (isWikiSportPage(pageUrl)) {
    const liveId = extractWikiSportLiveId(html);
    if (liveId) return buildWikiPhpUrl(liveId);
  }
  if (isBloggerPlayerPage(pageUrl)) {
    const target = extractBloggerZdecUrl(html);
    if (target) return resolveRedirectUrl(target, referer);
  }
  return null;
}

export async function fetchEmbedHtmlChain(
  embedUrl: string,
  html: string,
  hasPlayable: (body: string) => boolean | Promise<boolean>,
): Promise<{ html: string; referer: string }> {
  let current = html;
  let referer = embedUrl;
  for (let depth = 0; depth < 6; depth++) {
    if (await hasPlayable(current)) return { html: current, referer };
    const frame = extractInnerFrameUrl(current, referer);
    if (frame) {
      current = await fetchHtml(frame, referer);
      referer = frame;
      continue;
    }
    const scripted = await nextScriptedUrl(current, referer, referer);
    if (!scripted || scripted === referer) break;
    current = await fetchHtml(scripted, referer);
    referer = scripted;
  }
  return { html: current, referer };
}
