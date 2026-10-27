/**
 * 手動探針：跨境路線讀取（不受一般測試影響，放在 scripts/ 之下）。
 *
 * 用途：把「出行／導航路徑讀取」的實際結果印出來，方便人工核對與示範。
 *
 *   npm run probe:route          # 離線 fixture：一定跑得動，結果可重現
 *   npm run probe:route:live     # 加測 OSRM 真實路網（需要網絡，不需金鑰）
 */
import { expect, it } from "vitest";
import { resolveRoutes } from "@/lib/route/adapter";
import { describeJourney, describeModes } from "@/lib/route/instructions";
import { createOsrmProvider } from "@/lib/route/providers/osrm";
import { borderSegments } from "@/lib/types/journey";
import { formatHkTime } from "@/lib/time";
import type { RouteResolution } from "@/lib/types/route";

const DEPART = "2026-10-13T08:00";

function printResolution(title: string, resolution: RouteResolution, tier: string): void {
  console.log(`\n=== ${title}（tier: ${tier}）===`);
  for (const candidate of resolution.candidates) {
    const journey = candidate.journey;
    const crossing = borderSegments(journey)[0];
    console.log(
      [
        `• ${candidate.label}`,
        `${journey.totalMinutes} 分`,
        `${formatHkTime(journey.departAt)}→${formatHkTime(journey.arriveAt)}`,
        `口岸 ${journey.borderPortIds.join("/") || "—"}`,
        crossing?.border
          ? `排隊 ${crossing.border.queueMinutesRange[0]}–${crossing.border.queueMinutesRange[1]} 分（${crossing.border.confidence}）`
          : "排隊 —",
        `quality ${candidate.quality}`,
      ].join("｜"),
    );
    console.log(`   路段：${journey.segments.map((s) => `${s.kind === "border_crossing" ? "【跨境】" : ""}${s.mode}`).join(" → ")}`);
    console.log(`   摘要：${describeModes(journey)}`);
    // 只把第一條候選的逐步指示完整印出，其餘保持摘要，避免輸出過長。
    if (candidate === resolution.candidates[0]) {
      for (const step of describeJourney(journey)) {
        console.log(`     ${step.index}. ${step.isTransfer ? "[轉乘] " : ""}${step.text}`);
      }
    }
  }
  if (resolution.notices.length > 0) {
    console.log("   提示：");
    for (const notice of [...new Set(resolution.notices)]) console.log(`   - ${notice}`);
  }
}

it("跨境路線讀取：中環（交易廣場）→ 深圳福田", async () => {
  const { resolution, tier } = await resolveRoutes({
    query: {
      origin: "central-exchange-square",
      destination: "futian-station-sz",
      departAt: DEPART,
    },
  });

  printResolution("中環 → 福田", resolution, tier);

  expect(resolution.candidates.length).toBeGreaterThanOrEqual(3);
  expect(resolution.candidates.every((candidate) => candidate.journey.crossesBorder)).toBe(true);
});

it("換口岸：指定經羅湖口岸", async () => {
  const { resolution, tier } = await resolveRoutes({
    query: {
      origin: "central-exchange-square",
      destination: "futian-station-sz",
      departAt: DEPART,
      preferPortId: "lo-wu",
    },
  });

  printResolution("中環 → 福田（指定羅湖口岸）", resolution, tier);

  expect(resolution.candidates[0]?.journey.borderPortIds).toEqual(["lo-wu"]);
});

it("真實路網（OSRM，無需金鑰；需要網絡，失敗會自動回退）", async () => {
  const { resolution, tier } = await resolveRoutes({
    query: {
      origin: "lok-ma-chau-station",
      destination: "futian-checkpoint",
      departAt: DEPART,
    },
    providers: [createOsrmProvider({ profile: "walking" })],
    timeoutMs: 6000,
  });

  printResolution("落馬洲站 → 福田口岸（步行）", resolution, tier);

  console.log(
    tier === "live"
      ? "\n✅ 已取得真實路網折線（OSRM）。"
      : "\n⚠️ 未能取得真實路網，已回退 fixture；檢查網絡或 ROUTE_OSRM_BASE_URL。",
  );
  expect(["live", "fixture"]).toContain(tier);
});
