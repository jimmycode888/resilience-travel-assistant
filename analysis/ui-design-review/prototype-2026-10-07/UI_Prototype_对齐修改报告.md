# UI Review Prototype 對齊修改報告

- **日期**：2026-10-07
- **修改範圍**：**只修改** `/workspace/八校黑客松/ui-review-prototype/`
- **原始檔備份**：`analysis/ui-design-review/prototype-2026-10-07/original-src-backup/`（修改前的 `src/`、`vite.config.ts`、`index.html`）
- **資料真實來源**：`resilience-travel-assistant` 的 contract / types / corridor / golden fixtures + 運行中的 `POST http://localhost:5180/api/decision`

---

## 1. 修改了哪些 UI

| 區域 | 修改前 | 修改後 |
|---|---|---|
| 產品名稱 | 「出行可靠性決策助手」/「AI 出行可靠性決策助手」 | 全部統一為 **韌性出行助手**（頁首、hero、頁尾、`<title>`、`html lang`） |
| 頂欄 | 寫死「服務正常」 | 產品名 + **系統判定狀態**（正常／暴雨影響／交通中斷，隨情景變化）+ 資料更新時間 |
| 情景切換 | 輸入頁與結果頁都有使用者可見的「正常通勤／暴雨影響／交通中斷」按鈕 | **從使用者流程完全移除**；只在 `?demo=1` 時出現、且標明「僅用於演示，不屬於使用者介面」 |
| 輸入頁 | 西營盤／九龍灣等虛構地點、只有時刻的到達時間、寫死的車費選項 | 契約走廊 2×2 地點、`datetime-local`（含日期）、車費 0–500、轉乘 0–5（0 為有效值） |
| 輸入頁 CTA | `position: sticky`，捲動時遮擋欄位 | 取消 sticky，**實測 5 個捲動位置遮擋皆為 0** |
| 決策摘要 | 硬編碼文案 | `departAt` / `latestDepartAt` / `etaRange` / `action` / `confidence` 全部綁定真實欄位 |
| 路線 | 「港鐵優先」「約 11.8 km」+ 裝飾地圖 | 真實 `primaryPlan.label` + 4 項統計（全程／轉乘／額外車費／人流）+ 精簡路線條 + 真實 `RouteStep` 時間軸（可折疊） |
| Plan B | 「的士直達／巴士 101／過海的士」 | 真實 `planB` / `planBPlan`（R2 或 R3）；步驟與風險收進折疊區 |
| 切換條件 | 硬編碼一句話 | 真實 `switchCondition` 全文 + **`switchDeadline` 最遲切換時刻**（獨立深色區塊） |
| 風險 | 自造「低／中等／較高風險」 | 由真實 `primaryPlan.status` 推導低／中／高 + `riskNotes` 全文；文字 + 圖示（不只靠顏色） |
| 推薦理由 | 3 條寫死、含統計暗示 | 真實 `reasons`（5 條）+ `basis`（7 條，可展開，標規則／資料） |
| 新增區塊 | — | 「我們不知道什麼」（`uncertainty`）、「其他候選路線 / 已排除路線」（`candidates` / `excludedRoutes`）、「提醒」（`notices`） |
| 資料透明度 | `FIXTURE`、假來源「歷史行程」 | 品質標籤「演示固定資料」、`dataUpdatedAt`、真實 3 個 `dataSources` |
| 狀態頁 | 不確定＝整頁空白卡 | `uncertain` 保留完整建議 + 琥珀色提示條；`unavailable` 給「調整行程條件 / 查看原因 / 留在安全處持續觀察」；`error` 給重試 + 返回輸入頁；`loading` 骨架屏 |
| Demo 控制 | 「介面狀態預覽」常駐成品頁 | 只在 `?demo=1` 出現，可折疊，明確標示僅供演示 |
| 視覺系統 | 18 檔字級、95 個 hex、19 檔圓角 | 字級 **12/13/15/17/24/43**、圓角 **8/12/16/22**、陰影 **2 檔**、文字色 4 檔且皆 ≥4.5:1 |
| 響應式 | 地圖 359px、切換條件在 y=1969 | 地圖改精簡路線條（≤58px）、切換條件降至 **y=1199**、無橫向溢出 |

