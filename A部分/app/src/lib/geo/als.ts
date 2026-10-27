import type { AddressPlace } from './address-search';
interface Premises {
  GeoAddress?: string;
  GeospatialInformation?: { Latitude?: string; Longitude?: string } | { Latitude?: string; Longitude?: string }[];
  ChiPremisesAddress?: { BuildingName?: string; Region?: string; ChiDistrict?: { DcDistrict?: string }; ChiStreet?: { StreetName?: string; BuildingNoFrom?: string }; ChiEstate?: { EstateName?: string } };
  EngPremisesAddress?: { BuildingName?: string };
}
export function readAlsAddresses(raw: unknown): AddressPlace[] {
  const results = (raw as { SuggestedAddress?: { Address?: { PremisesAddress?: Premises }; ValidationInformation?: { Score?: number } }[] } | null)?.SuggestedAddress;
  if (!Array.isArray(results)) return [];
  return results.flatMap(item => {
    const p = item.Address?.PremisesAddress;
    if (!p || (item.ValidationInformation?.Score ?? 0) < 50) return [];
    const geo = Array.isArray(p.GeospatialInformation) ? p.GeospatialInformation[0] : p.GeospatialInformation;
    const lat = Number(geo?.Latitude), lon = Number(geo?.Longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 22.1 || lat > 22.6 || lon < 113.8 || lon > 114.5 || !p.GeoAddress) return [];
    const chi = p.ChiPremisesAddress;
    const name = chi?.BuildingName || chi?.ChiEstate?.EstateName || p.EngPremisesAddress?.BuildingName;
    if (!name) return [];
    const address = [chi?.Region, chi?.ChiDistrict?.DcDistrict, chi?.ChiStreet?.StreetName, chi?.ChiStreet?.BuildingNoFrom, chi?.ChiEstate?.EstateName, chi?.BuildingName].filter(Boolean).join(' · ');
    return [{ id: `als-${p.GeoAddress}`, name: name.slice(0, 120), lat, lon, address: address.slice(0, 500), kind: 'address', side: 'hk', coordinatesVerified: false, source: 'als' } satisfies AddressPlace];
  });
}
