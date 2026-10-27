# Journey Visual Spec v2 — E → D 视觉交接规范

| 项目 | 值 |
|---|---|
| 文档 | JOURNEY-VISUAL-SPEC-v2 |
| Owner | **E（UI / UX / Design System）** |
| 消费方 | **D（地图与前端交互实现）** |
| 版本 | v2.0 · 2026-10-10 |
| 适用代码 | `app/src/**`（第二阶段工作副本，位于本工作区 `A部分/app/`） |
| 相关文件 | `RISK-VISUAL-SPEC-v2.md`、`MAP-LAYERS-SPEC-v2.md`、`QA-CHECKLIST.md` |
| 上游依据 | 第一阶段 `UI-Handoff-v1.0/DESIGN-TOKENS.md`（UI Baseline v1.0）|

> **本文件不改变任何业务算法、接口契约或数据**。所有颜色、线宽、符号都是**视觉规格**；
> 风险等级、可信度、可行性的**判定**一律由 A/C 的代码决定。

---

## A. 视觉设计原则

1. **E 是视觉规范的唯一负责人。** 风险等级、路线样式的颜色与符号以本文件为准。
2. **D 负责按照已确认的视觉规范实现**，不需要（也不应该）自行发明配色。
3. **不得由开发人员自行决定风险等级颜色。** 现有 `JourneyMap.tsx` 中的硬编码色值必须由本文件的 Token 取代（见 §H）。
4. **地图属于高信息密度区域**，周边卡片应保持简洁；侧栏与卡片沿用第一阶段已收敛的字级与间距。
5. **风险不能只通过颜色表达**，必须同时使用文字标签 + 非颜色符号（形状/线型）。见 `RISK-VISUAL-SPEC-v2.md §C`。
6. **用户可见文案统一使用香港繁体中文**及一致的香港用语（`風險`、`通關`、`口岸`、`人流`、`信心`）。
7. **所有估算、缓存及演示数据必须有清晰的视觉标识**（`演示估算 · fixture` 徽章、`排隊估算`、`信心：低`）。
8. **不得通过视觉设计暗示系统掌握未经验证的精确人数或排队时间。** 排队一律「区间 + 信心 + 估算」三件套。
9. **移动端优先，桌面端适配。**
10. **视觉规格不能改变业务算法、接口契约或实际数据。**

---

## B. 本次实际检查的源码（事实来源）

| 文件 | 读到的内容 |
|---|---|
| `src/lib/integration/ui-contract.ts` | `RiskVisualToken`、`JourneyVisualSpec`、`REFERENCE_JOURNEY_VISUALS` 的**完整定义** |
| `src/lib/integration/index.ts` | 对外导出面（`REFERENCE_JOURNEY_VISUALS`、型别） |
| `src/lib/types/risk.ts` | `RiskLevel`、`CrowdSignal`、`RiskFactor`、`RiskBreakdown`、`RouteRisk` |
| `src/lib/risk/thresholds.ts` | `RISK_LEVEL_CUTOFFS`、`riskLevelOf`、`RISK_LEVEL_LABELS`、`RISK_FACTOR_LABELS`、权重表、`confidenceCapForQuality` |
| `src/lib/types/journey.ts` | `SegmentKind`、`BorderQueue`、`JourneySegment`、`Journey`、`journeyGeometry`、`borderSegments` |
| `src/lib/types/route.ts` | `CandidateRoute`、`RouteQuality` |
| `src/lib/types/journey-analysis.ts` | `JourneyAnalysis`、`AnalyzedJourney`、`DepartureOption` |
| `src/lib/types/team-integration.ts` | `DataEnvelope`、`TeamJourneyResult` |
| `src/lib/journey/analysis.ts` | `estimateCrowd`（**会产出 `critical`**）、`exclusionsFor`、`action: go/hold/unavailable` |
| `src/lib/geo/ports.ts` | `BORDER_PORTS`（4 个口岸 + 开放时间） |
| `src/components/JourneyMap.tsx` | 地图实现、**硬编码色值**、图例文字、工具栏、降级处理 |
| `src/components/JourneyPlanner.tsx` | 页面结构、`LEVELS`/`FACTORS`/`MODE_LABELS`、各状态文案、Replay 时间轴 |
| `src/app/globals.css` | `journey-*` 样式与现有色值 |
| `docs/phase2-qa/desktop.png` `mobile.png` | 现有实机截图（验收对照用） |

