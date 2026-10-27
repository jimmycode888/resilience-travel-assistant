import type { PlaceEntry } from './places';

export interface AddressPlace extends PlaceEntry { address?: string; source?: 'photon' | 'location' | 'als' | 'amap' }
export function readAddressFeatures(raw: unknown): AddressPlace[] {
  const features = (raw as { features?: unknown[] } | null)?.features;
  if (!Array.isArray(features)) return [];
  const results: AddressPlace[] = [];
  for (const feature of features) {
    const f = feature as { geometry?: { coordinates?: unknown[] }; properties?: Record<string, unknown> } | null;
    const p = f?.properties;
    const coordinates = f?.geometry?.coordinates;
    if (!Array.isArray(coordinates)) continue;
    const [lon, lat] = coordinates;
    if (!p || typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < 22.1 || lat > 22.9 || lon < 113.75 || lon > 114.65) continue;
    const hk = String(p.countrycode).toUpperCase() === 'HK' || /香港|Hong Kong/i.test(String(p.state));
    const sz = /深圳|Shenzhen/i.test(String(p.city));
    if (!hk && !sz) continue;
    const name = String(p.name ?? p.street ?? '').trim();
    if (!name || !p.osm_id || !p.osm_type) continue;
    const address = [...new Set([p.country, p.city, p.district, p.locality, p.street, p.housenumber].filter(v => typeof v === 'string' && v))].join(' · ');
    const id = `photon-${p.osm_type}-${p.osm_id}`;
    if (results.some(item => item.id === id)) continue;
    results.push({ id, name: name.slice(0, 120), address: address.slice(0, 500), lat, lon, side: hk ? 'hk' : 'sz', kind: 'address', coordinatesVerified: false, source: 'photon' });
  }
  return results;
}
