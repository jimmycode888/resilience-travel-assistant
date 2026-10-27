# Component Checklist（UI Baseline v1.0）

> D 在正式專案中需要**實現或還原**的 UI 元件。
>
> ⚠️ 下列名稱只是**實作建議**，用來對照 Prototype 的職責切分。
> **不要修改 production 的既有元件架構** —— 正式專案若已有對應元件（例如既有的 `TripForm`、`DecisionCard`、`RouteTimeline`、`ScenarioSwitcher`、`states.tsx`），請**沿用既有元件與命名**，把本清單當成「這個元件要負責顯示什麼」的對照表。

圖例：`[新增]` 正式專案尚無對應｜`[既有]` 正式專案已有，需擴充或對齊

---

## A. 輸入頁

| # | 元件 | 職責 | Prototype 名稱 | 正式專案 |
|---|---|---|---|---|
| A1 | InputField / Select | 起點、終點（**僅契約列舉值**） | `LocationField` | `[既有]` `TripForm` |
| A2 | DateTime input | 最遲到達時間（含日期，香港時間） | `TripInput` 內 | `[既有]` |
| A3 | Number input | 額外車費（0–500）、轉乘次數（0–5），**0 有效** | `TripInput` 內 | `[既有]` |
| A4 | Inline validation | 提交時驗證，錯誤清單置於欄位下方、CTA 上方 | `.field-errors` | `[既有]` `ErrorNotice` 變體 |
| A5 | Primary CTA | `獲取出行建議`，滿寬、**不可 sticky 遮擋欄位** | `.primary-button` | `[既有]` |
| A6 | Helper note | `建議會優先確保你在 HH:mm 前到達` | `.form-footnote` | `[新增]` |

## B. 全域

| # | 元件 | 職責 | Prototype 名稱 | 正式專案 |
|---|---|---|---|---|
| B1 | App header | 產品名 + **系統狀態徽章** + 資料更新時間 | `Header` | `[既有]` `layout.tsx` 需擴充狀態 |
| B2 | Footer | 品牌 + 免責 + 演示版本標記 | `GlobalFooter` | `[既有]` |
| B3 | Product brand | 名稱固定 `韌性出行助手` | `Brand` | `[既有]` |

## C. 結果頁 — 決策層

| # | 元件 | 職責 | Prototype 名稱 | 正式專案 |
|---|---|---|---|---|
| C1 | Decision summary | 行動建議 / 建議出發 / 最遲出發 / 到達區間 / 信心 / 推薦路線摘要 | `DecisionSummary` | `[既有]` `DecisionCard` |
| C2 | Action badge | `action` 4 值徽章 | `.action-badge` | `[新增]`（D 目前未消費 `action`） |
| C3 | Confidence scale | 3 格量表（高 3／中 2／低 1）+ 文字 | `ConfidenceScale` | `[既有]` |
| C4 | Status chip | 服務狀態（綠/琥珀/紅/中性） | `.chip` | `[既有]` |
| C5 | Uncertain banner | 琥珀橫幅「建議可用但不確定」 | `UncertainBanner` | `[新增]` |
| C6 | Notice list | `notices` 提示條 | `NoticeList` | `[既有]` |

## D. 結果頁 — 路線層

| # | 元件 | 職責 | Prototype 名稱 | 正式專案 |
|---|---|---|---|---|
| D1 | Route overview card | 標題 + 摘要 + 路線帶 + 統計 + 時間軸 | `RouteOverview` | `[既有]` |
| D2 | Route strip | 精簡路線示意（首尾節點 + 色線，**無距離、無虛構地理**） | `RouteStrip` | `[新增]` |
| D3 | Timeline | `RouteStep[]` 垂直時間軸（可折疊） | `Timeline` | `[既有]` `RouteTimeline` |
| D4 | Stat grid | 全程 / 轉乘 / 額外車費 / 人流 | `Stat` + `.stat-row` | `[既有]` |
| D5 | Plan B card | `planB` + `planBPlan`（**不含 confidence**） | `PlanBCard` | `[既有]` |
| D6 | Switch condition card | `switchCondition` + `switchDeadline`（深色高亮） | `SwitchCard` | `[既有]` 需補 `switchDeadline` |

## E. 結果頁 — 說明層

| # | 元件 | 職責 | Prototype 名稱 | 正式專案 |
|---|---|---|---|---|
| E1 | Risk section | 風險等級（文字+圖示+色）+ `riskNotes` | `RiskCard` | `[既有]` |
| E2 | Reason section | `reasons` + 可展開 `basis` | `ReasonsCard` | `[既有]` |
| E3 | Uncertainty section | `uncertainty` 清單 | `UncertaintyCard` | `[新增]` |
| E4 | Candidates section | `candidates`（折疊）+ `excludedRoutes`（可見） | `CandidatesCard` | `[既有]` 部分 |
| E5 | Data source section | 品質 + 時間 + `dataSources` + 取數來源標示 | `DataSourcesCard` | `[既有]` |
| E6 | Disclaimer block | `disclaimer` | `Disclaimer` | `[既有]` |

## F. 狀態層

| # | 元件 | 職責 | Prototype 名稱 | 正式專案 |
|---|---|---|---|---|
| F1 | Loading state | 骨架 + `正在讀取路線狀態與天氣資料` | `StatusPanel(loading)` | `[既有]` `LoadingCard` |
| F2 | Unavailable state | `hold` 語意 + 三出口（調整條件／查看原因／留在安全處） | `StatusPanel(unavailable)` | `[既有]` `UnavailableCard` 需擴充 |
| F3 | Error state | 可讀訊息 + 重試 + 返回（不偽造 error code） | `StatusPanel(error)` | `[既有]` `ErrorNotice` |
| F4 | Skeleton | 三條灰條（82% / 58% / 70%） | `.skeleton` | `[既有]` |

## G. Demo 專用（**不得進入使用者流程**）

| # | 元件 | 職責 | Prototype 名稱 | 正式專案 |
|---|---|---|---|---|
| G1 | Demo control | `?demo=1` 才渲染；情景與狀態切換 | `DemoControl` | `[新增]`（可選，若 D 也需要 demo 入口） |

## H. 基礎元件

| # | 元件 | 職責 |
|---|---|---|
| H1 | Card | 標題列 + 說明 + 動作插槽 + 內容 |
| H2 | Disclosure | 折疊控制（chevron 旋轉） |
| H3 | Icon | 15 個自繪 SVG（見 `DESIGN-TOKENS.md §7`） |
| H4 | Pill / Tag | 膠囊標籤、備選標籤 |

---

## 實作順序建議（給 D）

1. **A → C → F**：先把輸入頁、決策摘要與五狀態打通（最小可用閉環）。
2. **B → D**：補全域狀態徽章、路線概覽、Plan B、切換條件。
3. **E**：補風險、理由、不確定、候選、資料來源、免責。
4. **H**：抽出共用基礎元件。
5. **G**：如需要再接 demo 入口。
6. 全部完成後跑 `QA-CHECKLIST.md`，再交 E 做 regression review。
