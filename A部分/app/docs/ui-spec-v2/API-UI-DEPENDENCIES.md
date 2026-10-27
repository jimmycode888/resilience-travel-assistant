# API ↔ UI 数据依赖与待确认事项 v2

Owner **E** ｜ 消费方 **D** ｜ 版本 v2.0 · 2026-10-10
配套：`UI-PAGE-INVENTORY.md`、`COMPONENT-SPEC.md`、`REPLAY-SIMULATION-SPEC.md`

> **E 不修改任何 API contract 或 TypeScript 类型。** 任何新增字段建议一律标记 **Pending A Confirmation**。
> 来源：`src/lib/types/*.ts`、`src/lib/integration/*.ts`、`src/lib/risk/thresholds.ts`、`src/lib/journey/analysis.ts`。

---

## 0. 五类分类总览

| 类别 | 含义 | 数量 |
|---|---|---|
| **① 已存在且已确认** | 类型已冻结、语义明确、UI 已消费 | 18 |
| **② 已存在但语义待确认** | 字段存在，但语义/命名/口径需 A 或 C 确认 | 5 |
| **③ 尚未实现的数据或功能** | 契约已描述但无实作，或 UI 需要但无来源 | 4 |
| **④ 需要申请契约变更** | UI 有合理需求，但现有契约表达不了 | 3 |
| **⑤ 纯视觉 Token** | 不需要任何后端字段 | 9 |

---

## ① 已存在且已确认的字段

| UI 元素 | 真实字段 | 类型/允许值 | 来源文件 | 页面 | 现状 |
|---|---|---|---|---|---|
| 起终点 | `JourneyAnalysisRequest.origin/destination` | `string`（`PlaceEntry.id`） | `journey-analysis.ts` | Home/Search | ✅ |
| 出发/到达时间 | `.departAt` / `.arriveBy` | ISO 字串（`arriveBy` 可选） | 同上 | Home/Search | ✅ |
| 比较偏好 | `.mode` | `RouteMode` 4 值 | `types/risk.ts` | Home/Search | ✅ |
| 演示情景 | `.scenario` | `JourneyScenario` 3 值 | `journey-analysis.ts` | Home/Search | ✅ |
| 路线名 | `CandidateRoute.label` | `string` | `types/route.ts` | Result | ✅ |
| 路线总时长 | `Journey.totalMinutes` | `number` | `types/journey.ts` | Result | ✅ |
| 路线品质 | `CandidateRoute.quality` | `live/cached/fixture` | `types/route.ts` | Result | ⚠️ 未显示 |
| ETA 区间 | `RankedRoute.reliability.etaRange` | `[string,string]` | `types/reliability.ts` | Result | ✅ |
| 准时信心 | `.reliability.onTimeConfidence` | `Confidence` 3 值 | 同上 | Result | ✅ |
| 信心说明 | `.reliability.confidenceNote` | `string` | 同上 | Result | ✅ |
| 是否达标 | `AnalyzedJourney.meetsDeadline` | `boolean \| null` | `journey-analysis.ts` | Result | ✅ |
| 可行性 | `.eligible` | `boolean` | 同上 | Result/Map | ✅ |
| 排除原因 | `.exclusions` | `string[]` | 同上 | Result | ✅ |
| 风险等级 | `RouteRisk.level` / `RiskFactor.level` | `RiskLevel` 3 值 | `types/risk.ts` | Result/Risk | ✅ |
| 风险因子 | `RiskBreakdown.factors[]` | `{id,score,level,weight,contribution,claim,evidence,source,sourceUrl}` | 同上 | Risk | ⚠️ 部分 |
| 因子权重 | `.weights` | `RiskWeights` 5 键 | 同上 | Risk | 未显示 |
| 路径段 | `JourneySegment.*` | `id/mode/kind/line/from/to/departAt/arriveAt/durationMinutes/geometry/viaStations/viaDistricts` | `types/journey.ts` | Map/Result | ✅ |
| 口岸清单 | `BORDER_PORTS[]` | `id/name/nameEn/hkNode/szNode/openFrom/openTo/modes` | `geo/ports.ts` | Map | ✅ |

## ② 已存在但语义待确认的字段

| # | 字段 | 现状 | 待确认什么 | 需要谁 | 级别 |
|---|---|---|---|---|---|
| 2-1 | `JourneyVisualSpec.risk.critical` | 4 键之一，`label:'極高風險'` | 是否定义为「人流信号最高档」（crowd-only）？**路线风险 `RiskLevel` 永远不含 `critical`** | **A** | **P0** |
| 2-2 | `CrowdSignal.level` | 4 值（含 `critical`） | 与 `RiskLevel`（3 值）的关系；UI 是否需并列显示 | **C** | P1 |
| 2-3 | `BorderQueue.confidence` | 字段存在 | 实际取值口径（UI 现**写死「低信心」**） | **C** | **P0** |
| 2-4 | `RiskBreakdown.confidence` | 字段存在 | 是否需在 UI 显示；与 `reliability.onTimeConfidence` 的区别 | **C + E** | P1 |
| 2-5 | `RiskContext.quality` vs `CandidateRoute.quality` vs `JourneyAnalysis.quality` | 三处品质字段 | 三者关系与显示优先级（现只显示 `JourneyAnalysis.quality`，且固定 `fixture`） | **B + A** | P1 |

