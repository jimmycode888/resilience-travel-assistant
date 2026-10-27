/**
 * 手動聯網探測（成員 B）：用**真實公開來源**跑一次正式組合層的 `resolveRouteData`。
 *
 * 標準測試不連網；這一支必須明確用下面的指令執行：
 *   npx vitest run --config scripts/probe-team-data.config.ts
 */
import { it, expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { createFixtureProvider } from "@/lib/route/providers/fixture";
import { parseRawJourney } from "@/lib/route/parse";
import { createRouteDataResolver } from "@/lib/adapters/team-data";
import { portConditionClient } from "@/lib/adapters/port-conditions";

const DEPART_AT = new Date().toISOString();

it("用真實來源跑一次 B 的正式注入", async () => {
  process.env.HKO_OPEN_DATA_BASE_URL = "https://data.weather.gov.hk/weatherAPI/opendata/weather.php";
  process.env.TD_SPECIAL_TRAFFIC_NEWS_URL = "https://www.td.gov.hk/en/special_news/trafficnews.xml";
  process.env.MTR_NEXT_TRAIN_ENABLED = "1";
  portConditionClient.clear();

  const provider = createFixtureProvider();
  const request = { origin: "central-exchange-square", destination: "futian-station-sz", departAt: DEPART_AT, mode: "balanced" as const };
  const raw = await provider.fetch(request, new AbortController().signal);
  const candidates = (raw ?? []).map((route) => {
    const { journey } = parseRawJourney(route.journey);
    return { id: journey.id, label: journey.label, provider: route.provider, quality: route.quality, journey };
  });

  const resolve = createRouteDataResolver();
  const envelopes = await Promise.all(candidates.map((route) => resolve(route, request)));

  const summary = envelopes.map((envelope) => ({
    routeId: envelope?.routeId,
    口岸: envelope?.value.border?.portId ?? null,
    排隊區間: envelope?.value.border?.queueMinutesRange ?? null,
    置信度: envelope?.confidence ?? null,
    品質: envelope?.quality ?? null,
    天氣: envelope?.value.weather?.condition ?? null,
    服務狀態: envelope?.value.service?.status ?? null,
    公告數: envelope?.value.incidents?.length ?? null,
    updatedAt: envelope?.updatedAt ?? null,
  }));
  console.log(JSON.stringify(summary, null, 2));

  await mkdir("docs/data", { recursive: true });
  await writeFile(
    `docs/data/team-data-probe-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify({ checkedAt: new Date().toISOString(), note: "一次實測存檔，非目前即時資料", departAt: DEPART_AT, summary, envelopes }, null, 2),
  );

  // 先看每個口岸實際拿到什麼觀測（這是「有沒有信號」的第一手證據）。
  portConditionClient.clear();
  const conditions = await portConditionClient.resolve({ at: DEPART_AT });
  console.log("== 各口岸觀測 ==", JSON.stringify({
    quality: conditions.quality,
    ports: Object.entries(conditions.observationsByPort).map(([portId, rows]) => ({
      portId,
      觀測數: rows.length,
      實測班距: rows.map((row) => row.observedHeadwayMinutes),
      班次數: rows.map((row) => row.arrivals.length),
      延誤旗標: rows.map((row) => row.delayReported),
      品質: rows.map((row) => row.quality),
      說明: rows.flatMap((row) => (row.note ? [row.note] : [])),
    })),
  }, null, 2));

  // 再跑一次**正式端點**的完整處理鏈，確認注入後真的走得通。
  const { handleTeamJourneyRequest } = await import("@/lib/api/team-journey-handler");
  const handled = await handleTeamJourneyRequest({
    origin: "central-exchange-square",
    destination: "futian-station-sz",
    departAt: DEPART_AT,
    mode: "balanced",
  });
  const body = handled.body as { routes?: Array<{ candidate: { id: string }; data: { value: { border?: { queueMinutesRange: [number, number]; confidence: string } } | null; quality: string } | null; eligible: boolean }>; decision?: { action: string } | null; notices?: string[] };
  console.log("== POST /api/team-journey ==", handled.status);
  console.log(JSON.stringify((body.routes ?? []).map((route) => ({ id: route.candidate.id, eligible: route.eligible, quality: route.data?.quality ?? null, border: route.data?.value?.border ?? null })), null, 2));
  console.log("decision:", body.decision?.action ?? null);
  expect(handled.status).toBe(200);

  const crossBorder = envelopes.filter((envelope) => envelope?.value.border);
  expect(crossBorder.length).toBeGreaterThan(0);
  for (const envelope of crossBorder) {
    expect(envelope!.value.border!.queueMinutesRange[1]).toBeGreaterThanOrEqual(envelope!.value.border!.queueMinutesRange[0]);
    expect(envelope!.value.border!.note).toContain("估算");
    expect(envelope!.confidence).not.toBe("high");
  }
}, 30000);
