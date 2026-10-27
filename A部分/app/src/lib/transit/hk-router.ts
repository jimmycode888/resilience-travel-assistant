import { distanceKm } from '../geo/distance';
import { walkRoute } from './walking';
import { TransitError, type HkNetwork, type HkPattern, type TransitLeg, type TransitPlan, type TransitPoint } from './types';

export function serviceActive(network: HkNetwork, id: string, date: string): boolean {
  const exception = network.exceptions[date]?.[id];
  if (exception !== undefined) return exception === 1;
  const service = network.calendar[id];
  const day = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00+08:00`).getUTCDay();
  // Midnight HK is still the previous UTC day.
  const hkDay = (day + 1) % 7;
  return Boolean(service && date >= service.start && date <= service.end && service.days[hkDay]);
}
function serviceDates(departAt: string) {
  const local = new Date(Date.parse(departAt) + 8 * 3600000);
  const date = local.toISOString().slice(0, 10).replaceAll('-', '');
  const previous = new Date(local.getTime() - 86400000).toISOString().slice(0, 10).replaceAll('-', '');
  return { date, previous, minute: local.getUTCHours() * 60 + local.getUTCMinutes() + local.getUTCSeconds() / 60 };
}
/** Conservative wait for non-exact frequency service; never claim a real departure. */
export function nextBoarding(pattern: HkPattern, index: number, ready: number, active: Set<string>, previous: Set<string>): number | null {
  let best = Infinity;
  for (const [service, start, end, headway] of pattern.runs) {
    for (const shift of [0, -1440]) {
      if (!(shift === 0 ? active : previous).has(service)) continue;
      const offset = pattern.offsets[index]!;
      if (headway === 0) {
        const departure = start + shift + offset;
        if (departure >= ready) best = Math.min(best, departure);
      } else {
        // Full headway is reserved; the feed does not promise exact departure times.
        const terminal = Math.max(start + shift, ready - offset) + headway;
        if (terminal < end + shift) best = Math.min(best, terminal + offset);
      }
    }
  }
  return Number.isFinite(best) ? best : null;
}
interface Label { time: number; legs: TransitLeg[] }
const asPoint = (stop: HkNetwork['stops'][number]): TransitPoint => ({ name: stop.name, lat: stop.lat, lon: stop.lon, side: 'hk' });
const distance = (a: TransitPoint, b: TransitPoint) => distanceKm(a.lat, a.lon, b.lat, b.lon);
const walkKey = (a: TransitPoint, b: TransitPoint) => `${a.lat},${a.lon};${b.lat},${b.lon}`;

/** Up to four boardings. Walking candidates are only search heuristics; chosen paths are verified below. */
export async function routeHk(network: HkNetwork, from: TransitPoint, to: TransitPoint, departAt: string, verifyWalk: typeof walkRoute = walkRoute): Promise<TransitPlan> {
  if (from.side !== 'hk' || to.side !== 'hk') throw new TransitError('NO_ROUTE', '香港公交網絡只處理香港境內路段。');
  const { date, previous, minute } = serviceDates(departAt);
  const active = new Set(Object.keys(network.calendar).filter(id => serviceActive(network, id, date)));
  const prior = new Set(Object.keys(network.calendar).filter(id => serviceActive(network, id, previous)));
  for (const id of Object.keys(network.exceptions[date] ?? {})) if (serviceActive(network, id, date)) active.add(id);
  for (const id of Object.keys(network.exceptions[previous] ?? {})) if (serviceActive(network, id, previous)) prior.add(id);
  const points = network.stops.map(asPoint);
  const nearest = (point: TransitPoint) => points.map((p, i) => ({ i, km: distance(point, p) })).filter(p => p.km <= 0.9).sort((a, b) => a.km - b.km).slice(0, 12);
  const starts = nearest(from), ends = nearest(to);
  if (!starts.length || !ends.length) throw new TransitError('NO_ROUTE', '地址附近 900 米內沒有已收錄公交站點；山區或偏遠地點可能超出步行接駁範圍。');
  const grid = new Map<string, number[]>();
  const cell = (p: TransitPoint): [number, number] => [Math.floor(p.lat / 0.002), Math.floor(p.lon / 0.002)];
  points.forEach((p, i) => { const key = cell(p).join(','); const bucket = grid.get(key) ?? []; bucket.push(i); grid.set(key, bucket); });
  const known = new Map<string, TransitLeg | null>();
  const walk = (a: TransitPoint, b: TransitPoint): TransitLeg | null => {
    const key = walkKey(a, b);
    if (known.has(key)) return known.get(key)!;
    const km = distance(a, b);
    return { mode: 'walk', line: null, from: a, to: b, minutes: km < 0.015 ? 0 : Math.max(1, Math.ceil(km * 1.4 / 0.075)), geometry: [[a.lon, a.lat], [b.lon, b.lat]], approximate: true };
  };
  function search(): Label[] {
    let labels = new Map<number, Label>();
    for (const start of starts) { const leg = walk(from, points[start.i]!); if (leg) labels.set(start.i, { time: minute + leg.minutes, legs: leg.minutes ? [leg] : [] }); }
    const results: Label[] = [];
    for (let round = 0; round < 4; round++) {
      const next = new Map(labels);
      for (const pattern of network.patterns) {
        let onboard: { at: number; time: number; parent: Label; wait: number } | null = null;
        for (let j = 0; j < pattern.stops.length; j++) {
          const stop = pattern.stops[j]!;
          if (onboard && pattern.dropoff[j]) {
            const ride = pattern.offsets[j]! - pattern.offsets[onboard.at]!;
            const time = Math.ceil(onboard.time + ride);
            if (ride > 0 && time < (next.get(stop)?.time ?? Infinity) && time - minute <= 360) {
              const ids = pattern.stops.slice(onboard.at, j + 1);
              const leg: TransitLeg = { mode: pattern.mode, line: pattern.line, from: points[pattern.stops[onboard.at]!]!, to: points[stop]!, minutes: Math.ceil(ride + onboard.wait), waitMinutes: Math.ceil(onboard.wait), geometry: ids.map(i => [points[i]!.lon, points[i]!.lat]), approximate: true };
              next.set(stop, { time, legs: [...onboard.parent.legs, leg] });
            }
          }
          const parent = labels.get(stop);
          if (parent && pattern.pickup[j]) {
            const ready = parent.time + (parent.legs.some(l => l.mode !== 'walk') ? 3 : 1);
            const board = nextBoarding(pattern, j, ready, active, prior);
            if (board !== null && (!onboard || board < onboard.time + pattern.offsets[j]! - pattern.offsets[onboard.at]!)) onboard = { at: j, time: board, parent, wait: board - parent.time };
          }
        }
      }
      for (const end of ends) {
        const label = next.get(end.i); const leg = walk(points[end.i]!, to);
        if (label && leg && label.legs.some(l => l.mode !== 'walk')) results.push({ time: label.time + leg.minutes, legs: leg.minutes ? [...label.legs, leg] : label.legs });
      }
      // One short transfer edge per round; no unbounded chain of straight-line walks.
      const transferred = new Map(next);
      for (const [i, label] of next) {
        if (!label.legs.some(l => l.mode !== 'walk')) continue;
        const [x, y] = cell(points[i]!);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const j of grid.get(`${x + dx},${y + dy}`) ?? []) {
          if (j === i || distance(points[i]!, points[j]!) > 0.18) continue;
          const leg = walk(points[i]!, points[j]!);
          if (leg && label.time + leg.minutes < (transferred.get(j)?.time ?? Infinity)) transferred.set(j, { time: label.time + leg.minutes, legs: [...label.legs, leg] });
        }
      }
      labels = transferred;
    }
    return results.sort((a, b) => a.time - b.time);
  }
  // Validate final walking legs and re-run timetable search using verified durations.
  for (let attempt = 0; attempt < 12; attempt++) {
    const options = search();
    const confirmed = options.find(option => option.legs.every(leg => leg.mode !== 'walk' || Boolean(known.get(walkKey(leg.from, leg.to)))));
    const candidate = confirmed ?? options[0];
    if (!candidate) throw new TransitError('NO_ROUTE', '服務日曆及最多三次換乘範圍內未找到公交方案。');
    const missing = candidate.legs.filter(l => l.mode === 'walk' && !known.has(walkKey(l.from, l.to)));
    if (!missing.length) {
      return { legs: candidate.legs, minutes: candidate.legs.reduce((sum, l) => sum + Math.ceil(l.minutes), 0), notices: ['香港公交使用運輸署 GTFS；中途站時間按官方首末站時間插值，非即時到站。', '公交折線連接站點，並非導航路網；步行接駁已由 OSM 步行路網核驗。', '本網絡不含港鐵重鐵；最多三次換乘，端點附近 900 米內選站，步行路網上限 1.8 公里。'] };
    }
    // Keep demo server load low and reuse validated public street connections.
    for (const leg of missing) {
      try { known.set(walkKey(leg.from, leg.to), await verifyWalk(leg.from, leg.to)); }
      catch { known.set(walkKey(leg.from, leg.to), null); }
    }
  }
  throw new TransitError('WALK_UNVERIFIED', '候選步行接駁未能完成核驗，請更換附近入口或站點。');
}
