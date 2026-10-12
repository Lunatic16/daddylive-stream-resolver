import { castServer } from "./cast.js";
import { castingServer } from "./casting.js";
import { playerServer } from "./player.js";
import { plusServer } from "./plus.js";
import { streamServer } from "./stream.js";
import type { ServerKind } from "./kinds.js";
import type { ServerProfile } from "./types.js";
import { watchServer } from "./watch.js";

export type { ServerProfile, ServerTransport, RefererMode } from "./types.js";
export { PLAYERS, PLAYER_IDS, playerLabel, type ServerKind } from "./kinds.js";

const SERVER_PROFILES: Record<ServerKind, ServerProfile> = {
  stream: streamServer,
  cast: castServer,
  watch: watchServer,
  plus: plusServer,
  casting: castingServer,
  player: playerServer,
};

export function serverProfile(server: ServerKind): ServerProfile {
  return SERVER_PROFILES[server];
}
