type ServerKind = "stream" | "cast" | "watch" | "plus" | "casting" | "player";

type ServerExport = {
  server: ServerKind;
  label: string;
  title: string;
  direct: string;
  live?: string;
  vlc: string;
  mpv: string;
  isHls: boolean;
  resolveMs: number;
  playbackMs?: number;
  expiresAt?: string;
};

type ServerFail = {
  server: ServerKind;
  label: string;
  error: string;
  resolveMs: number;
};

type ServerIdle = {
  server: ServerKind;
  label: string;
  idle: true;
};

type ServerRunning = {
  server: ServerKind;
  label: string;
  running: true;
};

type ServerEntry =
  | (ServerExport & { ok: true })
  | (ServerFail & { ok: false })
  | ServerIdle
  | ServerRunning;

const isIdle = (entry: ServerEntry): entry is ServerIdle => "idle" in entry;
const isRunning = (entry: ServerEntry): entry is ServerRunning => "running" in entry;

type HlsPlayer = {
  loadSource(url: string): void;
  attachMedia(el: HTMLMediaElement): void;
  on(event: string, cb: (...args: unknown[]) => void): void;
  startLoad(startPosition?: number): void;
  recoverMediaError(): void;
  destroy(): void;
};

type HlsGlobal = {
  isSupported(): boolean;
  Events: { MANIFEST_PARSED: string; ERROR: string };
  ErrorTypes: { NETWORK_ERROR: string; MEDIA_ERROR: string };
  new (config?: Record<string, unknown>): HlsPlayer;
};

declare global {
  interface Window {
    Hls?: HlsGlobal;
  }
}

