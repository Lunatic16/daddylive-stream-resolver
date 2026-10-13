import type { Channel } from "./types.js";

/**
 * Sanitizes channel names to ensure safe usage inside M3U attributes.
 */
export function sanitizeTvgName(name: string): string {
  return name.replace(/"/g, "'").trim();
}

/* -------------------------------------------------------------------------- */
/*  Region detection                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Ordered region rules – first match wins. Order matters: explicit country
 * suffixes and brand-specific rules sit above broader brand fallbacks
 * (e.g. "Sky Sports Golf DE" must hit Germany before the generic Sky → UK rule).
 */
const REGION_RULES: [RegExp, string][] = [
  // US Hispanic / Latin America (before the generic USA rule)
  [/Telemundo|Univision|Unimas|NBC Universo|Galavisi|TUDN|Deportes USA|ESPN Deportes|beIN SPORTS en Espa|HBO Latino|Las Estrellas|Azteca|Canal5 MX|Claro Sports|TVC Deportes/i, "Hispanic & Latin America"],

  // USA (explicit tag, regional sports networks and untagged US brands)
  [/\bUSA\b|FanDuel|\bNESN\b|\bMSG\b|\bSNY\b|SportsNet (New York|Pittsburgh)|Spectrum Sports|\bMASN\b|YES Network|Root Sports|Space City|Marquee|Monumental|Altitude|Chicago Sports|NBC Sports (Bay|Boston|California|Philadelphia)|\bNFL\b|CBS Sports|FOX Soccer Plus|Tennis Channel|ESPNews|C SPAN|\bXTRA\b|NBC10|CW Philly|PIX 11|Fox Weather/i, "USA"],

  [/\bUK\b|Ireland/i, "UK & Ireland"],
  [/\bCA\b|Canada|\bTSN\d|Sportsnet|\bRDS\b|\bTVA\b/i, "Canada"],
  [/\bNZ\b|New Zealand|\bAU\b|Australia/i, "Australia & NZ"],
  [/Astro|Malaysia|\bIN$|\bPK$|\bBD$|SONY TEN|Star Sports|\bT Sports\b|\bPTV\b|\bTen Sports\b|StarzPlay/i, "South & Southeast Asia"],
  [/SuperSport|DSTV|Afrique|South Africa|Africa/i, "Africa"],
  [/Arabic|MENA|UAE|Qatar|Saudi|Abu Dhabi|Dubai|Alkass|SSC Sport|OnTime|Sport360|MAX AR/i, "Middle East & N. Africa"],
  [/Mexico|\bMX\b|Argentina|Chile|Colombia|Columbia|Uruguay|TYC|Win Sports/i, "Hispanic & Latin America"],
  [/Bras[i]l|Brazil|Globo|Bandsports/i, "Brazil"],
  [/\bItaly\b|\bItalia\b/i, "Italy"],
  [/\bDE\b|Germany|Deutschland|Bundesliga|Sky Sport Austria|Sky Sport Mix|Sky Sport Top Event|SportDigital|Magenta Sport/i, "Germany & Austria"],
  [/\bNL\b|Netherland/i, "Netherlands"],
  [/\bPoland\b|\bPL\b|Polsat|TVP|TVN|Motowizja/i, "Poland"],
  [/\bCZ\b|\bSK\b|Voyo|Oneplay|Prima Sport/i, "Czech & Slovakia"],
  [/Denmark|Sweden|\bSW\b|Norway|\bTV4\b|\bTV2 Zulu\b|V Sport|C More|V Film/i, "Nordics"],
  [/Serbia|Croatia|\bBiH\b|Bulgaria|Greece|Arena Sport|Sport Klub/i, "Balkans & Greece"],
  [/Romania|\bRO\b|Hungary|Russia|Cyprus|МАТЧ/i, "Romania, Hungary & Russia"],
  [/Turkey|\bTR\b|TRT/i, "Turkey"],
  [/Israe|HOT3|\bONE \d HD/i, "Israel"],
  [/Portugal|\bPT\b|Porto|Sporting TV/i, "Portugal"],
  [/Spain|\bES\b|Movistar|LaLiga|Mundotoro|Teledeporte|GOL PLAY|Vamos/i, "Spain"],
  [/France|\bTF1\b|\bM6\b|\bC8\b|\bW9\b|\bRMC\b|L'Equipe|Canal\+ (Foot|Formula|MotoGP)|BFM|CNews|\bLCI\b|Automoto/i, "France"],

  // UK brand fallbacks (untagged channels)
  [/\bSky\b|\bITV\b|\bBBC\b|\bDave\b|\bE4\b|Film4|Channel [45]\b|Racing Tv|MUTV|Liverpool|\bRTE\b|\bS4C\b|Premier Sports/i, "UK & Ireland"],

  // Genuinely international / unknown
  [/Fashion TV|PDC|Tennis\+/i, "International"],
];

function regionOf(name: string, fallback: string): string {
  for (const [pattern, region] of REGION_RULES) {
    if (pattern.test(name)) return region;
  }
  return fallback;
}

/* -------------------------------------------------------------------------- */
/*  Content-type detection                                                    */
/* -------------------------------------------------------------------------- */

/** Sports channels that group better by sport than by country (global groups). */
const SPORT_SUBTYPES: [RegExp, string][] = [
  [/Cricket|Cric|Willow/i, "Sports - Cricket"],
  [/\bWWE\b|\bFight\b|Combate|Ring Bulgaria|\bUFC\b|\bMMA\b|Boxing|БОЕЦ/i, "Sports - Combat & Wrestling"],
  [/\bF1\b|Formula|MotoGP|\bMotor\b|Motorsport|Racer TV|\bRally\b|Automoto|Motowizja/i, "Sports - Motorsport"],
  [/\bRacing\b/i, "Sports - Horse Racing"],
  [/\bTenn?is\b/i, "Sports - Tennis"],
  [/\bGolf\b/i, "Sports - Golf"],
];

/** Anything that is clearly sport but not covered by a subtype above. */
const SPORT_GENERAL =
  /spor|\bNFL\b|\bNBA\b|\bNHL\b|\bMLB\b|ESPN|beIN|DAZN|Deport|Calcio|Foot|Fussball|Futebol|Soccer|Rugby|Basket|Hockey|NESN|\bMSG\b|\bSNY\b|MASN|YES Network|Space City|Marquee|BIG TEN|SEC Network|ACC Network|Pac-12|Premier Brasil|TNT Brasil|L'Equipe|PDC|Mundotoro|GOL PLAY|TUDN|Movistar|LaLiga|SONY TEN|OnePlay MD|Win Sports|TYC|Match (TV|Football|Premier)|SSC|Alkass|Arena Sport|Canal\+ (Extra|Foot)|Vamos/i;

/** US regional sports networks get their own group. */
const US_RSN =
  /FanDuel|NESN|\bMSG\b|\bSNY\b|SportsNet (New York|Pittsburgh)|MASN|YES Network|Root Sports|Space City|Marquee|Monumental|Altitude|Chicago Sports|Spectrum Sports|NBC Sports (Bay|Boston|California|Philadelphia)/i;

const CLUB_TV =
  /\bBarca TV\b|Real Madrid TV|Benfica TV|Sporting TV|Liverpool TV|LFC TV|\bMUTV\b|Porto Canal/i;

const NEWS =
  /News|\bInfo\b|CNN|MSNBC|CNBC|Fox Business|Weather|Headline|BFM|\bLCI\b|CNews|TVN24|C SPAN|Newsmax|Noticias|Nachrichten/i;

const MUSIC = /\bMTV\b|VH1|\bCMT\b|Nick Music|FUSE TV|AXS TV|\bMusic\b|Musik/i;

const KIDS =
  /Disney|\bNICK\b|Nickelodeon|Nicktoons|TeenNick|Cartoon|Boomerang|Kids|Family Zone|HBO Family|Discovery Family|\bYTV\b/i;

const MOVIES =
  /Sky Cinema|HBO|Showtime|Starz|Cinemax|\bTCM\b|FX Movie|AXN Movies|MGM\+|Sundance|Film4|FilmBox|Yes Movies|Movies|IFC TV|Canal\+ (Family|Premium|Seriale)|V Film|Polsat Film|\bCinema\b|\bFilm\b|\bMovie\b|\bKino\b|Great American Family|Hallmark/i;

const DOCUMENTARY =
  /Discovery|National Geographic|Nat Geo|Animal Planet|Smithsonian|\bHistory\b|\bAHC\b|American Heroes|Science Channel|Destination America|HGTV|Food Network|Cooking|Magnolia|Travel Channel|\bTLC\b|Fashion TV|Outdoor Channel|Oxygen|Investigation|Crime|\bFYI\b|Reelz|Court TV|Law & Crime|Sky Arts|\bArte\b/i;

/** US over-the-air / broadcast networks and free sub-channels. */
const US_BROADCAST =
  /^(ABC|CBS|FOX|NBC|CW)( NY)? USA$|^(CBSNY|FOXNY|NBCNY) USA$|^NBC10 Philadelphia$|^CW (PIX 11 USA|Philly)$|^PBS USA$|^ION USA$|^MY9TV USA$|^METV USA$|^Antenna TV USA$|^COZI TV USA$|^Comet USA$|^Heroes & Icons|^Grit Channel$|^FETV/i;

/** Regions big enough to deserve their own Movies / Entertainment group. */
const MOVIE_REGIONS = new Set(["USA", "UK & Ireland", "Italy", "Poland"]);
const ENTERTAINMENT_REGIONS = new Set([
  "UK & Ireland",
  "Germany & Austria",
  "Canada",
  "Czech & Slovakia",
  "Nordics",
  "Balkans & Greece",
  "France",
  "Italy",
  "Hispanic & Latin America",
  "Israel",
  "Portugal",
  "Spain",
  "Turkey",
]);

/**
 * Assigns an IPTV group-title to a channel name.
 *
 * Content type is decided first (adult, sport, news, movies, kids, ...),
 * then a region is appended where grouping by country is useful
 * (general sports, movies, entertainment).
 */
export function classifyChannel(name: string): string {
  // Special groups
  if (/\b18\+/i.test(name)) return "18+ Adult";
  if (/Big Brother/i.test(name)) return "Live Cams - Big Brother";

  // Sports
  if (CLUB_TV.test(name)) return "Sports - Club TV";
  for (const [pattern, group] of SPORT_SUBTYPES) {
    if (pattern.test(name)) return group;
  }
  if (SPORT_GENERAL.test(name)) {
    if (US_RSN.test(name)) return "Sports - USA Regional";
    return `Sports - ${regionOf(name, "International")}`;
  }

  // Non-sport content types (single global groups)
  if (NEWS.test(name)) return "News & Weather";
  if (MUSIC.test(name)) return "Music";
  if (KIDS.test(name)) return "Kids";

  // Movies by region (small regions are folded into "International")
  if (MOVIES.test(name)) {
    const region = regionOf(name, "USA");
    return MOVIE_REGIONS.has(region) ? `Movies - ${region}` : "Movies - International";
  }

  if (DOCUMENTARY.test(name)) return "Documentary & Lifestyle";

  // General entertainment
  if (US_BROADCAST.test(name)) return "Entertainment - USA Broadcast";
  const region = regionOf(name, "USA");
  if (region === "USA") return "Entertainment - USA Cable";
  return ENTERTAINMENT_REGIONS.has(region) ? `Entertainment - ${region}` : "Entertainment - Other";
}

/** Display order of top-level groups (anything else sorts after these). */
const GROUP_ORDER = [
  "Sports",
  "News & Weather",
  "Entertainment",
  "Movies",
  "Kids",
  "Documentary & Lifestyle",
  "Music",
  "Live Cams",
  "18+ Adult",
];

/** English-speaking regions, in the order they should appear at the top. */
const ENGLISH_REGIONS = ["USA", "UK & Ireland", "Canada", "Australia & NZ"];

/** Regions that sort after the English-speaking and global groups. */
const NON_ENGLISH_REGIONS = new Set([
  "Africa",
  "Balkans & Greece",
  "Brazil",
  "Czech & Slovakia",
  "France",
  "Germany & Austria",
  "Hispanic & Latin America",
  "Israel",
  "Italy",
  "Middle East & N. Africa",
  "Netherlands",
  "Nordics",
  "Poland",
  "Portugal",
  "Romania, Hungary & Russia",
  "South & Southeast Asia",
  "Spain",
  "Turkey",
]);

/**
 * Sort key: [tier, englishRegionIndex, typeIndex]
 *  tier 0 – English-speaking regions (USA, UK, Canada, Australia & NZ)
 *  tier 1 – global groups with no region (News, Kids, Music, sport subtypes ...)
 *  tier 2 – all other regions / languages
 *  tier 3 – Live Cams, then 18+ Adult last
 */
function groupRank(group: string): [number, number, number] {
  const [top, rest = ""] = group.split(" - ");
  const typeIdx = GROUP_ORDER.indexOf(top);
  const type = typeIdx === -1 ? GROUP_ORDER.length : typeIdx;

  if (top === "18+ Adult") return [3, 1, 0];
  if (top === "Live Cams") return [3, 0, 0];

  const eng = ENGLISH_REGIONS.findIndex((r) => rest === r || rest.startsWith(`${r} `));
  if (eng !== -1) return [0, eng, type];

  if (NON_ENGLISH_REGIONS.has(rest)) return [2, 0, type];

  return [1, 0, type];
}

/**
 * Generates an IPTV M3U8 playlist string for a list of channels.
 * Formats standard #EXTINF attributes for media players like VLC, TiviMate, etc.
 *
 * @param channels Array of channels
 * @param origin Host origin (e.g., http://localhost:3000)
 * @param server Optional player server (defaults to 'stream')
 * @returns M3U playlist formatted string
 */
export function generateM3u8Playlist(
  channels: Channel[],
  origin: string,
  server?: string,
): string {
  const lines: string[] = ["#EXTM3U"];
  const serverQuery = server ? `?server=${encodeURIComponent(server)}` : "";
  const base = origin.replace(/\/+$/, "");

  // Classify once, then sort by group order → group name → natural name order
  const entries = channels.map((ch) => ({ ch, group: classifyChannel(ch.name) }));
  entries.sort((a, b) => {
    const ra = groupRank(a.group);
    const rb = groupRank(b.group);
    for (let i = 0; i < 3; i++) {
      if (ra[i] !== rb[i]) return ra[i] - rb[i];
    }
    if (a.group !== b.group) return a.group.localeCompare(b.group);
    return a.ch.name.localeCompare(b.ch.name, undefined, { numeric: true });
  });

  for (const { ch, group } of entries) {
    const safeName = sanitizeTvgName(ch.name);
    const streamUrl = `${base}/api/stream/${ch.id}.m3u8${serverQuery}`;
    lines.push(
      `#EXTINF:-1 tvg-id="${ch.id}" tvg-name="${safeName}" group-title="${group}",${ch.name}`,
      streamUrl,
    );
  }

  return lines.join("\n") + "\n";
}
