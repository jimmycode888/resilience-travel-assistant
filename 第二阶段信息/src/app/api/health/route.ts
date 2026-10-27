import { NextResponse } from "next/server";
import { buildHealthResponse } from "@/lib/api/health-handler";
import { apiError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json(buildHealthResponse(), {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

export function POST(): NextResponse {
  return NextResponse.json(
    apiError("METHOD_NOT_ALLOWED", "GET /api/health 只接受 GET。", []),
    { status: 405, headers: { Allow: "GET" } },
  );
}