**未检查、也未假定存在的**：任何未在上述文件中出现的字段、枚举或默认值。

---

## C. `JourneyVisualSpec` 的真实结构

来源：`src/lib/integration/ui-contract.ts`（A 所有）。

```ts
export interface RiskVisualToken { label: string; color: string; symbol: string }

export interface JourneyVisualSpec {
  risk: Record<'low' | 'medium' | 'high' | 'critical', RiskVisualToken>;
  border: { color: string; dashPattern: string; label: string };
  unavailable: RiskVisualToken;
}
```

### C.1 每个字段的类型与用途

| 字段 | 类型 | 允许值 | 用途 | 现状 |
|---|---|---|---|---|
| `risk` | `Record<4 个键, RiskVisualToken>` | 键只能是 `low`/`medium`/`high`/`critical` | 风险等级的颜色/标签/符号 | **4 个键** |
| `risk[*].label` | `string` | 任意字串 | 用户可见的等级标签 | 已给参考值 |
| `risk[*].color` | `string` | 任意 CSS 颜色 | 路线/图层/标记的颜色 | 已给参考值 |
| `risk[*].symbol` | `string` | 任意字串（现为字符符号） | **非颜色**区分符号 | 已给参考值 |
| `border` | 对象（3 个字段） | — | 通关段样式 | **缺线宽/透明度** |
| `border.color` | `string` | 任意 CSS 颜色 | 通关段颜色 | 已给参考值 |
| `border.dashPattern` | `string` | CSS `stroke-dasharray` 语法 | 通关段虚线 | `'7 7'` |
| `border.label` | `string` | 任意字串 | 通关段图例标签 | `通關段` |
| `unavailable` | `RiskVisualToken` | — | **不可行路线**的样式（不是风险等级） | 已给参考值 |

> ⚠️ `unavailable` 是 `RiskVisualToken` 型别，但语义上**属于「路线可行性」而不是「风险等级」**。
> 它没有 `low/medium/high` 的对应关系，D 不应把它当成第四/第五个风险等级。

### C.2 `REFERENCE_JOURNEY_VISUALS` 的真实内容

```ts
export const REFERENCE_JOURNEY_VISUALS: JourneyVisualSpec = {
  risk: {
    low:      { label: '低風險', color: '#16736b', symbol: '●'  },
    medium:   { label: '中風險', color: '#b46b0c', symbol: '▲'  },
    high:     { label: '高風險', color: '#ba4144', symbol: '!'  },
    critical: { label: '極高風險', color: '#84282c', symbol: '!!' },
  },
  border:    { color: '#8653ad', dashPattern: '7 7', label: '通關段' },
  unavailable: { label: '不可行', color: '#8b99a1', symbol: '×' },
};
```

文件内注释原文已声明：

> `/** Reference values for E to replace, not a claim of a finalized design system. */`

**即：这组值是等待 E 取代的占位参考，不是已定稿的设计系统。** 本文件即为其正式提案（见 `RISK-VISUAL-SPEC-v2.md`）。

### C.3 它与路线、风险、跨境、不可用状态的关系