## ③ 尚未实现的数据或功能

| # | 需求 | 现状 | 说明 | 需要谁 | 级别 |
|---|---|---|---|---|---|
| 3-1 | `CrowdRiskResult` 正式型别 | `PHASE2_CONTRACTS.md` 标记 **⏳ 待 C 提供** | 现由消费端形状 `CrowdSignal` 顶替；`estimateCrowd` 为演示规则 | **C**（A 收进 types） | P1 |
| 3-2 | `BorderRiskResult` 正式型别 | 同上 **⏳ 待 C 提供** | 现由 `BorderSignal` 顶替 | **C** | P1 |
| 3-3 | `DepartureWindow` 正式型别 | 同上 **⏳ 待 C 提供** | 现由 `JourneyAnalysis.departureOptions` 顶替 | **C** | P1 |
| 3-4 | `RoutePlanChain`（Primary/B/C） | 同上 **⏳ 待 C 提供** | 现只有 `planB`（单个），**无 Plan C** | **C** | P2 |

> ⚠️ **Plan C 不存在。** `JourneyAnalysis.planB` 是单一对象，没有 `planC` 字段。
> UI **不得**虚构 Plan C；`UI-PAGE-INVENTORY.md §6` 已标注该缺口。

## ④ 需要申请契约变更的字段（全部 Pending A Confirmation）

| # | UI 需求 | 为什么现有契约表达不了 | 建议 | 需要谁 | 级别 |
|---|---|---|---|---|---|
| 4-1 | **Replay 前后差异对比** | 现有 `JourneyAnalysis` 是**单次快照**，无 diff 结构 | 由 D 在前端保存两次快照自行比对（**不改契约**），或 A/C 新增 `JourneyDiff` | **A/C** | P1 |
| 4-2 | **口岸节点选中态** | `BORDER_PORTS` 只有静态数据，无「选中」语义 | 纯 UI 状态，**不需要契约变更** | — | P2 |
| 4-3 | **单条路线品质徽章** | `CandidateRoute.quality` **已存在**——不是契约缺口，只是 UI 未接线 | 纯前端消费 | **D** | P1 |

> 4-1 是**唯一**真正需要契约决策的项；4-2/4-3 实为 UI 实作缺口，列此以便追踪。

## ⑤ 纯视觉 Token（不需要后端字段）

| Token | 用途 |
|---|---|
| `--risk-low/medium/high/critical` | 风险配色 |
| `--route-border-crossing` / `--route-border-dash` | 通关段 |
| `--map-route-width-*` / `--map-route-opacity-*` | 选中态 |
| `--map-route-casing` | 描边 |
| `--map-route-dash-unavailable` | 不可行虚线 |
| `--map-port-marker` / `--map-place-*` / `--map-position` | 地图标记 |
| `--c-quality-live/cached/fixture` | 品质徽章配色 |
| `--font-size-risk-label` / `--font-size-risk-symbol` | 风险标签字号 |
| `--c-warning*` / `--c-danger*` | 状态条 |

---

## 6. 关键依赖逐项说明

### 6.1 Route / Journey
- **已确认**：`Journey` 含 `segments/departAt/arriveAt/totalMinutes/crossesBorder/borderPortIds`。
- **已确认**：`JourneySegment` 含 `geometry: LonLat[]`（`[lon,lat]`）、`kind`、`border?`。
- **UI 限制**：几何为**演示折线，非导航路网** → 图例必须保留 `折線為演示參考，非導航路網`。

### 6.2 RiskBreakdown
- **已确认**：5 因子 + `overall` + `weights` + `factors[]` + `confidence`。
- **缺口**：`confidence` 与 `factors[].notices` 未在 UI 呈现（P1）。

### 6.3 Crowd Signal
- **已确认**：`CrowdSignal { level(4), confidence, evidence }`。
- **语义待确认**：`critical` 与 `RiskLevel` 的关系（P0，需 A）。
- **不可编造**：**无精确人数**。

### 6.4 Reliability / On-time Probability
- **已确认**：`onTimeConfidence`（定性 3 档）+ `confidenceNote` + `etaRange`。
- **⚠️ 不存在「准时概率百分比」**：第一阶段已定「未经校准不输出概率」。
  UI **永远不得**显示 `89%` 之类数字。

