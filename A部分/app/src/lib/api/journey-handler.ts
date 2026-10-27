import { z } from 'zod';
import { findPlace } from '@/lib/geo/places';
import { parseArriveBy } from '@/lib/time';
import { analyzeJourney } from '@/lib/journey/analysis';
import type { JourneyAnalysis, JourneyAnalysisRequest } from '../types/journey-analysis';
import { apiError } from './errors';

const placeSchema = z.object({
  aliases: z.array(z.string().max(120)).max(30).optional(),
  id: z.string().min(1).max(120), name: z.string().trim().min(1).max(120),
  lat: z.number().finite().min(22.1).max(22.9), lon: z.number().finite().min(113.75).max(114.65),
  side: z.enum(['hk', 'sz']), kind: z.enum(['station', 'port', 'landmark', 'address', 'point']),
  coordinatesVerified: z.boolean(), address: z.string().max(500).optional(), source: z.enum(['photon', 'location', 'als', 'amap']).optional(),
}).strict();
const schema = z.object({
  origin: z.string().min(1).max(120), destination: z.string().min(1).max(120),
  originPlace: placeSchema.optional(), destinationPlace: placeSchema.optional(),
  departAt: z.string().max(40), arriveBy: z.string().max(40).optional(),
  routing: z.enum(['demo', 'transit']).optional(),
  scenario: z.enum(['normal', 'heavy_rain', 'disruption']).default('normal'),
  mode: z.enum(['fastest', 'reliable', 'less_crowded', 'balanced']).default('balanced'),
}).strict();
export async function handleJourneyRequest(raw: unknown, options?: { transit: (request: JourneyAnalysisRequest) => Promise<JourneyAnalysis> }) {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { status: 400, body: apiError('INVALID_INPUT', '請檢查地點、時間、模式與演示情景。', parsed.error.issues.map(i => i.message)) };
  const input = parsed.data;
  const origin = findPlace(input.origin) ?? (input.originPlace?.id === input.origin ? input.originPlace : undefined);
  const destination = findPlace(input.destination) ?? (input.destinationPlace?.id === input.destination ? input.destinationPlace : undefined);
  const departure = parseArriveBy(input.departAt);
  const arrival = input.arriveBy ? parseArriveBy(input.arriveBy) : null;
  if (!departure.ok || (arrival && !arrival.ok) || !origin || !destination || origin.id === destination.id || (origin.lat === destination.lat && origin.lon === destination.lon) || (arrival?.ok && departure.ok && arrival.epochMs <= departure.epochMs)) {
    return { status: 400, body: apiError('INVALID_INPUT', '請從搜尋結果確認不同的起終點，並讓到達期限晚於出發時間。') };
  }
  try {
    const normalized = { ...input, originPlace: origin, destinationPlace: destination, departAt: departure.iso, arriveBy: arrival?.ok ? arrival.iso : undefined };
    if (input.routing === 'transit') {
      if (!options?.transit) return { status: 503, body: apiError('INTERNAL_ERROR', '公開交通規劃需要連線伺服器；沒有轉用演示路線。') };
      return { status: 200, body: await options.transit(normalized) };
    }
    return { status: 200, body: await analyzeJourney({ ...input, departAt: departure.iso, arriveBy: arrival?.ok ? arrival.iso : undefined }) };
  } catch {
    return { status: 500, body: apiError('INTERNAL_ERROR', '行程分析暫時無法完成，請重試。') };
  }
}