const HLS_LIVE = {
  enableWorker: true,
  lowLatencyMode: false,
  liveSyncDurationCount: 4,
  liveMaxLatencyDurationCount: 20,
  liveDurationInfinity: true,
  maxLiveSyncPlaybackRate: 1,
  minLiveSyncPlaybackRate: 1,
  maxBufferSize: 60 * 1000 * 1000,
  maxBufferLength: 45,
  maxMaxBufferLength: 90,
  backBufferLength: 30,
  maxBufferHole: 0.5,
  fragLoadingTimeOut: 30000,
  manifestLoadingTimeOut: 20000,
  highBufferWatchdogPeriod: 2,
  nudgeOffset: 0.1,
  nudgeMaxRetry: 5,
  maxFragLookUpTolerance: 0.25,
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;

const ui = {
  form: $<HTMLFormElement>("watch-form"),
  channel: $<HTMLInputElement>("channel"),
  channelSearch: $<HTMLInputElement>("channel-search"),
  channelDropdown: $("channel-dropdown"),
  btnBrowseChannels: $<HTMLButtonElement>("btn-browse-channels"),
  downloadM3u8Link: $<HTMLAnchorElement>("download-m3u8-link"),
  btnCopyM3u8: $<HTMLButtonElement>("btn-copy-m3u8"),
  channelsBrowserCard: $("channels-browser-card"),
  channelCount: $("channel-count"),
  btnCloseBrowser: $<HTMLButtonElement>("btn-close-browser"),
  channelsFilterInput: $<HTMLInputElement>("channels-filter-input"),
  channelsGrid: $("channels-grid"),
  title: $("stream-title"),
  video: $<HTMLVideoElement>("video"),
  error: $("error"),
  servers: $("servers"),
  playerCard: $("player-card"),
  exportCard: $("export-card"),
  timing: $("timing"),
  timingResolve: $("timing-resolve"),
  timingPlayback: $("timing-playback"),
  streamNotes: $("stream-notes"),
  noteDirect: $("note-direct"),
  exports: {
    m3u8: $<HTMLInputElement>("m3u8-url"),
    direct: $<HTMLInputElement>("direct"),
    proxy: $<HTMLInputElement>("proxy"),
    vlc: $<HTMLInputElement>("vlc"),
    mpv: $<HTMLInputElement>("mpv"),
  },
};

const { players: PLAYER_CONFIG } = JSON.parse(
  document.getElementById("app-config")!.textContent!,
) as { players: { id: ServerKind; label: string }[] };

const PLAYER_IDS = PLAYER_CONFIG.map((player) => player.id);
const playerLabel = (server: ServerKind) =>
  PLAYER_CONFIG.find((player) => player.id === server)?.label ?? server;

const state = {
  hls: null as HlsPlayer | null,
  gen: 0,
  resolveGen: 0,
  label: "",
  channelId: 0,
  channels: [] as { id: number; name: string }[],
  servers: [] as ServerEntry[],
  active: "" as ServerKind | "",
  clocks: {
    resolve: 0 as number,
    playback: 0 as number,
    resolveStart: 0,
    playbackStart: 0,
    expiry: 0 as number,
  },
  expiresAt: 0,
};

const fmtRemain = (sec: number) => {
  if (sec <= 0) return "expired";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}h ${mm}m`;
  }
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const stopExpiryClock = () => {
  if (state.clocks.expiry) {
    window.clearInterval(state.clocks.expiry);
    state.clocks.expiry = 0;
  }
  state.expiresAt = 0;
};

const paintDirectExpiry = () => {
  if (!ui.noteDirect) return;
  if (!state.expiresAt) {
    ui.noteDirect.textContent = "No expiry time found for this link";
    ui.noteDirect.classList.remove("stream-notes__text--warn");
    return;
  }
  const left = state.expiresAt - Math.floor(Date.now() / 1000);
  if (left <= 0) {
    ui.noteDirect.textContent = "Expired — use Our Live URL instead";
    ui.noteDirect.classList.add("stream-notes__text--warn");
    return;
  }
  ui.noteDirect.textContent = `Expires in ${fmtRemain(left)}`;
  ui.noteDirect.classList.toggle("stream-notes__text--warn", left <= 60);
};

const bindStreamNotes = (expiresAt?: string) => {
  stopExpiryClock();
  if (ui.streamNotes) ui.streamNotes.hidden = false;
  const unix = Number(expiresAt);
  if (Number.isFinite(unix) && unix > 0) {
    state.expiresAt = unix;
    paintDirectExpiry();
    state.clocks.expiry = window.setInterval(paintDirectExpiry, 1000);
    return;
  }
  paintDirectExpiry();
};

const clearStreamNotes = () => {
  stopExpiryClock();
  if (ui.noteDirect) {
    ui.noteDirect.textContent = "—";
    ui.noteDirect.classList.remove("stream-notes__text--warn");
  }
  if (ui.streamNotes) ui.streamNotes.hidden = true;
};

const showTiming = () => {
  if (ui.timing) ui.timing.hidden = false;
};

const setTimingValue = (kind: "resolve" | "playback", text: string) => {
  const el = kind === "resolve" ? ui.timingResolve : ui.timingPlayback;
  if (el) el.textContent = text;
};

const stopClock = (kind: "resolve" | "playback", finalMs?: number) => {
  const id = state.clocks[kind];
  if (id) {
    window.clearInterval(id);
    state.clocks[kind] = 0;
  }
  const start = kind === "resolve" ? state.clocks.resolveStart : state.clocks.playbackStart;
  const ms = finalMs ?? (start ? performance.now() - start : 0);
  setTimingValue(kind, fmtMs(ms));
  return ms;
};

const startClock = (kind: "resolve" | "playback") => {
  stopClock(kind, 0);
  const started = performance.now();
  if (kind === "resolve") state.clocks.resolveStart = started;
  else state.clocks.playbackStart = started;
  setTimingValue(kind, fmtMs(0));
  showTiming();
  state.clocks[kind] = window.setInterval(() => {
    setTimingValue(kind, fmtMs(performance.now() - started));
  }, 50);
};

const clearTiming = () => {
  stopClock("resolve", 0);
  stopClock("playback", 0);
  setTimingValue("resolve", "—");
  setTimingValue("playback", "—");
  if (ui.timing) ui.timing.hidden = true;
  state.clocks.resolveStart = 0;
  state.clocks.playbackStart = 0;
};

const fmtMs = (ms: number) => (ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`);