---

## 2. 已與真實 API / fixture 對齊的欄位

**全部由真實資料驅動，逐字等於 API 輸出**：

`departAt`、`latestDepartAt`、`etaRange`、`action`、`confidence`、`primaryRoute`、`primaryPlan`、
`planB`、`planBPlan`、`switchCondition`、`switchDeadline`、`candidates`、`excludedRoutes`、
`notices`、`uncertainty`、`reasons`、`basis`、`dataUpdatedAt`、`dataQuality`、`dataSources`、
`disclaimer`、`serviceDate`、`generatedFor`、`transfers`、`extraCostHkd`、`status`、`scenario`、
`RouteStep`（`mode/line/from/to/departAt/arriveAt/durationMinutes/instruction/note`）、
`RoutePlan`（`label/summary/durationMinutes/transfers/extraCostHkd/status/crowding/riskNotes/score`）。

**資料取得方式**：優先呼叫現有服務 —— `vite.config.ts` 加 `/api` dev proxy → `http://localhost:5180`；連不到時回退到 `src/data/decisions.ts`（由 golden fixture 與真實 `unavailable` 回應**逐字產生**）。UI 會誠實標示本次結果來自「現有決策 API」還是「固定演示資料」。

**實測對齊結果（三情景）**：

| 情景 | status | departAt | latestDepartAt | etaRange | confidence | action | 主路線 | Plan B |
|---|---|---|---|---|---|---|---|---|
| 正常通勤 | ready | 08:09 | 08:15 | 08:54–09:04 | 高 | 按建議時間出發 | R1 港鐵主線 | R2 過海巴士 |
| 暴雨影響 | ready | 07:58 | 08:12 | 08:43–09:06 | 中 | 按建議時間出發 | R1 港鐵主線 | R2 過海巴士 |
| 交通中斷 | **uncertain** | 07:22 | 07:38 | 08:24–09:19 | **低** | 按建議時間出發 | R2 過海巴士 | R3 港鐵經鰂魚涌（R1 已排除） |

---

## 3. 仍因 contract / API 不完整而無法綁定的欄位

| 項目 | 狀況 | 處理方式 |
|---|---|---|
| Plan B 的「到達信心」 | 契約**沒有** per-route confidence；`RoutePlan` 只有 `status` / `crowding` / `delayMinutes` | **不編造**；改顯示真實「服務狀態／人流」，缺口交由團隊決定 |
| 天氣／事故專屬欄位 | `DecisionResponse` **沒有** `weather` / `incidents` 頂層欄位（它們在 `ContextSnapshot` 內） | 不臆造「天氣卡」；改用真實 `reasons[0]` / `riskNotes` 承載 |
| 錯誤代碼 | `error.code` 只在真實 HTTP 400/500 回應中出現；本原型走的是 fallback，不產生真實錯誤 | 錯誤頁只顯示可讀訊息 + 重試 + 返回，**不假造錯誤碼** |
| 資料來源連結 | `dataSources[].url` 目前全為 `null` | 原樣顯示 `null` 對應的說明文字，不補連結 |
| 服務恢復提示 | 立項說明 §5 要求，但契約無對應欄位 | 未實作（避免無資料支撐的模組） |
| 來源 note 內的英文 `fixture` | `dataSources[].note` 文字由後端產生，含「（fixture）」 | **原文照登**（不修改真實資料）；建議由 B 調整文案 |
| 繁體／簡體混用 | 真實資料為繁體（zh-HK），UI 骨架文案為簡體 | 資料逐字保留；界面文案依指示用簡體。**建議團隊統一** |

---

## 4. Desktop 驗證（1440×900）

✅ **通過**

- 三情景：無橫向溢出、無 console／page error
- 決策摘要（建議出發／最遲出發／到達區間／行動建議／到達信心）全數在首屏
- 切換條件位於 **y=512**（首屏內）
- 版面：左欄「路線概覽 + Plan B」／右欄「切換條件、風險、推薦理由、我們不知道什麼」／底部「其他候選路線、資料來源、免責聲明」
- CTA 遮擋欄位：**0**（5 個捲動位置實測）

