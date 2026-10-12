export type RefererMode = "required" | "omit" | "optional";

export type ServerTransport = {
  refererMode: RefererMode;
  refererOrigin?: string;
  vlcDirectPlayable: boolean;
  mpvDirectPlayable: boolean;
  toolsUserAgent?: boolean;
};

export type ServerProfile = {
  id: string;
  label: string;
  transport: ServerTransport;
};
