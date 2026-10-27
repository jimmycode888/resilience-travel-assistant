# B / C ↔ A 連接完整性與正確性驗證報告

**驗證對象：** 成員 B（資料適配層）與成員 C（決策引擎）是否已與成員 A 的骨架、共享型別與 API 契約完整、正確地接上。
**驗證日期：** 2026-10-06　**驗證人：** A（技術負責人）／本次為獨立覆核
**結論：** ✅ **連接完整且正確，可進入下一階段。** 無連接性 Bug；僅有 2 項已知待辦（1 項文件登錄、1 項 B 的實時來源）與 1 項可選的架構潔癖建議。

---

## 0. 一句話結論

B 的 `ContextSnapshot` 能完整流進 C 的 `decideTrip`，輸出符合 A 鎖定的 `DecisionResponse`，
`/api/decision` 的三情景與 `live` 回退在真實 HTTP 下全部通過；靜態分層依賴單向、無循環。
唯一「尚不完整」之處是 **C 新增的 4 個 additive 欄位尚未回寫 `API_CONTRACT.md` §2.2**（已在 C 的變更申請中列出，等 A 登錄），
以及 **B 的官方實時來源與 `sources[].url` 尚待接入** —— 兩者都是**刻意保留給後續階段**，不是連接斷裂。

---

## 1. 驗證方法（可重現）

| # | 方法 | 指令 / 腳本 | 結果 |
|---|---|---|---|
| 1 | 全量門檻 | `npm run verify`（lint → typecheck → test → build） | ✅ 全綠 |
| 2 | 單元／契約測試 | `npx vitest run` | ✅ 13 檔案 / **154 tests** 全過 |
| 3 | 黃金檔案回歸 | `src/test/golden.test.ts` | ✅ 三情景輸出鎖定、未漂移 |
| 4 | 凍結冒煙 | `npm run smoke`（三情景各 5 次 = 15 次） | ✅ 15/15 一致 |
| 5 | **執行期端到端** | 生產建置 `next start`，獨立腳本對 `POST /api/decision`、`GET /api/health` 做 **83 項**斷言 | ✅ **83/83 通過** |
| 6 | 靜態分層依賴 | `grep` 檢查 decision / adapters / components 的 import 方向 | ✅ 單向、無越界 |

> 端到端腳本刻意**不**使用專案自己的 `isDecisionResponse()` 或 fixture 常數，
> 改由外部重新檢查鎖定欄位、ISO 格式、時間單調性、品質標示與三情景差異，以避免「測試自己」。

---

## 2. 連接鏈路核對（B → A → C）

實際呼叫路徑（與 `docs/ARCHITECTURE.md §3` 一致）：

```text
POST /api/decision
  └─ app/api/decision/route.ts            A  解析 JSON、HTTP 狀態碼
      └─ lib/api/decision-handler.ts       A  validateTripRequest → resolveContext → decideTrip
          ├─ lib/adapters/index.ts         B  resolveContext({scenario}) → ContextResolution{snapshot, notices, quality, tier}
          │    └─ fixtures/context         B  normal / heavy_rain / disruption 三組快照
          └─ lib/decision/engine.ts        C  decideTrip(request, snapshot, {notices, now}) → DecisionResponse
```

| 檢查項 | 契約位置 | 實際 | 判定 |
|---|---|---|---|
| B 的輸出型別 = C 的輸入型別 | `ContextSnapshot` (`types/context.ts`) | adapters 回傳它、engine 只讀它 | ✅ 同一型別，無轉接層漂移 |
| A 把 B 的 `notices` / `quality` 傳下去 | handler → `decideTrip({notices, now})` | 回應 `notices` 含 fallback 訊息、`dataQuality` 反映實際層級 | ✅ |
| A 的時鐘由呼叫端注入，決策層不讀時鐘 | `options.now = toHkIso(Date.now())` | `grep Date.now src/lib/decision/` = 空 | ✅ 純函式 |
| 回應欄位由 C 產生、A 不改寫 | `route.ts` 直接回傳 `result.body` | 鎖定 + additive 欄位齊全 | ✅ |
| 錯誤結構穩定 | `lib/api/errors.ts` | 400 / 405 / 500 形狀一致 | ✅ |

---

## 3. 執行期端到端結果（83/83 通過）

### 3.1 三情景 + live 摘要（真實 HTTP 回應）

```text
normal      status=ready     conf=high   depart=08:09 主=R1 PlanB=R2 action=depart_at dq=fixture
heavy_rain  status=ready     conf=medium depart=07:58 主=R1 PlanB=R2 action=depart_at dq=fixture
disruption  status=uncertain conf=low    depart=07:22 主=R2 PlanB=R3 action=depart_at dq=fixture
live        status=ready     conf=high   depart=08:07 主=R1 PlanB=R2 action=depart_at dq=fixture   ← 無來源時回退
```

- 三情景主路線 / 信心 / 出發時間**互不相同且合理**：暴雨加緩衝、中斷改走 R2 並排除 R1。
- `live` 在未設定環境變數時**正確回退**到 fixture，並在 `notices` 說明，未 500。

### 3.2 契約欄位完整性

| 類別 | 欄位 | 結果 |
|---|---|---|
| 鎖定欄位 | `status, departAt, latestDepartAt, etaRange, confidence, primaryRoute, planB, switchCondition, reasons, dataUpdatedAt, dataQuality` | ✅ 4/4 情景全部齊全 |
| additive 欄位 | `primaryPlan, planBPlan, candidates, excludedRoutes, dataSources, notices, disclaimer, scenario, serviceDate, generatedFor, action, switchDeadline, basis, uncertainty` | ✅ 4/4 情景全部齊全 |

