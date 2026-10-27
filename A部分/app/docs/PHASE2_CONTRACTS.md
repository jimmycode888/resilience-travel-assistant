# 第二階段凍結契約總表

> 契約所有者：**成員 A（`src/lib/types/**` 唯一所有者）**
> 程式碼：`src/lib/types/`
> 上游依據：`第二阶段_团队分工工作流.md §4`（第 0 天必須凍結的接口）
> 相關文件：[ARCHITECTURE.md](./ARCHITECTURE.md)（模組邊界）、[RISK_ENGINE.md](./RISK_ENGINE.md)（風險引擎）

**鐵律**：任何人**不得直接修改 `src/lib/types/**`**。需要新增／更動欄位時，只能寫
`docs/*_CONTRACT_CHANGE_REQUEST.md` 提 CR，由 A 在集成窗口統一更新檔案與型別。這條規則
沿用第一階段，理由是第二階段所有風險計算、可靠性排序與地圖繪製都建立在同一組型別上——
一旦有人繞過 CR 直接改，五個人的產出會在編譯期之外悄悄漂移。

---

## 1 凍結契約一覽

| 契約 | 型別檔案 | Owner | 消費方 | 狀態 |
|---|---|---|---|---|
| `Journey` / `JourneySegment` / `PlaceRef` / `BorderQueue` | `src/lib/types/journey.ts` | A | D、C、風險層、可靠性層 | ✅ 已凍結 |
| `RawJourney` / `RawStep` / `RouteQuery` / `CandidateRoute` / `RouteResolution` | `src/lib/types/route.ts` | A | B、D、風險層 | ✅ 已凍結 |
| `RiskBreakdown` / `RouteRisk` / `RiskFactor` / `RouteMode` / `RiskContext` | `src/lib/types/risk.ts` | A | D、C、可靠性層 | ✅ 已凍結 |
| `ReliabilityResult` / `RankedRoute` / `RouteRanking` / `RankableRoute` | `src/lib/types/reliability.ts` | A | D、C | ✅ 已凍結 |
| `CrowdRiskResult` | `src/lib/types/crowd.ts`（建議） | **C 定義，A 收進 types** | A、D | ⏳ 待 C 提供；A 已有消費端形狀 `CrowdSignal`（`risk.ts`） |
| `BorderRiskResult` | `src/lib/types/border.ts`（建議） | **C 定義，A 收進 types** | A、D | ⏳ 待 C 提供；A 已有消費端形狀 `BorderSignal`（`risk.ts`） |
| `DepartureWindow`（風險序列 + 最佳窗口） | `src/lib/types/departure.ts`（建議） | **C 定義，A 收進 types** | D | ⏳ 待 C 提供 |
| `RoutePlanChain`（Primary / B / C + 觸發條件） | `src/lib/types/plan.ts`（建議） | **C 定義，A 收進 types** | D | ⏳ 待 C 提供 |
| `DataEnvelope`（source / updatedAt / confidence / quality） | `src/lib/types/data.ts`（建議） | **B 定義，A 收進 types** | A、C、D | ⏳ 待 B 提供 |

> 說明：C 的 `CrowdRiskResult` / `BorderRiskResult` 尚未落地前，風險引擎不等待——它先以
> **消費端最小形狀** `CrowdSignal` / `BorderSignal` 接收（定義於 `risk.ts`）。當 C 的正式型別
> 進到 `types/` 後，只需在轉接處做一次欄位對映，風險引擎與排序演算法**不需要改動**。
> 這正是「A 先凍結消費端形狀、C 後補生產端型別」的用意。

---

## 2 不可變更的三個欄位

以下三個欄位在 W1 契約凍結時一次定死，所有上層模組（風險、可靠性、排序、地圖、Plan B）都依賴它們的
**存在與語意**，不是依賴其值。任何改動都必須走 CR 並同步全組。

```ts
Segment.kind            // "in_hk" | "border_crossing" | "in_sz"   ← 跨境歸屬（解析結果，不是輸入）
Segment.border          // { portId, queueMinutesRange: [min, max], confidence, note }
CandidateRoute.quality  // "live" | "cached" | "fixture"            ← 每條候選各自標示
```

1. **`Segment.kind`** —— 由 `route/parse.ts` 依路段兩端 `PlaceRef.side` 判定，供應商不需要提供。
   它讓「香港境內段 → 通關段 → 深圳境內段」的邊界成為**結構化事實**，而不是靠字串比對「口岸」二字。
   風險引擎靠它決定是否啟用第五因子 `border`。
2. **`Segment.border`** —— 只有 `kind === "border_crossing"` 的路段會有這個欄位。`queueMinutesRange`
   必須是**區間**，不得退化成單點精確值；且必須附 `confidence` 與 `note`（估算時要明說「估算」）。
   這是產品倫理硬約束，不是格式偏好。
3. **`CandidateRoute.quality`** —— 三退路（live → cached → fixture）的如實標示。`fixture` 不得偽裝成
   `live`：把演示資料顯示成即時資料，是本專案最嚴重的一類產品錯誤。風險與可靠性層都以此欄位
   對可信度封頂（見 [RISK_ENGINE.md](./RISK_ENGINE.md) §4）。

---

## 3 契約變更流程（沿用第一階段）

```text
1. 提出者撰寫 docs/<主題>_CONTRACT_CHANGE_REQUEST.md
      └─ 必須寫清：要改哪個型別／為什麼／影響哪些消費方／如何驗證
2. A 在集成窗口審核
      ├─ 通過 → A 更新 src/lib/types/** 與本表，並在站會通知全組
      └─ 退回 → 在 CR 文件留下理由，提案人修正後重提
3. 更新完成後執行 npm run verify（lint → typecheck → test → build）
4. 站會同步：受影響的消費方（B / C / D / E）更新各自的實作與測試
```

**規則**

- 涉及 `src/lib/types/**` 的 PR **必須 A 批准**（見 `第二阶段_团队分工工作流.md §8`）。
- 新增欄位優先採 **additive**（可選欄位），避免破壞既有消費方；既有鎖定欄位不得更名或改型別。
- CR 通過後，本表的「狀態」欄與對應型別檔案必須**同一次提交**更新，避免文件與程式碼不一致。

---

## 4 相關文件

- [ARCHITECTURE.md](./ARCHITECTURE.md) —— 分層與單向依賴；第二階段新增 `risk/` 與 `reliability/` 的位置。
- [RISK_ENGINE.md](./RISK_ENGINE.md) —— 五因子風險引擎、四模式排序、可靠性與其倫理約束。
- `第二阶段_路径读取工作流.md` —— W0–W8 逐步實作、命令速查、異常路徑與交接清單。
- `第二阶段_团队分工工作流.md §4` —— 第 0 天必須凍結的接口清單。
