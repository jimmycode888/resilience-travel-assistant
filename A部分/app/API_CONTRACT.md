# API 契約（已鎖定）

> **契約所有者：成員 A。** 這份文件描述的是**凍結的介面**。
> 任何欄位的新增、刪除、改名或型別變更，都必須先更新本文件、更新
> `src/lib/types/`，並同步通知成員 B / C / D。

契約的程式碼來源（唯一真相）：

| 契約 | 檔案 |
|---|---|
| `TripRequest` | `src/lib/types/request.ts` |
| `ContextSnapshot`（B → C 的內部契約） | `src/lib/types/context.ts` |
| `DecisionResponse` | `src/lib/types/decision.ts` |
| 錯誤結構 | `src/lib/api/errors.ts` |

---

## 1. 共同規則

1. **所有時間都是 ISO 8601 字串。** 進入系統時可為 `YYYY-MM-DDTHH:mm`（解讀為香港時間 UTC+8）
   或帶偏移量的完整 ISO；**回應中的時間一律是 `YYYY-MM-DDTHH:mm:ss+08:00`**。2. **顯示層才轉換時區。** 伺服器與決策層永不使用「現在時間」來計算建議。
3. **未知欄位會被拒絕。** 請求與 `constraints` 都是 strict schema；多送欄位會得到
   `400 INVALID_INPUT`。這是刻意的：及早暴露各模組的格式漂移。
4. **決策結果必須是結構化且確定性的。** 相同輸入永遠得到相同輸出。
5. **資料品質必須誠實標示。** `fixture` 不得標成 `live`。
6. **大模型不得產生路線事實。** 路線、時間、警告、切換條件只能來自規則與資料。

---

## 2. `POST /api/decision`

### 2.1 請求：`TripRequest`

```json
{
  "origin": "hang-hau-estate",
  "destination": "central-exchange-square",
  "arriveBy": "2026-10-13T09:00",
  "constraints": { "maxExtraCost": 10, "maxTransfers": 2 },
  "scenario": "normal"
}
```

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `origin` | `string` | ✓ | 走廊內的預設起點 **ID 或名稱** |
| `destination` | `string` | ✓ | 走廊內的預設終點 **ID 或名稱** |
| `arriveBy` | `string` | ✓ | 最遲到達時間。`YYYY-MM-DDTHH:mm`（香港時間）或帶偏移量的 ISO 8601 |
| `constraints.maxExtraCost` | `number` | ✓ | 整數，`0–500`。相對最便宜候選路線可接受的額外車費（HKD）。`0` 表示只接受免費方案 |
| `constraints.maxTransfers` | `number` | ✓ | 整數，`0–5`。可接受的轉乘次數上限 |
| `scenario` | `"live" \| "normal" \| "heavy_rain" \| "disruption"` | ✓ | 演示情景。`live` 會嘗試實時資料，失敗時自動回退 |

可接受的 `origin` / `destination`（首版固定走廊）：

| role | ID | 名稱 |
|---|---|---|
| origin | `hang-hau-estate` | 坑口（富寧花園） |
| origin | `hang-hau-station` | 坑口站 A 出口 |
| destination | `central-exchange-square` | 中環（交易廣場） |
| destination | `central-ifc` | 中環（國際金融中心二期） |

傳入其他地點會得到 `400 INVALID_INPUT`，訊息中會列出可接受的值。
**不做全港任意路線搜尋**（見專案範圍限制）。

除錯專用（僅在 `ALLOW_FAULT_INJECTION=1` 時生效，會被驗證前剝離）：

```json
{ "faultInjection": "internal_error" }
```

`"internal_error"` 回傳 500；`"delay"` 延遲約 2.5 秒後正常回應（用來示範載入狀態）。
**正式對外版本必須保持 `ALLOW_FAULT_INJECTION=0`。**

### 2.2 回應：`DecisionResponse`

```json
{
  "status": "ready",
  "departAt": "2026-10-13T08:09:00+08:00",
  "latestDepartAt": "2026-10-13T08:15:00+08:00",
  "etaRange": ["2026-10-13T08:54:00+08:00", "2026-10-13T09:04:00+08:00"],
  "confidence": "high",
  "primaryRoute": [ /* RouteStep[] */ ],
  "planB": [ /* RouteStep[] */ ],
  "switchCondition": "若出發前將軍澳線延誤超過 10 分鐘，改行 Plan B：…",
  "reasons": ["…"],
  "dataUpdatedAt": "2026-10-13T07:30:00+08:00",
  "dataQuality": "fixture",

  "primaryPlan": { /* RoutePlan */ },
  "planBPlan": { /* RoutePlan | null */ },
  "candidates": [ /* RoutePlan[]，依分數排序 */ ],
  "excludedRoutes": [{ "routeId": "R1", "label": "…", "reason": "服務中斷（…）" }],
  "dataSources": [{ "id": "…", "label": "…", "quality": "fixture", "updatedAt": "…", "note": "…" }],
  "notices": ["…"],
  "disclaimer": "…",
  "scenario": "normal",
  "serviceDate": "2026-10-13",
  "generatedFor": { "origin": "坑口（富寧花園）", "destination": "中環（交易廣場）", "arriveBy": "2026-10-13T09:00:00+08:00" }
}
```

