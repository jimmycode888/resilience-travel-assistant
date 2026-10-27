import { NextResponse } from 'next/server';
import { handleJourneyRequest } from '@/lib/api/journey-handler';
import { analyzeTransitJourney } from '@/lib/transit/service';
import { apiError } from '@/lib/api/errors';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  let input: unknown;
  try { input = await request.json(); } catch { return NextResponse.json(apiError('INVALID_INPUT', '請求內容必須是合法 JSON。'), { status: 400 }); }
  const result = await handleJourneyRequest(input, { transit: analyzeTransitJourney });
  return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
}
export function GET() { return NextResponse.json(apiError('METHOD_NOT_ALLOWED', '請以 POST 提交行程。'), { status: 405, headers: { Allow: 'POST' } }); }
