# 技術架構

## 1. 技術棧與選擇理由

| 選擇 | 版本 | 理由 |
|---|---|---|
| Next.js（App Router） | 15.5 | 同一份專案同時提供頁面與 API Route，部署簡單，不需要另外架後端 |
| TypeScript（strict） | 5.9 | 共享型別就是接口契約；`noUncheckedIndexedAccess` 讓陣列存取不會悄悄變成 `undefined` |
| Tailwind CSS | 3.4 | 快速做出可用的行動優先版面，不需要設計系統 |
| Zod | 3.25 | 執行期輸入驗證；`strict()` 讓各模組的格式漂移立刻變成 400 |
| Vitest | 3.2 | 純函式決策層需要快速、無瀏覽器的測試 |
| ESLint 9（flat config） | — | `next/core-web-vitals` + `next/typescript` |

**刻意不使用**：資料庫、ORM、狀態管理函式庫、UI 元件庫、地圖 SDK、LLM SDK。
理由：黑客松 MVP 要在 6 天內凍結功能，且要能在**斷網**環境下演示。

## 2. 分層與責任

```text
┌──────────────────────────────────────────────────────────────┐
│ 展示層  src/app + src/components                    （D / E）  │
│ 責任：只做輸入、顯示與狀態處理。不計算任何路線事實。          │
│ 唯一依賴：src/lib/api-client.ts                              │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTP + TripRequest / DecisionResponse
┌───────────────────────────▼──────────────────────────────────┐
│ API 層  src/app/api + src/lib/api                     （A）   │
│ 責任：解析、驗證、錯誤轉換、HTTP 狀態碼。薄包裝。             │
│ 可測試：處理邏輯在 decision-handler.ts，不依賴 Next.js。      │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│ 決策層  src/lib/decision                              （C）   │
│ 責任：過濾 → 評分 → 主路線 → Plan B → 切換條件 → 理由。      │
│ 純函式：不讀時鐘、不呼叫網路、不使用隨機值。                   │
└───────────────────────────┬──────────────────────────────────┘
                            │ ContextSnapshot
┌───────────────────────────▼──────────────────────────────────┐
│ 資料適配層  src/lib/adapters                          （B）   │
│ 責任：live → cached → fixture 三層回退；把不同來源統一成快照。│
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│ 共享資料  src/lib/corridor + src/lib/fixtures         （A/B） │
│ 責任：固定走廊、3 條路線定義、3 組情景快照、黃金檔案。        │
└──────────────────────────────────────────────────────────────┘
```

依賴方向是**單向**的。沒有任何一層回頭依賴上層，因此：

- B 可以獨立替換 `adapters/`，C 與 D 不需要改動。
- C 可以獨立調整 `decision/`，只要 `DecisionResponse` 形狀不變，D 不需要改動。
- D 可以獨立重做 UI，只要繼續用 `api-client.ts`。

## 3. 資料流（一次請求的完整生命週期）

```text
1. 使用者在 / 選起點、終點、最遲到達時間、限制條件、情景
2. TripForm 把 TripRequest 編進 URL → router.push("/result?...")
      └─ 呼叫 API 的是結果頁，不是輸入頁；因此重新整理也會重算且結果相同
3. /result（Server Component）從 searchParams 還原 TripRequest
      └─ 參數有問題 → 記在 paramIssues 並回退示範預設值（仍然渲染，不白屏）
4. useDecision() 依 JSON(request) 為依賴鍵呼叫 api-client.requestDecision()
      └─ 契約檢查：回應形狀不符 → CONTRACT_MISMATCH，不會靜默壞掉
5. POST /api/decision → handleDecisionRequest()
      a. 抽出除錯欄位（僅在 ALLOW_FAULT_INJECTION=1 時生效）
      b. validateTripRequest()：strict schema + 日期 round-trip + 地點角色檢查
         └─ 失敗 → 400 { error: { code, message, details } }
      c. resolveContext({ scenario })
         ├─ normal / heavy_rain / disruption → 對應 fixture（完全可重現）
         └─ live → provider（逾時 2.5s）→ cache → fixture，每層都加 notice
      d. decideTrip(request, snapshot, { notices, now }) ← 純函式；now 由呼叫端注入
      e. 回傳 200 + DecisionResponse（連 unavailable 也是 200）
6. DecisionCard 顯示：出發時間、到達範圍、信心、路線步驟、Plan B、切換條件、理由、資料品質
```

## 4. 為什麼決策結果是確定性的

這是本專案最重要的工程性質之一（「重新整理與重複提交不會產生隨機結果」）。