#### 鎖定欄位

| 欄位 | 型別 | 說明 |
|---|---|---|
| `status` | `"ready" \| "uncertain" \| "unavailable"` | 見 §2.4 |
| `departAt` | `string` | **建議出發時間**（離開起點）。`unavailable` 時為 `""` |
| `etaRange` | `[string, string]` | `[最早到達, 最遲到達]`。`unavailable` 時為 `["", ""]` |
| `confidence` | `"high" \| "medium" \| "low"` | **定性**到達信心。`unavailable` 時固定 `"low"` |
| `primaryRoute` | `RouteStep[]` | 主路線步驟。`unavailable` 時為 `[]` |
| `planB` | `RouteStep[]` | 備用路線步驟；沒有可用 Plan B 時為 `[]` |
| `switchCondition` | `string` | 明確的切換條件。沒有 Plan B 或 `unavailable` 時為 `""` |
| `reasons` | `string[]` | 推薦理由，全部由規則與資料產生 |
| `dataUpdatedAt` | `string` | 資料更新時間（來自快照，非「現在」） |
| `dataQuality` | `"live" \| "cached" \| "fixture"` | 本次結果實際使用的資料品質 |

#### 附加欄位（additive）

前端**必須容忍**這些欄位缺失（它們讓 UI 更完整，但不是最小契約）：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `latestDepartAt` | `string` | 不計額外緩衝的最遲起程時間 = `departAt + 該情景的緩衝分鐘` |
| `primaryPlan` / `planBPlan` | `RoutePlan \| null` | 主路線／Plan B 的完整評估結果（時間、風險、分數） |
| `candidates` | `RoutePlan[]` | 所有通過限制條件的候選路線，依分數由高至低排序 |
| `excludedRoutes` | `ExcludedRoute[]` | 被限制條件或中斷排除的路線與原因 |
| `dataSources` | `DataSourceInfo[]` | 資料來源、品質與更新時間 |
| `notices` | `string[]` | 回退、資料品質、日期不一致、排除路線等提醒 |
| `disclaimer` | `string` | 免責聲明：信心不是校準過的準時機率 |
| `scenario` | `Scenario` | 回顯請求的情景 |
| `serviceDate` | `string` | 本次結果實際使用的服務日（香港時區） |
| `generatedFor` | `object` | 回顯解析後的地點名稱與正規化後的 `arriveBy` |

#### `RouteStep`

```ts
{
  id: string;                 // 穩定 ID，如 "R1-ride-tko"
  mode: "walk" | "mtr" | "bus" | "minibus" | "tram" | "ferry";
  line: string | null;        // "將軍澳線"；步行段為 null
  from: string;
  to: string;
  departAt: string;           // ISO +08:00
  arriveAt: string;           // ISO +08:00
  durationMinutes: number;
  instruction: string;        // 「乘將軍澳線（往北角方向）至北角站」
  note: string | null;        // 該路線的服務狀態說明（掛在最長的行車段）
}
```

**不變條件**（已由測試鎖定）：`steps[0].departAt === plan.departAt`、
`steps[n-1].arriveAt === plan.arriveAt`、相鄰步驟時間連續、`Σ durationMinutes === plan.durationMinutes`。

#### `RoutePlan`（附加）

```ts
{
  routeId: string; label: string; summary: string; steps: RouteStep[];
  departAt: string; arriveAt: string;
  accessWalkMinutes: number;      // 由起點步行至上車點的時間
  durationMinutes: number;        // 含延誤
  baseDurationMinutes: number;    // 不含延誤
  delayMinutes: number;
  transfers: number;
  extraCostHkd: number;
  status: "ok" | "delayed" | "disrupted" | "unknown";
  crowding: "low" | "medium" | "high" | "unknown";
  riskNotes: string[];
  score: number;                  // 0–1，演示規則，未經校準
}
```

### 2.3 錯誤回應

```json
{ "error": { "code": "INVALID_INPUT", "message": "請求格式不正確。", "details": ["arriveBy: arriveBy 不可為空。"] } }
```

