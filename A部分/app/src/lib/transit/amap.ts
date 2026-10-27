import { wgs2gcj } from 'eviltransform';
import { walkRoute } from './walking';
import { distanceKm } from '../geo/distance';
import type { LonLat } from '../types/journey';
import { TransitError, type TransitPoint, type TransitLeg, type TransitPlan } from './types';

export function amapConfigured() { return Boolean(process.env.AMAP_WEB_SERVICE_KEY?.trim()); }
export function toAmap(point: TransitPoint): string {
  const gcj = wgs2gcj(point.lat, point.lon);
  return `${gcj.lng.toFixed(6)},${gcj.lat.toFixed(6)}`;
}
export function fromAmap(value: unknown): LonLat {
  if (typeof value !== 'string') throw new TransitError('PROVIDER_ERROR', '高德路線缺少有效座標。');
  const numbers = value.split(',').map(Number);
  if (numbers.length !== 2 || !numbers.every(Number.isFinite) || numbers[0]! < 113.7 || numbers[0]! > 114.7 || numbers[1]! < 22.1 || numbers[1]! > 22.95) throw new TransitError('PROVIDER_ERROR', '高德路線座標超出服務範圍。');
  // Invert the forward transform by bounded fixed-point refinement. The npm
  // package's legacy exact inverse diverges; never use it for map geometry.
  let lat = numbers[1]!, lon = numbers[0]!;
  for (let i = 0; i < 8; i++) {
    const projected = wgs2gcj(lat, lon);
    const dLat = projected.lat - numbers[1]!, dLon = projected.lng - numbers[0]!;
    lat -= dLat; lon -= dLon;
    if (Math.max(Math.abs(dLat), Math.abs(dLon)) < 1e-8) break;
  }
  return [lon, lat];
}
function point(name: string, location: unknown): TransitPoint { const [lon, lat] = fromAmap(location); return { name, lon, lat, side: 'sz' }; }
function geometry(raw: unknown): LonLat[] { if (typeof raw !== 'string' || !raw) return []; return raw.split(';').map(fromAmap); }
function duration(raw: unknown): number {
  if ((typeof raw !== 'string' && typeof raw !== 'number') || raw === '' || !Number.isFinite(Number(raw)) || Number(raw) < 0) throw new TransitError('PROVIDER_ERROR', '高德路線缺少有效耗時。');
  return Math.ceil(Number(raw) / 60);
}
interface AmapStop { name?: string; location?: string }
interface AmapSegment {
  walking?: { duration?: string; origin?: string; destination?: string; steps?: { polyline?: string }[] };
  bus?: { buslines?: { name?: string; type?: string; duration?: string; polyline?: string; departure_stop?: AmapStop; arrival_stop?: AmapStop }[] };
  railway?: { id?: string };
  taxi?: { origin?: string };
}
export function parseAmapPlans(raw: unknown, from: TransitPoint, to: TransitPoint, onRejected?: (reason: string) => void, verifyAccessGaps = false): TransitPlan[] {
  const body = raw as { status?: string; infocode?: string; route?: { transits?: { duration?: string; segments?: AmapSegment[] }[] } } | null;
  if (body?.status !== '1') throw new TransitError('PROVIDER_ERROR', `深圳公交服務拒絕請求（${String(body?.infocode ?? 'unknown').replace(/[^0-9]/g, '').slice(0, 10) || 'unknown'}），請檢查 Key 權限及配額。`);
  if (!Array.isArray(body.route?.transits)) return [];
  const plans: TransitPlan[] = [];
  for (const transit of body.route.transits.slice(0, 5)) {
    try {
      if (!Array.isArray(transit.segments)) continue;
      const legs: TransitLeg[] = [];
      for (const segment of transit.segments) {
        if (segment.railway?.id || segment.taxi?.origin) throw new Error('Unsupported rail/taxi segment');
        const w = segment.walking;
        if (w?.duration && Number(w.duration) > 0) {
          const geo = (Array.isArray(w.steps) ? w.steps : []).flatMap(step => geometry(step.polyline));
          if (geo.length < 2) throw new Error('Missing walk geometry');
          legs.push({ mode: 'walk', line: null, from: point('步行起點', w.origin), to: point('步行終點', w.destination), minutes: duration(w.duration), geometry: geo });
        }
        const bus = segment.bus?.buslines?.[0];
        if (bus) {
          const geo = geometry(bus.polyline);
          if (!bus.name || !bus.departure_stop?.name || !bus.arrival_stop?.name || geo.length < 2) throw new Error('Incomplete bus route');
          legs.push({ mode: /地铁|地鐵/.test(bus.type ?? '') ? 'mtr' : 'bus', line: bus.name, from: point(bus.departure_stop.name, bus.departure_stop.location), to: point(bus.arrival_stop.name, bus.arrival_stop.location), minutes: duration(bus.duration), geometry: geo });
        }
      }
      if (!legs.length || !legs.some(l => l.mode !== 'walk')) continue;
      // Preserve gaps as explicit unverified connectors. The async adapter must
      // route them on a foot network before returning any complete itinerary.
      const stitched: TransitLeg[] = [];
      let cursor = from;
      const connect = (target: TransitPoint) => {
        const km = distanceKm(cursor.lat, cursor.lon, target.lat, target.lon);
        if (km > 0.15) {
          if (!verifyAccessGaps || km > 1.8) throw new Error('Incomplete access or transfer connection');
          stitched.push({ mode: 'walk', line: '入口／轉乘步行接駁', from: cursor, to: target, minutes: 0, geometry: [], approximate: true });
        }
      };
      for (const leg of legs) { connect(leg.from); stitched.push(leg); cursor = leg.to; }
      connect(to);
      legs.splice(0, legs.length, ...stitched);
      legs[0] = { ...legs[0]!, from };
      legs[legs.length - 1] = { ...legs[legs.length - 1]!, to };
      const published = duration(transit.duration);
      const sum = legs.reduce((total, leg) => total + leg.minutes, 0);
      const reserve = Math.max(0, published - sum);
      const firstRide = legs.find(l => l.mode !== 'walk')!;
      firstRide.minutes += reserve; firstRide.waitMinutes = reserve;
      plans.push({ legs, minutes: Math.max(published, sum), notices: ['深圳公交／地鐵方案來自高德官方接口；耗時是平台估算，非車輛即時到站。', '高德 GCJ-02 座標已轉換為 WGS84；站點入口仍以現場指示為準。'] });
    } catch (error) { onRejected?.(error instanceof Error ? error.message : 'Invalid transit option'); }
  }
  return plans;
}
export async function routeShenzhen(from: TransitPoint, to: TransitPoint, departAt: string, fetchImpl: typeof fetch = fetch, verifyWalk: typeof walkRoute = walkRoute): Promise<TransitPlan[]> {
  const key = process.env.AMAP_WEB_SERVICE_KEY?.trim();
  if (!key) throw new TransitError('MISSING_KEY', '深圳公交尚未啟用：需要配置高德 Web 服務 Key。');
  if (from.side !== 'sz' || to.side !== 'sz') throw new TransitError('NO_ROUTE', '深圳接口只處理深圳境內路段。');
  const local = new Date(Date.parse(departAt) + 8 * 3600000).toISOString();
  const url = new URL('https://restapi.amap.com/v3/direction/transit/integrated');
  url.search = new URLSearchParams({ key, origin: toAmap(from), destination: toAmap(to), city: '0755', cityd: '0755', strategy: '0', nightflag: '1', extensions: 'all', date: local.slice(0, 10), time: local.slice(11, 16) }).toString();
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(6500), cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new TransitError('PROVIDER_ERROR', '深圳公交服務暫時不可用。');
    const plans = parseAmapPlans(await response.json(), from, to, undefined, true);
    const verified: TransitPlan[] = [];
    const connectors = new Map<string, TransitLeg | null>();
    for (const plan of plans) {
      const legs: TransitLeg[] = [];
      let complete = true;
      for (const leg of plan.legs) {
        if (leg.mode !== 'walk' || !leg.approximate) { legs.push(leg); continue; }
        const id = `${leg.from.lon},${leg.from.lat};${leg.to.lon},${leg.to.lat}`;
        if (!connectors.has(id)) {
          try { connectors.set(id, await verifyWalk(leg.from, leg.to)); }
          catch { connectors.set(id, null); }
        }
        const connection = connectors.get(id);
        if (!connection) { complete = false; break; }
        legs.push({ ...connection, line: leg.line });
      }
      if (complete) verified.push({ ...plan, legs, minutes: legs.reduce((sum, l) => sum + l.minutes, 0), notices: [...plan.notices, ...(connectors.size ? ['平台步行起終點與所選地址之間的接駁已另外核驗並計入時間。'] : [])] });
    }
    if (!verified.length) throw new TransitError('NO_ROUTE', '高德未返回完整的深圳公交方案，請調整出發時間或附近入口。');
    return verified;
  } catch (error) { if (error instanceof TransitError) throw error; throw new TransitError('PROVIDER_ERROR', '深圳公交查詢逾時或網絡不可用。'); }
}