const parseChannelInput = (raw: string): number | null => {
  const id = Number(raw.trim());
  return Number.isFinite(id) && id >= 1 ? id : null;
};

const shortError = (message: string) => (message.length <= 40 ? message : `${message.slice(0, 37)}…`);

const showError = (message: string) => {
  if (!ui.error) return;
  ui.error.textContent = message;
  ui.error.hidden = false;
};

const hideError = () => {
  if (ui.error) ui.error.hidden = true;
};

const stopPlayback = () => {
  state.gen += 1;
  if (state.clocks.playback) stopClock("playback");
  state.hls?.destroy();
  state.hls = null;
  if (!ui.video) return;
  ui.video.pause();
  ui.video.removeAttribute("src");
  ui.video.load();
};

const playUrl = (entry: ServerExport) =>
  entry.isHls ? entry.live || entry.direct : entry.direct;

const playStream = async (src: string, isHls: boolean): Promise<number> => {
  if (!ui.video) throw new Error("video missing");
  const id = ++state.gen;
  startClock("playback");
  state.hls?.destroy();
  state.hls = null;
  ui.video.pause();
  ui.video.removeAttribute("src");
  ui.video.load();
  const live = () => id === state.gen;
  const Hls = window.Hls;
  try {
    if (isHls && Hls?.isSupported()) {
      state.hls = new Hls(HLS_LIVE);
      state.hls.loadSource(src);
      state.hls.attachMedia(ui.video);
      await new Promise<void>((resolve, reject) => {
        state.hls!.on(Hls.Events.MANIFEST_PARSED, () => resolve());
        state.hls!.on(Hls.Events.ERROR, (_, detail) => {
          const err = detail as { fatal?: boolean; type?: string; details?: string };
          if (!state.hls || !Hls) return;
          if (!err.fatal) {
            if (err.details === "bufferStalledError") state.hls.startLoad();
            return;
          }
          if (err.type === Hls.ErrorTypes.NETWORK_ERROR) {
            state.hls.startLoad();
            return;
          }
          if (err.type === Hls.ErrorTypes.MEDIA_ERROR) {
            state.hls.recoverMediaError();
            return;
          }
          reject(new Error("playback failed"));
        });
      });
      if (!live()) return stopClock("playback");
      await ui.video.play();
      return stopClock("playback");
    }
    if (isHls && ui.video.canPlayType("application/vnd.apple.mpegurl")) {
      ui.video.src = src;
      if (!live()) return stopClock("playback");
      await ui.video.play();
      return stopClock("playback");
    }
    ui.video.src = src;
    await new Promise<void>((resolve, reject) => {
      const video = ui.video!;
      const done = () => {
        video.removeEventListener("loadedmetadata", onReady);
        video.removeEventListener("error", onErr);
      };
      const onReady = () => {
        done();
        resolve();
      };
      const onErr = () => {
        done();
        reject(new Error("playback failed"));
      };
      video.addEventListener("loadedmetadata", onReady);
      video.addEventListener("error", onErr);
      if (video.readyState >= 1) onReady();
    });
    if (!live()) return stopClock("playback");
    await ui.video.play();
    return stopClock("playback");
  } catch (err) {
    stopClock("playback");
    throw err;
  }
};

const bindExports = (entry: ServerExport) => {
  if (ui.exports.m3u8) {
    ui.exports.m3u8.value = `${window.location.origin}/api/stream/${state.channelId}.m3u8?server=${entry.server}`;
  }
  ui.exports.direct!.value = entry.direct;
  ui.exports.proxy!.value = entry.live ?? "";
  ui.exports.vlc!.value = entry.vlc;
  ui.exports.mpv!.value = entry.mpv;
  if (ui.exportCard) ui.exportCard.hidden = false;
  bindStreamNotes(entry.expiresAt);
};

