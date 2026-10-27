# 韌性出行助手（Resilience Travel Assistant）

> 把天氣與交通資訊，轉成「**幾點走、走哪條、什麼時候切換**」的可執行出行決定。
> 這不是另一款地圖，而是疊在現有導航與官方資料之上的**出行可靠性決策層**。

**這是黑客松演示原型。** 目前所有路線時間、車費與服務狀態都是**標示為 `fixture` 的固定演示資料**，
不是實時路況。介面上的「到達信心 高／中／低」是**定性判斷**，並非經校準的準時機率。

- 最終提交：2026-10-18 ｜ 功能凍結：2026-10-11
- 首版範圍：**一條固定通勤走廊**（將軍澳坑口 ↔ 中環）、3 條候選路線、3 個確定性演示情景
- 負責人：成員 A（技術架構、接口契約、集成、部署、演示穩定性）

---

## 1. 快速開始

```bash
cd resilience-travel-assistant
npm install
npm run dev          # http://localhost:3000
```

其他指令：

| 指令 | 用途 |
|---|---|
| `npm run dev` | 本機開發伺服器 |
| `npm run build` | 生產建置 |
| `npm run start` | 啟動生產伺服器（需先 build） |
| `npm run lint` | ESLint 9（flat config） |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest 單元與整合測試 |
| `npm run smoke` | **功能凍結驗收**：三個情景各連跑 5 次並輸出結果表 |
| `npm run fixtures:update` | 重新產生黃金檔案（刻意調整建議內容後才執行） |
| `npm run verify` | lint → typecheck → test → build 一次跑完 |
| `npm run probe:route` | 印出跨境候選路線表（離線 fixture，必成功） |
| `npm run probe:risk` | 印出五因子風險、可靠性與四模式排序（離線，必成功） |

環境需求：Node.js ≥ 20.11（建議 22 或 24）、npm 10+。**不需要資料庫**。

環境變數：複製 `.env.example` 為 `.env.local`。**不填任何值也能完整運行**（全部走 fixture）。
**絕對不要提交真實金鑰**；`.env*.local` 已被 `.gitignore` 忽略。

---

## 2. 核心流程

```text
使用者選擇起點、終點、最遲到達時間、限制條件、演示情景
        │                                        （成員 D：/ 輸入頁）
        ▼
POST /api/decision  ← TripRequest
        │
        ▼
資料適配層：live → cached → fixture 三層回退        （成員 B：src/lib/adapters）
        │  ContextSnapshot
        ▼
決策引擎：過濾 → 評分 → 主路線 → Plan B → 切換條件   （成員 C：src/lib/decision）
        │  DecisionResponse（結構化、確定性）
        ▼
結果頁顯示建議出發時間、到達範圍、信心、Plan B、切換條件、理由、資料時間與品質
                                             （成員 D + E：/result）
```

**硬規則**：大模型不參與路線、時間、警告或切換條件的事實判斷。規則與資料先產生結構化結果，
LLM（若啟用）只能把已有結果改寫成更自然的說明。

---

## 3. 目錄結構

