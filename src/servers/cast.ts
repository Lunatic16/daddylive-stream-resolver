import type { ServerProfile } from "./types.js";

export const castServer: ServerProfile = {
  id: "cast",
  label: "PLAYER 2",
  transport: {
    refererMode: "required",
    vlcDirectPlayable: true,
    mpvDirectPlayable: true,
    toolsUserAgent: true,
  },
};
