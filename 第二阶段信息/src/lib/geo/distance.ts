/**
 * 地理距離工具（成員 A 維護）。
 *
 * 只用於「判斷某個座標離哪個口岸最近」這類粗粒度判定，
 * 不用於顯示距離或計算步行時間。
 */
const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** 兩點間的大圓距離（公里）。 */
export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = toRadians(bLat - aLat);
  const dLon = toRadians(bLon - aLon);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 顯示用的粗略距離描述；超過 2 公里不顯示小數，避免假精確。 */
export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} 公尺`;
  return `${km.toFixed(km < 10 ? 1 : 0)} 公里`;
}
