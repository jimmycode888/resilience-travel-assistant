# 集成指南（成員 B / C / D / E）

本文件說明每個模組的**接入點**、**可改什麼**、**不可改什麼**，以及**如何驗收**。
目標是讓四個人可以並行替換自己的模組，而不會互相破壞。

**開始前請先讀 [API_CONTRACT.md](./API_CONTRACT.md)。** 契約是唯讀的。

---

## 0. 共同規則

1. 只改自己負責的目錄。需要改別人的目錄時，先在站會提出。
2. 每次改動後執行 `npm run verify`（lint + typecheck + test + build）。
3. 主分支必須保持可運行。發現主分支壞掉時，所有相關的人優先修復，不繼續加功能。
4. 不要新增頁面、資料來源或資料庫 —— 10 月 11 日已功能凍結。
5. 不要提交真實金鑰。金鑰只放 `.env.local`（已被 `.gitignore` 忽略）。
6. 不要改 `src/lib/types/`。那裡的型別就是契約。

### 模組邊界（單向依賴）

```text
components/  ──►  api-client.ts  ──►  /api/decision  ──►  api/decision-handler
                                                                │
                                        ┌───────────────────────┴──────────────────┐
                                        ▼                                          ▼
                                  adapters/（B）                              decision/（C）
                                        │                                          │
                                        ▼                                          │
                              fixtures/context（B）                                │
                                        └──────────► corridor/（A/B 共用）◄────────┘
```

`decision/` **不得**直接呼叫網路或讀取環境變數；`adapters/` **不得**產生 DecisionResponse；
`components/` **不得**直接 import `adapters/` 或 `decision/`。

---

## 1. 成員 B：資料與後端

### 你負責的檔案

| 檔案 | 用途 |
|---|---|
| `src/lib/adapters/live-providers.ts` | 實作香港天文台與運輸署的實時來源 |
| `src/lib/adapters/index.ts` | 三層回退鏈（live → cached → fixture）；通常不需要改 |
| `src/lib/adapters/cache.ts` | 記憶體快取；TTL 可調 |
| `src/lib/fixtures/context/snapshots.ts` | 三組固定演示資料 |
| `.env.example` | 你需要的環境變數（**只放名稱，不放值**） |
| `docs/DATA_SOURCES.md` | 資料來源與限制說明（必填） |
| `docs/FIXTURE_CATALOG.md` | 三組 fixture 的欄位、預期影響與待補事項 |

### 你要填的欄位

`ContextSnapshot` 需要下列欄位（完整契約見 [API_CONTRACT.md §5](./API_CONTRACT.md)）：

| 欄位 | 你要做的事 |
|---|---|
| `collectedAt` | 實際攤取時間（ISO +08:00）。fixture 用固定值 |
| `expiresAt` | 資料失效時間。決策層用它判定過期（僅 live / cached） |
| `weather.updatedAt` | 天氣資料自己的更新時間 |
| `routes[].updatedAt` | 每條路線狀態的更新時間 |
| `routes[].affectedSegments` | 受影響區段（人類可讀），會顯示在風險提示 |
| `sources[].url` | **官方資料集連結**（fixture 目前為 `null`，請補上） |

### 做法

1. 依官方文件核對 endpoint 與欄位名稱。**不要憑記憶填寫欄位。**
2. 在 `live-providers.ts` 內把官方回應轉成：

```ts
interface LiveDataPayload {
  weather?: WeatherSnapshot;        // condition / warning / rainfallMmPerHour / temperatureC / note
  routes?: RouteServiceStatus[];    // 必須覆蓋 R1 / R2 / R3 三條 routeId
  incidents?: Incident[];
}
```

3. 逾時、HTTP 錯誤、欄位缺失時**必須 throw**，讓上層回退。回傳 `null` 代表「已設定但這次沒有資料」。
4. 完成後把對應的環境變數名稱補進 `.env.example`，並在 `docs/DATA_SOURCES.md`
   寫清楚：來源、更新頻率、涵蓋範圍、已知缺口。

### 驗收