```text
resilience-travel-assistant/
├── API_CONTRACT.md              # 鎖定的介面契約（唯讀，變更需全組同意）
├── INTEGRATION.md               # 成員 B / C / D 的接入點與替換方式
├── TASKS.md                     # 任務清單與驗收條件
├── README.md
├── .env.example                 # 環境變數範例（不含真實金鑰）
├── docs/
│   ├── ARCHITECTURE.md          # 分層、資料流、決策規則
│   ├── DATA_SOURCES.md          # 資料來源、狀態、已知限制
│   ├── FIXTURE_CATALOG.md       # 三組 fixture 的欄位與預期影響（成員 B）
│   ├── DECISION_ENGINE.md       # 決策規則、閾值、局限與校准計畫（成員 C）
│   ├── PHASE2_CONTRACTS.md      # ★ 第二階段凍結契約總表（Journey / Route / Risk / Reliability）
│   ├── RISK_ENGINE.md           # ★ 五因子風險規則、權重、等級、四模式排序（成員 A）
│   ├── MAP_MODULE_MIGRATION.md  # 既有專案可複用模組的遷移評估
│   ├── DEMO_RUNBOOK.md          # 演示流程、斷網演示、故障恢復
│   ├── QA_CHECKLIST.md          # 狀態清單與 QA 檢查項（成員 D）
│   ├── USER_TEST_SCRIPT.md      # 使用者測試腳本與觀察表（成員 D）
│   ├── PHASE1_ACCEPTANCE.md     # 第一階段驗收紀錄
│   └── screenshots/             # 實際畫面（供 D 的 QA 與 E 的路演材料使用）
└── src/
    ├── app/                     # Next.js App Router
    │   ├── page.tsx             # 輸入頁（/）
    │   ├── result/page.tsx      # 結果頁（/result?...）— 動態渲染
    │   ├── error.tsx / global-error.tsx / not-found.tsx   # 不會白屏
    │   └── api/
    │       ├── decision/route.ts   # POST /api/decision（薄包裝）
    │       └── health/route.ts     # GET  /api/health
    ├── components/              # 前端（成員 D 的模組）
    │   ├── TripForm.tsx         # 輸入頁表單
    │   ├── DecisionView.tsx     # 結果頁容器：loading / success / error / unavailable
    │   ├── DecisionCard.tsx     # 六項必要輸出的呈現
    │   ├── RouteTimeline.tsx    # 路線步驟時間軸
    │   ├── ScenarioSwitcher.tsx # 情景切換器
    │   ├── DataFreshnessBadge.tsx # live / cached / fixture 標示
    │   ├── states.tsx           # 共用狀態元件
    │   └── use-decision.ts      # 呼叫 /api/decision 的 hook
    ├── lib/
    │   ├── types/               # ★ 共享型別：request / context / decision / journey / route / risk / reliability
    │   ├── corridor/            # ★ 固定走廊與 3 條路線定義（唯一來源）
    │   ├── fixtures/            # ★ 三組情境快照 + 黃金檔案 + 示範請求
    │   ├── route/               # ★ 成員 A：路線供應商（fixture / OSRM）、解析器、分步指示
    │   ├── geo/                 # ★ 成員 A：口岸與地點註冊表、側別判定、距離、定位
    │   ├── risk/                # ★ 成員 A：五因子風險引擎（權重表在 thresholds.ts）
    │   ├── reliability/         # ★ 成員 A：可靠性（定性信心 + ETA 區間）與四模式排序
    │   ├── adapters/            # 成員 B：實時來源、快取、三層回退
    │   ├── decision/            # 成員 C：評分、信心、Plan B、切換條件
    │   ├── api/                 # 決策與 health 的處理邏輯（可單元測試）
    │   ├── validation.ts        # TripRequest 執行期驗證
    │   ├── api-client.ts        # 前端呼叫 API 的唯一出口
    │   ├── url-params.ts        # 輸入頁 ↔ 結果頁的參數編碼
    │   ├── time.ts              # 香港時區純函式工具
    │   └── labels.ts            # 中文（香港）標籤唯一來源
    └── test/                    # Vitest：情景、邊界、確定性、黃金檔案、凍結驗收
```

★ = 跨成員共用的檔案。**只有負責人可以修改，改完必須同步全組。**

---

## 4. 三個確定性演示情景

固定示範行程：坑口（富寧花園）→ 中環（交易廣場），最遲 2026-10-13 09:00 到達，
限制 `maxExtraCost = 10`、`maxTransfers = 2`。

| 情景 | status | 出發 | 最遲出發 | 預計到達範圍 | 信心 | 主路線 | Plan B | 被排除 |
|---|---|---|---|---|---|---|---|---|
| `normal` | ready | 08:09 | 08:15 | 08:54–09:04 | high | R1 港鐵主線（45 分） | R2 過海巴士（65 分） | — |
| `heavy_rain` | ready | 07:58 | 08:12 | 08:43–09:06 | medium | R1 港鐵主線（48 分） | R2 過海巴士（77 分） | — |
| `disruption` | uncertain | 07:22 | 07:38 | 08:24–09:19 | low | R2 過海巴士（82 分） | R3 港鐵經鰂魚涌（106 分） | R1（服務中斷） |

三個情景的建議出發時間、主路線與信心**都不同**，且全部由規則產生、可重複驗證。

候選路線（`normal` 情景的完整評分）：

| 路線 | 內容 | 基準 | 延誤 | 合計 | 轉乘 | 額外車費 | 分數 |
|---|---|---|---|---|---|---|---|
| `R1` | 港鐵主線：將軍澳線 → 北角 → 港島線 | 45 分 | +0 | 45 分 | 1 | $0 | 0.885 |
| `R3` | 港鐵經鰂魚涌轉乘 | 51 分 | +0 | 51 分 | 1 | $0 | 0.805 |
| `R2` | 過海巴士（東區海底隧道） | 62 分 | +3 | 65 分 | 0 | $6 | 0.540 |

---

## 5. 介面

完整契約見 **[API_CONTRACT.md](./API_CONTRACT.md)**。

### `GET /api/health`

```bash
curl -s http://localhost:3000/api/health
```

回傳服務狀態、版本、香港時間、走廊資訊、可用情景、每個 fixture 的擷取時間與品質、
是否已設定實時資料來源。

### `POST /api/decision`

