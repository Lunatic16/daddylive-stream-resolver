import { createServer, type ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PLAYER_IDS, type ServerKind } from "../servers/kinds.js";
import { proxyStream } from "../proxy/stream.js";
import { renderPage } from "../web/page.js";
import { handleLivePlaylist, handleResolveOne } from "./resolve.js";
import { fetchChannelList, generateM3u8Playlist } from "../channels/index.js";
import { fetchEventsFeed } from "../events/index.js";

const PORT = Number(process.env.PORT ?? "3000");

const webRoot = [
  join(dirname(fileURLToPath(import.meta.url)), "../web"),
  join(process.cwd(), "src/web"),
].find((path) => existsSync(join(path, "style.css")))!;

const staticFiles: Record<string, [string, string]> = {
  "/style.css": ["style.css", "text/css; charset=utf-8"],
  "/app.js": ["app.js", "application/javascript; charset=utf-8"],
};

function send(
  res: ServerResponse,
  status: number,
  body: string | Buffer,
  contentType: string,
  extra?: Record<string, string>,
) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, { "Content-Type": contentType, "Content-Length": buf.byteLength, ...extra });
  res.end(buf);
}

createServer(async (req, res) => {
  try {
    if (req.method !== "GET") {
      send(res, 405, "method not allowed", "text/plain");
      return;
    }
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname === "/api/proxy") {
      const result = await proxyStream(url.searchParams, url.origin);
      send(res, result.status, result.body, result.type, result.headers);
      return;
    }
    if (url.pathname === "/api/live") {
      const channelId = Number(url.searchParams.get("channel"));
      const serverParam = url.searchParams.get("server");
      if (!Number.isFinite(channelId) || channelId < 1) {
        send(res, 400, "channel required", "text/plain");
        return;
      }
      if (!serverParam || !PLAYER_IDS.includes(serverParam as ServerKind)) {
        send(res, 400, "server required", "text/plain");
        return;
      }
      const variantRaw = url.searchParams.get("v");
      const variant =
        variantRaw != null && variantRaw !== "" ? Number(variantRaw) : null;
      await handleLivePlaylist(
        res,
        channelId,
        serverParam as ServerKind,
        url.origin,
        url.searchParams.get("u"),
        Number.isFinite(variant as number) ? (variant as number) : null,
      );
      return;
    }
    if (url.pathname === "/api/resolve") {
      const channelId = Number(url.searchParams.get("channel"));
      const serverParam = url.searchParams.get("server");
      if (!Number.isFinite(channelId) || channelId < 1) {
        send(res, 400, "channel required", "text/plain");
        return;
      }
      if (!serverParam || !PLAYER_IDS.includes(serverParam as ServerKind)) {
        send(res, 400, "server required", "text/plain");
        return;
      }
      await handleResolveOne(res, channelId, serverParam as ServerKind, url.origin);
      return;
    }
    if (url.pathname === "/api/events") {
      try {
        const feed = await fetchEventsFeed();
        send(res, 200, JSON.stringify(feed), "application/json; charset=utf-8", {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "failed";
        send(res, 502, JSON.stringify({ error: message }), "application/json; charset=utf-8", {
          "Access-Control-Allow-Origin": "*",
        });
      }
      return;
    }
    if (url.pathname === "/api/channels") {
      const channels = await fetchChannelList();
      send(
        res,
        200,
        JSON.stringify(channels),
        "application/json; charset=utf-8",
        { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" },
      );
      return;
    }
    if (
      url.pathname === "/api/channels.m3u8" ||
      url.pathname === "/playlist.m3u8" ||
      url.pathname === "/channels.m3u8"
    ) {
      const serverParam = url.searchParams.get("server");
      const server = serverParam && PLAYER_IDS.includes(serverParam as ServerKind)
        ? (serverParam as ServerKind)
        : undefined;
      const channels = await fetchChannelList();
      const m3u8 = generateM3u8Playlist(channels, url.origin, server);
      send(
        res,
        200,
        m3u8,
        "application/x-mpegURL; charset=utf-8",
        {
          "Access-Control-Allow-Origin": "*",
          "Content-Disposition": 'inline; filename="daddylive.m3u8"',
          "Cache-Control": "public, max-age=300",
        },
      );
      return;
    }
    const streamMatch = url.pathname.match(/^\/api\/stream\/(\d+)\.m3u8$/);
    if (streamMatch) {
      const channelId = Number(streamMatch[1]);
      const serverParam = url.searchParams.get("server") ?? "stream";
      if (!PLAYER_IDS.includes(serverParam as ServerKind)) {
        send(res, 400, "invalid server", "text/plain");
        return;
      }
      const variantRaw = url.searchParams.get("v");
      const variant =
        variantRaw != null && variantRaw !== "" ? Number(variantRaw) : null;
      await handleLivePlaylist(
        res,
        channelId,
        serverParam as ServerKind,
        url.origin,
        url.searchParams.get("u"),
        Number.isFinite(variant as number) ? (variant as number) : null,
      );
      return;
    }
    const asset = staticFiles[url.pathname];
    if (asset) {
      send(res, 200, readFileSync(join(webRoot, asset[0])), asset[1]);
      return;
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      send(res, 200, renderPage(), "text/html; charset=utf-8");
      return;
    }
    send(res, 404, "not found", "text/plain");
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    send(res, 500, message, "text/plain");
  }
}).listen(PORT, () => {
  process.stdout.write(`listening on http://localhost:${PORT}\n`);
});
