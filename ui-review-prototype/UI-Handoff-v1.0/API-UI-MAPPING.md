# API → UI Mapping（UI Baseline v1.0）

> 本表描述 **UI 元素 ↔ 契約欄位 ↔ 顯示行為**。
> 事實來源是 `resilience-travel-assistant` 的 API Contract / production API / fixture；本 Baseline 未修改任何一方。

## 1. 資料取得方式

Prototype 有兩條取數路徑，**優先使用現有 API**：

| 順序 | 來源 | 說明 |
|---|---|---|
| 1 | `POST /api/decision`（經 Vite dev proxy） | 自動挑選健康的既有服務（`:5173` → `:5180`）；**未自建任何後端** |
| 2 | `src/data/decisions.ts`（內嵌） | 由 golden fixture 與真實 `unavailable` 回應**逐字產生**，作為 API 不可用時的回退 |

畫面「資料來源」區塊會**如實標示**本次結果來自哪一條路徑：
- `現有決策 API（POST /api/decision）`
- `固定演示資料（與 API 輸出一致）`

---

## 2. 決策摘要

| UI 元素 | 契約欄位 | 顯示行為 |
|---|---|---|
| 行動建議徽章 | `action` | 4 值對應固定文案（見 §5）；徽章配色：`depart_at` 藍 / `depart_now` 紅 / `wait` 琥珀 / `hold` 中性 |
| 建議出發時間（最大字級） | `departAt` | 取 ISO 的 `HH:mm`（字串切片，不做時區換算）；`""` 時不顯示此區塊 |
| 最遲出發時間 | `latestDepartAt` | `最遲出發 HH:mm`；空字串時整行不顯示 |
| 到達區間 | `etaRange[0]` / `etaRange[1]` | `HH:mm – HH:mm`；`["",""]` 時不顯示 |
| 到達信心 | `confidence` | 只出現 `高 / 中 / 低`（**永不出現百分比**）；量表亮格數 high 3 / medium 2 / low 1；附註 `定性判斷 · 未經歷史校準` |
| 服務標籤（頁首右側） | `primaryPlan.status` | `推薦路線：服務正常` 等；`status === "unavailable"` 或無 `primaryPlan` 時**不顯示** |
| 頂欄系統狀態 | `scenario` | 由情景推導：`當前狀態：正常 / 暴雨影響 / 交通中斷`（徽章色 綠/琥珀/紅）。**非**使用者可選 |
| 頂欄資料時間 | `dataUpdatedAt` | `資料更新：YYYY-MM-DD HH:mm`（行動版隱藏） |
| 目標到達時間（摘要小標） | `generatedFor.arriveBy` | `為確保 09:00 前到達` |

## 3. 推薦路線 / 路線概覽

| UI 元素 | 契約欄位 | 顯示行為 |
|---|---|---|
| 推薦路線名稱 | `primaryPlan.label` | 決策摘要右側 + 路線概覽標題 |
| 全程 / 轉乘 / 額外車費 | `primaryPlan.durationMinutes` / `.transfers` / `.extraCostHkd` | `45 分鐘 · 轉乘 1 次 · 額外車費 $0` |
| 人流 | `primaryPlan.crowding` | `人流低 / 人流一般 / 人流高 / 人流未確認` |
| 路線摘要 | `primaryPlan.summary` | 卡片說明（行動版截斷 2 行） |
| 路線示意帶 | `primaryRoute[0].from` / `primaryRoute[last].to` | 只顯示首尾節點；線色隨風險語意（藍/琥珀/紅） |
| 時間軸 | `primaryRoute[]` | 每段顯示 `departAt`(HH:mm)、`durationMinutes`、`mode`、`line`、`instruction`、`from → to`、`arriveAt`、`note` |
| 服務狀態（各段備註） | `RouteStep.note` / `primaryPlan.riskNotes` | `RouteStep.note` 以琥珀小字顯示 |

## 4. Plan B

| UI 元素 | 契約欄位 | 顯示行為 |
|---|---|---|
| Plan B 名稱 | `planBPlan.label` | 卡片說明列；無 Plan B 時顯示「本次沒有可用的備用路線…」 |
| 摘要 | `planBPlan.summary` | 卡片 hint |
| 出發 / 到達 / 全程 / 額外車費 | `planBPlan.departAt` / `.arriveAt` / `.durationMinutes` / `.extraCostHkd` | 4 格統計 |
| 服務狀態 / 人流 | `planBPlan.status` / `.crowding` | 收在折疊區內的 2 格統計 |
| 路線步驟 | `planB[]` | 折疊區（桌面預設展開、行動預設收起） |
| 備用路線風險 | `planBPlan.riskNotes` | 折疊區內清單 |
| **到達信心** | **—（契約無此欄位）** | **Contract 當前沒有 per-route confidence 欄位，Prototype 沒有自行創造。D 不需要實作 Plan B confidence。** |

## 5. 列舉值文案對照