| Spec 字段 | 由什么驱动 | 判定者 |
|---|---|---|
| `risk.low/medium/high` | `RouteRisk.level`（`RiskLevel`） | A（`riskLevelOf(score)`） |
| `risk.critical` | **路线风险算法不会产出**（见 §D） | — |
| `border.*` | `JourneySegment.kind === "border_crossing"` | A（`route/parse.ts`） |
| `unavailable.*` | `AnalyzedJourney.eligible === false` | A（`journey/analysis.ts` 的 `exclusionsFor`） |

---

## D. ⚠️ 三种「等级」不是同一个枚举（本文件最重要的核对）

代码里同时存在三种不同的等级，**必须分别记录，不能混为一谈**：

| # | 概念 | 型别与出处 | 允许值 | 档数 |
|---|---|---|---|---|
| 1 | **路线风险等级** | `RiskLevel` — `types/risk.ts:20` | `low` / `medium` / `high` | **3** |
| 2 | **人流信号等级** | `CrowdSignal.level` — `types/risk.ts:136` | `low` / `medium` / `high` / **`critical`** | **4** |
| 3 | **视觉规格等级** | `JourneyVisualSpec.risk` — `ui-contract.ts:4` | `low` / `medium` / `high` / **`critical`** | **4** |

辅证：

- `risk/thresholds.ts` 的 `riskLevelOf(score)`：`0–39 → low`、`40–69 → medium`、`70–100 → high` —— **只回传三种**。
- `risk/thresholds.ts` 的 `RISK_LEVEL_LABELS`：`{ low:'低', medium:'中', high:'高' }` —— **只有三键**。
- `journey/analysis.ts:17` 的 `estimateCrowd()`：`level = interrupted ? 'critical' : peak ? 'high' : …` —— **会产出 `critical`**，但那是**人流信号**，不是路线风险。
- `JourneyPlanner.tsx:13` 的 `LEVELS` 有 4 键（`critical:'極高'`），因为它同时渲染人流与路线风险。
- `types/risk.ts` 的 `RiskBreakdown` 注释明确写：**「本模型输出的是定性风险等级（low / medium / high）」**。

### D.1 结论（P0，需 A 确认）

- **`critical` 目前不是路线风险算法的等级。** `RiskRoute.level` / `RiskLevel` 不可能等于 `critical`。
- **`critical` 确实已存在于「人流信号」这一真实业务输出**（`CrowdSignal.level`，由 `estimateCrowd` 产出）。
- 因此 `JourneyVisualSpec.risk.critical` **只能解释为「人流信号的最高档」的视觉扩展**，不得被解释为路线风险新增等级。
- 若团队希望 `critical` 仅用于人流，**建议在 `JourneyVisualSpec` 中把该键的语义写明**（例如改名为 `crowdCritical`，或在文档注释标注 `crowd-only`）。
  → **此项属 A 的契约决定，E 不自行修改 `ui-contract.ts`。**

### D.2 映射关系（现状）

```
路線風險  RiskLevel(3) ──► JourneyVisualSpec.risk.{low,medium,high}
人流訊號  CrowdSignal(4) ──► JourneyVisualSpec.risk.critical（僅最高檔；其餘共用 low/medium/high）
路線可行性 eligible=false ──► JourneyVisualSpec.unavailable
跨境段   kind=border_crossing ──► JourneyVisualSpec.border
```

> 「团队要求的四色（绿/黄/橙/红）」对应关系：
> - 绿 = `low`、黄 = `medium`、红 = `high` → **已确认，对应路线风险三档**
> - 橙 = 「较高」→ **在现有代码中找不到对应的路线风险档位**
>   → 视觉上保留为 `risk.critical`（`#84282c` 目前是**暗红**，不是橙），**待 A 确认橙色的归属**（P0，见 §J）

---

## E. 现有实现现状（D 需要改动的起点）

### E.1 演示地图**尚未**读取 `JourneyVisualSpec`

`grep REFERENCE_JOURNEY_VISUALS src/components/` → **无命中**。
`JourneyMap.tsx` 中的颜色是**硬编码副本**：

