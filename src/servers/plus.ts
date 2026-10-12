import type { ServerProfile } from "./types.js";

export const plusServer: ServerProfile = {
  id: "plus",
  label: "PLAYER 4",
  transport: {
    refererMode: "optional",
    vlcDirectPlayable: false,
    mpvDirectPlayable: true,
  },
};