| HTTP | `code` | 時機 | 前端行為 |
|---|---|---|---|
| 400 | `INVALID_INPUT` | 格式、日期、地點或限制條件不合法；含未知欄位 | 顯示 `message` 與 `details`，提供返回輸入頁 |
| 405 | `METHOD_NOT_ALLOWED` | 用錯 HTTP 方法 | 顯示錯誤 |
| 500 | `INTERNAL_ERROR` | 上游失敗、未預期錯誤、故障注入 | 顯示可讀訊息並提供「重試」 |

`error.code` 是穩定列舉，前端**不得**依賴 `message` 的文字內容做判斷。

### 2.4 `status` 判定規則

| `status` | 條件 | 使用者應該做什麼 |
|---|---|---|
| `ready` | 有可行路線，且到達信心不是 `low`，且**有**可用 Plan B | 依建議出發時間行動，記住切換條件 |
| `uncertain` | 有可行路線，但到達信心為 `low`，**或**沒有可用 Plan B | 可以出發，但要預留更多時間並自行留意官方資訊 |
| `unavailable` | 沒有任何路線能同時滿足服務狀態與限制條件 | 依 `reasons` 調整限制條件、改時間或改用其他方式 |

`unavailable` 一定回傳 HTTP `200`：它是**有效的決策結果**，不是伺服器錯誤。
判斷結果是否可行動請用 `isActionable(response)`（`src/lib/types/decision.ts`），
不要自己檢查 `departAt !== ""`。

---

## 3. `GET /api/health`

```json
{
  "status": "ok",
  "service": "resilience-travel-assistant",
  "version": "0.1.0",
  "time": "2026-10-06T09:51:02+08:00",
  "uptimeSeconds": 6,
  "corridor": { "id": "tko-hang-hau-to-central", "name": "將軍澳（坑口）↔ 中環" },
  "scenarios": ["normal", "heavy_rain", "disruption"],
  "fixtures": {
    "normal": { "collectedAt": "2026-10-13T07:30:00+08:00", "expiresAt": "2026-10-13T08:00:00+08:00", "quality": "fixture" },
    "heavy_rain": { "collectedAt": "2026-10-13T07:30:00+08:00", "expiresAt": "2026-10-13T08:00:00+08:00", "quality": "fixture" },
    "disruption": { "collectedAt": "2026-10-13T07:30:00+08:00", "expiresAt": "2026-10-13T08:00:00+08:00", "quality": "fixture" }
  },
  "liveDataConfigured": false,
  "allowFaultInjection": false
}
```

`liveDataConfigured: false` 明確表示目前沒有接上任何實時來源 —— 演示時可以直接用這一頁回答
「這是真資料嗎？」。

---

## 4. 決策規則（契約的一部分：使用者看到的數字從哪來）

所有門檻都在 `src/lib/decision/thresholds.ts`，可 review、可測試。

### 4.1 時間計算

```text
基準時間 base        = Σ(各段行車時間 + 候車時間 + 步行時間)
有效時間 effective   = base + 該路線的延誤分鐘
最遲出發 latest      = arriveBy − effective
建議出發 departAt    = latest − 該情景的緩衝分鐘
最早到達             = departAt + base
最遲到達             = departAt + effective + 該情景的浮動分鐘
```

| 情景 | 緩衝（分鐘） | 浮動（分鐘） | 鐵路延誤切換門檻 | Plan B 候車切換門檻 |
|---|---|---|---|---|
| `live` | 8 | 15 | 10 分 | 15 分 |
| `normal` | 6 | 10 | 10 分 | 15 分 |
| `heavy_rain` | 14 | 20 | 15 分 | 20 分 |
| `disruption` | 16 | 35 | 10 分 | 15 分 |

`latestDepartAt` 就是上面的「最遲出發」。`departAt` 已經包含緩衝，因此介面上寫的是
「建議 08:09 出發，不遲於 08:15 起程」。

### 4.2 路線過濾（排除條件）

一條路線會被排除，若符合任一項：

1. `status === "disrupted"`（服務中斷）
2. `transfers > maxTransfers`
3. `extraCostHkd > maxExtraCost`
4. 需要的出發時間早於首班服務時間 `05:30`（或落在前一日）

全部被排除時 → `status: "unavailable"`，`excludedRoutes` 會逐條說明原因。

### 4.3 評分（0–1）

```text
分數 = 0.40 × 時間分（最快者 1、最慢者 0，線性內插）
     + 0.25 × 服務狀態分（ok 1.0 / delayed 0.6 / unknown 0.5 / disrupted 0）
     + 0.15 × 轉乘分（1 − transfers / maxTransfers）
     + 0.10 × 人流分（low 1.0 / medium 0.6 / unknown 0.4 / high 0.25）
     + 0.10 × 費用分（1 − extraCostHkd / maxExtraCost）
```

分數相同時按路線 ID 排序，確保結果完全可重現。

### 4.4 主路線與 Plan B