const paintServers = () => {
  if (!ui.servers) return;
  const sorted = [...state.servers].sort(
    (a, b) => PLAYER_IDS.indexOf(a.server) - PLAYER_IDS.indexOf(b.server),
  );
  ui.servers.innerHTML = sorted
    .map((entry) => {
      const name = entry.label;
      if (isIdle(entry)) {
        return `<button type="button" class="badge" data-server="${entry.server}"><span class="badge__name">${name}</span></button>`;
      }
      if (isRunning(entry)) {
        return `<button type="button" class="badge badge--running" data-server="${entry.server}" disabled><span class="badge__name">${name}</span></button>`;
      }
      const active = entry.server === state.active ? " badge--active" : "";
      if (!entry.ok) {
        return `<button type="button" class="badge badge--fail${active}" data-server="${entry.server}" title="${entry.error.replace(/"/g, "&quot;")}"><span class="badge__name">${name}</span><span class="badge__tag">${shortError(entry.error)}</span></button>`;
      }
      return `<button type="button" class="badge${active}" data-server="${entry.server}"><span class="badge__name">${name}</span></button>`;
    })
    .join("");
};

const resetBadges = () => {
  state.servers = PLAYER_IDS.map((server) => ({
    server,
    label: playerLabel(server),
    idle: true as const,
  }));
  state.active = "";
  paintServers();
};

const upsertServer = (entry: ServerEntry) => {
  const idx = state.servers.findIndex((item) => item.server === entry.server);
  if (idx >= 0) state.servers[idx] = entry;
  else state.servers.push(entry);
};

const selectServer = async (server: ServerKind) => {
  const channelId = parseChannelInput(ui.channel?.value ?? "");
  if (!channelId) {
    showError("enter a valid channel ID");
    return;
  }
  if (ui.channel) ui.channel.value = String(channelId);
  state.channelId = channelId;
  hideError();
  stopPlayback();
  clearTiming();
  clearStreamNotes();
  if (ui.playerCard) ui.playerCard.hidden = false;

  const reqId = ++state.resolveGen;
  state.active = server;
  for (const entry of state.servers) {
    if (entry.server !== server && isRunning(entry)) {
      upsertServer({ server: entry.server, label: entry.label, idle: true });
    }
  }
  upsertServer({ server, label: playerLabel(server), running: true });
  paintServers();
  if (ui.title) ui.title.textContent = `${state.label || `Channel ${channelId}`} · ${playerLabel(server)}`;
  startClock("resolve");
  setTimingValue("playback", "—");

  const live = () => reqId === state.resolveGen;

  try {
    const res = await fetch(`/api/resolve?channel=${channelId}&server=${server}`);
    const data = (await res.json()) as ServerExport & { error?: string; resolveMs?: number };
    if (!live()) return;
    const resolveMs = stopClock("resolve");
    if (!res.ok || data.error || !data.direct) {
      upsertServer({
        server,
        label: data.label ?? playerLabel(server),
        error: data.error ?? "resolve failed",
        resolveMs: data.resolveMs ?? resolveMs,
        ok: false,
      });
      paintServers();
      clearStreamNotes();
      if (ui.exportCard) ui.exportCard.hidden = true;
      showError(data.error ?? "resolve failed");
      return;
    }
    if (data.title) {
      const name = data.title.split(" · ")[0];
      if (name) state.label = name;
    }
    bindExports(data);
    try {
      const playbackMs = await playStream(playUrl(data), data.isHls);
      if (!live()) return;
      upsertServer({ ...data, resolveMs, playbackMs, ok: true });
      paintServers();
      hideError();
    } catch {
      if (!live()) return;
      upsertServer({ ...data, resolveMs, ok: true });
      paintServers();
      showError("playback failed");
    }
  } catch {
    if (!live()) return;
    stopClock("resolve");
    upsertServer({
      server,
      label: playerLabel(server),
      error: "resolve failed",
      resolveMs: 0,
      ok: false,
    });
    paintServers();
    clearTiming();
    clearStreamNotes();
    if (ui.exportCard) ui.exportCard.hidden = true;
    showError("resolve failed");
  }
};

