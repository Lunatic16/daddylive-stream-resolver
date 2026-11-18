import type { ServerProfile } from "./types.js";

export const castingServer: ServerProfile = {
  id: "casting",
  label: "PLAYER 5",
  transport: {
    refererMode: "required",
    vlcDirectPlayable: false,
    mpvDirectPlayable: false,
  },
};
