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
  fragLoadingTimeOut: 8000,
  manifestLoadingTimeOut: 30000,
  highBufferWatchdogPeriod: 2,
  nudgeOffset: 0.1,
  nudgeMaxRetry: 5,
  maxFragLookUpTolerance: 0.25,
  defaultAudioCodec: "mp4a.40.2",
};

const STORAGE_KEY = "dlhd:lastChannel";

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;

const ui = {
  form: $<HTMLFormElement>("watch-form"),
  downloadM3u8Link: $<HTMLAnchorElement>("download-m3u8-link"),
  btnCopyM3u8: $<HTMLButtonElement>("btn-copy-m3u8"),
  channelCount: $("channel-count"),
  channelsFilterInput: $<HTMLInputElement>("channels-filter-input"),
  channelsGrid: $("channels-grid"),
  title: $("stream-title"),
  video: $<HTMLVideoElement>("video"),
  overlay: $("player-overlay"),
  overlaySpinner: $("overlay-spinner"),
  overlayText: $("overlay-text"),
  error: $("error"),
  servers: $("servers"),
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

// Escape anything that comes from the network before it goes into innerHTML.
const esc = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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

const fmtMs = (ms: number) => (ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`);

/* ───────── Player overlay ───────── */

type OverlayKind = "empty" | "loading" | "error";

const setOverlay = (kind: OverlayKind | null, text = "") => {
  if (!ui.overlay) return;
  if (!kind) {
    ui.overlay.classList.add("is-off");
    return;
  }
  ui.overlay.classList.remove("is-off");
  ui.overlay.dataset.kind = kind;
  if (ui.overlaySpinner) ui.overlaySpinner.hidden = kind !== "loading";
  if (ui.overlayText) ui.overlayText.textContent = text;
};

/* ───────── Expiry note ───────── */

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

/* ───────── Timing clocks ───────── */

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

const parseChannelInput = (raw: string): number | null => {
  const id = Number(raw.trim());
  return Number.isFinite(id) && id >= 1 ? id : null;
};

const showError = (message: string) => {
  if (!ui.error) return;
  ui.error.textContent = message;
  ui.error.hidden = false;
};

const hideError = () => {
  if (ui.error) ui.error.hidden = true;
};

/* ───────── Playback ───────── */

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
        let mediaRecoveries = 0;
        state.hls!.on(Hls.Events.MANIFEST_PARSED, () => resolve());
        state.hls!.on(Hls.Events.ERROR, (_, detail) => {
          const err = detail as {
            fatal?: boolean;
            type?: string;
            details?: string;
            reason?: string;
          };
          if (!state.hls || !Hls) return;
          if (!err.fatal) {
            if (err.details === "bufferStalledError") state.hls.startLoad();
            return;
          }
          if (err.type === Hls.ErrorTypes.NETWORK_ERROR) {
            if (/manifest/i.test(err.details || "")) {
              reject(new Error(err.details || "manifest network error"));
              return;
            }
            state.hls.startLoad();
            return;
          }
          if (err.type === Hls.ErrorTypes.MEDIA_ERROR) {
            mediaRecoveries += 1;
            if (mediaRecoveries <= 3) {
              state.hls.recoverMediaError();
            } else {
              state.hls.startLoad();
              mediaRecoveries = 0;
            }
            return;
          }
          reject(new Error(err.details || err.reason || "playback failed"));
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

/* ───────── Server switcher ───────── */

const paintServers = () => {
  if (!ui.servers) return;
  const sorted = [...state.servers].sort(
    (a, b) => PLAYER_IDS.indexOf(a.server) - PLAYER_IDS.indexOf(b.server),
  );
  ui.servers.innerHTML = sorted
    .map((entry) => {
      const name = esc(entry.label);
      const isActive = entry.server === state.active;
      const pressed = `aria-pressed="${isActive}"`;
      if (isIdle(entry)) {
        return `<button type="button" class="badge" data-server="${entry.server}" ${pressed}><span class="badge__dot"></span><span class="badge__name">${name}</span></button>`;
      }
      if (isRunning(entry)) {
        return `<button type="button" class="badge badge--running badge--active" data-server="${entry.server}" ${pressed} disabled><span class="badge__dot"></span><span class="badge__name">${name}</span></button>`;
      }
      const active = isActive ? " badge--active" : "";
      if (!entry.ok) {
        return `<button type="button" class="badge badge--fail${active}" data-server="${entry.server}" ${pressed} title="${esc(entry.error)} — click to retry"><span class="badge__dot"></span><span class="badge__name">${name}</span></button>`;
      }
      return `<button type="button" class="badge badge--ok${active}" data-server="${entry.server}" ${pressed}><span class="badge__dot"></span><span class="badge__name">${name}</span></button>`;
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

const channelTitle = () => state.label || `Channel ${state.channelId}`;

type SelectOpts = { fallback?: boolean; note?: string };

// With fallback on, a failed server automatically moves on to the next one,
// so picking a channel "just works" without clicking through PLAYER 1..6.
const tryNextServer = (server: ServerKind, opts: SelectOpts): boolean => {
  if (!opts.fallback) return false;
  const next = PLAYER_IDS[PLAYER_IDS.indexOf(server) + 1];
  if (!next) return false;
  void selectServer(next, { fallback: true, note: `${playerLabel(server)} failed` });
  return true;
};

const selectServer = async (server: ServerKind, opts: SelectOpts = {}) => {
  const channelId = state.channelId;
  hideError();
  stopPlayback();
  clearTiming();
  clearStreamNotes();

  const reqId = ++state.resolveGen;
  state.active = server;
  for (const entry of state.servers) {
    if (entry.server !== server && isRunning(entry)) {
      upsertServer({ server: entry.server, label: entry.label, idle: true });
    }
  }
  upsertServer({ server, label: playerLabel(server), running: true });
  paintServers();
  if (ui.title) ui.title.textContent = `${channelTitle()} · ${playerLabel(server)}`;
  setOverlay(
    "loading",
    opts.note ? `${opts.note} — trying ${playerLabel(server)}…` : `Resolving ${playerLabel(server)}…`,
  );
  startClock("resolve");
  setTimingValue("playback", "—");

  const live = () => reqId === state.resolveGen;

  const failed = (message: string, label?: string, resolveMs = 0) => {
    upsertServer({
      server,
      label: label ?? playerLabel(server),
      error: message,
      resolveMs,
      ok: false,
    });
    paintServers();
    clearStreamNotes();
    if (ui.exportCard) ui.exportCard.hidden = true;
    if (tryNextServer(server, opts)) return;
    setOverlay("error", `${message}. Try another server.`);
    showError(message);
  };

  try {
    const res = await fetch(`/api/resolve?channel=${channelId}&server=${server}`);
    const data = (await res.json()) as ServerExport & { error?: string; resolveMs?: number };
    if (!live()) return;
    const resolveMs = stopClock("resolve");
    if (!res.ok || data.error || !data.direct) {
      failed(data.error ?? "Resolve failed", data.label, data.resolveMs ?? resolveMs);
      return;
    }
    if (data.title) {
      const name = data.title.split(" · ")[0];
      if (name) state.label = name;
      if (ui.title) ui.title.textContent = `${channelTitle()} · ${playerLabel(server)}`;
    }
    bindExports(data);
    try {
      const playbackMs = await playStream(playUrl(data), data.isHls);
      if (!live()) return;
      upsertServer({ ...data, resolveMs, playbackMs, ok: true });
      paintServers();
      hideError();
      setOverlay(null);
    } catch {
      if (!live()) return;
      upsertServer({ ...data, resolveMs, ok: true });
      paintServers();
      if (tryNextServer(server, opts)) return;
      setOverlay("error", "Playback failed. Try another server.");
      showError("Playback failed");
    }
  } catch {
    if (!live()) return;
    stopClock("resolve");
    clearTiming();
    failed("Resolve failed");
  }
};

/* ───────── Clipboard ───────── */

// navigator.clipboard is undefined on insecure origins (a phone hitting this
// over http://lan-ip:3000), and some mobile browsers reject it even when
// present — the execCommand fallback keeps copy working inside the click gesture.
const copyText = async (text: string) => {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // fall through to the synchronous fallback
    }
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.left = "-9999px";
  ta.style.fontSize = "16px";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    ta.remove();
  }
  if (!copied) throw new Error("copy failed");
};

const flashButton = (btn: HTMLButtonElement, text: string, cls: "ok" | "err") => {
  const label = btn.textContent;
  btn.textContent = text;
  btn.classList.add(cls);
  setTimeout(() => {
    btn.textContent = label;
    btn.classList.remove(cls);
  }, 1200);
};

document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const id = btn.dataset.copy;
    const input = id ? $<HTMLInputElement>(id) : null;
    if (!input?.value) return;
    try {
      await copyText(input.value);
      flashButton(btn, "Copied", "ok");
    } catch {
      // last resort: select the field so a long-press → Copy still works
      input.focus();
      input.select();
      flashButton(btn, "Copy failed", "err");
    }
  });
});

ui.btnCopyM3u8?.addEventListener("click", async () => {
  const btn = ui.btnCopyM3u8;
  if (!btn) return;
  try {
    await copyText(`${window.location.origin}/api/channels.m3u8`);
    flashButton(btn, "Copied", "ok");
  } catch {
    flashButton(btn, "Copy failed", "err");
  }
});

/* ───────── Channels ───────── */

const remember = (channelId: number) => {
  try {
    localStorage.setItem(STORAGE_KEY, String(channelId));
  } catch {
    // storage unavailable (private mode etc.) — not important
  }
};

const recall = (): number | null => {
  try {
    return parseChannelInput(localStorage.getItem(STORAGE_KEY) ?? "");
  } catch {
    return null;
  }
};

const highlightActiveChannelInGrid = (channelId: number, scroll = false) => {
  document.querySelectorAll<HTMLButtonElement>(".channel-btn").forEach((btn) => {
    const active = btn.dataset.channelId === String(channelId);
    btn.classList.toggle("channel-btn--active", active);
    if (active) btn.setAttribute("aria-current", "true");
    else btn.removeAttribute("aria-current");
    if (active && scroll) btn.scrollIntoView({ block: "center" });
  });
};

const resetStage = () => {
  stopPlayback();
  state.resolveGen += 1;
  state.active = "";
  if (ui.exportCard) ui.exportCard.hidden = true;
  clearTiming();
  clearStreamNotes();
  hideError();
  resetBadges();
};

const onChannelSelected = (channelId: number, channelName?: string) => {
  resetStage();
  state.channelId = channelId;
  state.label = channelName ?? state.channels.find((c) => c.id === channelId)?.name ?? "";
  if (ui.title) ui.title.textContent = channelTitle();
  remember(channelId);
  highlightActiveChannelInGrid(channelId);

  void selectServer(PLAYER_IDS[0], { fallback: true });
};

// Every word typed must match the channel's name or number, in any order:
// "mediaset italy" and "italy mediaset" both find "20 Mediaset Italy".
const searchTerms = (q: string) => q.trim().toLowerCase().split(/\s+/).filter(Boolean);

const matchesFilter = (ch: { id: number; name: string }, terms: string[]) => {
  const name = ch.name.toLowerCase();
  const id = String(ch.id);
  return terms.every((t) => name.includes(t) || id.includes(t));
};

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Wrap matched text in <mark>, escaping each piece separately so entities never split.
const highlight = (name: string, terms: string[]) => {
  if (!terms.length) return esc(name);
  const re = new RegExp(`(${terms.map(escRe).join("|")})`, "gi");
  return name
    .split(re)
    .map((part, i) => (i % 2 ? `<mark>${esc(part)}</mark>` : esc(part)))
    .join("");
};

const renderChannelsGrid = (filter = "") => {
  if (!ui.channelsGrid) return;
  const terms = searchTerms(filter);
  const filtered = state.channels.filter((ch) => matchesFilter(ch, terms));
  if (ui.channelCount) ui.channelCount.textContent = String(filtered.length);
  if (filtered.length === 0) {
    ui.channelsGrid.innerHTML = `<div class="channels__empty">${
      state.channels.length ? "No channels match your search" : "Loading channels…"
    }</div>`;
    return;
  }
  ui.channelsGrid.innerHTML = filtered
    .map((ch) => {
      const active = ch.id === state.channelId ? " channel-btn--active" : "";
      return `<button type="button" role="listitem" class="channel-btn${active}" data-channel-id="${ch.id}" data-channel-name="${esc(ch.name)}"><span class="channel-btn__name">${highlight(ch.name, terms)}</span><span class="channel-btn__id">#${ch.id}</span></button>`;
    })
    .join("");
};

