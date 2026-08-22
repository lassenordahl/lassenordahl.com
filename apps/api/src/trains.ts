import GtfsRealtimeBindings from "gtfs-realtime-bindings";

const { transit_realtime } = GtfsRealtimeBindings;

// MTA GTFS-RT feeds are grouped by line-family. Add more lines as needed.
const FEED_BY_LINE: Record<string, string> = {
  A: "nyct%2Fgtfs-ace",
  C: "nyct%2Fgtfs-ace",
  E: "nyct%2Fgtfs-ace",
  B: "nyct%2Fgtfs-bdfm",
  D: "nyct%2Fgtfs-bdfm",
  F: "nyct%2Fgtfs-bdfm",
  M: "nyct%2Fgtfs-bdfm",
  G: "nyct%2Fgtfs-g",
  J: "nyct%2Fgtfs-jz",
  Z: "nyct%2Fgtfs-jz",
  N: "nyct%2Fgtfs-nqrw",
  Q: "nyct%2Fgtfs-nqrw",
  R: "nyct%2Fgtfs-nqrw",
  W: "nyct%2Fgtfs-nqrw",
  L: "nyct%2Fgtfs-l",
  "1": "nyct%2Fgtfs",
  "2": "nyct%2Fgtfs",
  "3": "nyct%2Fgtfs",
  "4": "nyct%2Fgtfs",
  "5": "nyct%2Fgtfs",
  "6": "nyct%2Fgtfs",
  "7": "nyct%2Fgtfs",
  SI: "nyct%2Fgtfs-si",
};

// Official MTA line colors → approximate 8-bit RGB. Values from
// https://new.mta.info/document/2331 (design standards manual).
const MTA_COLORS: Record<string, [number, number, number]> = {
  A: [0, 57, 166], C: [0, 57, 166], E: [0, 57, 166],
  B: [255, 99, 25], D: [255, 99, 25], F: [255, 99, 25], M: [255, 99, 25],
  G: [108, 190, 69],
  J: [153, 102, 51], Z: [153, 102, 51],
  L: [167, 169, 172],
  N: [252, 204, 10], Q: [252, 204, 10], R: [252, 204, 10], W: [252, 204, 10],
  "1": [238, 53, 46], "2": [238, 53, 46], "3": [238, 53, 46],
  "4": [0, 147, 60], "5": [0, 147, 60], "6": [0, 147, 60],
  "7": [185, 51, 173],
  SI: [0, 57, 166],
};

const FEED_BASE = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/";

// walkMinutes: how long it takes to walk to this stop. Arrivals sooner than
// this are dropped — you can't catch a train that leaves before you get there.
export type TrainFeed = { line: string; stopIds: string[]; walkMinutes?: number };
export type TrainsConfig = {
  address: string;
  feeds: TrainFeed[];
  // How many upcoming arrivals to show per line. Defaults to 2.
  maxArrivals?: number;
};

export type TrainSegment =
  | { kind: "bullet"; line: string; color: [number, number, number] }
  | { kind: "text"; value: string };

export type TrainsResult = { text: string; segments: TrainSegment[] };

// Per-line health, surfaced at GET /trains/status for debugging dead feeds.
export type TrainFeedStatus = {
  line: string;
  ok: boolean;
  arrivals: number;
  error?: string;
};

export const DEFAULT_MAX_ARRIVALS = 2;

export const DEFAULT_TRAINS_CONFIG: TrainsConfig = {
  address: "240 Meeker Ave, Brooklyn",
  maxArrivals: DEFAULT_MAX_ARRIVALS,
  feeds: [
    { line: "L", stopIds: ["L08N", "L08S"], walkMinutes: 6 },
    { line: "G", stopIds: ["G29N", "G29S"], walkMinutes: 4 },
  ],
};