```bash
curl -s -X POST http://localhost:3000/api/decision \
  -H 'Content-Type: application/json' \
  -d '{
    "origin": "hang-hau-estate",
    "destination": "central-exchange-square",
    "arriveBy": "2026-10-13T09:00",
    "constraints": { "maxExtraCost": 10, "maxTransfers": 2 },
    "scenario": "normal"
  }'
```

改用 `"scenario": "heavy_rain"` 或 `"disruption"` 會得到不同且合理的建議。

錯誤一律回傳穩定結構：

```json
{ "error": { "code": "INVALID_INPUT", "message": "請求格式不正確。", "details": ["arriveBy: arriveBy 不可為空。"] } }
```

| HTTP | code | 時機 |
|---|---|---|
| 400 | `INVALID_INPUT` | 格式、日期、地點或限制條件不合法；含未知欄位 |
| 405 | `METHOD_NOT_ALLOWED` | 用錯 HTTP 方法 |
| 500 | `INTERNAL_ERROR` | 上游失敗或未預期錯誤（含演示用的故障注入） |

`status: "unavailable"` **不是** HTTP 錯誤，而是有效的決策結果，回傳 `200`。

---

## 6. 介面使用方式（前端）

輸入頁提交後會把整個 `TripRequest` 編進網址並前往結果頁：

```text
/result?origin=hang-hau-estate&destination=central-exchange-square
        &arriveBy=2026-10-13T09:00&maxExtraCost=10&maxTransfers=2&scenario=normal
```

因為請求完全存在 URL 裡，所以：

- **重新整理頁面**得到相同建議；
- **分享連結**給其他成員或評審會看到一樣的畫面；
- **重複提交**不會產生隨機結果（決策引擎是純函式，且已用測試鎖定）。

結果頁也提供「查看原始 JSON」按鈕，方便 B / C / D 對照契約。

---

## 7. 已知限制

1. **`/api/decision` 仍只支援一條走廊**（坑口 ↔ 中環）。第二階段新增的**跨境走廊**（中環 → 深圳福田，經落馬洲／羅湖／深圳灣）目前以模組與探針形式交付，尚未接入網頁 API；範圍上仍不做全港路線搜尋、不做全口岸覆蓋。
2. **所有資料都是 `fixture`**。路線時間、車費與服務狀態是演示估算值，**不是官方班次或票價**。
3. **沒有真實實時資料**。`live` 情景目前會回退到固定演示資料，並在畫面上明確標示。
4. **到達信心未經校準**，只是規則分數的定性分級，不可解讀為準時機率。
5. **沒有登入、支付、社交、後台、推送、資料庫**（刻意不做）。
6. 巴士路線以「過海巴士（東區海底隧道）」描述，**未使用真實路線編號**；正式版需由成員 B 核對官方資料後填入。

---

## 8. 團隊接入位置

| 成員 | 負責模組 | 接入方式 |
|---|---|---|
| **B** 資料與後端 | `src/lib/adapters/`、`src/lib/fixtures/context/` | 實作 `LiveDataProvider` 並補齊環境變數；決策層與前端不需改動 |
| **C** 決策與 GenAI | `src/lib/decision/` | 調整 `thresholds.ts` 的權重與門檻、`engine.ts` 的規則；契約不可破壞 |
| **D** 前端與 QA | `src/app/`、`src/components/` | 只透過 `src/lib/api-client.ts` 取資料；不得改動共享型別 |
| **E** UI / 視覺 | `src/components/`、`tailwind.config.ts` | 視覺與文案微調；資訊層級以「出發時間／信心／切換條件」為第一屏 |

詳細步驟與不變條件見 **[INTEGRATION.md](./INTEGRATION.md)**。

---

## 9. 第二階段：出行決策增強層（成員 A · 風險 → 可靠性 → 排序）

第二階段把第一階段的「單一走廊決策」升級成 **真實路線 + 五因子風險 + 可靠性 + 四模式排序**。
成員 A 負責的這條鏈（路徑讀取 → 風險 → 可靠性）已完成，**全部離線可跑、無需金鑰**。

### 9.1 資料流

```text
起點 + 終點 + 出發時間
   │
   ▼
Route Adapter：live（OSRM，零金鑰）→ cached → fixture        src/lib/route/adapter.ts
   │  CandidateRoute（含 Journey / Segment / 跨境段 kind / 口岸排隊區間）
   ▼
Risk Engine：weather / crowd / disruption / transfer / border   src/lib/risk/
   │  RouteRisk（五因子分數 + 權重 + 可溯源 claim / evidence / source）
   ▼
Reliability + Ranking：定性準時信心 + ETA 區間 + 四模式排序      src/lib/reliability/
```

