import type {
  EventCategory,
  EventChannel,
  EventChannelKind,
  EventDay,
  ScheduleEvent,
} from "./types.js";

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

function monthIndex(name: string): number {
  return MONTHS.indexOf(name.toLowerCase().slice(0, 3));
}

function isoDay(year: number, month: number, day: number): string | undefined {
  if (year < 2000 || month < 0 || month > 11 || day < 1 || day > 31) return undefined;
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Day titles come in a few shapes: "Saturday 24th Oct 2026 - Schedule Time UK GMT",
// "Tuesday 28th April 2026 - …", "Saturday, October 24, 2026", "Saturday 24th October 2026".
// Pull the schedule date out so times can be converted out of UK GMT exactly.
function parseDayDate(title: string): string | undefined {
  const dayMonthYear = title.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})\.?\s+(\d{4})/i);
  if (dayMonthYear) {
    const month = monthIndex(dayMonthYear[2]);
    if (month >= 0) return isoDay(Number(dayMonthYear[3]), month, Number(dayMonthYear[1]));
  }
  const monthDayYear = title.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i);
  if (monthDayYear) {
    const month = monthIndex(monthDayYear[1]);
    if (month >= 0) return isoDay(Number(monthDayYear[3]), month, Number(monthDayYear[2]));
  }
  return undefined;
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

const stripTags = (html: string): string => html.replace(/<[^>]+>/g, "");

const cleanText = (html: string): string =>
  decodeEntities(stripTags(html)).replace(/\s+/g, " ").trim();

function matchPositions(html: string, re: RegExp): number[] {
  const positions: number[] = [];
  for (const match of html.matchAll(re)) positions.push(match.index ?? 0);
  return positions;
}

function sliceBlocks(html: string, re: RegExp): string[] {
  const starts = matchPositions(html, re);
  return starts.map((start, i) =>
    html.slice(start, i + 1 < starts.length ? starts[i + 1] : undefined),
  );
}

function classifyChannel(path: string, name: string): EventChannel {
  const channelMatch = path.match(/\/watch\.php\?id=(\d+)/i);
  if (channelMatch) {
    return { name, kind: "channel", channel: Number(channelMatch[1]), path };
  }
  let kind: EventChannelKind = "link";
  if (/\/watchextra\.php\?/i.test(path)) kind = "extra";
  else if (/\/watchstreamed\.php\?/i.test(path)) kind = "streamed";
  else if (/\/watchlivelive\.php\?/i.test(path)) kind = "livelive";
  return { name, kind, path };
}

function parseChannels(block: string): EventChannel[] {
  const channels: EventChannel[] = [];
  for (const match of block.matchAll(/<a\b[^>]*\shref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const path = match[1];
    const name = cleanText(match[2]) || cleanText(match[0].match(/\btitle="([^"]*)"/i)?.[1] ?? "");
    if (!name) continue;
    channels.push(classifyChannel(path, name));
  }
  return channels;
}

function parseEvents(slice: string): ScheduleEvent[] {
  const events: ScheduleEvent[] = [];
  for (const block of sliceBlocks(slice, /<div class="schedule__event["\s]/g)) {
    const time = (block.match(/data-time="([^"]*)"/i)?.[1] ?? "").trim();
    const title = cleanText(
      block.match(/class="schedule__eventTitle"[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "",
    );
    if (!time && !title) continue;
    events.push({ time, title, channels: parseChannels(block) });
  }
  return events;
}

function parseCategories(slice: string): EventCategory[] {
  const categories: EventCategory[] = [];
  for (const block of sliceBlocks(slice, /<div class="schedule__category["\s]/g)) {
    const events = parseEvents(block);
    if (events.length === 0) continue;
    const name = cleanText(
      block.match(/class="[^"]*card__meta[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "",
    );
    categories.push({ name: name || "Events", events });
  }
  return categories;
}

export function parseScheduleDays(html: string): EventDay[] {
  const days: EventDay[] = [];
  for (const block of sliceBlocks(html, /<div class="schedule__day["\s]/g)) {
    const categories = parseCategories(block);
    if (categories.length === 0) continue;
    const title = cleanText(
      block.match(/class="schedule__dayTitle"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "",
    );
    days.push({ title, date: parseDayDate(title), categories });
  }
  return days;
}

export type HomeSection = {
  title: string;
  endpoint: string | null;
  days: EventDay[];
};

export function parseHomeSections(html: string): HomeSection[] {
  const sections: HomeSection[] = [];
  for (const block of sliceBlocks(html, /<section\b[^>]*>/g)) {
    const rawTitle = block.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1];
    if (!rawTitle) continue;
    const title = cleanText(rawTitle);
    if (!title) continue;
    sections.push({
      title,
      endpoint: block.match(/data-endpoint="([^"]*)"/i)?.[1] ?? null,
      days: parseScheduleDays(block),
    });
  }
  return sections;
}

export function parseSchedulePayload(text: string): EventDay[] | null {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const html = (payload as { html?: unknown }).html;
  if (typeof html !== "string" || !html.includes("schedule__day")) return null;
  return parseScheduleDays(html);
}
