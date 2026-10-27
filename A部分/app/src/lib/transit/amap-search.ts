import { fromAmap } from './amap';
import type { AddressPlace } from '../geo/address-search';
export async function searchShenzhen(query: string): Promise<AddressPlace[]> {
  const key = process.env.AMAP_WEB_SERVICE_KEY?.trim();
  if (!key) return [];
  const url = new URL('https://restapi.amap.com/v3/place/text');
  url.search = new URLSearchParams({ key, keywords: query, city: '深圳', citylimit: 'true', offset: '5', page: '1', extensions: 'base' }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(4500), cache: 'no-store' });
  if (!response.ok) throw new Error('Shenzhen search unavailable');
  const body = await response.json() as { status?: string; pois?: { id?: string; name?: string; location?: string; cityname?: string; adname?: string; address?: unknown }[] };
  if (body.status !== '1' || !Array.isArray(body.pois)) throw new Error('Shenzhen search unavailable');
  return body.pois.flatMap(p => {
    try {
      if (!p.id || !p.name || !p.cityname?.includes('深圳')) return [];
      const [lon, lat] = fromAmap(p.location);
      return [{ id: `amap-${p.id}`, name: p.name.slice(0, 120), lat, lon, side: 'sz', kind: 'address', coordinatesVerified: false, source: 'amap', address: [p.cityname, p.adname, typeof p.address === 'string' ? p.address : ''].filter(Boolean).join(' · ').slice(0, 500) } satisfies AddressPlace];
    } catch { return []; }
  });
}