### 3.3 不變條件與一致性（逐情景斷言）

- ✅ `departAt` 皆為 `YYYY-MM-DDTHH:mm:ss+08:00`。
- ✅ `etaRange` 為 [最早, 最遲] 且有序。
- ✅ `departAt === primaryPlan.departAt`；末步行車 `arriveAt === primaryPlan.arriveAt`（步驟加總一致）。
- ✅ 有 Plan B 時 `switchCondition` 非空、且 `planBPlan.routeId ≠ primaryPlan.routeId`；無 Plan B 時 `switchCondition === ""`。
- ✅ `dataSources` 非空、品質值合法；`dataUpdatedAt` 來自快照（非「現在」）。
- ✅ `basis` 非空且**無 `statistics`**（未校準前不得宣稱統計依據）；`uncertainty` 存在。

### 3.4 資料誠實性（fixture 不得冒充 live）

- ✅ 三情景 `dataQuality === "fixture"`，且所有 `sources[].quality === "fixture"`。
- ✅ `disruption` 正確排除中斷路線 R1，主路線改為 R2。

### 3.5 確定性與邊界

- ✅ 同輸入連續兩次請求，`disruption` 回應 **byte-for-byte 相同**。
- ✅ 未知欄位 → `400 INVALID_INPUT`；無效 `arriveBy` → `400 INVALID_INPUT`。
- ✅ `arriveBy: 2026-10-13T05:45`（低於首班 05:30 可達範圍）→ **HTTP 200 + `status: "unavailable"`**（有效決策結果，非 500）。
- ✅ `GET /api/health` → 200、`status: ok`、三情景皆回報 `quality: "fixture"`、`liveDataConfigured: false`。
- ✅ 頁面 `/` 與 `/result?...` 皆 200；`GET /api/decision` → 405；未知路由 → 404。**無白屏。**

---

## 4. 靜態分層依賴核對

| 規則（`INTEGRATION.md §0` / `ARCHITECTURE.md §2`） | 檢查 | 結果 |
|---|---|---|
| `decision/` 不得呼叫網路、讀環境變數、讀時鐘、用隨機值 | `grep -E "adapters\|fixtures\|process.env\|fetch(\|Date.now\|Math.random" src/lib/decision/` | ✅ 無命中 |
| `adapters/` 不得產生 `DecisionResponse` | `grep -E "DecisionResponse\|decideTrip" src/lib/adapters/` | ✅ 無命中 |
| `components/` 不得 import `adapters/` 或 `decision/` | `grep -E "@/lib/(adapters\|decision)" src/components/` | ✅ 無命中 |
| 契約門檻與文件一致 | `thresholds.ts` ↔ `API_CONTRACT.md §4.1`（8/15、6/10、14/20、16/35 等） | ✅ 逐項相符 |

---

## 5. 待辦與建議（不影響「連接正確」的判定）

### 5.1 ⚠️ 文件登錄缺口（P1，屬 A 的收尾）
C 已實作並通過測試的 4 個 additive 欄位 —— `action`、`switchDeadline`、`basis`、`uncertainty` ——
目前**尚未列入 `API_CONTRACT.md §2.2 的 additive 表**。程式碼與 `types/decision.ts` 已就緒，屬純文件滯後。
→ 依 C 的 `docs/DECISION_CONTRACT_CHANGE_REQUEST.md §4` 待 A 決定的第 1 項，建議於 10/11 前登錄，避免 D/E 誤判可用欄位。

### 5.2 ⚠️ B 的實時來源尚未接入（P1，刻意保留）
- `/api/health` 目前 `liveDataConfigured: false`；`fixtures` 的 `sources[].url` 皆為 `null`。
- 運輸署 provider 會**刻意 throw**（XML 路線映射未定案），因此 `live` 若未設 HKO 變數會直接回退 fixture。
- 這是 B 指令書的既定進度（10/7–10/9），**非連接缺陷**；回退鏈本身已由 5 個測試驗證。

### 5.3 ℹ️ 可選潔癖（P2）
`src/components/TripForm.tsx` 直接 `import { DEMO_REQUEST } from "@/lib/fixtures/demo-request"` 作為預設值。
現行 `INTEGRATION.md` 只禁止 components import `adapters/` / `decision/`，故此寫法**不違規**；
但 `ARCHITECTURE.md §2` 寫明展示層「唯一依賴：api-client.ts」。
若日後要嚴格化，可改由 `app/` 頁面把 `initialRequest` 當 prop 傳入（元件已支援 `initialRequest` prop），成本極低。

---

## 6. 驗收結論

| 問題 | 判定 |
|---|---|
| B 是否完整接上 A？ | ✅ 適配層以 `ContextSnapshot` 為唯一輸出，經 `resolveContext` 對接 A 的 handler；三情景 + 回退鏈測試通過。 |
| C 是否完整接上 A？ | ✅ `decideTrip` 簽名與 A 的呼叫完全一致；輸出滿足全部鎖定欄位與 additive 欄位。 |
| 連接是否正確？ | ✅ 83/83 端到端斷言、154 單元測試、build 全綠；時間、品質、Plan B、切換條件、確定性皆正確。 |
| 有無破壞性缺口？ | ❌ 無。僅 5.1 文件登錄與 5.2 B 實時來源兩項已知待辦。 |

**建議：** 連接驗收**通過**，可進入 D 的 QA 與 10/11 功能凍結；A 於凍結前完成 §5.1 的文件登錄。