> ⚠️ 目前這條鏈以**模組 + 探針**形式交付，**尚未接入 `/api/decision` 與網頁**；
> 接入屬後續集成工作。`/api/decision` 的行為與第一階段完全相同。

### 9.2 五因子權重（先定死、不調參）

| 行程類型 | 天氣 | 人流 | 服務中斷 | 轉乘 | 通關 |
|---|---|---|---|---|---|
| 境內 | 0.25 | 0.25 | 0.35 | 0.15 | 0 |
| 跨境 | 0.15 | 0.20 | 0.25 | 0.10 | **0.30** |

權重總和為 1；`border` 為 0 時其餘因子按比例歸一化。

### 9.3 四種路線模式（只調權重，不換算法）

| 模式 | 時間權重 | 風險權重 | 風險因子倍率 |
|---|---|---|---|
| `fastest` 最快 | 0.7 | 0.3 | 全部 1 |
| `reliable` 最穩 | 0.35 | 0.65 | disruption ×1.6、transfer ×1.4、weather ×1.2、border ×1.2 |
| `less_crowded` 較不擠 | 0.35 | 0.65 | crowd ×2.2 |
| `balanced` 均衡 | 0.5 | 0.5 | 全部 1 |

排序時**先依該模式重算風險、再排序**（`rankCandidates`），否則模式差異不會生效。

### 9.4 誠實性硬約束（延續第一階段產品倫理）

- 風險只輸出 **低／中／高** 三級 + 可信度，**不聲稱知道精確人數或精確排隊分鐘數**。
- 口岸排隊一律是 **區間 + 置信度**，並標示「估算」。
- 準時信心是 **定性分級**，不是校準過的準時機率；必須同時顯示 `confidenceNote`。
- 每個因子都帶 `claim / evidence / source`，任何結論都能回指規則或資料。
- 資料品質為 `fixture` / `cached` 時，可信度**不得**為「高」。

### 9.5 驗收方式

```bash
npm run test        # 含 src/test/risk-engine.test.ts、src/test/reliability-ranking.test.ts
npm run probe:risk  # 人工核對：五因子明細 + 四模式排序（含合成對照組）
npm run verify      # lint → typecheck → test → build
```

規則全文見 **[docs/RISK_ENGINE.md](./docs/RISK_ENGINE.md)**，契約見 **[docs/PHASE2_CONTRACTS.md](./docs/PHASE2_CONTRACTS.md)**。

---

## 10. 相關文件

- [API_CONTRACT.md](./API_CONTRACT.md) — 鎖定的請求／回應契約與錯誤碼
- [INTEGRATION.md](./INTEGRATION.md) — B / C / D 的接入、替換與驗收方式
- [TASKS.md](./TASKS.md) — 任務清單、驗收條件與狀態
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — 分層責任、資料流、決策規則
- [docs/PHASE2_CONTRACTS.md](./docs/PHASE2_CONTRACTS.md) — 第二階段凍結契約總表（Journey / Route / Risk / Reliability）
- [docs/RISK_ENGINE.md](./docs/RISK_ENGINE.md) — 五因子風險規則、權重、等級與四模式排序
- [docs/MAP_MODULE_MIGRATION.md](./docs/MAP_MODULE_MIGRATION.md) — 既有專案可複用模組的遷移評估
- [docs/DATA_SOURCES.md](./docs/DATA_SOURCES.md) — 資料來源、品質標示與限制
- [docs/FIXTURE_CATALOG.md](./docs/FIXTURE_CATALOG.md) — 三組演示資料的欄位與預期影響
- [docs/DECISION_ENGINE.md](./docs/DECISION_ENGINE.md) — 評分規則、閾值、局限與校準計畫
- [docs/DECISION_CONTRACT_CHANGE_REQUEST.md](./docs/DECISION_CONTRACT_CHANGE_REQUEST.md) — C 的介面契約 v1 接入記錄與待 A 決定的變更
- [docs/contracts/](./docs/contracts/) — 外部／歷史契約存檔（含來源與走廊差異說明）
- [docs/DEMO_RUNBOOK.md](./docs/DEMO_RUNBOOK.md) — 演示腳本、斷網演示、故障恢復
- [docs/QA_CHECKLIST.md](./docs/QA_CHECKLIST.md) — 狀態清單與 QA 檢查項
- [docs/USER_TEST_SCRIPT.md](./docs/USER_TEST_SCRIPT.md) — 使用者測試腳本
- [docs/PHASE1_ACCEPTANCE.md](./docs/PHASE1_ACCEPTANCE.md) — 第一階段驗收紀錄
- [docs/screenshots/](./docs/screenshots/) — 實際畫面截圖（手機／桌面 × 三個情景）