const loadChannels = async () => {
  try {
    const res = await fetch("/api/channels");
    if (!res.ok) throw new Error("channels failed");
    state.channels = (await res.json()) as { id: number; name: string }[];
    const initial = state.channelId;
    const known = state.channels.find((c) => c.id === initial);
    if (known) {
      state.label = known.name;
      if (ui.title && !state.active) ui.title.textContent = known.name;
    }
    renderChannelsGrid(ui.channelsFilterInput?.value ?? "");
    highlightActiveChannelInGrid(initial, true);
  } catch {
    if (ui.channelsGrid) {
      ui.channelsGrid.innerHTML = `<div class="channels__empty">Couldn't load channels. You can still enter an ID above.</div>`;
    }
  }
};

ui.channelsGrid?.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".channel-btn");
  if (!btn?.dataset.channelId) return;
  onChannelSelected(Number(btn.dataset.channelId), btn.dataset.channelName);
});

ui.channelsFilterInput?.addEventListener("input", () => {
  renderChannelsGrid(ui.channelsFilterInput?.value ?? "");
});

// Enter in the search box plays the first match.
ui.channelsFilterInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const terms = searchTerms(ui.channelsFilterInput!.value);
  const first = state.channels.find((ch) => matchesFilter(ch, terms));
  if (first) onChannelSelected(first.id, first.name);
});

// The search box lives in a form; Enter is handled by the keydown listener above.
ui.form?.addEventListener("submit", (event) => {
  event.preventDefault();
});

ui.servers?.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-server]");
  if (!btn?.dataset.server || btn.disabled) return;
  void selectServer(btn.dataset.server as ServerKind);
});

// "/" jumps to channel search (unless already typing somewhere).
document.addEventListener("keydown", (event) => {
  if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target as HTMLElement;
  if (target.closest("input, textarea, select, [contenteditable]")) return;
  event.preventDefault();
  ui.channelsFilterInput?.focus();
  ui.channelsFilterInput?.select();
});

/* ───────── Boot ───────── */

state.channelId = recall() ?? 46;
if (ui.title) ui.title.textContent = `Channel ${state.channelId}`;
setOverlay("empty", "Pick a channel to start watching");
resetBadges();
renderChannelsGrid();
void loadChannels();
