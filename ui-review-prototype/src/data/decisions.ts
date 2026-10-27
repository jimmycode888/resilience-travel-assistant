/**
 * 真實決策輸出（Source of Truth）。
 *
 * 本檔由專案真實輸出產生，內容逐字等於：
 *  - `resilience-travel-assistant/src/lib/fixtures/golden/{normal,heavy_rain,disruption}.json` 的 `decision` 物件
 *  - 以及對運行中的 `POST http://localhost:5180/api/decision`（constraints maxExtraCost=0 / maxTransfers=0）
 *    取得的真實 `unavailable` 回應
 *
 * ⚠️ 請勿手改此檔內容。資料若與真實 API 不一致，以真實 API 為準。
 * 本檔僅為 UI review prototype 的離線資料來源（API 不可用時的 fallback）。
 */

export type Confidence = "high" | "medium" | "low";
export type DecisionStatus = "ready" | "uncertain" | "unavailable";
export type DecisionAction = "depart_now" | "depart_at" | "wait" | "hold";
export type RouteStatus = "ok" | "delayed" | "disrupted" | "unknown";
export type Crowding = "low" | "medium" | "high" | "unknown";
export type TransportMode = "mtr" | "bus" | "minibus" | "walk" | "tram" | "ferry";
export type DataQuality = "live" | "cached" | "fixture";
export type Scenario = "normal" | "heavy_rain" | "disruption";

export interface RouteStep {
  id: string;
  mode: TransportMode;
  line: string | null;
  from: string;
  to: string;
  departAt: string;
  arriveAt: string;
  durationMinutes: number;
  instruction: string;
  note: string | null;
}

export interface RoutePlan {
  routeId: string;
  label: string;
  summary: string;
  steps: RouteStep[];
  departAt: string;
  arriveAt: string;
  accessWalkMinutes: number;
  durationMinutes: number;
  baseDurationMinutes: number;
  delayMinutes: number;
  transfers: number;
  extraCostHkd: number;
  status: RouteStatus;
  crowding: Crowding;
  riskNotes: string[];
  score: number;
}

export interface ExcludedRoute { routeId: string; label: string; reason: string; }
export interface DataSourceInfo {
  id: string; label: string; url: string | null;
  quality: DataQuality; updatedAt: string; note: string | null;
}
export interface DecisionBasis {
  claim: string; type: "rule" | "data" | "statistics";
  source: string; sourceUrl: string | null;
}

export interface DecisionResponse {
  status: DecisionStatus;
  departAt: string;
  latestDepartAt: string;
  etaRange: [string, string];
  confidence: Confidence;
  primaryRoute: RouteStep[];
  planB: RouteStep[];
  switchCondition: string;
  reasons: string[];
  dataUpdatedAt: string;
  dataQuality: DataQuality;
  primaryPlan: RoutePlan | null;
  planBPlan: RoutePlan | null;
  candidates: RoutePlan[];
  excludedRoutes: ExcludedRoute[];
  dataSources: DataSourceInfo[];
  notices: string[];
  disclaimer: string;
  scenario: Scenario;
  serviceDate: string;
  generatedFor: { origin: string; destination: string; arriveBy: string };
  action: DecisionAction;
  switchDeadline: string;
  basis: DecisionBasis[];
  uncertainty: string[];
}