document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const id = btn.dataset.copy;
    const input = id ? $<HTMLInputElement>(id) : null;
    if (!input?.value) return;
    await navigator.clipboard.writeText(input.value);
    const label = btn.textContent;
    btn.textContent = "Copied";
    btn.classList.add("ok");
    setTimeout(() => {
      btn.textContent = label;
      btn.classList.remove("ok");
    }, 1200);
  });
});

ui.servers?.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-server]");
  if (!btn?.dataset.server || btn.disabled) return;
  void selectServer(btn.dataset.server as ServerKind);
});

ui.channel?.addEventListener("change", () => {
  stopPlayback();
  state.resolveGen += 1;
  state.label = "";
  state.active = "";
  if (ui.playerCard) ui.playerCard.hidden = true;
  if (ui.exportCard) ui.exportCard.hidden = true;
  clearTiming();
  clearStreamNotes();
  hideError();
  resetBadges();
});

ui.form?.addEventListener("submit", (event) => {
  event.preventDefault();
});

const onChannelSelected = (channelId: number, channelName?: string) => {
  if (ui.channel) ui.channel.value = String(channelId);
  if (ui.channelSearch) ui.channelSearch.value = channelName ? `${channelName} (#${channelId})` : "";
  if (ui.channelDropdown) ui.channelDropdown.hidden = true;
  if (ui.downloadM3u8Link) {
    ui.downloadM3u8Link.href = `/api/channels.m3u8`;
  }
  stopPlayback();
  state.resolveGen += 1;
  state.channelId = channelId;
  state.label = channelName ?? "";
  state.active = "";
  if (ui.playerCard) ui.playerCard.hidden = true;
  if (ui.exportCard) ui.exportCard.hidden = true;
  clearTiming();
  clearStreamNotes();
  hideError();
  resetBadges();
  highlightActiveChannelInGrid(channelId);
};

const highlightActiveChannelInGrid = (channelId: number) => {
  document.querySelectorAll<HTMLButtonElement>(".channel-btn").forEach((btn) => {
    btn.classList.toggle("channel-btn--active", btn.dataset.channelId === String(channelId));
  });
};

const renderDropdown = (items: { id: number; name: string }[]) => {
  if (!ui.channelDropdown) return;
  if (items.length === 0) {
    ui.channelDropdown.innerHTML = `<div class="channel-dropdown__item" style="cursor:default;color:var(--muted)">No channels found</div>`;
    ui.channelDropdown.hidden = false;
    return;
  }
  ui.channelDropdown.innerHTML = items
    .slice(0, 30)
    .map(
      (ch) =>
        `<div class="channel-dropdown__item" data-id="${ch.id}" data-name="${ch.name.replace(/"/g, "&quot;")}"><span>${ch.name}</span><span class="channel-dropdown__id">#${ch.id}</span></div>`,
    )
    .join("");
  ui.channelDropdown.hidden = false;
};

const renderChannelsGrid = (filter: string = "") => {
  if (!ui.channelsGrid) return;
  const q = filter.trim().toLowerCase();
  const filtered = state.channels.filter(
    (ch) => !q || ch.name.toLowerCase().includes(q) || String(ch.id).includes(q),
  );
  if (ui.channelCount) ui.channelCount.textContent = String(filtered.length);
  ui.channelsGrid.innerHTML = filtered
    .map((ch) => {
      const active = ch.id === state.channelId ? " channel-btn--active" : "";
      return `<button type="button" class="channel-btn${active}" data-channel-id="${ch.id}" data-channel-name="${ch.name.replace(/"/g, "&quot;")}"><span class="channel-btn__name">${ch.name}</span><span class="channel-btn__id">#${ch.id}</span></button>`;
    })
    .join("");
};

