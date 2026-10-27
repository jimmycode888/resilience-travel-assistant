/** Explicit manual network probe, excluded from normal tests by file location. */
import { it, expect } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { transportTimeClient } from "@/lib/adapters/transport-times";
import { createTransportDepartmentProvider, createHkoWeatherProvider } from "@/lib/adapters/live-providers";
import { resolveContextWithTier, SnapshotCache } from "@/lib/adapters";
it("manually probe official sources", async () => {
  process.env.HKO_OPEN_DATA_BASE_URL = "https://data.weather.gov.hk/weatherAPI/opendata/weather.php";
  process.env.TD_SPECIAL_TRAFFIC_NEWS_URL = "https://www.td.gov.hk/en/special_news/trafficnews.xml";
  process.env.MTR_NEXT_TRAIN_ENABLED = "1";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const [boards, weather, traffic, context] = await Promise.all([
      transportTimeClient.collect(controller.signal),
      createHkoWeatherProvider()!.fetch(controller.signal),
      createTransportDepartmentProvider()!.fetch(controller.signal),
      resolveContextWithTier({ scenario: "live", cache: new SnapshotCache(), timeoutMs: 5000 }),
    ]);
    await mkdir("docs/data", { recursive: true });
    await writeFile("docs/data/live-source-check.json", JSON.stringify({ checkedAt: new Date().toISOString(), note: "一次實測存檔，非目前即時資料，不作演示 fixture 或決策输入", boards, weather, traffic, context }, null, 2));
    expect(weather?.weather).toBeDefined(); expect(boards.some((b) => b.quality === "live")).toBe(true);
    console.log(boards.map((b) => `${b.id}: ${b.quality}/${b.state}, ${b.arrivals.length} predictions`).join("\n"));
    console.log("context:", context.tier);
  } finally { clearTimeout(timer); }
}, 15000);