```ts
const COLORS = { low: '#16736b', medium: '#b46b0c', high: '#ba4144' };   // 只有 3 键
// 未可行：'#8b99a1'      通关段：'#8653ad' + dashArray '7 7'      关闭风险上色：'#2577a4'
```

→ 与 `REFERENCE_JOURNEY_VISUALS` 的数值目前**一致**（人手同步），但**没有单一来源**；任何一方改动都会静默漂移。

### E.2 其他硬编码视觉常量（`JourneyMap.tsx`）

| 用途 | 现值 |
|---|---|
| 路线线宽 | 选中 `7` / 未选中 `4` |
| 路线透明度 | 选中 `1` / 未选中 `0.5` |
| 通关段虚线 | `'7 7'` |
| 关闭「风险上色」时的路线色 | `#2577a4` |
| 口岸节点 | `circleMarker` 半径 `6`、色 `#8653ad`、`fillOpacity 0.6` |
| 起点/终点标记 | 半径 `9`、色 `#123e54` |
| 其他已收录地点 | 半径 `4`、边 `#6a8290`、填 `#fff` |
| 目前位置精度圈 | `#2688d2`、`fillOpacity 0.12` |
| 目前位置标记 | 半径 `7`、填 `#2688d2`、边 `#fff` |

### E.3 现有图例文案（`JourneyMap.tsx`）

> 綠：低風險 · 黃：中風險 · 紅：高風險 · 紫虛線：通關 · 灰：不可行。折線為演示參考，非導航路網。

**问题**：图例只提「绿/黄/红」，但实际色值是**青绿 `#16736b` / 琥珀 `#b46b0c` / 红 `#ba4144`**；且未提「橙（较高）」。→ 见 §H 与 P1 问题。

---

## F. Token 命名规范

命名原则：**沿用第一阶段既有的语义化做法**（`--ink` / `--muted` / `--line` / `--blue`…），
v2 以 `--` 开头的 CSS 自订属性作为实现载体，并保留一组「Spec 对应名」以便与 `JourneyVisualSpec` 对照。

| Spec 对应名 | 建议 CSS 变量 | 语义 | 是否已确认 |
|---|---|---|---|
| `risk.low` | `--risk-low` | 路线风险「低」 | ✅ 已确认（`RiskLevel.low`） |
| `risk.medium` | `--risk-medium` | 路线风险「中」 | ✅ 已确认（`RiskLevel.medium`） |
| `risk.high` | `--risk-high` | 路线风险「高」 | ✅ 已确认（`RiskLevel.high`） |
| `risk.critical` | `--risk-critical` | **人流信号最高档** | ⚠️ 待 A 确认语义 |
| `border.crossing` | `--border-crossing` | 通关段 | ✅ 已确认（`kind === 'border_crossing'`） |
| `route.unavailable` | `--route-unavailable` | 不可行路线 | ✅ 已确认（`eligible === false`） |
| `route.riskLayerOff` | `--route-neutral` | 关闭风险上色时的路线色 | 🟡 E 提案 |
| `route.width.selected` | `--route-width-selected` | 选中线宽 | 🟡 E 提案 |
| `route.width.default` | `--route-width-default` | 未选中线宽 | 🟡 E 提案 |
| `route.opacity.selected` | `--route-opacity-selected` | 选中透明度 | 🟡 E 提案 |
| `route.opacity.default` | `--route-opacity-default` | 未选中透明度 | 🟡 E 提案 |
| `port.node` | `--port-node` | 口岸节点 | 🟡 E 提案 |
| `place.terminal` | `--place-terminal` | 起终点标记 | 🟡 E 提案 |
| `place.other` | `--place-other` | 其他已收录地点 | 🟡 E 提案 |
| `position.marker` | `--position-marker` | 目前位置 | 🟡 E 提案 |
| `map.canvas` | `--map-canvas` | 地图底图容器底色 | 🟡 E 提案 |
| `status.hold` / `status.unavailable` / `status.offline` / `status.error` | `--status-*` | 状态条 | 🟡 E 提案 |

