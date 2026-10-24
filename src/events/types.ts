export type EventChannelKind = "channel" | "extra" | "streamed" | "livelive" | "link";

export type EventChannel = {
  name: string;
  kind: EventChannelKind;
  channel?: number;
  path: string;
};

export type ScheduleEvent = {
  time: string;
  title: string;
  channels: EventChannel[];
};

export type EventCategory = {
  name: string;
  events: ScheduleEvent[];
};

export type EventDay = {
  title: string;
  date?: string;
  categories: EventCategory[];
};

export type EventSection = {
  title: string;
  days: EventDay[];
};

export type EventsFeed = {
  fetchedAt: string;
  sections: EventSection[];
};
