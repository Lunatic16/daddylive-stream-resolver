import type { ServerProfile } from "./types.js";

export const playerServer: ServerProfile = {
  id: "player",
  label: "PLAYER 6",
  transport: {
    refererMode: "omit",
    vlcDirectPlayable: true,
    mpvDirectPlayable: true,
  },
};
