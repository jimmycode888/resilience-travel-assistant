import type { ContextSnapshot, DataSourceInfo } from "@/lib/types";

/**
 * 三個情景共用同一組示範資料來源描述；品質一律標示為 fixture。
 * `url` 保留為 null —— 成員 B 接入真實來源後，必須填入官方資料集連結。
 */
function fixtureSources(collectedAt: string, note: string): DataSourceInfo[] {
  return [
    {
      id: "hko-weather",
      label: "香港天文台（天氣警告及降雨）",
      url: null,
      quality: "fixture",
      updatedAt: collectedAt,
      note: `${note} 待成員 B 接入後填入官方資料集連結。`,
    },
    {
      id: "mtr-service-status",
      label: "港鐵服務狀態",
      url: null,
      quality: "fixture",
      updatedAt: collectedAt,
      note,
    },
    {
      id: "td-special-traffic-news",
      label: "運輸署特別交通消息",
      url: null,
      quality: "fixture",
      updatedAt: collectedAt,
      note: `${note} 待成員 B 接入後填入官方資料集連結。`,
    },
  ];
}

/** 資料擷取時間。固定值，讓三個情景完全可重現。 */
export const FIXTURE_COLLECTED_AT = "2026-10-13T07:30:00+08:00";
/** 資料失效時間：擷取後 30 分鐘。決策層用它判斷資料是否過期。 */
export const FIXTURE_EXPIRES_AT = "2026-10-13T08:00:00+08:00";
export const FIXTURE_SERVICE_DATE = "2026-10-13";

const FIXTURE_NOTE = "演示固定資料（fixture），非實時；請勿當作即時路況。";

/** 情景一：正常通勤。 */
export const NORMAL_SNAPSHOT: ContextSnapshot = {
  scenario: "normal",
  serviceDate: FIXTURE_SERVICE_DATE,
  collectedAt: FIXTURE_COLLECTED_AT,
  expiresAt: FIXTURE_EXPIRES_AT,
  quality: "fixture",
  weather: {
    condition: "clear",
    warning: null,
    rainfallMmPerHour: 0,
    temperatureC: 28,
    note: "天氣良好，無警告信號生效。",
    updatedAt: FIXTURE_COLLECTED_AT,
  },
  routes: [
    {
      routeId: "R1",
      status: "ok",
      delayMinutes: 0,
      crowding: "medium",
      note: "將軍澳線及港島線服務正常，北角站轉乘通道人流一般。",
      affectedSegments: [],
      updatedAt: FIXTURE_COLLECTED_AT,
    },
    {
      routeId: "R2",
      status: "ok",
      delayMinutes: 3,
      crowding: "low",
      note: "東區海底隧道及干諾道中車流暢順，僅輕微擠塞。",
      affectedSegments: ["東區海底隧道"],
      updatedAt: FIXTURE_COLLECTED_AT,
    },
    {
      routeId: "R3",
      status: "ok",
      delayMinutes: 0,
      crowding: "low",
      note: "鰂魚涌站轉乘人流較少。",
      affectedSegments: [],
      updatedAt: FIXTURE_COLLECTED_AT,
    },
  ],
  incidents: [],
  sources: fixtureSources(FIXTURE_COLLECTED_AT, FIXTURE_NOTE),
};

