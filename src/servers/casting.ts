import type { ServerProfile } from "./types.js";

export const castingServer: ServerProfile = {
  id: "casting",
  label: "PLAYER 5",
  transport: {
    refererMode: "omit",
    vlcDirectPlayable: true,
    mpvDirectPlayable: true,
  },
};