| 措施 | 位置 |
|---|---|
| 決策層完全不讀取時鐘 | `src/lib/decision/engine.ts` 沒有任何 `Date.now()` |
| 所有時間以純字串運算，固定 `+08:00` | `src/lib/time.ts` |
| fixture 的 `collectedAt` 是固定值 `2026-10-13T07:30:00+08:00` | `src/lib/fixtures/context/snapshots.ts` |
| 評分結果四捨五入到小數 3 位再比較 | `src/lib/decision/scoring.ts` |
| 分數相同時按路線 ID 排序 | `engine.ts` 的 `candidates.sort` |
| 整個 `TripRequest` 存在 URL 裡 | `src/lib/url-params.ts` |
| 黃金檔案測試 + 3×10 次重複測試 | `src/test/golden.test.ts`、`determinism.test.ts` |

`live` 情景在**未設定**實時來源時也會回退到固定 fixture，因此預設的演示路徑全部可重現。
一旦接上真實來源，`live` 自然會隨時間變動 —— 這是正確行為，且畫面會標示 `live`。

## 5. 錯誤與降級策略

| 失敗點 | 行為 | 使用者看到 |
|---|---|---|
| 請求格式錯 | 400 `INVALID_INPUT` | 可讀訊息 + 具體欄位 |
| 實時來源逾時／失敗 | 回退 cached → fixture | 「實時資料取得失敗…」提醒 + 灰色 `fixture` 標籤 |
| 沒有可用路線 | 200 `unavailable` | 逐條說明排除原因與調整建議 |
| 決策層未預期錯誤 | 500 `INTERNAL_ERROR` | 可讀訊息 + 「重試」按鈕 |
| 前端元件崩潰 | `error.tsx` / `global-error.tsx` | 可讀訊息 + 返回輸入頁 |
| 網址參數壞掉 | 回退示範預設值 | 黃色提示列出無法辨識的參數 |
| 完全斷網 | 同上（API 為同源） | 若已部署則無法載入；演示請用本機 `npm run start` 或錄屏備份 |

**原則**：任何一層失敗都不可以白屏，也不可以讓使用者看到「正常服務中」的假象。

## 6. 決策規則摘要

完整規則見 [API_CONTRACT.md §4](../API_CONTRACT.md)。重點：

1. **時間**：`建議出發 = arriveBy − 有效行程時間 − 該情景緩衝`。
2. **過濾**：服務中斷、超過轉乘上限、超過費用上限、出發時間早於首班服務 → 排除並記錄原因。
3. **評分**：時間 0.40 + 服務狀態 0.25 + 轉乘 0.15 + 人流 0.10 + 費用 0.10。
4. **主路線**：分數最高者。
5. **Plan B**：分數最高的**不同運輸方式**路線（鐵路 ↔ 路面），確保對抗不同失效模式。
6. **信心**：0–100 規則分數 → `high ≥ 70`、`medium ≥ 45`、`low < 45`。
7. **status**：`low` 信心或沒有 Plan B → `uncertain`；沒有可行路線 → `unavailable`。

> ⚠️ 所有權重與門檻都是**演示設定，未經歷史資料校準**。
> 因此介面只輸出定性信心，不輸出準時機率。校準是賽後工作。

## 7. 安全與隱私

- 沒有任何個人資料：演示地點是公開地點，時間是虛構的固定服務日。
- 沒有登入、帳號、Cookie 追蹤或個資儲存。
- 金鑰只透過環境變數讀取；`.env*.local` 已被 `.gitignore` 忽略；`.env.example` 只有變數名稱。
- 沒有硬編碼的個人路徑（`src/` 內不含 `/Users/`）。
- 沒有資料庫，因此沒有資料外洩面。
- `ALLOW_FAULT_INJECTION` 預設 `0`；正式環境必須保持關閉。

## 8. 部署準備（成員 A）

首版只需要一個 Node 環境：

```bash
npm ci
npm run build
npm run start        # 預設 3000，可用 PORT 覆寫
```

- 沒有建置期環境變數需求；不填任何變數也能運行。
- `GET /api/health` 可作為部署後的健康檢查端點。
- 若要部署到 Vercel / Netlify / Cloudflare，只需要把同一個 repo 連上去；
  本專案沒有需要持久化的狀態（`snapshotCache` 是進程內記憶體，冷啟動即清空，這是可接受的）。
- 演示備份三重保險見 [DEMO_RUNBOOK.md](./DEMO_RUNBOOK.md)。