图例：✅ = 代码已确认 ｜ 🟡 = E 提出的视觉建议（颜色值待 E 确认后可实作）｜ ⚠️ = 待团队确认

**命名约束**：不得新增与第一阶段 `--ink/--muted/--faint/--blue/--green/--amber/--red/--deep` 语义重复的变量。

---

## G. `JourneyVisualSpec` 字段映射表

「实际字段」全部来自 §B 所列源码，未凭空补充。

| 实际字段 | 实际类型 | 当前值/默认值 | 视觉含义 | 对应 Token | 应用位置 | 实现说明 | 状态 |
|---|---|---|---|---|---|---|---|
| `risk['low'].label` | `string` | `低風險` | 低风险文字标签 | `risk.low` | 风险图层图例、风险卡 | 与 `RISK_LEVEL_LABELS.low`（`低`）**用词不同**，需统一 | ⚠️ 待统一 |
| `risk['low'].color` | `string` | `#16736b` | 低风险颜色 | `risk.low` | 地图折线、因子卡 | 现为青绿，非纯绿 | ✅ 可用 |
| `risk['low'].symbol` | `string` | `●` | 非颜色符号 | `risk.low` | 图例、风险卡 | 需与 medium/high 拉开差异（见 RISK 文件） | 🟡 |
| `risk['medium'].label` | `string` | `中風險` | 中风险标签 | `risk.medium` | 同上 | 与 `RISK_LEVEL_LABELS.medium`（`中`）不一致 | ⚠️ |
| `risk['medium'].color` | `string` | `#b46b0c` | 中风险颜色 | `risk.medium` | 地图折线 | 现为琥珀棕，**不是黄** | ⚠️ 见 P1 |
| `risk['medium'].symbol` | `string` | `▲` | 非颜色符号 | `risk.medium` | 图例 | — | 🟡 |
| `risk['high'].label` | `string` | `高風險` | 高风险标签 | `risk.high` | 同上 | 与 `RISK_LEVEL_LABELS.high`（`高`）不一致 | ⚠️ |
| `risk['high'].color` | `string` | `#ba4144` | 高风险颜色 | `risk.high` | 地图折线 | 红 | ✅ |
| `risk['high'].symbol` | `string` | `!` | 非颜色符号 | `risk.high` | 图例 | 与 critical 的 `!!` 过近 | 🟡 |
| `risk['critical'].label` | `string` | `極高風險` | **人流最高档**标签 | `risk.critical` | 人流/因子卡 | **路线风险不会产出此值** | ⚠️ 待 A 确认 |
| `risk['critical'].color` | `string` | `#84282c` | — | `risk.critical` | — | 暗红，与 `high` 的 `#ba4144` 过近 | ⚠️ |
| `risk['critical'].symbol` | `string` | `!!` | — | `risk.critical` | — | 与 `!` 过近 | ⚠️ |
| `border.color` | `string` | `#8653ad` | 通关段颜色 | `border.crossing` | 地图折线 | 已实作（硬编码同值） | ✅ |
| `border.dashPattern` | `string` | `'7 7'` | 通关段虚线 | `border.crossing` | 地图折线 `dashArray` | 已实作 | ✅ |
| `border.label` | `string` | `通關段` | 通关段图例 | `border.crossing` | 图例、路段列 | 已实作 | ✅ |
| `unavailable.label` | `string` | `不可行` | 不可行标签 | `route.unavailable` | 路线卡 tag、图例 | 路线卡显示 `不可行` | ✅ |
| `unavailable.color` | `string` | `#8b99a1` | 不可行颜色 | `route.unavailable` | 地图灰虚线 | 已实作 | ✅ |
| `unavailable.symbol` | `string` | `×` | 非颜色符号 | `route.unavailable` | 图例 | **图例与卡片目前未显示此符号** | 🟡 待补 |
| `RouteRisk.level` | `RiskLevel` | `low`/`medium`/`high` | 风险等级 | `risk.*` | 地图折线配色 | 3 值，驱动地图主配色 | ✅ |
| `RouteRisk.breakdown.overall` | `number` | 0–100 | 加权总分 | — | 因子卡（不直接显示） | 目前 UI 未显示数值 | ✅ |
| `RiskFactor.score` | `number` | 0–100 | 单因子分数 | — | 因子卡 | 目前 UI 显示的是 `level`，**未显示 score** | ✅ |
| `RiskFactor.level` | `RiskLevel` | 3 值 | 单因子等级 | `risk.*` | `.journey-factors` | `LEVELS[factor.level]` | ✅ |
| `RiskFactor.claim` / `.evidence` / `.source` | `string` | — | 溯源文字 | — | 因子卡 `<details>` | 已实作 | ✅ |
| `RiskBreakdown.confidence` | `Confidence` | `high`/`medium`/`low` | 风险评估可信度 | `status.*` | 因子卡/摘要 | 目前未在因子卡单独显示 | 🟡 待补 |
| `CrowdSignal.level` | 4 值 | 含 `critical` | 人流等级 | `risk.critical` | 路线卡「整體風險」旁 | `estimateCrowd` 产出 | ⚠️ |
| `CrowdSignal.confidence` | `Confidence` | 固定 `'low'` | 人流可信度 | — | 路线卡 | **目前未显示** | 🟡 待补 |
| `JourneySegment.kind` | `SegmentKind` | `in_hk`/`border_crossing`/`in_sz` | 跨境归属 | `border.crossing` | 地图折线、路段列 | 仅 `border_crossing` 有专门样式 | ✅ |
| `JourneySegment.border.queueMinutesRange` | `[number, number]` | 例 `[15, 30]` | 排队区间 | — | 地图 popup、路段列 | 已显示为 `排隊估算 15–30 分鐘` | ✅ |
| `JourneySegment.border.confidence` | `Confidence` | — | 排队可信度 | — | 路段列 | **目前写死「低信心」字样** | ⚠️ 应读字段 |
| `JourneySegment.border.note` | `string \| null` | — | 估算说明 | — | 路段列 | **目前未显示** | 🟡 |
| `Journey.borderPortIds` | `string[]` | — | 途经口岸 | `port.node` | 地图节点 | 未用于节点样式 | 🟡 |
| `Journey.crossesBorder` | `boolean` | — | 是否跨境 | — | 布局/标签 | 未用于视觉标示 | 🟡 |
| `AnalyzedJourney.eligible` | `boolean` | — | 是否可行 | `route.unavailable` | 地图灰虚线、卡片 tag | 已实作 | ✅ |
| `AnalyzedJourney.exclusions` | `string[]` | — | 排除原因 | `status.error` | 卡片红字 | 已实作 | ✅ |
| `JourneyAnalysis.action` | `'go'\|'hold'\|'unavailable'` | — | 整体行动 | `status.*` | 结果标题 | 已实作（3 种标题） | ✅ |
| `JourneyAnalysis.quality` | `'fixture'` | 固定 | 数据品质 | `status.*` | `演示估算 · fixture` 徽章 | 已实作 | ✅ |
| `RouteQuality` | `'live'\|'cached'\|'fixture'` | — | 路线品质 | `status.*` | 路线卡 | **目前未在路线卡标示单条品质** | 🟡 待补 |