- **主路線** = 分數最高的候選路線。
- **Plan B** = 分數最高的**不同主要運輸方式**候選路線（鐵路 ↔ 路面）。
  這樣 Plan B 才能對抗與主路線不同的失效模式；沒有其他方式時才退回次高分路線。
- 只有一條可行路線時 `planB = []`、`switchCondition = ""`，且 `status` 至少為 `uncertain`。

### 4.5 到達信心

以 0–100 的規則分數計算，起始分依主路線狀態（`ok` 90／`delayed` 60／`unknown` 45），再扣分：

| 扣分項 | 分數 |
|---|---|
| 延誤（每 1 分鐘扣 1 分，最多扣 25 分） | −1/分 |
| 人流 `high` | −15 |
| 人流 `unknown` | −10 |
| 轉乘次數 ≥ 2 | −10 |
| 緩衝 < 5 分鐘 | −15 |
| 資料品質為 `fixture` | −5 |
| 資料品質為 `cached` | −5 |
| 本走廊存在任何中斷路線 | −10 |

`≥ 70` → `high`；`45–69` → `medium`；`< 45` → `low`。

> ⚠️ **這是定性分級，不是準時機率。** 未經歷史資料校準前，介面與文件都不得聲稱準確的
> 準時概率。這是產品範圍的硬限制。

### 4.6 資料過期（`expiresAt`）

當資料品質為 `live` 或 `cached`，且伺服器現在時間超過 `snapshot.expiresAt` 時：

- `confidence` **強制降為 `low`** → `status` 變成 `uncertain`（不假裝確定）；
- 顯示的規則分數一併壓到 45 以下，避免「信心低但分數 85/100」的矛盾敘述；
- 回應加一條說明資料過期時間的 `notice` 與 `reasons` 條目。

`fixture` **不套用**此規則：它是刻意標示的演示樣本；若套用實時效期，演示日過後整個介面
會變成「資料過期」。fixture 的誠實訊號是「演示固定資料 + 固定 `collectedAt`」標示。

### 4.7 資料品質欄位的責任分工

| 欄位 | 生產者 | 消費者 |
|---|---|---|
| `collectedAt` | B（適配層） | 決策層（→ `dataUpdatedAt`）、UI |
| `expiresAt` | B（適配層） | 決策層（過期判斷） |
| `quality` | B（適配層） | 決策層（扣分）、UI（標示）、`/api/health` |
| `weather.updatedAt` / `routes[].updatedAt` | B | UI（資料來源區塊） |
| `sources[].url` | B（官方資料集連結） | UI、文件、路演說明 |

---

## 5. `ContextSnapshot`（B → C 的內部契約）

決策層只讀這個結構，不直接呼叫外部 API。完整型別見 `src/lib/types/context.ts`。

```ts
interface ContextSnapshot {
  scenario: Scenario;              // 這份資料所屬的情景
  serviceDate: string;             // "2026-10-13"（香港時區）
  collectedAt: string;             // 資料攤取時間 → 成為回應的 dataUpdatedAt
  expiresAt: string;               // 資料失效時間（僅 live / cached 會被檢查）
  quality: "live" | "cached" | "fixture";
  weather: {
    condition: "clear" | "cloudy" | "rain" | "heavy_rain" | "storm";
    warning: string | null;        // "黑色暴雨警告信號"
    rainfallMmPerHour: number | null;
    temperatureC: number | null;
    note: string | null;
    updatedAt: string;             // 天氣資料自己的更新時間
  };
  routes: Array<{                  // 對應成員 B 指令書的 "transit"
    routeId: string;               // 必須覆蓋 R1 / R2 / R3
    status: "ok" | "delayed" | "disrupted" | "unknown";
    delayMinutes: number;
    crowding: "low" | "medium" | "high" | "unknown";
    note: string | null;
    affectedSegments: string[];
    updatedAt: string;
  }>;
  incidents: Array<{ id; kind; title; detail; since }>;
  sources: Array<{ id; label; url: string | null; quality; updatedAt; note }>;
}
```

**B 必須遵守的三條規則**

1. 上游欄位缺失時要明確回報 `unknown` 或 `null`，**不得編造**。
2. `quality` 必須反映實際命中的那一層，永遠不得把 fixture 標成 live。
3. 路線狀態必須覆蓋走廊內全部 `routeId`；缺少的路線會被決策層視為 `unknown`
   並降低到達信心（不會被當成「服務正常」）。

---

## 6. 契約變更流程

1. 提出變更理由與影響範圍（哪些成員會受影響）。
2. 由成員 A 更新本文件 + `src/lib/types/`。
3. 執行 `npm run verify`；若使用者可見的建議改變，需執行 `npm run fixtures:update`
   並在 PR 說明中解釋為什麼建議應該改變。
4. 在站會上通知 B / C / D。