async function fetchArrivalsMinutes(
  feedUrl: string,
  stopIds: Set<string>,
  nowMs: number,
  walkMinutes: number = 0,
): Promise<number[]> {
  // cf.cacheTtl lets the edge dedup repeat fetches across lines that share
  // a feed family (e.g. B/D/F/M all hit the same gtfs-bdfm URL).
  const res = await fetch(feedUrl, { cf: { cacheTtl: 15 } as any });
  if (!res.ok) throw new Error(`feed ${feedUrl} -> ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const feed = transit_realtime.FeedMessage.decode(buf);
  const minutes: number[] = [];
  for (const entity of feed.entity) {
    const tu = entity.tripUpdate;
    if (!tu || !tu.stopTimeUpdate) continue;
    for (const stu of tu.stopTimeUpdate) {
      if (!stu.stopId || !stopIds.has(stu.stopId)) continue;
      const tRaw = stu.arrival?.time ?? stu.departure?.time;
      if (tRaw == null) continue;
      const tSec = typeof tRaw === "number" ? tRaw : Number(tRaw);
      if (!Number.isFinite(tSec) || tSec <= 0) continue;
      const m = Math.round((tSec * 1000 - nowMs) / 60000);
      // Drop arrivals we can't physically make given the walk to the stop.
      if (m >= walkMinutes && m < 60) minutes.push(m);
    }
  }
  return minutes.sort((a, b) => a - b);
}

function formatMinutes(mins: number[], count: number): string {
  if (mins.length === 0) return "--";
  return mins.slice(0, count).map((m) => `${m}M`).join(" ");
}

export async function getTrainsData(
  config: TrainsConfig = DEFAULT_TRAINS_CONFIG,
): Promise<TrainsResult> {
  const now = Date.now();
  const count = normalizeMaxArrivals(config.maxArrivals);
  const results = await Promise.all(
    config.feeds.map(async (f) => {
      const line = f.line.toUpperCase();
      const slug = FEED_BY_LINE[line];
      if (!slug) return { line, mins: [] as number[] };
      const url = FEED_BASE + slug;
      const mins = await fetchArrivalsMinutes(
        url,
        new Set(f.stopIds),
        now,
        f.walkMinutes ?? 0,
      ).catch((e) => {
        console.log(`feed err ${line}:`, e);
        return [] as number[];
      });
      return { line, mins };
    }),
  );

  if (results.length === 0) {
    return { text: "NO FEEDS", segments: [{ kind: "text", value: "NO FEEDS" }] };
  }

  const segments: TrainSegment[] = [];
  const textParts: string[] = [];
  results.forEach(({ line, mins }, i) => {
    const color = MTA_COLORS[line] ?? [255, 255, 255];
    const minsText = formatMinutes(mins, count);
    // Leading gap between feeds is handled by the text segment padding.
    segments.push({ kind: "bullet", line, color });
    segments.push({ kind: "text", value: ` ${minsText}${i < results.length - 1 ? "  " : " "}` });
    textParts.push(`${line} ${minsText}`);
  });

  return { text: textParts.join("  "), segments };
}

// Clamp the configured arrival count into a sane range. The display only has
// room for a couple of numbers per line before the scroll gets unreadable.
export function normalizeMaxArrivals(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MAX_ARRIVALS;
  }
  return Math.min(4, Math.max(1, Math.round(value)));
}

// Probe each feed independently and report whether it returned arrivals. Used
// by GET /trains/status to tell "no trains running" apart from "feed is down".
export async function getTrainsStatus(
  config: TrainsConfig = DEFAULT_TRAINS_CONFIG,
): Promise<TrainFeedStatus[]> {
  const now = Date.now();
  return Promise.all(
    config.feeds.map(async (f) => {
      const line = f.line.toUpperCase();
      const slug = FEED_BY_LINE[line];
      if (!slug) {
        return { line, ok: false, arrivals: 0, error: "unknown line" };
      }
      try {
        const mins = await fetchArrivalsMinutes(
          FEED_BASE + slug,
          new Set(f.stopIds),
          now,
          f.walkMinutes ?? 0,
        );
        return { line, ok: true, arrivals: mins.length };
      } catch (e: any) {
        return { line, ok: false, arrivals: 0, error: String(e?.message ?? e) };
      }
    }),
  );
}
