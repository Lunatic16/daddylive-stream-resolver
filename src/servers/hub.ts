import type { ServerProfile } from "./types.js";

export const hubServer: ServerProfile = {
  id: "hub",
  label: "PLAYER 7",
  transport: {
    refererMode: "required",
    vlcDirectPlayable: true,
    mpvDirectPlayable: true,
    toolsUserAgent: true,
  },
};