## 5. Mobile 驗證（390×844）

✅ **通過（含一項已知限制）**

- 三情景：無橫向溢出、無 console／page error
- 決策摘要全數在首屏；路線步驟預設折疊
- **CTA 遮擋欄位：0**（修正前為 1–3 個欄位被遮擋）
- 切換條件位置：**1969px → 1199px**（改善 39%）
- ⚠️ **已知限制**：切換條件仍不在 844px 首屏內（約 1.42 屏）。在 §17 指定的順序（摘要→路線概覽→Plan B→切換條件）加上真實資料量（5 段時間軸、6 項統計、5 條風險）下，第一屏無法容納。**留給 E 決定**（見 §10）。

## 6. 三個場景驗證

✅ **全部通過**（以真實 API 驅動，見 §2 表格）

- 正常通勤：高信心、R1 主線、R2 Plan B、無排除
- 暴雨影響：中信心、黑色暴雨警告（真實 fixture 文案，未改警告等級）
- 交通中斷：**uncertain + 低信心**、主路線改為 R2、R1 顯示於「已排除路線」
- 三情景共用同一結果頁骨架，只替換真實狀態與資料 ✅

## 7. 五種狀態驗證

| 狀態 | 結果 |
|---|---|
| loading | ✅ 骨架屏 +「正在讀取路線狀態與天氣資料」 |
| ready | ✅ 完整建議（正常／暴雨） |
| uncertain | ✅ **保留完整建議** + 頂部琥珀色提示條（交通中斷情景） |
| unavailable | ✅ 真實 `action=hold` 語意；出口＝調整行程條件／查看原因／留在安全處持續觀察；另列真實 `reasons` 與 `excludedRoutes` |
| error | ✅ 可讀錯誤 + 重試 + 返回輸入頁 |

**狀態矛盾檢查**：不再出現「交通中斷 + 服務正常」寫死字樣（頂欄改為隨情景變化的系統狀態）；不再出現「unavailable + 服務正常」。

## 8. 是否修改了 production 檔案

❌ **沒有**。只修改 `ui-review-prototype/`。`resilience-travel-assistant/` 全目錄未被寫入（僅唯讀取用）。

## 9. 是否修改了 contract / API / fixture

❌ **全部沒有**。`API_CONTRACT.md`、`src/lib/types/*`、`src/lib/corridor/*`、`src/lib/fixtures/*`、決策引擎、正式前端皆未改動。原型以 HTTP 呼叫既有 API，並另存一份逐字 golden 複本作離線回退。

## 10. 仍需 A / B / C / D / E 決定的問題

| # | 問題 | 需要誰 |
|---|---|---|
| 1 | `action` / `switchDeadline` / `basis` / `uncertainty` 已實作但**未登記**於 `API_CONTRACT.md §2.2`；本原型已安全讀取。請確認是否正式納入契約 | A（C 已提申請） |
| 2 | Plan B 缺「到達信心」欄位；是否要 C 新增 `RoutePlan.confidence`？ | C + A |
| 3 | 繁體（真實資料／正式前端）與簡體（UI 骨架文案）混用，是否統一？ | E + A |
| 4 | 來源 `note` 含英文「fixture」，是否由 B 改寫為純中文？ | B |
| 5 | Mobile 切換條件無法進首屏：是否接受「1.4 屏」，或在決策摘要加 `switchDeadline` 提示行，或把切換條件提到 Plan B 之前？ | E（＋A 決定是否偏離 §17 順序） |
| 6 | `dataSources[].url` 仍為 `null`；來源連結何時補上？ | B |
| 7 | 是否需要「服務恢復提示」（立項 §5），契約目前無欄位 | A + C |
| 8 | `?demo=1` 是否為團隊認可的演示開關（本原型用它隔離 demo 控件）？ | A + E |

---

*本次只修改 `ui-review-prototype`，未動任何正式專案檔案、契約、API、fixture 或決策邏輯。*

---

# 附錄：2026-10-08 更新（語言統一與 API 容錯）