### G.1 `REFERENCE_JOURNEY_VISUALS` 是否覆盖所有视觉需求？

**不覆盖。** 现有 `JourneyVisualSpec` 只有 3 个顶层字段，缺少以下**已被实际使用**的视觉属性：

| 缺失的视觉需求 | 为什么现有字段无法覆盖 | 建议 |
|---|---|---|
| 选中态（线宽/透明度） | `risk[*]` 只有 `label/color/symbol`，无状态维度 | **E 提案**：新增 `route.width.selected/default`、`route.opacity.selected/default`（或由 D 以 CSS 常量实现，不入契约） |
| 关闭风险上色时的中性色 | 无对应字段 | 同上（`route.riskLayerOff`） |
| 口岸节点样式 | 无对应字段 | 同上（`port.node`） |
| 起终点/其他地点标记样式 | 无对应字段 | 同上（`place.terminal` / `place.other`） |
| 目前位置样式 | 无对应字段 | 同上（`position.marker`） |
| 单条路线的资料品质标示 | `unavailable` 只表达「不可行」 | 需 D 读取 `CandidateRoute.quality` 自行呈现（无 spec 字段） |
| 状态条（hold / offline / stale / error） | 无对应字段 | E 提案样张；D 可用既有 `journey-status`/`journey-alert` 样式 |
| 跨境「未核实坐标」提示 | 无对应字段 | 纯文案，不需 token |