export const DECISIONS: Record<Scenario, DecisionResponse> = {
  normal: {
  "status": "ready",
  "departAt": "2026-10-13T08:09:00+08:00",
  "latestDepartAt": "2026-10-13T08:15:00+08:00",
  "etaRange": [
    "2026-10-13T08:54:00+08:00",
    "2026-10-13T09:04:00+08:00"
  ],
  "confidence": "high",
  "primaryRoute": [
    {
      "id": "R1-walk-access",
      "mode": "walk",
      "line": null,
      "from": "坑口（富寧花園）",
      "to": "坑口站 A 出口",
      "departAt": "2026-10-13T08:09:00+08:00",
      "arriveAt": "2026-10-13T08:14:00+08:00",
      "durationMinutes": 5,
      "instruction": "步行前往坑口站 A 出口",
      "note": null
    },
    {
      "id": "R1-ride-tko",
      "mode": "mtr",
      "line": "將軍澳線",
      "from": "坑口站",
      "to": "北角站",
      "departAt": "2026-10-13T08:14:00+08:00",
      "arriveAt": "2026-10-13T08:33:00+08:00",
      "durationMinutes": 19,
      "instruction": "乘將軍澳線（往北角方向）至北角站",
      "note": "將軍澳線及港島線服務正常，北角站轉乘通道人流一般。"
    },
    {
      "id": "R1-interchange-nop",
      "mode": "walk",
      "line": null,
      "from": "北角站",
      "to": "北角站",
      "departAt": "2026-10-13T08:33:00+08:00",
      "arriveAt": "2026-10-13T08:36:00+08:00",
      "durationMinutes": 3,
      "instruction": "於北角站同站轉乘港島線（往堅尼地城方向）",
      "note": null
    },
    {
      "id": "R1-ride-isl",
      "mode": "mtr",
      "line": "港島線",
      "from": "北角站",
      "to": "中環站",
      "departAt": "2026-10-13T08:36:00+08:00",
      "arriveAt": "2026-10-13T08:48:00+08:00",
      "durationMinutes": 12,
      "instruction": "乘港島線至中環站",
      "note": null
    },
    {
      "id": "R1-walk-egress",
      "mode": "walk",
      "line": null,
      "from": "中環站",
      "to": "中環（交易廣場）",
      "departAt": "2026-10-13T08:48:00+08:00",
      "arriveAt": "2026-10-13T08:54:00+08:00",
      "durationMinutes": 6,
      "instruction": "由中環站出口步行前往目的地",
      "note": null
    }
  ],
  "planB": [
    {
      "id": "R2-walk-access",
      "mode": "walk",
      "line": null,
      "from": "坑口（富寧花園）",
      "to": "坑口（北）巴士總站",
      "departAt": "2026-10-13T07:49:00+08:00",
      "arriveAt": "2026-10-13T07:58:00+08:00",
      "durationMinutes": 9,
      "instruction": "步行前往坑口（北）巴士總站",
      "note": null
    },
    {
      "id": "R2-ride-bus",
      "mode": "bus",
      "line": "過海巴士（東隧）",
      "from": "坑口（北）巴士總站",
      "to": "中環（交易廣場）",
      "departAt": "2026-10-13T07:58:00+08:00",
      "arriveAt": "2026-10-13T08:54:00+08:00",
      "durationMinutes": 56,
      "instruction": "乘過海巴士經東區海底隧道至中環（交易廣場）",
      "note": "東區海底隧道及干諾道中車流暢順，僅輕微擠塞。"
    },
    {
      "id": "R2-walk-egress",
      "mode": "walk",
      "line": null,
      "from": "中環（交易廣場）",
      "to": "中環（交易廣場）",
      "departAt": "2026-10-13T08:54:00+08:00",
      "arriveAt": "2026-10-13T08:54:00+08:00",
      "durationMinutes": 0,
      "instruction": "步行前往目的地",
      "note": null
    }
  ],
  "switchCondition": "若出發前將軍澳線延誤超過 10 分鐘，改行 Plan B：過海巴士（東區海底隧道）（需先步行 9 分鐘至坑口（北）巴士總站；巴士較慢，必須在 07:49 前離開起點，逾時則維持主路線並改乘下一班）。若到達坑口（北）巴士總站後 15 分鐘內仍未能上車，時間已不可控，請改乘下一個可行班次。",
  "reasons": [
    "天氣與交通消息未見影響本走廊的事件（資料時間 2026-10-13 07:30）。",
    "港鐵主線（將軍澳線 → 港島線）：現時服務正常，人流一般，預計全程 45 分鐘。",
    "主路線較 Plan B（過海巴士（東區海底隧道））快 20 分鐘，因此建議先採用主路線，並保留 Plan B 作為切換選項。",
    "已按「正常通勤」情景預留 6 分鐘緩衝：建議 08:09 出發，不遲於 08:15 起程，預計 08:54 到達。",
    "到達信心為「高」（規則分數 85/100；扣分：演示固定資料（-5））。"
  ],
  "dataUpdatedAt": "2026-10-13T07:30:00+08:00",
  "dataQuality": "fixture",
  "primaryPlan": {
    "routeId": "R1",
    "label": "港鐵主線（將軍澳線 → 港島線）",
    "summary": "坑口站上車，北角站同站轉乘港島線，中環站下車。最快但依賴鐵路班次。",
    "steps": [
      {
        "id": "R1-walk-access",
        "mode": "walk",
        "line": null,
        "from": "坑口（富寧花園）",
        "to": "坑口站 A 出口",
        "departAt": "2026-10-13T08:09:00+08:00",
        "arriveAt": "2026-10-13T08:14:00+08:00",
        "durationMinutes": 5,
        "instruction": "步行前往坑口站 A 出口",
        "note": null
      },
      {
        "id": "R1-ride-tko",
        "mode": "mtr",
        "line": "將軍澳線",
        "from": "坑口站",
        "to": "北角站",
        "departAt": "2026-10-13T08:14:00+08:00",
        "arriveAt": "2026-10-13T08:33:00+08:00",
        "durationMinutes": 19,
        "instruction": "乘將軍澳線（往北角方向）至北角站",
        "note": "將軍澳線及港島線服務正常，北角站轉乘通道人流一般。"
      },
      {
        "id": "R1-interchange-nop",
        "mode": "walk",
        "line": null,
        "from": "北角站",
        "to": "北角站",
        "departAt": "2026-10-13T08:33:00+08:00",
        "arriveAt": "2026-10-13T08:36:00+08:00",
        "durationMinutes": 3,
        "instruction": "於北角站同站轉乘港島線（往堅尼地城方向）",
        "note": null
      },
      {
        "id": "R1-ride-isl",
        "mode": "mtr",
        "line": "港島線",
        "from": "北角站",
        "to": "中環站",
        "departAt": "2026-10-13T08:36:00+08:00",
        "arriveAt": "2026-10-13T08:48:00+08:00",
        "durationMinutes": 12,
        "instruction": "乘港島線至中環站",
        "note": null
      },
      {
        "id": "R1-walk-egress",
        "mode": "walk",
        "line": null,
        "from": "中環站",
        "to": "中環（交易廣場）",
        "departAt": "2026-10-13T08:48:00+08:00",
        "arriveAt": "2026-10-13T08:54:00+08:00",
        "durationMinutes": 6,
        "instruction": "由中環站出口步行前往目的地",
        "note": null
      }
    ],
    "departAt": "2026-10-13T08:09:00+08:00",
    "arriveAt": "2026-10-13T08:54:00+08:00",
    "accessWalkMinutes": 5,
    "durationMinutes": 45,
    "baseDurationMinutes": 45,
    "delayMinutes": 0,
    "transfers": 1,
    "extraCostHkd": 0,
    "status": "ok",
    "crowding": "medium",
    "riskNotes": [
      "依賴將軍澳線與港島線兩個區段",
      "北角站轉乘通道在繁忙時間人流較多",
      "將軍澳線及港島線服務正常，北角站轉乘通道人流一般。"
    ],
    "score": 0.885
  },
  "planBPlan": {
    "routeId": "R2",
    "label": "過海巴士（東區海底隧道）",
    "summary": "坑口（北）上車，經東區海底隧道直達中環，全程免轉乘，但受路面情況影響。",
    "steps": [
      {
        "id": "R2-walk-access",
        "mode": "walk",
        "line": null,
        "from": "坑口（富寧花園）",
        "to": "坑口（北）巴士總站",
        "departAt": "2026-10-13T07:49:00+08:00",
        "arriveAt": "2026-10-13T07:58:00+08:00",
        "durationMinutes": 9,
        "instruction": "步行前往坑口（北）巴士總站",
        "note": null
      },
      {
        "id": "R2-ride-bus",
        "mode": "bus",
        "line": "過海巴士（東隧）",
        "from": "坑口（北）巴士總站",
        "to": "中環（交易廣場）",
        "departAt": "2026-10-13T07:58:00+08:00",
        "arriveAt": "2026-10-13T08:54:00+08:00",
        "durationMinutes": 56,
        "instruction": "乘過海巴士經東區海底隧道至中環（交易廣場）",
        "note": "東區海底隧道及干諾道中車流暢順，僅輕微擠塞。"
      },
      {
        "id": "R2-walk-egress",
        "mode": "walk",
        "line": null,
        "from": "中環（交易廣場）",
        "to": "中環（交易廣場）",
        "departAt": "2026-10-13T08:54:00+08:00",
        "arriveAt": "2026-10-13T08:54:00+08:00",
        "durationMinutes": 0,
        "instruction": "步行前往目的地",
        "note": null
      }
    ],
    "departAt": "2026-10-13T07:49:00+08:00",
    "arriveAt": "2026-10-13T08:54:00+08:00",
    "accessWalkMinutes": 9,
    "durationMinutes": 65,
    "baseDurationMinutes": 62,
    "delayMinutes": 3,
    "transfers": 0,
    "extraCostHkd": 6,
    "status": "ok",
    "crowding": "low",
    "riskNotes": [
      "全程受路面擠塞影響",
      "班次較疏，候車時間變動大",
      "車費高於港鐵方案",
      "東區海底隧道及干諾道中車流暢順，僅輕微擠塞。",
      "受影響區段：東區海底隧道"
    ],
    "score": 0.54
  },
  "candidates": [
    {
      "routeId": "R1",
      "label": "港鐵主線（將軍澳線 → 港島線）",
      "summary": "坑口站上車，北角站同站轉乘港島線，中環站下車。最快但依賴鐵路班次。",
      "steps": [
        {
          "id": "R1-walk-access",
          "mode": "walk",
          "line": null,
          "from": "坑口（富寧花園）",
          "to": "坑口站 A 出口",
          "departAt": "2026-10-13T08:09:00+08:00",
          "arriveAt": "2026-10-13T08:14:00+08:00",
          "durationMinutes": 5,
          "instruction": "步行前往坑口站 A 出口",
          "note": null
        },
        {
          "id": "R1-ride-tko",
          "mode": "mtr",
          "line": "將軍澳線",
          "from": "坑口站",
          "to": "北角站",
          "departAt": "2026-10-13T08:14:00+08:00",
          "arriveAt": "2026-10-13T08:33:00+08:00",
          "durationMinutes": 19,
          "instruction": "乘將軍澳線（往北角方向）至北角站",
          "note": "將軍澳線及港島線服務正常，北角站轉乘通道人流一般。"
        },
        {
          "id": "R1-interchange-nop",
          "mode": "walk",
          "line": null,
          "from": "北角站",
          "to": "北角站",
          "departAt": "2026-10-13T08:33:00+08:00",
          "arriveAt": "2026-10-13T08:36:00+08:00",
          "durationMinutes": 3,
          "instruction": "於北角站同站轉乘港島線（往堅尼地城方向）",
          "note": null
        },
        {
          "id": "R1-ride-isl",
          "mode": "mtr",
          "line": "港島線",
          "from": "北角站",
          "to": "中環站",
          "departAt": "2026-10-13T08:36:00+08:00",
          "arriveAt": "2026-10-13T08:48:00+08:00",
          "durationMinutes": 12,
          "instruction": "乘港島線至中環站",
          "note": null
        },
        {
          "id": "R1-walk-egress",
          "mode": "walk",
          "line": null,
          "from": "中環站",
          "to": "中環（交易廣場）",
          "departAt": "2026-10-13T08:48:00+08:00",
          "arriveAt": "2026-10-13T08:54:00+08:00",
          "durationMinutes": 6,
          "instruction": "由中環站出口步行前往目的地",
          "note": null
        }
      ],
      "departAt": "2026-10-13T08:09:00+08:00",
      "arriveAt": "2026-10-13T08:54:00+08:00",
      "accessWalkMinutes": 5,
      "durationMinutes": 45,
      "baseDurationMinutes": 45,
      "delayMinutes": 0,
      "transfers": 1,
      "extraCostHkd": 0,
      "status": "ok",
      "crowding": "medium",
      "riskNotes": [
        "依賴將軍澳線與港島線兩個區段",
        "北角站轉乘通道在繁忙時間人流較多",
        "將軍澳線及港島線服務正常，北角站轉乘通道人流一般。"
      ],
      "score": 0.885
    },
    {
      "routeId": "R3",
      "label": "港鐵（鰂魚涌轉乘）",
      "summary": "坑口站上車，改於鰂魚涌站轉乘港島線。北角站受阻時的替代轉乘點。",
      "steps": [
        {
          "id": "R3-walk-access",
          "mode": "walk",
          "line": null,
          "from": "坑口（富寧花園）",
          "to": "坑口站 A 出口",
          "departAt": "2026-10-13T08:03:00+08:00",
          "arriveAt": "2026-10-13T08:08:00+08:00",
          "durationMinutes": 5,
          "instruction": "步行前往坑口站 A 出口",
          "note": null
        },
        {
          "id": "R3-ride-tko",
          "mode": "mtr",
          "line": "將軍澳線",
          "from": "坑口站",
          "to": "鰂魚涌站",
          "departAt": "2026-10-13T08:08:00+08:00",
          "arriveAt": "2026-10-13T08:29:00+08:00",
          "durationMinutes": 21,
          "instruction": "乘將軍澳線（往北角方向）至鰂魚涌站",
          "note": "鰂魚涌站轉乘人流較少。"
        },
        {
          "id": "R3-interchange-qb",
          "mode": "walk",
          "line": null,
          "from": "鰂魚涌站",
          "to": "鰂魚涌站",
          "departAt": "2026-10-13T08:29:00+08:00",
          "arriveAt": "2026-10-13T08:33:00+08:00",
          "durationMinutes": 4,
          "instruction": "於鰂魚涌站轉乘港島線（往堅尼地城方向）",
          "note": null
        },
        {
          "id": "R3-ride-isl",
          "mode": "mtr",
          "line": "港島線",
          "from": "鰂魚涌站",
          "to": "中環站",
          "departAt": "2026-10-13T08:33:00+08:00",
          "arriveAt": "2026-10-13T08:48:00+08:00",
          "durationMinutes": 15,
          "instruction": "乘港島線至中環站",
          "note": null
        },
        {
          "id": "R3-walk-egress",
          "mode": "walk",
          "line": null,
          "from": "中環站",
          "to": "中環（交易廣場）",
          "departAt": "2026-10-13T08:48:00+08:00",
          "arriveAt": "2026-10-13T08:54:00+08:00",
          "durationMinutes": 6,
          "instruction": "由中環站出口步行前往目的地",
          "note": null
        }
      ],
      "departAt": "2026-10-13T08:03:00+08:00",
      "arriveAt": "2026-10-13T08:54:00+08:00",
      "accessWalkMinutes": 5,
      "durationMinutes": 51,
      "baseDurationMinutes": 51,
      "delayMinutes": 0,
      "transfers": 1,
      "extraCostHkd": 0,
      "status": "ok",
      "crowding": "low",
      "riskNotes": [
        "鰂魚涌站月台較窄，人流管制時轉乘時間會顯著增加",
        "仍然依賴將軍澳線",
        "鰂魚涌站轉乘人流較少。"
      ],
      "score": 0.805
    },
    {
      "routeId": "R2",
      "label": "過海巴士（東區海底隧道）",
      "summary": "坑口（北）上車，經東區海底隧道直達中環，全程免轉乘，但受路面情況影響。",
      "steps": [
        {
          "id": "R2-walk-access",
          "mode": "walk",
          "line": null,
          "from": "坑口（富寧花園）",
          "to": "坑口（北）巴士總站",
          "departAt": "2026-10-13T07:49:00+08:00",
          "arriveAt": "2026-10-13T07:58:00+08:00",
          "durationMinutes": 9,
          "instruction": "步行前往坑口（北）巴士總站",
          "note": null
        },
        {
          "id": "R2-ride-bus",
          "mode": "bus",
          "line": "過海巴士（東隧）",
          "from": "坑口（北）巴士總站",
          "to": "中環（交易廣場）",
          "departAt": "2026-10-13T07:58:00+08:00",
          "arriveAt": "2026-10-13T08:54:00+08:00",
          "durationMinutes": 56,
          "instruction": "乘過海巴士經東區海底隧道至中環（交易廣場）",
          "note": "東區海底隧道及干諾道中車流暢順，僅輕微擠塞。"
        },
        {
          "id": "R2-walk-egress",
          "mode": "walk",
          "line": null,
          "from": "中環（交易廣場）",
          "to": "中環（交易廣場）",
          "departAt": "2026-10-13T08:54:00+08:00",
          "arriveAt": "2026-10-13T08:54:00+08:00",
          "durationMinutes": 0,
          "instruction": "步行前往目的地",
          "note": null
        }
      ],
      "departAt": "2026-10-13T07:49:00+08:00",
      "arriveAt": "2026-10-13T08:54:00+08:00",
      "accessWalkMinutes": 9,
      "durationMinutes": 65,
      "baseDurationMinutes": 62,
      "delayMinutes": 3,
      "transfers": 0,
      "extraCostHkd": 6,
      "status": "ok",
      "crowding": "low",
      "riskNotes": [
        "全程受路面擠塞影響",
        "班次較疏，候車時間變動大",
        "車費高於港鐵方案",
        "東區海底隧道及干諾道中車流暢順，僅輕微擠塞。",
        "受影響區段：東區海底隧道"
      ],
      "score": 0.54
    }
  ],
  "excludedRoutes": [],
  "dataSources": [
    {
      "id": "hko-weather",
      "label": "香港天文台（天氣警告及降雨）",
      "url": null,
      "quality": "fixture",
      "updatedAt": "2026-10-13T07:30:00+08:00",
      "note": "演示固定資料（fixture），非實時；請勿當作即時路況。 待成員 B 接入後填入官方資料集連結。"
    },
    {
      "id": "mtr-service-status",
      "label": "港鐵服務狀態",
      "url": null,
      "quality": "fixture",
      "updatedAt": "2026-10-13T07:30:00+08:00",
      "note": "演示固定資料（fixture），非實時；請勿當作即時路況。"
    },
    {
      "id": "td-special-traffic-news",
      "label": "運輸署特別交通消息",
      "url": null,
      "quality": "fixture",
      "updatedAt": "2026-10-13T07:30:00+08:00",
      "note": "演示固定資料（fixture），非實時；請勿當作即時路況。 待成員 B 接入後填入官方資料集連結。"
    }
  ],
  "notices": [
    "本結果使用演示固定資料（fixture），並非實時路況，請勿當作即時資訊。"
  ],
  "disclaimer": "到達信心是基於演示規則的定性判斷，並非經校準的準時機率。實際出行請同時參考港鐵、運輸署與香港天文台的官方資訊。",
  "scenario": "normal",
  "serviceDate": "2026-10-13",
  "generatedFor": {
    "origin": "坑口（富寧花園）",
    "destination": "中環（交易廣場）",
    "arriveBy": "2026-10-13T09:00:00+08:00"
  },
  "action": "depart_at",
  "switchDeadline": "2026-10-13T07:49:00+08:00",
  "basis": [
    {
      "claim": "建議出發時間的規則：arriveBy − （行程時間 + 延誤）− 6 分鐘緩衝；到達範圍另計 ±10 分鐘浮動。",
      "type": "rule",
      "source": "API_CONTRACT.md §4.1 情景參數（演示設定，未經校準）",
      "sourceUrl": null
    },
    {
      "claim": "所有緩衝、權重與信心門檻都是演示設定，未經歷史資料校準，因此只輸出定性信心，不輸出準時機率。本專案尚未完成歷史資料校準，因此沒有任何統計依據可以引用。",
      "type": "rule",
      "source": "專案範圍限制：DECISION_ENGINE.md §10 已知限制",
      "sourceUrl": null
    },
    {
      "claim": "香港天文台（天氣警告及降雨）（演示固定資料，更新於 2026-10-13 07:30）；演示固定資料（fixture），非實時；請勿當作即時路況。 待成員 B 接入後填入官方資料集連結。",
      "type": "data",
      "source": "香港天文台（天氣警告及降雨）",
      "sourceUrl": null
    },
    {
      "claim": "港鐵服務狀態（演示固定資料，更新於 2026-10-13 07:30）；演示固定資料（fixture），非實時；請勿當作即時路況。",
      "type": "data",
      "source": "港鐵服務狀態",
      "sourceUrl": null
    },
    {
      "claim": "運輸署特別交通消息（演示固定資料，更新於 2026-10-13 07:30）；演示固定資料（fixture），非實時；請勿當作即時路況。 待成員 B 接入後填入官方資料集連結。",
      "type": "data",
      "source": "運輸署特別交通消息",
      "sourceUrl": null
    },
    {
      "claim": "主路線「港鐵主線（將軍澳線 → 港島線）」的服務狀態（服務正常）與人流（人流一般）來自本次資料快照。",
      "type": "data",
      "source": "成員 B 的 ContextSnapshot.routes",
      "sourceUrl": null
    },
    {
      "claim": "到達信心「高」由規則分數 85/100 得出；扣分項：演示固定資料（-5）。",
      "type": "rule",
      "source": "DECISION_ENGINE.md §7 到達信心規則",
      "sourceUrl": null
    }
  ],
  "uncertainty": [
    "本結果使用演示固定資料，並非實時路況，不能當作即時資訊。",
    "行動建議為「按建議時間出發」，本建議由規則與輸入資料產生，不構成出行保證。"
  ]
} as DecisionResponse,
  heavy_rain: {
  "status": "ready",
  "departAt": "2026-10-13T07:58:00+08:00",
  "latestDepartAt": "2026-10-13T08:12:00+08:00",
  "etaRange": [
    "2026-10-13T08:43:00+08:00",
    "2026-10-13T09:06:00+08:00"
  ],
  "confidence": "medium",
  "primaryRoute": [
    {
      "id": "R1-walk-access",
      "mode": "walk",
      "line": null,
      "from": "坑口（富寧花園）",
      "to": "坑口站 A 出口",
      "departAt": "2026-10-13T07:58:00+08:00",
      "arriveAt": "2026-10-13T08:03:00+08:00",
      "durationMinutes": 5,
      "instruction": "步行前往坑口站 A 出口",
      "note": null
    },
    {
      "id": "R1-ride-tko",
      "mode": "mtr",
      "line": "將軍澳線",
      "from": "坑口站",
      "to": "北角站",
      "departAt": "2026-10-13T08:03:00+08:00",
      "arriveAt": "2026-10-13T08:25:00+08:00",
      "durationMinutes": 22,
      "instruction": "乘將軍澳線（往北角方向）至北角站",
      "note": "露天段需限速行駛，將軍澳線延誤約 3 分鐘。"
    },
    {
      "id": "R1-interchange-nop",
      "mode": "walk",
      "line": null,
      "from": "北角站",
      "to": "北角站",
      "departAt": "2026-10-13T08:25:00+08:00",
      "arriveAt": "2026-10-13T08:28:00+08:00",
      "durationMinutes": 3,
      "instruction": "於北角站同站轉乘港島線（往堅尼地城方向）",
      "note": null
    },
    {
      "id": "R1-ride-isl",
      "mode": "mtr",
      "line": "港島線",
      "from": "北角站",
      "to": "中環站",
      "departAt": "2026-10-13T08:28:00+08:00",
      "arriveAt": "2026-10-13T08:40:00+08:00",
      "durationMinutes": 12,
      "instruction": "乘港島線至中環站",
      "note": null
    },
    {
      "id": "R1-walk-egress",
      "mode": "walk",
      "line": null,
      "from": "中環站",
      "to": "中環（交易廣場）",
      "departAt": "2026-10-13T08:40:00+08:00",
      "arriveAt": "2026-10-13T08:46:00+08:00",
      "durationMinutes": 6,
      "instruction": "由中環站出口步行前往目的地",
      "note": null
    }
  ],
  "planB": [
    {
      "id": "R2-walk-access",
      "mode": "walk",
      "line": null,
      "from": "坑口（富寧花園）",
      "to": "坑口（北）巴士總站",
      "departAt": "2026-10-13T07:29:00+08:00",
      "arriveAt": "2026-10-13T07:40:00+08:00",
      "durationMinutes": 11,
      "instruction": "步行前往坑口（北）巴士總站",
      "note": null
    },
    {
      "id": "R2-ride-bus",
      "mode": "bus",
      "line": "過海巴士（東隧）",
      "from": "坑口（北）巴士總站",
      "to": "中環（交易廣場）",
      "departAt": "2026-10-13T07:40:00+08:00",
      "arriveAt": "2026-10-13T08:46:00+08:00",
      "durationMinutes": 66,
      "instruction": "乘過海巴士經東區海底隧道至中環（交易廣場）",
      "note": "多處路面積水，東區海底隧道收費廣場及干諾道中車速緩慢。"
    },
    {
      "id": "R2-walk-egress",
      "mode": "walk",
      "line": null,
      "from": "中環（交易廣場）",
      "to": "中環（交易廣場）",
      "departAt": "2026-10-13T08:46:00+08:00",
      "arriveAt": "2026-10-13T08:46:00+08:00",
      "durationMinutes": 0,
      "instruction": "步行前往目的地",
      "note": null
    }
  ],
  "switchCondition": "若出發前將軍澳線延誤超過 15 分鐘，改行 Plan B：過海巴士（東區海底隧道）（需先步行 9 分鐘至坑口（北）巴士總站；巴士較慢，必須在 07:29 前離開起點，逾時則維持主路線並改乘下一班）。若到達坑口（北）巴士總站後 20 分鐘內仍未能上車，時間已不可控，請改乘下一個可行班次。",
  "reasons": [
    "黑色暴雨警告信號生效：多區出現水浸，部分巴士路線需改道或延誤，路面行車時間明顯增加。",
    "港鐵主線（將軍澳線 → 港島線）：現時延誤約 3 分鐘，預計全程 48 分鐘。",
    "主路線較 Plan B（過海巴士（東區海底隧道））快 29 分鐘，因此建議先採用主路線，並保留 Plan B 作為切換選項。",
    "已按「暴雨影響」情景預留 14 分鐘緩衝：建議 07:58 出發，不遲於 08:12 起程，預計 08:46 到達。",
    "到達信心為「中」（規則分數 52/100；扣分：延誤 3 分鐘（-3）、演示固定資料（-5））。"
  ],
  "dataUpdatedAt": "2026-10-13T07:30:00+08:00",
  "dataQuality": "fixture",
  "primaryPlan": {
    "routeId": "R1",
    "label": "港鐵主線（將軍澳線 → 港島線）",
    "summary": "坑口站上車，北角站同站轉乘港島線，中環站下車。最快但依賴鐵路班次。",
    "steps": [
      {
        "id": "R1-walk-access",
        "mode": "walk",
        "line": null,
        "from": "坑口（富寧花園）",
        "to": "坑口站 A 出口",
        "departAt": "2026-10-13T07:58:00+08:00",
        "arriveAt": "2026-10-13T08:03:00+08:00",
        "durationMinutes": 5,
        "instruction": "步行前往坑口站 A 出口",
        "note": null
      },
      {
        "id": "R1-ride-tko",
        "mode": "mtr",
        "line": "將軍澳線",
        "from": "坑口站",
        "to": "北角站",
        "departAt": "2026-10-13T08:03:00+08:00",
        "arriveAt": "2026-10-13T08:25:00+08:00",
        "durationMinutes": 22,
        "instruction": "乘將軍澳線（往北角方向）至北角站",
        "note": "露天段需限速行駛，將軍澳線延誤約 3 分鐘。"
      },
      {
        "id": "R1-interchange-nop",
        "mode": "walk",
        "line": null,
        "from": "北角站",
        "to": "北角站",
        "departAt": "2026-10-13T08:25:00+08:00",
        "arriveAt": "2026-10-13T08:28:00+08:00",
        "durationMinutes": 3,
        "instruction": "於北角站同站轉乘港島線（往堅尼地城方向）",
        "note": null
      },
      {
        "id": "R1-ride-isl",
        "mode": "mtr",
        "line": "港島線",
        "from": "北角站",
        "to": "中環站",
        "departAt": "2026-10-13T08:28:00+08:00",
        "arriveAt": "2026-10-13T08:40:00+08:00",
        "durationMinutes": 12,
        "instruction": "乘港島線至中環站",
        "note": null
      },
      {
        "id": "R1-walk-egress",
        "mode": "walk",
        "line": null,
        "from": "中環站",
        "to": "中環（交易廣場）",
        "departAt": "2026-10-13T08:40:00+08:00",
        "arriveAt": "2026-10-13T08:46:00+08:00",
        "durationMinutes": 6,
        "instruction": "由中環站出口步行前往目的地",
        "note": null
      }
    ],
    "departAt": "2026-10-13T07:58:00+08:00",
    "arriveAt": "2026-10-13T08:46:00+08:00",
    "accessWalkMinutes": 5,
    "durationMinutes": 48,
    "baseDurationMinutes": 45,
    "delayMinutes": 3,
    "transfers": 1,
    "extraCostHkd": 0,
    "status": "delayed",
    "crowding": "medium",
    "riskNotes": [
      "依賴將軍澳線與港島線兩個區段",
      "北角站轉乘通道在繁忙時間人流較多",
      "露天段需限速行駛，將軍澳線延誤約 3 分鐘。",
      "受影響區段：坑口站 → 北角站（露天段）"
    ],
    "score": 0.785
  },
  "planBPlan": {
    "routeId": "R2",
    "label": "過海巴士（東區海底隧道）",
    "summary": "坑口（北）上車，經東區海底隧道直達中環，全程免轉乘，但受路面情況影響。",
    "steps": [
      {
        "id": "R2-walk-access",
        "mode": "walk",
        "line": null,
        "from": "坑口（富寧花園）",
        "to": "坑口（北）巴士總站",
        "departAt": "2026-10-13T07:29:00+08:00",
        "arriveAt": "2026-10-13T07:40:00+08:00",
        "durationMinutes": 11,
        "instruction": "步行前往坑口（北）巴士總站",
        "note": null
      },
      {
        "id": "R2-ride-bus",
        "mode": "bus",
        "line": "過海巴士（東隧）",
        "from": "坑口（北）巴士總站",
        "to": "中環（交易廣場）",
        "departAt": "2026-10-13T07:40:00+08:00",
        "arriveAt": "2026-10-13T08:46:00+08:00",
        "durationMinutes": 66,
        "instruction": "乘過海巴士經東區海底隧道至中環（交易廣場）",
        "note": "多處路面積水，東區海底隧道收費廣場及干諾道中車速緩慢。"
      },
      {
        "id": "R2-walk-egress",
        "mode": "walk",
        "line": null,
        "from": "中環（交易廣場）",
        "to": "中環（交易廣場）",
        "departAt": "2026-10-13T08:46:00+08:00",
        "arriveAt": "2026-10-13T08:46:00+08:00",
        "durationMinutes": 0,
        "instruction": "步行前往目的地",
        "note": null
      }
    ],
    "departAt": "2026-10-13T07:29:00+08:00",
    "arriveAt": "2026-10-13T08:46:00+08:00",
    "accessWalkMinutes": 9,
    "durationMinutes": 77,
    "baseDurationMinutes": 62,
    "delayMinutes": 15,
    "transfers": 0,
    "extraCostHkd": 6,
    "status": "delayed",
    "crowding": "high",
    "riskNotes": [
      "全程受路面擠塞影響",
      "班次較疏，候車時間變動大",
      "車費高於港鐵方案",
      "多處路面積水，東區海底隧道收費廣場及干諾道中車速緩慢。",
      "受影響區段：東區海底隧道",
      "受影響區段：干諾道中"
    ],
    "score": 0.365
  },
  "candidates": [
    {
      "routeId": "R1",
      "label": "港鐵主線（將軍澳線 → 港島線）",
      "summary": "坑口站上車，北角站同站轉乘港島線，中環站下車。最快但依賴鐵路班次。",
      "steps": [
        {
          "id": "R1-walk-access",
          "mode": "walk",
          "line": null,
          "from": "坑口（富寧花園）",
          "to": "坑口站 A 出口",
          "departAt": "2026-10-13T07:58:00+08:00",
          "arriveAt": "2026-10-13T08:03:00+08:00",
          "durationMinutes": 5,
          "instruction": "步行前往坑口站 A 出口",
          "note": null
        },
        {
          "id": "R1-ride-tko",
          "mode": "mtr",
          "line": "將軍澳線",
          "from": "坑口站",
          "to": "北角站",
          "departAt": "2026-10-13T08:03:00+08:00",
          "arriveAt": "2026-10-13T08:25:00+08:00",
          "durationMinutes": 22,
          "instruction": "乘將軍澳線（往北角方向）至北角站",
          "note": "露天段需限速行駛，將軍澳線延誤約 3 分鐘。"
        },
        {
          "id": "R1-interchange-nop",
          "mode": "walk",
          "line": null,
          "from": "北角站",
          "to": "北角站",
          "departAt": "2026-10-13T08:25:00+08:00",
          "arriveAt": "2026-10-13T08:28:00+08:00",
          "durationMinutes": 3,
          "instruction": "於北角站同站轉乘港島線（往堅尼地城方向）",
          "note": null
        },
        {
          "id": "R1-ride-isl",
          "mode": "mtr",
          "line": "港島線",
          "from": "北角站",
          "to": "中環站",
          "departAt": "2026-10-13T08:28:00+08:00",
          "arriveAt": "2026-10-13T08:40:00+08:00",
          "durationMinutes": 12,
          "instruction": "乘港島線至中環站",
          "note": null
        },
        {
          "id": "R1-walk-egress",
          "mode": "walk",
          "line": null,
          "from": "中環站",
          "to": "中環（交易廣場）",
          "departAt": "2026-10-13T08:40:00+08:00",
          "arriveAt": "2026-10-13T08:46:00+08:00",
          "durationMinutes": 6,
          "instruction": "由中環站出口步行前往目的地",
          "note": null
        }
      ],
      "departAt": "2026-10-13T07:58:00+08:00",
      "arriveAt": "2026-10-13T08:46:00+08:00",
      "accessWalkMinutes": 5,
      "durationMinutes": 48,
      "baseDurationMinutes": 45,
      "delayMinutes": 3,
      "transfers": 1,
      "extraCostHkd": 0,
      "status": "delayed",
      "crowding": "medium",
      "riskNotes": [
        "依賴將軍澳線與港島線兩個區段",
        "北角站轉乘通道在繁忙時間人流較多",
        "露天段需限速行駛，將軍澳線延誤約 3 分鐘。",
        "受影響區段：坑口站 → 北角站（露天段）"
      ],
      "score": 0.785
    },
    {
      "routeId": "R3",
      "label": "港鐵（鰂魚涌轉乘）",
      "summary": "坑口站上車，改於鰂魚涌站轉乘港島線。北角站受阻時的替代轉乘點。",
      "steps": [
        {
          "id": "R3-walk-access",
          "mode": "walk",
          "line": null,
          "from": "坑口（富寧花園）",
          "to": "坑口站 A 出口",
          "departAt": "2026-10-13T07:51:00+08:00",
          "arriveAt": "2026-10-13T07:56:00+08:00",
          "durationMinutes": 5,
          "instruction": "步行前往坑口站 A 出口",
          "note": null
        },
        {
          "id": "R3-ride-tko",
          "mode": "mtr",
          "line": "將軍澳線",
          "from": "坑口站",
          "to": "鰂魚涌站",
          "departAt": "2026-10-13T07:56:00+08:00",
          "arriveAt": "2026-10-13T08:20:00+08:00",
          "durationMinutes": 24,
          "instruction": "乘將軍澳線（往北角方向）至鰂魚涌站",
          "note": "鰂魚涌站轉乘人流因雨天增加。"
        },
        {
          "id": "R3-interchange-qb",
          "mode": "walk",
          "line": null,
          "from": "鰂魚涌站",
          "to": "鰂魚涌站",
          "departAt": "2026-10-13T08:20:00+08:00",
          "arriveAt": "2026-10-13T08:24:00+08:00",
          "durationMinutes": 4,
          "instruction": "於鰂魚涌站轉乘港島線（往堅尼地城方向）",
          "note": null
        },
        {
          "id": "R3-ride-isl",
          "mode": "mtr",
          "line": "港島線",
          "from": "鰂魚涌站",
          "to": "中環站",
          "departAt": "2026-10-13T08:24:00+08:00",
          "arriveAt": "2026-10-13T08:40:00+08:00",
          "durationMinutes": 16,
          "instruction": "乘港島線至中環站",
          "note": null
        },
        {
          "id": "R3-walk-egress",
          "mode": "walk",
          "line": null,
          "from": "中環站",
          "to": "中環（交易廣場）",
          "departAt": "2026-10-13T08:40:00+08:00",
          "arriveAt": "2026-10-13T08:46:00+08:00",
          "durationMinutes": 6,
          "instruction": "由中環站出口步行前往目的地",
          "note": null
        }
      ],
      "departAt": "2026-10-13T07:51:00+08:00",
      "arriveAt": "2026-10-13T08:46:00+08:00",
      "accessWalkMinutes": 5,
      "durationMinutes": 55,
      "baseDurationMinutes": 51,
      "delayMinutes": 4,
      "transfers": 1,
      "extraCostHkd": 0,
      "status": "delayed",
      "crowding": "medium",
      "riskNotes": [
        "鰂魚涌站月台較窄，人流管制時轉乘時間會顯著增加",
        "仍然依賴將軍澳線",
        "鰂魚涌站轉乘人流因雨天增加。",
        "受影響區段：鰂魚涌站轉乘通道"
      ],
      "score": 0.688
    },
    {
      "routeId": "R2",
      "label": "過海巴士（東區海底隧道）",
      "summary": "坑口（北）上車，經東區海底隧道直達中環，全程免轉乘，但受路面情況影響。",
      "steps": [
        {
          "id": "R2-walk-access",
          "mode": "walk",
          "line": null,
          "from": "坑口（富寧花園）",
          "to": "坑口（北）巴士總站",
          "departAt": "2026-10-13T07:29:00+08:00",
          "arriveAt": "2026-10-13T07:40:00+08:00",
          "durationMinutes": 11,
          "instruction": "步行前往坑口（北）巴士總站",
          "note": null
        },
        {
          "id": "R2-ride-bus",
          "mode": "bus",
          "line": "過海巴士（東隧）",
          "from": "坑口（北）巴士總站",
          "to": "中環（交易廣場）",
          "departAt": "2026-10-13T07:40:00+08:00",
          "arriveAt": "2026-10-13T08:46:00+08:00",
          "durationMinutes": 66,
          "instruction": "乘過海巴士經東區海底隧道至中環（交易廣場）",
          "note": "多處路面積水，東區海底隧道收費廣場及干諾道中車速緩慢。"
        },
        {
          "id": "R2-walk-egress",
          "mode": "walk",
          "line": null,
          "from": "中環（交易廣場）",
          "to": "中環（交易廣場）",
          "departAt": "2026-10-13T08:46:00+08:00",
          "arriveAt": "2026-10-13T08:46:00+08:00",
          "durationMinutes": 0,
          "instruction": "步行前往目的地",
          "note": null
        }
      ],
      "departAt": "2026-10-13T07:29:00+08:00",
      "arriveAt": "2026-10-13T08:46:00+08:00",
      "accessWalkMinutes": 9,
      "durationMinutes": 77,
      "baseDurationMinutes": 62,
      "delayMinutes": 15,
      "transfers": 0,
      "extraCostHkd": 6,
      "status": "delayed",
      "crowding": "high",
      "riskNotes": [
        "全程受路面擠塞影響",
        "班次較疏，候車時間變動大",
        "車費高於港鐵方案",
        "多處路面積水，東區海底隧道收費廣場及干諾道中車速緩慢。",
        "受影響區段：東區海底隧道",
        "受影響區段：干諾道中"
      ],
      "score": 0.365
    }
  ],
  "excludedRoutes": [],
  "dataSources": [
    {
      "id": "hko-weather",
      "label": "香港天文台（天氣警告及降雨）",
      "url": null,
      "quality": "fixture",
      "updatedAt": "2026-10-13T07:30:00+08:00",
      "note": "演示固定資料（fixture），非實時；請勿當作即時路況。 待成員 B 接入後填入官方資料集連結。"
    },
    {
      "id": "mtr-service-status",
      "label": "港鐵服務狀態",
      "url": null,
      "quality": "fixture",
      "updatedAt": "2026-10-13T07:30:00+08:00",
      "note": "演示固定資料（fixture），非實時；請勿當作即時路況。"
    },
    {
      "id": "td-special-traffic-news",
      "label": "運輸署特別交通消息",
      "url": null,
      "quality": "fixture",
      "updatedAt": "2026-10-13T07:30:00+08:00",
      "note": "演示固定資料（fixture），非實時；請勿當作即時路況。 待成員 B 接入後填入官方資料集連結。"
    }
  ],
  "notices": [
    "本結果使用演示固定資料（fixture），並非實時路況，請勿當作即時資訊。"
  ],
  "disclaimer": "到達信心是基於演示規則的定性判斷，並非經校準的準時機率。實際出行請同時參考港鐵、運輸署與香港天文台的官方資訊。",
  "scenario": "heavy_rain",
  "serviceDate": "2026-10-13",
  "generatedFor": {
    "origin": "坑口（富寧花園）",
    "destination": "中環（交易廣場）",
    "arriveBy": "2026-10-13T09:00:00+08:00"
  },
  "action": "depart_at",
  "switchDeadline": "2026-10-13T07:29:00+08:00",
  "basis": [
    {
      "claim": "建議出發時間的規則：arriveBy − （行程時間 + 延誤）− 14 分鐘緩衝；到達範圍另計 ±20 分鐘浮動。",
      "type": "rule",
      "source": "API_CONTRACT.md §4.1 情景參數（演示設定，未經校準）",
      "sourceUrl": null
    },
    {
      "claim": "所有緩衝、權重與信心門檻都是演示設定，未經歷史資料校準，因此只輸出定性信心，不輸出準時機率。本專案尚未完成歷史資料校準，因此沒有任何統計依據可以引用。",
      "type": "rule",
      "source": "專案範圍限制：DECISION_ENGINE.md §10 已知限制",
      "sourceUrl": null
    },
    {
      "claim": "香港天文台（天氣警告及降雨）（演示固定資料，更新於 2026-10-13 07:30）；演示固定資料（fixture），非實時；請勿當作即時路況。 待成員 B 接入後填入官方資料集連結。",
      "type": "data",
      "source": "香港天文台（天氣警告及降雨）",
      "sourceUrl": null
    },
    {
      "claim": "港鐵服務狀態（演示固定資料，更新於 2026-10-13 07:30）；演示固定資料（fixture），非實時；請勿當作即時路況。",
      "type": "data",
      "source": "港鐵服務狀態",
      "sourceUrl": null
    },
    {
      "claim": "運輸署特別交通消息（演示固定資料，更新於 2026-10-13 07:30）；演示固定資料（fixture），非實時；請勿當作即時路況。 待成員 B 接入後填入官方資料集連結。",
      "type": "data",
      "source": "運輸署特別交通消息",
      "sourceUrl": null
    },
    {
      "claim": "主路線「港鐵主線（將軍澳線 → 港島線）」的服務狀態（服務延誤，延誤約 3 分鐘）與人流（人流一般）來自本次資料快照。",
      "type": "data",
      "source": "成員 B 的 ContextSnapshot.routes",
      "sourceUrl": null
    },
    {
      "claim": "到達信心「中」由規則分數 52/100 得出；扣分項：延誤 3 分鐘（-3）、演示固定資料（-5）。",
      "type": "rule",
      "source": "DECISION_ENGINE.md §7 到達信心規則",
      "sourceUrl": null
    }
  ],
  "uncertainty": [
    "本結果使用演示固定資料，並非實時路況，不能當作即時資訊。",
    "到達信心為「中」，出發前請再確認港鐵、運輸署與香港天文台的官方公告。",
    "行動建議為「按建議時間出發」，本建議由規則與輸入資料產生，不構成出行保證。"
  ]
} as DecisionResponse,
  disruption: {
  "status": "uncertain",
  "departAt": "2026-10-13T07:22:00+08:00",
  "latestDepartAt": "2026-10-13T07:38:00+08:00",
  "etaRange": [
    "2026-10-13T08:24:00+08:00",
    "2026-10-13T09:19:00+08:00"
  ],
  "confidence": "low",
  "primaryRoute": [
    {
      "id": "R2-walk-access",
      "mode": "walk",
      "line": null,
      "from": "坑口（富寧花園）",
      "to": "坑口（北）巴士總站",
      "departAt": "2026-10-13T07:22:00+08:00",
      "arriveAt": "2026-10-13T07:33:00+08:00",
      "durationMinutes": 11,
      "instruction": "步行前往坑口（北）巴士總站",
      "note": null
    },
    {
      "id": "R2-ride-bus",
      "mode": "bus",
      "line": "過海巴士（東隧）",
      "from": "坑口（北）巴士總站",
      "to": "中環（交易廣場）",
      "departAt": "2026-10-13T07:33:00+08:00",
      "arriveAt": "2026-10-13T08:44:00+08:00",
      "durationMinutes": 71,
      "instruction": "乘過海巴士經東區海底隧道至中環（交易廣場）",
      "note": "鐵路中斷令過海巴士需求急增，坑口（北）巴士總站候車時間增加。"
    },
    {
      "id": "R2-walk-egress",
      "mode": "walk",
      "line": null,
      "from": "中環（交易廣場）",
      "to": "中環（交易廣場）",
      "departAt": "2026-10-13T08:44:00+08:00",
      "arriveAt": "2026-10-13T08:44:00+08:00",
      "durationMinutes": 0,
      "instruction": "步行前往目的地",
      "note": null
    }
  ],
  "planB": [
    {
      "id": "R3-walk-access",
      "mode": "walk",
      "line": null,
      "from": "坑口（富寧花園）",
      "to": "坑口站 A 出口",
      "departAt": "2026-10-13T06:58:00+08:00",
      "arriveAt": "2026-10-13T07:08:00+08:00",
      "durationMinutes": 10,
      "instruction": "步行前往坑口站 A 出口",
      "note": null
    },
    {
      "id": "R3-ride-tko",
      "mode": "mtr",
      "line": "將軍澳線",
      "from": "坑口站",
      "to": "鰂魚涌站",
      "departAt": "2026-10-13T07:08:00+08:00",
      "arriveAt": "2026-10-13T07:53:00+08:00",
      "durationMinutes": 45,
      "instruction": "乘將軍澳線（往北角方向）至鰂魚涌站",
      "note": "大量乘客改用鰂魚涌站轉乘，月台實施人流管制。"
    },
    {
      "id": "R3-interchange-qb",
      "mode": "walk",
      "line": null,
      "from": "鰂魚涌站",
      "to": "鰂魚涌站",
      "departAt": "2026-10-13T07:53:00+08:00",
      "arriveAt": "2026-10-13T08:01:00+08:00",
      "durationMinutes": 8,
      "instruction": "於鰂魚涌站轉乘港島線（往堅尼地城方向）",
      "note": null
    },
    {
      "id": "R3-ride-isl",
      "mode": "mtr",
      "line": "港島線",
      "from": "鰂魚涌站",
      "to": "中環站",
      "departAt": "2026-10-13T08:01:00+08:00",
      "arriveAt": "2026-10-13T08:32:00+08:00",
      "durationMinutes": 31,
      "instruction": "乘港島線至中環站",
      "note": null
    },
    {
      "id": "R3-walk-egress",
      "mode": "walk",
      "line": null,
      "from": "中環站",
      "to": "中環（交易廣場）",
      "departAt": "2026-10-13T08:32:00+08:00",
      "arriveAt": "2026-10-13T08:44:00+08:00",
      "durationMinutes": 12,
      "instruction": "由中環站出口步行前往目的地",
      "note": null
    }
  ],
  "switchCondition": "若於坑口（北）巴士總站等候超過 15 分鐘仍未能上車，改乘 Plan B：港鐵（鰂魚涌轉乘）（步行 5 分鐘至坑口站；最遲 07:37 前決定是否改乘，06:58 前離開起點）。",
  "reasons": [
    "將軍澳線信號故障：坑口站至北角站之間列車服務暫停，預計恢復時間未確認。",
    "過海巴士（東區海底隧道）：現時服務正常，人流高，預計全程 82 分鐘。",
    "主路線較 Plan B（港鐵（鰂魚涌轉乘））快 24 分鐘，因此建議先採用主路線，並保留 Plan B 作為切換選項。",
    "已按「交通中斷」情景預留 16 分鐘緩衝：建議 07:22 出發，不遲於 07:38 起程，預計 08:44 到達。",
    "有 1 條路線未被納入：港鐵主線（將軍澳線 → 港島線）：服務中斷 — 信號故障：將軍澳線（坑口 ↔ 北角）列車服務暫停，港鐵已安排免費接駁巴士。",
    "到達信心為「低」（規則分數 40/100；扣分：延誤 20 分鐘（-20）、人流高（-15）、演示固定資料（-5）、本走廊有中斷事件（-10））。"
  ],
  "dataUpdatedAt": "2026-10-13T07:30:00+08:00",
  "dataQuality": "fixture",
  "primaryPlan": {
    "routeId": "R2",
    "label": "過海巴士（東區海底隧道）",
    "summary": "坑口（北）上車，經東區海底隧道直達中環，全程免轉乘，但受路面情況影響。",
    "steps": [
      {
        "id": "R2-walk-access",
        "mode": "walk",
        "line": null,
        "from": "坑口（富寧花園）",
        "to": "坑口（北）巴士總站",
        "departAt": "2026-10-13T07:22:00+08:00",
        "arriveAt": "2026-10-13T07:33:00+08:00",
        "durationMinutes": 11,
        "instruction": "步行前往坑口（北）巴士總站",
        "note": null
      },
      {
        "id": "R2-ride-bus",
        "mode": "bus",
        "line": "過海巴士（東隧）",
        "from": "坑口（北）巴士總站",
        "to": "中環（交易廣場）",
        "departAt": "2026-10-13T07:33:00+08:00",
        "arriveAt": "2026-10-13T08:44:00+08:00",
        "durationMinutes": 71,
        "instruction": "乘過海巴士經東區海底隧道至中環（交易廣場）",
        "note": "鐵路中斷令過海巴士需求急增，坑口（北）巴士總站候車時間增加。"
      },
      {
        "id": "R2-walk-egress",
        "mode": "walk",
        "line": null,
        "from": "中環（交易廣場）",
        "to": "中環（交易廣場）",
        "departAt": "2026-10-13T08:44:00+08:00",
        "arriveAt": "2026-10-13T08:44:00+08:00",
        "durationMinutes": 0,
        "instruction": "步行前往目的地",
        "note": null
      }
    ],
    "departAt": "2026-10-13T07:22:00+08:00",
    "arriveAt": "2026-10-13T08:44:00+08:00",
    "accessWalkMinutes": 9,
    "durationMinutes": 82,
    "baseDurationMinutes": 62,
    "delayMinutes": 20,
    "transfers": 0,
    "extraCostHkd": 6,
    "status": "ok",
    "crowding": "high",
    "riskNotes": [
      "全程受路面擠塞影響",
      "班次較疏，候車時間變動大",
      "車費高於港鐵方案",
      "鐵路中斷令過海巴士需求急增，坑口（北）巴士總站候車時間增加。",
      "受影響區段：坑口（北）巴士總站"
    ],
    "score": 0.865
  },
  "planBPlan": {
    "routeId": "R3",
    "label": "港鐵（鰂魚涌轉乘）",
    "summary": "坑口站上車，改於鰂魚涌站轉乘港島線。北角站受阻時的替代轉乘點。",
    "steps": [
      {
        "id": "R3-walk-access",
        "mode": "walk",
        "line": null,
        "from": "坑口（富寧花園）",
        "to": "坑口站 A 出口",
        "departAt": "2026-10-13T06:58:00+08:00",
        "arriveAt": "2026-10-13T07:08:00+08:00",
        "durationMinutes": 10,
        "instruction": "步行前往坑口站 A 出口",
        "note": null
      },
      {
        "id": "R3-ride-tko",
        "mode": "mtr",
        "line": "將軍澳線",
        "from": "坑口站",
        "to": "鰂魚涌站",
        "departAt": "2026-10-13T07:08:00+08:00",
        "arriveAt": "2026-10-13T07:53:00+08:00",
        "durationMinutes": 45,
        "instruction": "乘將軍澳線（往北角方向）至鰂魚涌站",
        "note": "大量乘客改用鰂魚涌站轉乘，月台實施人流管制。"
      },
      {
        "id": "R3-interchange-qb",
        "mode": "walk",
        "line": null,
        "from": "鰂魚涌站",
        "to": "鰂魚涌站",
        "departAt": "2026-10-13T07:53:00+08:00",
        "arriveAt": "2026-10-13T08:01:00+08:00",
        "durationMinutes": 8,
        "instruction": "於鰂魚涌站轉乘港島線（往堅尼地城方向）",
        "note": null
      },
      {
        "id": "R3-ride-isl",
        "mode": "mtr",
        "line": "港島線",
        "from": "鰂魚涌站",
        "to": "中環站",
        "departAt": "2026-10-13T08:01:00+08:00",
        "arriveAt": "2026-10-13T08:32:00+08:00",
        "durationMinutes": 31,
        "instruction": "乘港島線至中環站",
        "note": null
      },
      {
        "id": "R3-walk-egress",
        "mode": "walk",
        "line": null,
        "from": "中環站",
        "to": "中環（交易廣場）",
        "departAt": "2026-10-13T08:32:00+08:00",
        "arriveAt": "2026-10-13T08:44:00+08:00",
        "durationMinutes": 12,
        "instruction": "由中環站出口步行前往目的地",
        "note": null
      }
    ],
    "departAt": "2026-10-13T06:58:00+08:00",
    "arriveAt": "2026-10-13T08:44:00+08:00",
    "accessWalkMinutes": 5,
    "durationMinutes": 106,
    "baseDurationMinutes": 51,
    "delayMinutes": 55,
    "transfers": 1,
    "extraCostHkd": 0,
    "status": "delayed",
    "crowding": "high",
    "riskNotes": [
      "鰂魚涌站月台較窄，人流管制時轉乘時間會顯著增加",
      "仍然依賴將軍澳線",
      "大量乘客改用鰂魚涌站轉乘，月台實施人流管制。",
      "受影響區段：鰂魚涌站轉乘通道",
      "受影響區段：港島線（鰂魚涌 → 中環）"
    ],
    "score": 0.35
  },
  "candidates": [
    {
      "routeId": "R2",
      "label": "過海巴士（東區海底隧道）",
      "summary": "坑口（北）上車，經東區海底隧道直達中環，全程免轉乘，但受路面情況影響。",
      "steps": [
        {
          "id": "R2-walk-access",
          "mode": "walk",
          "line": null,
          "from": "坑口（富寧花園）",
          "to": "坑口（北）巴士總站",
          "departAt": "2026-10-13T07:22:00+08:00",
          "arriveAt": "2026-10-13T07:33:00+08:00",
          "durationMinutes": 11,
          "instruction": "步行前往坑口（北）巴士總站",
          "note": null
        },
        {
          "id": "R2-ride-bus",
          "mode": "bus",
          "line": "過海巴士（東隧）",
          "from": "坑口（北）巴士總站",
          "to": "中環（交易廣場）",
          "departAt": "2026-10-13T07:33:00+08:00",
          "arriveAt": "2026-10-13T08:44:00+08:00",
          "durationMinutes": 71,
          "instruction": "乘過海巴士經東區海底隧道至中環（交易廣場）",
          "note": "鐵路中斷令過海巴士需求急增，坑口（北）巴士總站候車時間增加。"
        },
        {
          "id": "R2-walk-egress",
          "mode": "walk",
          "line": null,
          "from": "中環（交易廣場）",
          "to": "中環（交易廣場）",
          "departAt": "2026-10-13T08:44:00+08:00",
          "arriveAt": "2026-10-13T08:44:00+08:00",
          "durationMinutes": 0,
          "instruction": "步行前往目的地",
          "note": null
        }
      ],
      "departAt": "2026-10-13T07:22:00+08:00",
      "arriveAt": "2026-10-13T08:44:00+08:00",
      "accessWalkMinutes": 9,
      "durationMinutes": 82,
      "baseDurationMinutes": 62,
      "delayMinutes": 20,
      "transfers": 0,
      "extraCostHkd": 6,
      "status": "ok",
      "crowding": "high",
      "riskNotes": [
        "全程受路面擠塞影響",
        "班次較疏，候車時間變動大",
        "車費高於港鐵方案",
        "鐵路中斷令過海巴士需求急增，坑口（北）巴士總站候車時間增加。",
        "受影響區段：坑口（北）巴士總站"
      ],
      "score": 0.865
    },
    {
      "routeId": "R3",
      "label": "港鐵（鰂魚涌轉乘）",
      "summary": "坑口站上車，改於鰂魚涌站轉乘港島線。北角站受阻時的替代轉乘點。",
      "steps": [
        {
          "id": "R3-walk-access",
          "mode": "walk",
          "line": null,
          "from": "坑口（富寧花園）",
          "to": "坑口站 A 出口",
          "departAt": "2026-10-13T06:58:00+08:00",
          "arriveAt": "2026-10-13T07:08:00+08:00",
          "durationMinutes": 10,
          "instruction": "步行前往坑口站 A 出口",
          "note": null
        },
        {
          "id": "R3-ride-tko",
          "mode": "mtr",
          "line": "將軍澳線",
          "from": "坑口站",
          "to": "鰂魚涌站",
          "departAt": "2026-10-13T07:08:00+08:00",
          "arriveAt": "2026-10-13T07:53:00+08:00",
          "durationMinutes": 45,
          "instruction": "乘將軍澳線（往北角方向）至鰂魚涌站",
          "note": "大量乘客改用鰂魚涌站轉乘，月台實施人流管制。"
        },
        {
          "id": "R3-interchange-qb",
          "mode": "walk",
          "line": null,
          "from": "鰂魚涌站",
          "to": "鰂魚涌站",
          "departAt": "2026-10-13T07:53:00+08:00",
          "arriveAt": "2026-10-13T08:01:00+08:00",
          "durationMinutes": 8,
          "instruction": "於鰂魚涌站轉乘港島線（往堅尼地城方向）",
          "note": null
        },
        {
          "id": "R3-ride-isl",
          "mode": "mtr",
          "line": "港島線",
          "from": "鰂魚涌站",
          "to": "中環站",
          "departAt": "2026-10-13T08:01:00+08:00",
          "arriveAt": "2026-10-13T08:32:00+08:00",
          "durationMinutes": 31,
          "instruction": "乘港島線至中環站",
          "note": null
        },
        {
          "id": "R3-walk-egress",
          "mode": "walk",
          "line": null,
          "from": "中環站",
          "to": "中環（交易廣場）",
          "departAt": "2026-10-13T08:32:00+08:00",
          "arriveAt": "2026-10-13T08:44:00+08:00",
          "durationMinutes": 12,
          "instruction": "由中環站出口步行前往目的地",
          "note": null
        }
      ],
      "departAt": "2026-10-13T06:58:00+08:00",
      "arriveAt": "2026-10-13T08:44:00+08:00",
      "accessWalkMinutes": 5,
      "durationMinutes": 106,
      "baseDurationMinutes": 51,
      "delayMinutes": 55,
      "transfers": 1,
      "extraCostHkd": 0,
      "status": "delayed",
      "crowding": "high",
      "riskNotes": [
        "鰂魚涌站月台較窄，人流管制時轉乘時間會顯著增加",
        "仍然依賴將軍澳線",
        "大量乘客改用鰂魚涌站轉乘，月台實施人流管制。",
        "受影響區段：鰂魚涌站轉乘通道",
        "受影響區段：港島線（鰂魚涌 → 中環）"
      ],
      "score": 0.35
    }
  ],
  "excludedRoutes": [
    {
      "routeId": "R1",
      "label": "港鐵主線（將軍澳線 → 港島線）",
      "reason": "服務中斷 — 信號故障：將軍澳線（坑口 ↔ 北角）列車服務暫停，港鐵已安排免費接駁巴士。"
    }
  ],
  "dataSources": [
    {
      "id": "hko-weather",
      "label": "香港天文台（天氣警告及降雨）",
      "url": null,
      "quality": "fixture",
      "updatedAt": "2026-10-13T07:30:00+08:00",
      "note": "演示固定資料（fixture），非實時；請勿當作即時路況。 待成員 B 接入後填入官方資料集連結。"
    },
    {
      "id": "mtr-service-status",
      "label": "港鐵服務狀態",
      "url": null,
      "quality": "fixture",
      "updatedAt": "2026-10-13T07:30:00+08:00",
      "note": "演示固定資料（fixture），非實時；請勿當作即時路況。"
    },
    {
      "id": "td-special-traffic-news",
      "label": "運輸署特別交通消息",
      "url": null,
      "quality": "fixture",
      "updatedAt": "2026-10-13T07:30:00+08:00",
      "note": "演示固定資料（fixture），非實時；請勿當作即時路況。 待成員 B 接入後填入官方資料集連結。"
    }
  ],
  "notices": [
    "本結果使用演示固定資料（fixture），並非實時路況，請勿當作即時資訊。",
    "已排除 1 條路線：R1 港鐵主線（將軍澳線 → 港島線）：服務中斷 — 信號故障：將軍澳線（坑口 ↔ 北角）列車服務暫停，港鐵已安排免費接駁巴士。"
  ],
  "disclaimer": "到達信心是基於演示規則的定性判斷，並非經校準的準時機率。實際出行請同時參考港鐵、運輸署與香港天文台的官方資訊。",
  "scenario": "disruption",
  "serviceDate": "2026-10-13",
  "generatedFor": {
    "origin": "坑口（富寧花園）",
    "destination": "中環（交易廣場）",
    "arriveBy": "2026-10-13T09:00:00+08:00"
  },
  "action": "depart_at",
  "switchDeadline": "2026-10-13T07:37:00+08:00",
  "basis": [
    {
      "claim": "建議出發時間的規則：arriveBy − （行程時間 + 延誤）− 16 分鐘緩衝；到達範圍另計 ±35 分鐘浮動。",
      "type": "rule",
      "source": "API_CONTRACT.md §4.1 情景參數（演示設定，未經校準）",
      "sourceUrl": null
    },
    {
      "claim": "1 條路線因服務中斷或超出「額外車費／轉乘次數」限制而被排除，不參與評分。",
      "type": "rule",
      "source": "API_CONTRACT.md §4.2 路線過濾（硬約束先於評分）",
      "sourceUrl": null
    },
    {
      "claim": "所有緩衝、權重與信心門檻都是演示設定，未經歷史資料校準，因此只輸出定性信心，不輸出準時機率。本專案尚未完成歷史資料校準，因此沒有任何統計依據可以引用。",
      "type": "rule",
      "source": "專案範圍限制：DECISION_ENGINE.md §10 已知限制",
      "sourceUrl": null
    },
    {
      "claim": "香港天文台（天氣警告及降雨）（演示固定資料，更新於 2026-10-13 07:30）；演示固定資料（fixture），非實時；請勿當作即時路況。 待成員 B 接入後填入官方資料集連結。",
      "type": "data",
      "source": "香港天文台（天氣警告及降雨）",
      "sourceUrl": null
    },
    {
      "claim": "港鐵服務狀態（演示固定資料，更新於 2026-10-13 07:30）；演示固定資料（fixture），非實時；請勿當作即時路況。",
      "type": "data",
      "source": "港鐵服務狀態",
      "sourceUrl": null
    },
    {
      "claim": "運輸署特別交通消息（演示固定資料，更新於 2026-10-13 07:30）；演示固定資料（fixture），非實時；請勿當作即時路況。 待成員 B 接入後填入官方資料集連結。",
      "type": "data",
      "source": "運輸署特別交通消息",
      "sourceUrl": null
    },
    {
      "claim": "主路線「過海巴士（東區海底隧道）」的服務狀態（服務正常，延誤約 20 分鐘）與人流（人流高）來自本次資料快照。",
      "type": "data",
      "source": "成員 B 的 ContextSnapshot.routes",
      "sourceUrl": null
    },
    {
      "claim": "到達信心「低」由規則分數 40/100 得出；扣分項：延誤 20 分鐘（-20）、人流高（-15）、演示固定資料（-5）、本走廊有中斷事件（-10）。",
      "type": "rule",
      "source": "DECISION_ENGINE.md §7 到達信心規則",
      "sourceUrl": null
    }
  ],
  "uncertainty": [
    "本結果使用演示固定資料，並非實時路況，不能當作即時資訊。",
    "另有 1 條路線被排除，未納入本次比較；放寬限制後可能出現更好的選擇。",
    "本走廊已有路線中斷，其餘路線可能連帶受影響（例如人流轉移、替代班次擠塞）。",
    "到達信心為「低」，出發前請再確認港鐵、運輸署與香港天文台的官方公告。",
    "行動建議為「按建議時間出發」，本建議由規則與輸入資料產生，不構成出行保證。"
  ]
} as DecisionResponse,
};

