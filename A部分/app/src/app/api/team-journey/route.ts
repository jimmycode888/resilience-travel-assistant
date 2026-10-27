/**
 * 正式團隊行程端點。回傳 `TeamJourneyResult`（不可快取）。
 * 實作在 `@/lib/api/team-journey-handler`；B/C 的注入點見該檔的 `teamModules`。
 */
import { NextResponse } from 'next/server';
import { handleTeamJourneyRequest } from '@/lib/api/team-journey-handler';
import { apiError } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json(apiError('INVALID_INPUT', '請求內容必須是合法 JSON。'), {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  const result = await handleTeamJourneyRequest(input);
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function GET() {
  return NextResponse.json(apiError('METHOD_NOT_ALLOWED', '請以 POST 提交行程。'), {
    status: 405,
    headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
  });
}
