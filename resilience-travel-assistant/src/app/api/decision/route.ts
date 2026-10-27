import { NextResponse } from "next/server";
import { handleDecisionRequest } from "@/lib/api/decision-handler";
import { apiError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      apiError("INVALID_INPUT", "請求內容必須是合法的 JSON。", [
        "Content-Type 應為 application/json。",
      ]),
      { status: 400 },
    );
  }

  const result = await handleDecisionRequest(body);
  return NextResponse.json(result.body, { status: result.status });
}

export function GET(): NextResponse {
  return NextResponse.json(
    apiError("METHOD_NOT_ALLOWED", "POST /api/decision 只接受 POST。", [
      "請以 POST 提交 TripRequest。",
    ]),
    { status: 405, headers: { Allow: "POST" } },
  );
}
