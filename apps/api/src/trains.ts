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

export type TrainFeed = { line: string; stopIds: string[] };
export type TrainsConfig = { address: string; feeds: TrainFeed[] };

export type TrainSegment =
  | { kind: "bullet"; line: string; color: [number, number, number] }
  | { kind: "text"; value: string };

export type TrainsResult = { text: string; segments: TrainSegment[] };

export const DEFAULT_TRAINS_CONFIG: TrainsConfig = {
  address: "240 Meeker Ave, Brooklyn",
  feeds: [
    { line: "L", stopIds: ["L08N", "L08S"] },
    { line: "G", stopIds: ["G29N", "G29S"] },
  ],
};

async function fetchArrivalsMinutes(
  feedUrl: string,
  stopIds: Set<string>,
  nowMs: number,
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
      if (m >= 0 && m < 60) minutes.push(m);
    }
  }
  return minutes.sort((a, b) => a - b);
}

function formatMinutes(mins: number[]): string {
  if (mins.length === 0) return "--";
  return mins.slice(0, 2).map((m) => `${m}M`).join(" ");
}

export async function getTrainsData(
  config: TrainsConfig = DEFAULT_TRAINS_CONFIG,
): Promise<TrainsResult> {
  const now = Date.now();
  const results = await Promise.all(
    config.feeds.map(async (f) => {
      const line = f.line.toUpperCase();
      const slug = FEED_BY_LINE[line];
      if (!slug) return { line, mins: [] as number[] };
      const url = FEED_BASE + slug;
      const mins = await fetchArrivalsMinutes(url, new Set(f.stopIds), now).catch((e) => {
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
    const minsText = formatMinutes(mins);
    // Leading gap between feeds is handled by the text segment padding.
    segments.push({ kind: "bullet", line, color });
    segments.push({ kind: "text", value: ` ${minsText}${i < results.length - 1 ? "  " : " "}` });
    textParts.push(`${line} ${minsText}`);
  });

  return { text: textParts.join("  "), segments };
}