/** 情景二：暴雨影響。 */
export const HEAVY_RAIN_SNAPSHOT: ContextSnapshot = {
  scenario: "heavy_rain",
  serviceDate: FIXTURE_SERVICE_DATE,
  collectedAt: FIXTURE_COLLECTED_AT,
  expiresAt: FIXTURE_EXPIRES_AT,
  quality: "fixture",
  weather: {
    condition: "heavy_rain",
    warning: "黑色暴雨警告信號",
    rainfallMmPerHour: 45,
    temperatureC: 25,
    note: "天文台於 06:40 發出黑色暴雨警告信號，多區錄得每小時 40 毫米以上雨量。",
    updatedAt: FIXTURE_COLLECTED_AT,
  },
  routes: [
    {
      routeId: "R1",
      status: "delayed",
      delayMinutes: 3,
      crowding: "medium",
      note: "露天段需限速行駛，將軍澳線延誤約 3 分鐘。",
      affectedSegments: ["坑口站 → 北角站（露天段）"],
      updatedAt: FIXTURE_COLLECTED_AT,
    },
    {
      routeId: "R2",
      status: "delayed",
      delayMinutes: 15,
      crowding: "high",
      note: "多處路面積水，東區海底隧道收費廣場及干諾道中車速緩慢。",
      affectedSegments: ["東區海底隧道", "干諾道中"],
      updatedAt: FIXTURE_COLLECTED_AT,
    },
    {
      routeId: "R3",
      status: "delayed",
      delayMinutes: 4,
      crowding: "medium",
      note: "鰂魚涌站轉乘人流因雨天增加。",
      affectedSegments: ["鰂魚涌站轉乘通道"],
      updatedAt: FIXTURE_COLLECTED_AT,
    },
  ],
  incidents: [
    {
      id: "INC-RAIN-1",
      kind: "weather",
      title: "黑色暴雨警告信號生效",
      detail: "多區出現水浸，部分巴士路線需改道或延誤，路面行車時間明顯增加。",
      since: "2026-10-13T06:40:00+08:00",
    },
  ],
  sources: fixtureSources(FIXTURE_COLLECTED_AT, FIXTURE_NOTE),
};

/** 情景三：交通中斷。 */
export const DISRUPTION_SNAPSHOT: ContextSnapshot = {
  scenario: "disruption",
  serviceDate: FIXTURE_SERVICE_DATE,
  collectedAt: FIXTURE_COLLECTED_AT,
  expiresAt: FIXTURE_EXPIRES_AT,
  quality: "fixture",
  weather: {
    condition: "cloudy",
    warning: null,
    rainfallMmPerHour: 0,
    temperatureC: 27,
    note: "天氣無特殊影響；本次中斷來自行車服務事故。",
    updatedAt: FIXTURE_COLLECTED_AT,
  },
  routes: [
    {
      routeId: "R1",
      status: "disrupted",
      delayMinutes: 0,
      crowding: "high",
      note: "信號故障：將軍澳線（坑口 ↔ 北角）列車服務暫停，港鐵已安排免費接駁巴士。",
      affectedSegments: ["坑口站 → 北角站"],
      updatedAt: FIXTURE_COLLECTED_AT,
    },
    {
      routeId: "R2",
      status: "ok",
      delayMinutes: 20,
      crowding: "high",
      note: "鐵路中斷令過海巴士需求急增，坑口（北）巴士總站候車時間增加。",
      affectedSegments: ["坑口（北）巴士總站"],
      updatedAt: FIXTURE_COLLECTED_AT,
    },
    {
      routeId: "R3",
      status: "delayed",
      delayMinutes: 55,
      crowding: "high",
      note: "大量乘客改用鰂魚涌站轉乘，月台實施人流管制。",
      affectedSegments: ["鰂魚涌站轉乘通道", "港島線（鰂魚涌 → 中環）"],
      updatedAt: FIXTURE_COLLECTED_AT,
    },
  ],
  incidents: [
    {
      id: "INC-MTR-1",
      kind: "mtr",
      title: "將軍澳線信號故障",
      detail: "坑口站至北角站之間列車服務暫停，預計恢復時間未確認。",
      since: "2026-10-13T06:55:00+08:00",
    },
    {
      id: "INC-BUS-1",
      kind: "bus",
      title: "過海巴士需求急增",
      detail: "坑口（北）巴士總站候車人龍延長，實際候車時間高於平時。",
      since: "2026-10-13T07:10:00+08:00",
    },
  ],
  sources: fixtureSources(FIXTURE_COLLECTED_AT, FIXTURE_NOTE),
};
