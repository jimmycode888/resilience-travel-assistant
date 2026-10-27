import { findPlace } from '@/lib/geo/places';
import { readAlsAddresses } from '@/lib/geo/als';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { readAddressFeatures } from '@/lib/geo/address-search';
import { handleJourneyRequest } from '@/lib/api/journey-handler';
import { GET } from '@/app/api/places/route';
const feature = { properties: { osm_type: 'W', osm_id: 123, name: '測試酒店', countrycode: 'HK', street: '皇后大道' }, geometry: { coordinates: [114.16, 22.28] } };
const place = readAddressFeatures({ features: [feature] })[0]!;
const request = { origin: place.id, originPlace: place, destination: 'futian-station-sz', departAt: '2026-10-16T08:00', scenario: 'normal', mode: 'balanced' };
afterEach(() => vi.unstubAllGlobals());
describe('真實地址搜尋與行程', () => {
  it('保留真實座標，過濾區域外、錯誤座標和重複結果', () => {
    const results = readAddressFeatures({ features: [feature, feature, { ...feature, geometry: { coordinates: [116.4, 39.9] } }, { ...feature, geometry: { coordinates: ['114', 22.3] } }] });
    expect(results).toHaveLength(1); expect(results[0]?.lat).toBe(22.28); expect(results[0]?.address).toContain('皇后大道');
  });
  it('接受已確認的任意地址，但不生成虛構演示接駁', async () => {
    const result = await handleJourneyRequest(request);
    expect(result.status).toBe(200);
    if ('routes' in result.body) { expect(result.body.routes).toHaveLength(0); expect(result.body.action).toBe('unavailable'); expect(result.body.request.originPlace?.lat).toBe(22.28); }
  });
  it('拒絕未確認、ID 不匹配、越界及相同座標', async () => {
    for (const input of [{ ...request, originPlace: undefined }, { ...request, originPlace: { ...place, id: 'different' } }, { ...request, originPlace: { ...place, lat: 90 } }, { ...request, destination: 'other', destinationPlace: { ...place, id: 'other' } }]) expect((await handleJourneyRequest(input)).status).toBe(400);
  });
  it('服務失敗時明確提示，並保留內置候選', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const response = await GET(new Request('http://localhost/api/places?q=Central'));
    const body = await response.json(); expect(body.message).toContain('暫時不可用'); expect(body.places.length).toBeGreaterThan(0);
  });
  it('搜尋 API 返回真實地址，短查詢不呼叫外部服務', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [feature] }) }); vi.stubGlobal('fetch', fetchMock);
    expect((await GET(new Request('http://localhost/api/places?q=a'))).status).toBe(400); expect(fetchMock).not.toHaveBeenCalled();
    const response = await GET(new Request('http://localhost/api/places?q=hotel')); expect((await response.json()).places[0]?.id).toBe(place.id);
  });
});

describe('香港政府地址來源', () => {
  it('讀取香港政府實際地址形狀並保留地址和座標', () => {
    const results = readAlsAddresses({ SuggestedAddress: [{ ValidationInformation: { Score: 90 }, Address: { PremisesAddress: { GeoAddress: 'HKU-1', ChiPremisesAddress: { BuildingName: '大學堂', ChiEstate: { EstateName: '香港大學' }, ChiStreet: { StreetName: '大學徑', BuildingNoFrom: '1' } }, GeospatialInformation: { Latitude: '22.28131', Longitude: '114.14016' } } } }] });
    expect(results[0]?.source).toBe('als'); expect(results[0]?.lat).toBe(22.28131); expect(results[0]?.address).toContain('香港大學');
  });
  it('不把無座標或低匹配分數結果當成有效地址', () => {
    expect(readAlsAddresses({ SuggestedAddress: [{ ValidationInformation: { Score: 10 }, Address: { PremisesAddress: { GeoAddress: 'bad' } } }] })).toEqual([]);
  });
});

it('搜尋選取含別名的內置站點可以提交，不因嚴格欄位校驗被拒絕', async () => {
 const destinationPlace = findPlace('sheung-shui-station')!;
 const result = await handleJourneyRequest({ origin: 'central-exchange-square', destination: destinationPlace.id, destinationPlace, departAt: '2026-10-16T08:00', mode: 'balanced', scenario: 'normal' });
 expect(result.status).toBe(200);
});