```bash
npm run test          # api.test.ts 已包含三層回退鏈的測試
curl -s localhost:3000/api/health | grep liveDataConfigured   # 設定後應為 true
```

- 未設定環境變數時，系統必須**完全正常**運行並走 fixture（現在的行為）。
- 實時來源失敗時**不可以**回傳 500；必須標示 `cached` 或 `fixture` 並在 `notices` 說明。
- 永遠不可以把 fixture 標示成 `live`。

### 你可以自由改的

- 新增 provider、調整快取 TTL、調整 `timeoutMs`。
- 修改 fixture 內的延誤分鐘數與狀態（**但改完必須執行 `npm run fixtures:update`**）。

### 你不可以改的

- `src/lib/decision/`（那是 C 的模組）。
- `LiveDataPayload` 的欄位形狀（要改請先找 A）。

---

## 2. 成員 C：決策引擎與 GenAI

### 你負責的檔案

| 檔案 | 用途 |
|---|---|
| `src/lib/decision/thresholds.ts` | 緩衝、浮動、評分權重、信心規則（**最常改這裡**） |
| `src/lib/decision/scoring.ts` | 評分與信心計算 |
| `src/lib/decision/engine.ts` | 過濾 → 排序 → 主路線 → Plan B → 切換條件 → 理由 |
| `src/lib/corridor/index.ts` | 路線定義（與 A/B 共用；改路線要先確認） |
| `docs/DECISION_ENGINE.md` | 規則、閾值、局限與校准計畫（**你負責定稿**） |

### 決策函式的介面

```ts
decideTrip(
  request: TripRequest,
  snapshot: ContextSnapshot,
  options?: { notices?: readonly string[]; routes?: readonly RouteDefinition[]; now?: string },
): DecisionResponse
```

- `options.routes`：候選路線，預設為走廊內三條；你可以在測試中注入自訂路線。
- `options.now`：注入時鐘（ISO）。只有 `live` / `cached` 資料會被判定過期；
  `fixture` 不受時鐘影響（否則演示日過後全部變成「資料過期」）。
- 引擎**自己不會**讀取時鐘（`grep -rn "Date.now" src/lib/decision/` 必須是空的）。

**硬性要求**

- **純函式**：不讀取時鐘（不可用 `Date.now()`）、不呼叫網路、不使用隨機值。
- 不可修改傳入的 `request` 或 `snapshot`（已有測試）。
- 不可 throw 使用者可見的錯誤；`unavailable` 要用回傳值表示。
- 路線、時間、警告、切換條件**只能來自規則與資料**。

### 調整建議時的流程

1. 改 `thresholds.ts` 或 `engine.ts`。
2. `npm test` —— 會看到具體哪些情景的建議改變了。
3. `npm run smoke` —— 印出三個情景的結果表，確認新舊差異是你想要的。
4. 若**刻意**改變使用者看到的建議 → `npm run fixtures:update` 並在提交訊息說明理由。
5. 若**不小心**改變 → 修回來，不要更新黃金檔案。

### GenAI 解釋文案（若啟用）

- 只能放在 `engine.ts` **之後**：先有 `DecisionResponse`，再改寫 `reasons` 的文字。
- 不可讓模型產生或修改 `departAt`、`etaRange`、`primaryRoute`、`planB`、`switchCondition`。
- 必須有 fallback：模型失敗或逾時時直接使用規則產生的 `reasons`。
- 不可把 API Key 放在前端或用 `NEXT_PUBLIC_` 前綴。

### 驗收

```bash
npm run test          # 三個情景、邊界、確定性、黃金檔案
npm run smoke         # 三個情景各 5 次
```

---

## 3. 成員 D：前端與 QA

### 你負責的檔案

| 檔案 | 用途 |
|---|---|
| `src/app/page.tsx`、`src/app/result/page.tsx` | 頁面入口 |
| `src/app/error.tsx`、`global-error.tsx`、`not-found.tsx` | 錯誤邊界（不可刪） |
| `src/components/**` | 全部 UI 元件 |
| `src/test/` | 測試清單與回歸測試 |
| `docs/QA_CHECKLIST.md` | 狀態清單與 QA 檢查項（**你負責執行並填結果**） |
| `docs/USER_TEST_SCRIPT.md` | 使用者測試腳本與觀察表（**你負責執行**） |