const loadChannels = async () => {
  try {
    const res = await fetch("/api/channels");
    if (!res.ok) return;
    state.channels = (await res.json()) as { id: number; name: string }[];
    if (ui.channelCount) ui.channelCount.textContent = String(state.channels.length);
    const initialId = parseChannelInput(ui.channel?.value ?? "46");
    if (initialId) {
      state.channelId = initialId;
      const initialCh = state.channels.find((c) => c.id === initialId);
      if (initialCh && ui.channelSearch) {
        ui.channelSearch.value = `${initialCh.name} (#${initialCh.id})`;
        state.label = initialCh.name;
      }
    }
    renderChannelsGrid();
  } catch {
    // Non-fatal if channel listing network fails
  }
};

ui.channelSearch?.addEventListener("input", () => {
  const q = ui.channelSearch!.value.trim().toLowerCase();
  if (!q) {
    if (ui.channelDropdown) ui.channelDropdown.hidden = true;
    return;
  }
  const matches = state.channels.filter(
    (c) => c.name.toLowerCase().includes(q) || String(c.id).includes(q),
  );
  renderDropdown(matches);
});

ui.channelSearch?.addEventListener("focus", () => {
  const q = ui.channelSearch!.value.trim().toLowerCase();
  if (q && state.channels.length > 0) {
    const matches = state.channels.filter(
      (c) => c.name.toLowerCase().includes(q) || String(c.id).includes(q),
    );
    renderDropdown(matches);
  }
});

ui.channelDropdown?.addEventListener("click", (event) => {
  const item = (event.target as HTMLElement).closest<HTMLElement>(".channel-dropdown__item");
  if (!item?.dataset.id) return;
  const id = Number(item.dataset.id);
  const name = item.dataset.name;
  onChannelSelected(id, name);
});

document.addEventListener("click", (event) => {
  if (
    ui.channelDropdown &&
    !ui.channelDropdown.contains(event.target as Node) &&
    event.target !== ui.channelSearch
  ) {
    ui.channelDropdown.hidden = true;
  }
});

ui.btnCopyM3u8?.addEventListener("click", async () => {
  const m3u8Url = `${window.location.origin}/api/channels.m3u8`;
  await navigator.clipboard.writeText(m3u8Url);
  if (!ui.btnCopyM3u8) return;
  const label = ui.btnCopyM3u8.textContent;
  ui.btnCopyM3u8.textContent = "Copied URL";
  ui.btnCopyM3u8.classList.add("ok");
  setTimeout(() => {
    if (ui.btnCopyM3u8) {
      ui.btnCopyM3u8.textContent = label;
      ui.btnCopyM3u8.classList.remove("ok");
    }
  }, 1200);
});

ui.btnBrowseChannels?.addEventListener("click", () => {
  if (!ui.channelsBrowserCard) return;
  const isHidden = ui.channelsBrowserCard.hidden;
  ui.channelsBrowserCard.hidden = !isHidden;
  if (isHidden) {
    if (ui.channelsFilterInput) {
      ui.channelsFilterInput.value = "";
      ui.channelsFilterInput.focus();
    }
    renderChannelsGrid();
  }
});

ui.btnCloseBrowser?.addEventListener("click", () => {
  if (ui.channelsBrowserCard) ui.channelsBrowserCard.hidden = true;
});

ui.channelsFilterInput?.addEventListener("input", () => {
  renderChannelsGrid(ui.channelsFilterInput?.value ?? "");
});

ui.channelsGrid?.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".channel-btn");
  if (!btn?.dataset.channelId) return;
  const id = Number(btn.dataset.channelId);
  const name = btn.dataset.channelName;
  onChannelSelected(id, name);
  if (ui.channelsBrowserCard) ui.channelsBrowserCard.hidden = true;
});

ui.channel?.addEventListener("input", () => {
  const id = parseChannelInput(ui.channel?.value ?? "");
  if (id && state.channels.length > 0) {
    const ch = state.channels.find((c) => c.id === id);
    if (ch && ui.channelSearch) {
      ui.channelSearch.value = `${ch.name} (#${ch.id})`;
      state.label = ch.name;
    }
  }
});

resetBadges();
void loadChannels();
