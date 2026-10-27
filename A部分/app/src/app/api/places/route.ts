import { NextResponse } from 'next/server';
import { searchPlaces } from '@/lib/geo/places';
import { readAddressFeatures, type AddressPlace } from '@/lib/geo/address-search';
import { readAlsAddresses } from '@/lib/geo/als';
import { searchShenzhen } from '@/lib/transit/amap-search';

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2 || q.length > 120) return NextResponse.json({ places: [], message: '請輸入 2–120 個字搜尋香港或深圳地點。' }, { status: 400 });
  const local = searchPlaces(q, { limit: 5 });
  const photon = new URL('/api/', process.env.PHOTON_BASE_URL || 'https://photon.komoot.io');
  photon.search = new URLSearchParams({ q, limit: '12', bbox: '113.75,22.1,114.65,22.9' }).toString();
  const als = new URL('https://www.als.gov.hk/lookup'); als.search = new URLSearchParams({ q, n: '5' }).toString();
  const fetchPlaces = async (url: URL, read: (raw: unknown) => AddressPlace[]) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(4500), headers: { Accept: 'application/json' }, next: { revalidate: 300 } });
    if (!response.ok) throw new Error('Search unavailable');
    return read(await response.json());
  };
  const results = await Promise.allSettled([fetchPlaces(photon, readAddressFeatures), /深圳|shenzhen/i.test(q) ? Promise.resolve([]) : fetchPlaces(als, readAlsAddresses), searchShenzhen(q)]);
  const remote = [results[1], results[2], results[0]].flatMap(r => r?.status === 'fulfilled' ? r.value : []);
  const places = [...new Map([...local, ...remote].map(p => [p.id, p])).values()].slice(0, 16);
  const failed = results.some(r => r.status === 'rejected');
  return NextResponse.json({ places, message: failed ? '部分地址搜尋服務暫時不可用，仍可選取以下結果或稍後重試。' : remote.length ? '' : '未找到更多地址，請補充城市、街道或嘗試英文名稱。' });
}