/** 真實 unavailable 回應（constraints: maxExtraCost=0, maxTransfers=0）。 */
export const UNAVAILABLE_DECISION: DecisionResponse = {
  "status": "unavailable",
  "departAt": "",
  "latestDepartAt": "",
  "etaRange": [
    "",
    ""
  ],
  "confidence": "low",
  "primaryRoute": [],
  "planB": [],
  "switchCondition": "",
  "reasons": [
    "在目前的資料與你的限制條件下，沒有可行的路線建議。",
    "R1 港鐵主線（將軍澳線 → 港島線）：需要轉乘 1 次，超過上限 0 次。",
    "R2 過海巴士（東區海底隧道）：額外車費 $6，超過上限 $0。",
    "R3 港鐵（鰂魚涌轉乘）：需要轉乘 1 次，超過上限 0 次。",
    "可以放寬額外車費或轉乘次數上限，或改為較早的到達時間再試一次。"
  ],
  "dataUpdatedAt": "2026-10-13T07:30:00+08:00",
  "dataQuality": "fixture",
  "primaryPlan": null,
  "planBPlan": null,
  "candidates": [],
  "excludedRoutes": [
    {
      "routeId": "R1",
      "label": "港鐵主線（將軍澳線 → 港島線）",
      "reason": "需要轉乘 1 次，超過上限 0 次"
    },
    {
      "routeId": "R2",
      "label": "過海巴士（東區海底隧道）",
      "reason": "額外車費 $6，超過上限 $0"
    },
    {
      "routeId": "R3",
      "label": "港鐵（鰂魚涌轉乘）",
      "reason": "需要轉乘 1 次，超過上限 0 次"
    }
  ],
  "dataSources": [
    {
      "id": "hko-weather",
      "label": "香港天文台（天氣警告及降雨）",
      "url": null,
      "quality": "fixture",
      "updatedAt": "2026-10-13T07:30:00+08:00",
      "note": "演示固定資料（fixture），非實時；請勿當作即時路況。 待成員 B 接入後填入官方資料集連結。"
    },
    {
      "id": "mtr-service-status",
      "label": "港鐵服務狀態",
      "url": null,
      "quality": "fixture",
      "updatedAt": "2026-10-13T07:30:00+08:00",
      "note": "演示固定資料（fixture），非實時；請勿當作即時路況。"
    },
    {
      "id": "td-special-traffic-news",
      "label": "運輸署特別交通消息",
      "url": null,
      "quality": "fixture",
      "updatedAt": "2026-10-13T07:30:00+08:00",
      "note": "演示固定資料（fixture），非實時；請勿當作即時路況。 待成員 B 接入後填入官方資料集連結。"
    }
  ],
  "notices": [
    "本結果使用演示固定資料（fixture），並非實時路況，請勿當作即時資訊。"
  ],
  "disclaimer": "到達信心是基於演示規則的定性判斷，並非經校準的準時機率。實際出行請同時參考港鐵、運輸署與香港天文台的官方資訊。",
  "scenario": "normal",
  "serviceDate": "2026-10-13",
  "generatedFor": {
    "origin": "hang-hau-estate",
    "destination": "central-exchange-square",
    "arriveBy": "2026-10-13T09:00:00+08:00"
  },
  "action": "hold",
  "switchDeadline": "",
  "basis": [
    {
      "claim": "建議出發時間的規則：arriveBy − （行程時間 + 延誤）− 6 分鐘緩衝；到達範圍另計 ±10 分鐘浮動。",
      "type": "rule",
      "source": "API_CONTRACT.md §4.1 情景參數（演示設定，未經校準）",
      "sourceUrl": null
    },
    {
      "claim": "3 條路線因服務中斷或超出「額外車費／轉乘次數」限制而被排除，不參與評分。",
      "type": "rule",
      "source": "API_CONTRACT.md §4.2 路線過濾（硬約束先於評分）",
      "sourceUrl": null
    },
    {
      "claim": "所有緩衝、權重與信心門檻都是演示設定，未經歷史資料校準，因此只輸出定性信心，不輸出準時機率。本專案尚未完成歷史資料校準，因此沒有任何統計依據可以引用。",
      "type": "rule",
      "source": "專案範圍限制：DECISION_ENGINE.md §10 已知限制",
      "sourceUrl": null
    },
    {
      "claim": "香港天文台（天氣警告及降雨）（演示固定資料，更新於 2026-10-13 07:30）；演示固定資料（fixture），非實時；請勿當作即時路況。 待成員 B 接入後填入官方資料集連結。",
      "type": "data",
      "source": "香港天文台（天氣警告及降雨）",
      "sourceUrl": null
    },
    {
      "claim": "港鐵服務狀態（演示固定資料，更新於 2026-10-13 07:30）；演示固定資料（fixture），非實時；請勿當作即時路況。",
      "type": "data",
      "source": "港鐵服務狀態",
      "sourceUrl": null
    },
    {
      "claim": "運輸署特別交通消息（演示固定資料，更新於 2026-10-13 07:30）；演示固定資料（fixture），非實時；請勿當作即時路況。 待成員 B 接入後填入官方資料集連結。",
      "type": "data",
      "source": "運輸署特別交通消息",
      "sourceUrl": null
    }
  ],
  "uncertainty": [
    "目前沒有路線能同時滿足服務狀態與你的限制條件，因此不提供出發建議；調整限制條件或改時間後再查一次。",
    "本結果使用演示固定資料，並非實時路況，不能當作即時資訊。",
    "另有 3 條路線被排除，未納入本次比較；放寬限制後可能出現更好的選擇。",
    "行動建議為「留在安全處持續觀察」，本建議由規則與輸入資料產生，不構成出行保證。"
  ]
} as DecisionResponse;

/** 固定通勤走廊的預設地點（與 src/lib/corridor/index.ts 一致）。 */
export const ORIGINS = [
  { id: "hang-hau-estate", name: "坑口（富寧花園）" },
  { id: "hang-hau-station", name: "坑口站 A 出口" },
] as const;

export const DESTINATIONS = [
  { id: "central-exchange-square", name: "中環（交易廣場）" },
  { id: "central-ifc", name: "中環（國際金融中心二期）" },
] as const;

/** 固定示範行程（與 src/lib/fixtures/demo-request.ts 一致）。 */
export const DEMO_REQUEST = {
  origin: "hang-hau-estate",
  destination: "central-exchange-square",
  arriveBy: "2026-10-13T09:00",
  maxExtraCost: 10,
  maxTransfers: 2,
} as const;

/** 產品名稱（唯一）。 */
export const PRODUCT_NAME = "韌性出行助手";
