import type { ServerProfile } from "./types.js";

export const watchServer: ServerProfile = {
  id: "watch",
  label: "PLAYER 3",
  transport: {
    refererMode: "optional",
    vlcDirectPlayable: false,
    mpvDirectPlayable: false,
  },
};