## 團隊決定（已依指示落實）

| # | 決定 | 落實情況 |
|---|---|---|
| ① | 接受保留 `?demo=1`，僅作為內部 Demo 機制，不在使用者介面顯示情景切換入口 | ✅ 情景切換與界面狀態預覽**只**在 `?demo=1` 出現；無 URL 參數時，整個 demo 面板不渲染（DOM 中不存在） |
| ② | 暫不增加 Plan B confidence（契約無 per-route confidence） | ✅ 未新增；Plan B 區塊只顯示真實 `status` / `crowding` / `durationMinutes` / `extraCostHkd`，不編造信心值 |
| ③ | 最終 UI 統一使用繁體中文；API/fixture 原始資料保持真實內容 | ✅ 本輪完成（詳下） |

## ③ 繁體統一：作法與驗證

**作法**：以 OpenCC `s2hk`（簡→繁，香港）轉換 `src/App.tsx` 的全部界面文字，並依正式專案用語修正兩處：
- `數據` → **`資料`**（正式專案用「資料」452 次 vs「數據」7 次）
- `説明` → **`說明`**（正式專案一律用「說明」）

界面標籤與 `resilience-travel-assistant/src/lib/labels.ts` **逐字一致**：
`立即出發` / `按建議時間出發` / `先核實再出發` / `留在安全處持續觀察` /
`服務正常` / `服務延誤` / `服務中斷` / `狀態未確認` /
`人流低` / `人流一般` / `人流高` / `人流未確認` /
`實時資料` / `快取資料` / `演示固定資料` / `高` / `中` / `低`。

**驗證方式**：把實際渲染的頁面文字（桌面＋行動、三情景，共 8,022 字）逐字元掃描，找出任何「OpenCC 會轉換」的字元：

```
簡體殘留：{'說': 2, '涌': 21, '干': 5}
```

逐項確認**全部為誤報或正確用法**，無真實簡體殘留：
- `說`（「依你的限制條件逐條說**說**明」）—— `說` 是正確繁體；OpenCC 會轉成日式異體 `説`，屬工具誤報。
- `涌`（**鰂魚涌**站）、`干`（**干**諾道中）—— 屬 **API 原始資料**的正確香港地名寫法，**未修改**。

**資料未動**：`src/data/decisions.ts` 為真實資料逐字複本（含 `干諾道中`、`鰂魚涌`），本輪**完全未修改**；`API_CONTRACT.md`、`types/`、`corridor/`、`fixtures/`、決策引擎、正式前端亦全部未動。

## API 容錯強化（本輪新增）

`:5180`（D 的 QA 服務）在本次工作期間被關閉，導致代理回傳 502。已改為**自動挑選健康來源**：

- `vite.config.ts` 啟動時與其後每 15 秒探測 `/api/health`，依序嘗試
  `DECISION_API_TARGET` → `http://localhost:5173` → `http://localhost:5180`，取第一個健康的作為代理目標。
- 全部不可用時，前端自動回退到 `src/data/decisions.ts`（與 API 輸出逐字一致），並在「資料來源」區塊如實標示。
- 現況：`:5173`（房間預覽，持續運行）為代理目標，`POST /api/decision` 實測 `HTTP 200`、`time_total ≈ 0.005–0.03s`。

## 本輪回歸結果（繁體版）

| 檢查 | 桌面 1440×900 | 行動 390×844 |
|---|---|---|
| 橫向溢出 | 無 | 無 |
| Console error | 0 | 0 |
| CTA 遮擋欄位（5 個捲動位置） | 0 | 0 |
| 切換條件位置 | y=512（首屏內） | y=1199 |
| 三情景（正常／暴雨／中斷） | 全部通過 | 全部通過 |
| 五狀態（loading／ready／uncertain／unavailable／error） | 全部通過 | 全部通過 |
| 產品名稱 | 韌性出行助手 | 韌性出行助手 |

> 註：瀏覽器 console 偶爾出現 `net::ERR_ABORTED`（React StrictMode 在 dev 模式重複觸發 effect 造成的第一個請求中止），非應用錯誤；正式 build 不受影響。