| 欄位 | 值 | UI 文案 |
|---|---|---|
| `action` | `depart_now` | 立即出發 |
| | `depart_at` | 按建議時間出發 |
| | `wait` | 先核實再出發 |
| | `hold` | 留在安全處持續觀察 |
| `confidence` | `high` / `medium` / `low` | 高 / 中 / 低 |
| `primaryPlan.status`、`RouteStatus` | `ok` / `delayed` / `disrupted` / `unknown` | 服務正常 / 服務延誤 / 服務中斷 / 狀態未確認 |
| `crowding` | `low` / `medium` / `high` / `unknown` | 人流低 / 人流一般 / 人流高 / 人流未確認 |
| `dataQuality` | `live` / `cached` / `fixture` | 實時資料 / 快取資料 / 演示固定資料 |
| `TransportMode` | `walk`/`mtr`/`bus`/`minibus`/`tram`/`ferry` | 步行 / 港鐵 / 巴士 / 小巴 / 電車 / 渡輪 |

> 上表與正式專案 `src/lib/labels.ts` 逐字一致。

## 6. 切換條件

| UI 元素 | 契約欄位 | 顯示行為 |
|---|---|---|
| 切換條件區塊 | `switchCondition` | 獨立深色高亮卡；空字串時**整個區塊不渲染** |
| 最遲切換決定 | `switchDeadline` | `最遲切換決定：HH:mm`（大字）；空字串時該行不顯示 |

## 7. 風險 / 理由 / 不確定

| UI 元素 | 契約欄位 | 顯示行為 |
|---|---|---|
| 風險等級 | `primaryPlan.status` 推導 | `ok`→低、`delayed`→中、`disrupted`→高、`unknown`→中；**文字 + 圖示 + 顏色**三者並用 |
| 風險原因 | `primaryPlan.riskNotes[]` | 逐條列出 |
| 推薦理由 | `reasons[]` | 逐條列出（基點樣式） |
| 依據 | `basis[]` | 折疊區；每條顯示 `type`（規則／資料／統計）、`claim`、`source` |
| 我們不知道什麼 | `uncertainty[]` | 獨立卡片；`uncertain` 時另取前 3 條放入琥珀橫幅 |

> ⚠️ **不得加入統計暗示**。`reasons` / `basis` 內若無 `statistics` 條目，UI 不得自行聲稱「基於相似行程表現」「過去相似時段較穩定」等。

## 8. 候選 / 排除 / 提醒

| UI 元素 | 契約欄位 | 顯示行為 |
|---|---|---|
| 其他候選路線 | `candidates[]` | 卡片（預設折疊）；每條顯示 `routeId · label`、狀態 chip、`durationMinutes`、`transfers`、`extraCostHkd`、`score`（3 位小數）、`crowding` |
| 已排除路線 | `excludedRoutes[]` | 同卡片內**預設可見**的紅框區塊；顯示 `routeId · label` + `reason` |
| 提醒 | `notices[]` | 琥珀提示條，位於決策摘要之後；無內容時不渲染 |

## 9. 資料來源 / 免責

| UI 元素 | 契約欄位 | 顯示行為 |
|---|---|---|
| 品質標籤 | `dataQuality` | `演示固定資料` 等（**不使用英文 `FIXTURE`**） |
| 資料時間 | `dataUpdatedAt` | `演示資料時間：YYYY-MM-DD HH:mm` |
| 來源清單 | `dataSources[]` | 每筆顯示 `label`、品質標籤、`updatedAt`、`note` |
| 免責聲明 | `disclaimer` | 底部區塊；無內容時不渲染 |
| 服務日 | `serviceDate` | 契約提供；本 Baseline 未單獨顯示（見 §10） |
| 請求回顯 | `generatedFor` | `origin` / `destination` / `arriveBy` 供除錯與顯示目標時間 |

## 10. 契約有、但本 Baseline 未顯示的欄位

僅記錄，**不代表 D 必須實作**：

| 欄位 | 狀態 |
|---|---|
| `serviceDate` | 未單獨顯示（`generatedFor.arriveBy` 已顯示日期） |
| `primaryPlan.score` | 候選路線清單內顯示；主路線卡不顯示 |
| `primaryPlan.baseDurationMinutes` / `.delayMinutes` | 未單獨顯示 |
| `RouteStep.id` | 僅作 React key |
| `dataSources[].url` | 目前全為 `null`，未顯示連結 |

## 11. 契約沒有的欄位

| 需求 | 狀態 |
|---|---|
| Plan B 到達信心 | **Contract 當前沒有該欄位，Prototype 沒有自行創造。** |
| 天氣 / 事故專屬欄位 | `DecisionResponse` 無頂層 `weather` / `incidents`；相關事實由 `reasons`、`riskNotes` 承載 |
| 錯誤代碼（Demo 模擬錯誤時） | 真實 HTTP 400/500 才有 `error.code`；模擬狀態不偽造 |
