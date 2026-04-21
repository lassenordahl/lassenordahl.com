import GtfsRealtimeBindings from "gtfs-realtime-bindings";

const { transit_realtime } = GtfsRealtimeBindings;

// 240 Meeker Ave is closest to the Lorimer St (L) / Metropolitan Av (G) complex.
// Stop IDs include direction suffix: N = northbound, S = southbound.
//   Lorimer St (L): L08 — N = 8 Av / Manhattan-bound, S = Canarsie-bound
//   Metropolitan Av (G): G29 — N = Court Sq / Queens-bound, S = Church Av-bound
const L_FEED = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l";
const G_FEED = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g";
const L_STOPS = new Set(["L08N", "L08S"]);
const G_STOPS = new Set(["G29N", "G29S"]);

async function fetchArrivalsMinutes(feedUrl: string, stopIds: Set<string>, nowMs: number): Promise<number[]> {
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

function formatLine(label: string, mins: number[]): string {
  if (mins.length === 0) return `${label} --`;
  return `${label} ${mins.slice(0, 2).map((m) => `${m}M`).join(" ")}`;
}

export async function getTrainsText(): Promise<string> {
  const now = Date.now();
  const [l, g] = await Promise.all([
    fetchArrivalsMinutes(L_FEED, L_STOPS, now).catch((e) => {
      console.log("L feed err:", e);
      return [] as number[];
    }),
    fetchArrivalsMinutes(G_FEED, G_STOPS, now).catch((e) => {
      console.log("G feed err:", e);
      return [] as number[];
    }),
  ]);
  return `${formatLine("L", l)}  ${formatLine("G", g)}`;
}
