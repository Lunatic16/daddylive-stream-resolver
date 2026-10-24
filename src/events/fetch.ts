import { DLHD_BASE } from "../config.js";
import { fetchHtml } from "../http.js";
import { parseHomeSections, parseSchedulePayload } from "./parse.js";
import type { EventDay, EventsFeed, EventSection } from "./types.js";

const BASE = DLHD_BASE.replace(/\/+$/, "");
const FEED_TTL_MS = 2 * 60 * 1000;

let feedCache: { at: number; feed: EventsFeed } | null = null;

async function fetchRemoteDays(endpoint: string): Promise<EventDay[]> {
  const payload = await fetchHtml(`${BASE}${endpoint}`, `${BASE}/`);
  return parseSchedulePayload(payload) ?? [];
}

export async function fetchEventsFeed(): Promise<EventsFeed> {
  if (feedCache && Date.now() - feedCache.at < FEED_TTL_MS) {
    return feedCache.feed;
  }
  const home = await fetchHtml(`${BASE}/`, `${BASE}/`);
  const homeSections = parseHomeSections(home);
  const remoteDays = await Promise.all(
    homeSections.map((section) =>
      section.endpoint ? fetchRemoteDays(section.endpoint).catch(() => [] as EventDay[]) : null,
    ),
  );
  const sections: EventSection[] = [];
  homeSections.forEach((section, i) => {
    const days = remoteDays[i] ?? section.days;
    if (days.length > 0) sections.push({ title: section.title, days });
  });
  const feed: EventsFeed = { fetchedAt: new Date().toISOString(), sections };
  feedCache = { at: Date.now(), feed };
  return feed;
}
