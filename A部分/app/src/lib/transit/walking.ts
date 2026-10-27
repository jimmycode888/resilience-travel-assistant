import { distanceKm } from '../geo/distance';
import { TransitError, type TransitLeg, type TransitPoint } from './types';
import type { LonLat } from '../types/journey';
let publicSlot = Promise.resolve();
let publicNextAt = 0;
async function throttlePublicRouter() {
  const turn = publicSlot.then(async () => {
    const delay = Math.max(0, publicNextAt - Date.now());
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    publicNextAt = Date.now() + 1100;
  });
  publicSlot = turn.catch(() => {});
  await turn;
}
const cache = new Map<string, { at: number; leg: TransitLeg }>();
export async function walkRoute(from: TransitPoint, to: TransitPoint, fetchImpl: typeof fetch = fetch): Promise<TransitLeg> {
  const direct = distanceKm(from.lat, from.lon, to.lat, to.lon);
  if (from.side !== to.side) throw new TransitError('WALK_UNVERIFIED', '步行接駁不得跨越邊界。');
  if (direct < 0.015) return { mode: 'walk', line: null, from, to, minutes: 0, geometry: [[from.lon, from.lat], [to.lon, to.lat]] };
  const key = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  const saved = cache.get(key);
  if (saved && Date.now() - saved.at < 86400000) return { ...saved.leg, from, to };
  const base = process.env.FOOT_ROUTER_URL || 'https://routing.openstreetmap.de/routed-foot';
  try {
    if (base.replace(/\/+$/, '') === 'https://routing.openstreetmap.de/routed-foot' && fetchImpl === fetch) await throttlePublicRouter();
    const response = await fetchImpl(`${base}/route/v1/driving/${key}?overview=full&geometries=geojson&steps=false&radiuses=75;75`, { signal: AbortSignal.timeout(4500), headers: { Accept: 'application/json', 'User-Agent': 'ResilienceTravelAssistant/0.1 (HK-SZ transit prototype)' } });
    if (!response.ok) throw new Error('HTTP error');
    const body = await response.json();
    const route = body.routes?.[0];
    const geometry = route?.geometry?.coordinates;
    if (body.code !== 'Ok' || !Number.isFinite(route?.duration) || !Number.isFinite(route?.distance) || route.distance > 1800 || !Array.isArray(geometry) || geometry.length < 2 || !geometry.every((p: unknown) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) || body.waypoints?.some((p: { distance?: number }) => !Number.isFinite(p.distance) || p.distance! > 75)) throw new Error('No walkable connection');
    const leg: TransitLeg = { mode: 'walk', line: null, from, to, minutes: Math.max(1, Math.ceil(route.duration / 60)), geometry: geometry as LonLat[] };
    if (cache.size >= 512) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), leg });
    return leg;
  } catch { throw new TransitError('WALK_UNVERIFIED', '步行接駁未能通過路網核驗，沒有把直線距離當成可行路徑。'); }
}