→ **以上均属「无法用现有契约表达」的视觉需求，标记为 `Pending Contract Confirmation`。**
→ **E 不直接修改 TypeScript 文件**；若团队决定纳入契约，请由 A 按契约变更流程处理。

---

## H. Design Token 与实现对照

完整颜色表、符号表与可访问性要求见 **`RISK-VISUAL-SPEC-v2.md`** 与 **`MAP-LAYERS-SPEC-v2.md`**。
本节只列**已确认**的核心值（与现有代码一致，保证 D 可以从「现况 → token」无痛迁移）：

| Token | 建议值 | 语义 | 适用位置 | 是否已确认 | 对应 Spec 字段 |
|---|---|---|---|---|---|
| `--risk-low` | `#16736b` | 路线风险低 | 地图折线、图例 | ✅ 与 `REFERENCE_JOURNEY_VISUALS` 一致 | `risk.low.color` |
| `--risk-medium` | `#b46b0c` | 路线风险中 | 同上 | ✅ | `risk.medium.color` |
| `--risk-high` | `#ba4144` | 路线风险高 | 同上 | ✅ | `risk.high.color` |
| `--risk-critical` | `#84282c` | 人流信号最高档 | 因子卡、人流标签 | ⚠️ 语义待确认 | `risk.critical.color` |
| `--border-crossing` | `#8653ad` | 通关段 | 地图折线 | ✅ | `border.color` |
| `--route-unavailable` | `#8b99a1` | 不可行 | 地图折线 | ✅ | `unavailable.color` |
| `--route-neutral` | `#2577a4` | 关闭风险上色的路线 | 地图折线 | 🟡 E 提案 | 无 |
| `--map-canvas` | `#e6eef0` | 地图容器底色 | `.journey-map` | ✅ 现况 | 无 |

---

## I. D Integration Notes

1. **现有演示地图尚未自动读取 `JourneyVisualSpec`**（`grep REFERENCE_JOURNEY_VISUALS src/components/` 无命中）。实作位置是 `src/components/JourneyMap.tsx` 顶部的 `COLORS` 常量与 `L.polyline(...)` 的 options。
2. D 需要**按照已经确认的视觉规格**，替换演示地图中对应的颜色常量。建议做法：在 `globals.css` 定义 §F 的 CSS 自订属性，并在 `JourneyMap.tsx` 以 `getComputedStyle` 或直接常量对照取值。**具体做法由 D 决定，E 只规范「值」与「语义」。**
3. **不要为还原视觉而修改业务算法。**
4. **不要自行新增风险等级。** `RiskLevel` 只有 3 个值；`critical` 属于人流信号，不得让路线风险产出 `critical`。
5. **不要自行改变 `JourneyVisualSpec` 的字段。**
6. **不要修改 A 所拥有的共享类型**（`src/lib/types/**`、`src/lib/integration/**`）。
7. **不要编造字段不存在的颜色、图标、路线状态或业务值。**
8. 如果一个需求无法通过现有接口表达，**先记录问题并交由 E/A 确认**（清单见 §J）。
9. 如果视觉样式与当前实际数据冲突，**保留真实数据语义**，并向 E 提交问题。
10. 完成后使用 **`QA-CHECKLIST.md`** 对比 `docs/phase2-qa/desktop.png` 与 `mobile.png`。