### 取資料的唯一方式

```ts
import { requestDecision, DecisionApiError } from "@/lib/api-client";

const decision = await requestDecision(tripRequest);   // 已處理錯誤與契約檢查
```

**不要**自己 `fetch("/api/decision")`，也不要 import `src/lib/decision/` 或 `src/lib/adapters/`。
`api-client.ts` 會檢查回應是否符合契約，格式漂移時會立刻報錯而不是靜默壞掉。

### 必須處理的狀態（一個都不能少）

| 狀態 | 現在的實作 |
|---|---|
| 載入中 | `LoadingCard`（`use-decision.ts` 的 `phase: "loading"`） |
| 成功 | `DecisionCard` |
| 無可行路線（`status: "unavailable"`） | `UnavailableCard`，顯示 `reasons` |
| 輸入無效（400） | `ErrorNotice`，顯示 `error.details` |
| 接口失敗（500 / 網路） | `ErrorNotice` + 「重試」按鈕 |
| 路由層崩潰 | `app/error.tsx`、`app/global-error.tsx` |
| 網址參數有問題 | `DecisionView` 的 `paramIssues` 提示 |
| 資料過期 | `status: "uncertain"` + `notices` 說明（不需要新元件） |

逐項觸發方式見 [docs/QA_CHECKLIST.md §1](./docs/QA_CHECKLIST.md)。

**任何情況下都不能白屏。**

### 結果頁的第一屏必須回答三件事

1. **幾點走** —— `departAt`（大字）
2. **到達信心** —— `confidence` 標籤
3. **什麼時候切換** —— `switchCondition`

這三項是使用者測試的驗收重點（10 月 13 日：至少 4/5 人能自行找到）。

### 手機與桌面

- 斷點：單欄優先，`sm:` 以上才排成多欄。
- 觸控目標至少 44px 高；輸入框用 `inputmode` 叫出正確鍵盤。
- 驗收方式：`npm run dev` 後在手機瀏覽器開啟 `http://<你的內網 IP>:3000`，
  完整跑完「輸入 → 結果 → 切換情景」一次。

### 驗收

```bash
npm run verify
```

---

## 4. 成員 E：UI / 視覺

### 你負責的檔案

- `src/components/**` 的樣式與文案（與 D 協作）
- `tailwind.config.ts` 的字型與主題擴充
- `src/lib/labels.ts` —— 中文（香港）標籤的**唯一來源**（改文案改這裡）

### 設計限制（不是美感問題，是正確性問題）

1. **不得移除或淡化資料品質標示。** `DataFreshnessBadge` 與 `dataUpdatedAt` 必須持續可見 ——
   這是「不把演示資料偽裝成實時資料」的硬要求。
2. **不得顯示準時機率或百分比。** 只能顯示「到達信心 高／中／低」。
3. **不得用顏色單獨表達狀態**（色盲可及性）：每個狀態標籤都要有文字。
4. 風險等級用 `low`／`medium`／`high` 的文字 + 顏色，不要只靠顏色。
5. 不要把 `Plan B` 藏進折疊區 —— 它是核心賣點之一。

### 視覺一致性檢查

UI 完成後執行 `npm run dev`，在手機寬度（375px）與桌面（1280px）各走一次三個情景，
確認：文字不溢出、數字對齊、時間與狀態標籤顏色一致。

---

## 5. 全員共同驗收清單（每次提交前）

```bash
npm run verify     # lint → typecheck → test → build
npm run smoke      # 三個情景各 5 次
```

- [ ] 三個情景仍能產生不同且合理的建議
- [ ] 至少一個 `unavailable` 情境仍顯示可讀訊息（用 `arriveBy: 2026-10-13T05:45` 測試）
- [ ] 沒有新增硬編碼個人路徑或金鑰（`git grep -iE "/Users/|api[_-]?key|secret"`）
- [ ] `dataQuality` 沒有把 fixture 說成 live
- [ ] README 與 TASKS.md 已更新