### 6.5 Best Departure Window
- **已确认**：`departureOptions[]`（每 10 分钟一格，0–120 分钟）+ `bestDeparture`。
- **每格含**：`departAt / routeId / riskScore / etaRange / meetsDeadline`。
- **缺口**：无「未来风险序列」的时间戳/来源 → 序列本身来自 `evaluate()` 重算，非独立数据源。

### 6.6 Plan B / Plan C
- **已确认**：`planB: { routeId, trigger, reason } | null`。
- **不存在 Plan C**（见 §3-4）。跨境换口岸语义已包含在 `planB.reason`。

### 6.7 Border Risk
- **已确认**：`JourneySegment.border: { portId, queueMinutesRange, confidence, note }`；`BORDER_PORTS[].openFrom/openTo`。
- **硬约束**：排队必须**区间 + 信心 + 估算**。

### 6.8 Border Queue Range
- **已确认**：`[number, number]`。
- **缺口**：`confidence` 写死「低信心」（P0）；`note` 未显示。

### 6.9 DataEnvelope
- **已确认**（`types/team-integration.ts`）：`{ value, source, sourceUrl, updatedAt, expiresAt, confidence, quality }`。
- **现状**：`JourneyAnalysis.sources[]` 是简化版（`label/url/updatedAt/note`），**无 `confidence` / `expiresAt`**。
- **UI 影响**：无法显示来源级信心 → 标 `Pending`（需 B/A 确认是否统一到 `DataEnvelope`）。

### 6.10 Confidence
- **已确认**：`Confidence = 'high' | 'medium' | 'low'`。
- **UI 需要显示 4 处**：`reliability.onTimeConfidence`（✅已显示）、`RiskBreakdown.confidence`（❌）、`CrowdSignal.confidence`（❌）、`BorderQueue.confidence`（❌）。

### 6.11 Data Quality
- **已确认**：`RouteQuality = 'live' | 'cached' | 'fixture'`。
- **现状**：`JourneyAnalysis.quality` **类型固定为 `'fixture'`** → 目前 UI 只能显示 fixture。
- **规则**：`fixture` 用中性徽章，**不得**用绿/黄/红。

### 6.12 Replay / Simulation 的变化结果
- **现状**：`play(index)` 直接**重跑 `run()`** 并替换整个 `analysis` → **不保留上一份快照**，因此**无法在 UI 上做前后对比**。
- **缺口**：需要保存旧快照（纯前端改动，**不需契约变更**）或由 A/C 提供 diff。
- **详见**：`REPLAY-SIMULATION-SPEC.md`。

---

## 7. 待确认事项汇总

### 7.1 需要 **A** 确认

| # | 事项 | 级别 |
|---|---|---|
| A-1 | `JourneyVisualSpec.risk.critical` 的语义与命名（crowd-only？） | **P0** |
| A-2 | 团队「橙 = 较高」的归属（接受 E 的「三色 + 符号承载第四档」方案） | **P0** |
| A-3 | `JourneyVisualSpec` 是否新增选中态/口岸/地点等字段，或维持只管颜色 | P1 |
| A-4 | 三处 `quality`（`RiskContext` / `CandidateRoute` / `JourneyAnalysis`）的关系与显示优先级 | P1 |
| A-5 | Replay 差异对比：前端自比对 或 新增 `JourneyDiff` 契约 | P1 |
| A-6 | `docs/PHASE2_CONTRACTS.md §1` 未列 `UI Spec v2`，与工作流「第 0 天冻结」不一致 | P1 |

### 7.2 需要 **B** 确认

| # | 事项 | 级别 |
|---|---|---|
| B-1 | `JourneyAnalysis.sources[]` 是否统一到 `DataEnvelope`（补 `confidence` / `expiresAt`） | P1 |
| B-2 | 口岸数据的真实来源与刷新频率（现为参考时刻表 + 「座標未核實」） | P1 |
| B-3 | 部分数据源失败时，`sources[]` 是否如实排除（现为成功源才加入） | P2 |

### 7.3 需要 **C** 确认

| # | 事项 | 级别 |
|---|---|---|
| C-1 | `BorderQueue.confidence` 的实际取值口径（现 UI 写死「低信心」） | **P0** |
| C-2 | `CrowdSignal.confidence` / `.evidence` 是否应在 UI 显示 | P1 |
| C-3 | `CrowdRiskResult` / `BorderRiskResult` / `DepartureWindow` / `RoutePlanChain` 正式型别落地时间 | P1 |
| C-4 | `RiskFactor.notices` 是否正式作为「数据缺口」的用户可见说明 | P1 |
| C-5 | 是否存在 Plan C（`RoutePlanChain`）？UI 目前不虚构 | P2 |