---

## J. 问题清单

### P0（阻塞实现或可能造成严重误导）

| # | 问题 | 影响 | 需要谁 |
|---|---|---|---|
| P0-1 | `JourneyVisualSpec.risk` 有 4 键，但路线风险 `RiskLevel` 只有 3 值；`critical` 仅来自人流信号 `CrowdSignal.level` | D 可能误把 `critical` 当作路线风险第四档而写出错误的映射（例如给路线风险加 `critical` 分支） | **A** 确认 `risk.critical` 的语义与命名 |
| P0-2 | 团队要求的「橙色 = 较高」在现有代码中**找不到对应的路线风险档位**；`critical` 现值为**暗红 `#84282c`**，不是橙 | 若 D 直接把 `critical` 画成橙，会与「不得新增算法等级」冲突；若照现值画，则团队四色要求未满足 | **A + E** 决定橙色归属 |
| P0-3 | `queueMinutesRange` 的 `confidence` 目前未读取（路段列写死「低信心」） | 与其他来源的可信度不一致；违反 DoD「每个数字都要带 confidence」 | **C** 提供该字段的实际取值口径 + **D** 修正 |

### P1（重要设计或接口问题）

| # | 问题 | 影响 | 需要谁 |
|---|---|---|---|
| P1-1 | 图例文案写「黃：中風險」，实际色值是琥珀棕 `#b46b0c`；图例也未提「橙／較高」 | 用户看到的颜色名与实物不符 | E 改写图例文案（见 MAP-LAYERS §图例） |
| P1-2 | 标签用词两套：spec 用 `低風險/中風險/高風險`，`RISK_LEVEL_LABELS` 用 `低/中/高`，UI 再映射一次 | 同一概念三种写法 | E 统一（建议 spec 用「低／中／高風險」，短标签用「低／中／高」） |
| P1-3 | `critical` 的 `#84282c` 与 `high` 的 `#ba4144` 色差不足；符号 `!` 与 `!!` 过近 | 色盲/低对比环境下无法区分 | E 调整（见 RISK-VISUAL-SPEC §B） |
| P1-4 | `unavailable.symbol`（`×`）在 UI 中未出现，仅用颜色+文字 | 非颜色区分不足 | D 在路线卡与图例补 `×` |
| P1-5 | 单条路线的 `RouteQuality` 未在路线卡标示 | 「fixture 不得伪装成 live」的可追溯性不足 | D 补标示 |
| P1-6 | `CrowdSignal.confidence` 与 `RiskBreakdown.confidence` 均未在 UI 显示 | DoD 第 8 条「每个数字都要带 confidence」 | D 补 |
| P1-7 | 无「选中路线」之外的**多路线同时比较**视觉规范（三条路线叠在一起） | 三条跨境路线重叠时会互相遮蔽 | E 规范（见 MAP-LAYERS §D） |

### P2（非阻塞视觉优化）

| # | 问题 |
|---|---|
| P2-1 | 地图容器底色 `#e6eef0` 与第一阶段 `--canvas #f4f6f6` 不一致 |
| P2-2 | `journey-map-caption` 字号 `11px`，低于第一阶段已收敛的最小字级 `12px` |
| P2-3 | 「在地圖選取：起點/終點」与地图工具栏两个 checkbox 语义相关但分散在两处 |
| P2-4 | Replay 时间轴刻度文字 `11px`，同样低于 12px 下限 |
