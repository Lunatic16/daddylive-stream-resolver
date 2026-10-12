import { UA } from "../http.js";
import { buildProxyUrl } from "./links.js";
import { upstreamRuleFor } from "./rules.js";
import { coalesceSegment } from "./segment-cache.js";
import { unwrapWebpMpegTs } from "./unwrap-webp-ts.js";

const CORS = { "Access-Control-Allow-Origin": "*" };
const TS_CACHE = { ...CORS, "Cache-Control": "public, max-age=3600, immutable" };
const PL_CACHE = { ...CORS, "Cache-Control": "no-cache" };

export type ProxyResult = {
  status: number;
  body: string | Buffer;
  type: string;
  headers?: Record<string, string>;
};

function buildUpstreamHeaders(playableUrl: string, embedReferer: string): Record<string, string> {
  const rule = upstreamRuleFor(playableUrl);
  const headers: Record<string, string> = { "User-Agent": UA, Accept: "*/*" };
  if (rule.refererMode === "omit") return headers;
  if (rule.refererMode === "required") {
    const referer = rule.forceReferer ?? embedReferer;
    headers.Referer = referer;
    headers.Origin = new URL(referer).origin;
    return headers;
  }
  if (embedReferer) {
    headers.Referer = embedReferer;
    if (URL.canParse(embedReferer)) headers.Origin = new URL(embedReferer).origin;
  }
  return headers;
}

function isPlaylist(body: Buffer, targetUrl: string): boolean {
  const head = body.subarray(0, Math.min(body.length, 256)).toString("utf8");
  return head.includes("#EXTM3U") || /\.m3u8(\?|$)/i.test(targetUrl);
}

function proxiedLine(path: string, baseDir: string, referer: string, origin: string): string {
  const abs = new URL(path, baseDir).href;
  const ref = upstreamRuleFor(abs).refererMode === "omit" ? "" : referer;
  return buildProxyUrl(abs, ref, origin);
}

function rewritePlaylist(playlist: string, playlistUrl: URL, referer: string, origin: string): string {
  const baseDir = playlistUrl.href.slice(0, playlistUrl.href.lastIndexOf("/") + 1);
  return playlist
    .split("\n")
    .filter((line) => !/^#EXT-X-PROGRAM-DATE-TIME:/i.test(line.trim()))
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_match, uri: string) =>
          `URI="${proxiedLine(uri, baseDir, referer, origin)}"`,
        );
      }
      return proxiedLine(trimmed, baseDir, referer, origin);
    })
    .join("\n");
}

async function fetchRaw(target: string, referer: string): Promise<{ status: number; body: Buffer; type: string }> {
  const res = await fetch(target, {
    headers: buildUpstreamHeaders(target, referer),
    redirect: "follow",
  });
  return {
    status: res.status,
    body: Buffer.from(await res.arrayBuffer()),
    type: res.headers.get("content-type") || "",
  };
}

export async function proxyStream(query: URLSearchParams, origin: string): Promise<ProxyResult> {
  const target = query.get("url");
  const referer = query.get("referer") ?? "";
  if (!target) {
    return { status: 400, body: "url required", type: "text/plain" };
  }
  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(target);
  } catch {
    return { status: 400, body: "invalid url", type: "text/plain" };
  }
  if (upstreamUrl.protocol !== "http:" && upstreamUrl.protocol !== "https:") {
    return { status: 400, body: "unsupported protocol", type: "text/plain" };
  }
  const rule = upstreamRuleFor(target);
  const playlistUrl = /\.m3u8(\?|$)/i.test(target);
  try {
    if (!playlistUrl) {
      const body = await coalesceSegment(target, async () => {
        const upstream = await fetchRaw(target, referer);
        if (upstream.status >= 400) throw new Error(`HTTP ${upstream.status}`);
        const ts = unwrapWebpMpegTs(upstream.body);
        if (ts) return ts;
        if (upstream.body[0] === 0x89) throw new Error("PNG unwrap failed");
        return upstream.body;
      });
      if (body[0] === 0x47) {
        return { status: 200, body, type: "video/mp2t", headers: TS_CACHE };
      }
      return { status: 200, body, type: "application/octet-stream", headers: PL_CACHE };
    }

    const upstream = await fetchRaw(target, referer);
    if (upstream.status >= 400) {
      return {
        status: upstream.status,
        body: upstream.body,
        type: upstream.type || "text/plain",
        headers: { ...CORS, "Cache-Control": "no-store" },
      };
    }

    if (rule.rewritePlaylist && isPlaylist(upstream.body, target)) {
      const text = upstream.body.toString("utf8");
      const proxyReferer =
        rule.refererMode === "required"
          ? (rule.forceReferer ?? referer)
          : rule.refererMode === "omit"
            ? ""
            : referer;
      const body = text.startsWith("#EXTM3U")
        ? rewritePlaylist(text, upstreamUrl, proxyReferer || referer || target, origin)
        : text;
      return {
        status: 200,
        body,
        type: "application/vnd.apple.mpegurl",
        headers: PL_CACHE,
      };
    }

    const mpegTs = unwrapWebpMpegTs(upstream.body);
    if (mpegTs) {
      return { status: 200, body: mpegTs, type: "video/mp2t", headers: TS_CACHE };
    }

    return {
      status: upstream.status,
      body: upstream.body,
      type: upstream.type || "application/octet-stream",
      headers: PL_CACHE,
    };
  } catch (err) {
    return {
      status: 502,
      body: err instanceof Error ? err.message : "proxy failed",
      type: "text/plain",
      headers: CORS,
    };
  }
}
