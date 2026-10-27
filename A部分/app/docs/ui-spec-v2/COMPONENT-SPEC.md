# Component Spec v2 — 组件视觉与交互规范

Owner **E** ｜ 消费方 **D** ｜ 版本 v2.0 · 2026-10-10
配套：`DESIGN-TOKENS-v2.md`、`UI-WIREFRAMES.md`、`UI-STATES.md`、`API-UI-DEPENDENCIES.md`

> 组件名称只是**实现建议**。正式项目沿用既有元件结构；若已有对应元件（`.journey-*`），
> 请**扩展既有元件**而非新建。
>
> **与 `JOURNEY-VISUAL-SPEC-v2.md` 的关系**：以已确认的**接口事实**为准。
> 若本文件与既有规范冲突，**不修改既有规范**，冲突记录在 §20。

---

## 1. Search / Location Input
| 项 | 内容 |
|---|---|
| 目的 | 选取起点/终点（仅限已收录地点） |
| 组成 | `<label>` + `<input>` + 下拉选项列表 + 提示行 |
| Token | `--c-bg-surface` `--c-border` `--radius-md` `--font-size-body` `--layout-touch-min` |
| 交互 | 聚焦展开、输入过滤、点选关闭、`Escape` 关闭、`aria-controls` 关联 |
| 状态 | 默认 / 聚焦展开 / 有匹配 / **无匹配**（`沒有匹配的地點，請更換關鍵字。`） |
| 移动端 | 选项行 `min-height:44px`；下拉宽度 = 输入框宽 |
| 可访问性 | `id` + `<label for>`；`aria-controls`；点选后焦点回输入框 |
| 数据字段 | `PlaceEntry.id/name/side`；写入 `JourneyAnalysisRequest.origin/destination` |
| 现状 | ✅ `.journey-search` / `.journey-search-options` |

## 2. Route Card
| 项 | 内容 |
|---|---|
| 目的 | 一条候选路线的可比较摘要 |
| 组成 | tag + 路线名 + **大数值分钟** + ETA + 风险 + 信心 + 红字警示 |
| Token | `--font-size-metric`（25px）`--radius-md` `--c-border-strong` `--risk-*` `--c-danger` |
| 交互 | 整卡可点（`<button aria-pressed>`）；点选联动地图与详情 |
| 状态 | 默认 / 选中（`.is-selected`）/ 推荐（tag）/ 不可行（tag + 红字）/ 超期（红字） |
| 移动端 | 单栏；`overflow-wrap:anywhere` |
| 可访问性 | `aria-pressed`；tag 需为**文字**非仅颜色；大数值用 `tabular-nums` |
| 数据字段 | `candidate.label`、`journey.totalMinutes`、`reliability.etaRange/.onTimeConfidence`、`risk.level`、`meetsDeadline`、`exclusions`、`eligible` |
| 现状 | ✅ `.journey-route-card` ｜ **缺口**：无品质徽章、无风险符号 |
| E 提案 | tag/`<small>` 字号 `10–11px → 12px`；风险等级前加符号 |

## 3. Risk Badge
| 项 | 内容 |
|---|---|
| 目的 | 单点显示风险等级（**颜色 + 符号 + 文字**） |
| 组成 | 符号（`● ▲ ■ ◆`）+ 等级文字（`低/中/高`） |
| Token | `--risk-low/medium/high`、`--risk-medium-text`、`--font-size-risk-label`、`--font-size-risk-symbol` |
| 交互 | 非交互（展示） |
| 状态 | low / medium / high / critical / unavailable |
| 移动端 | 符号 ≥14px，文字 ≥12px |
| 可访问性 | **不得只用颜色**；符号 `aria-hidden`，文字承载语意 |
| 数据字段 | `RiskLevel`、`CrowdSignal.level`、`AnalyzedJourney.eligible` |
| 现状 | ⚠️ **无独立组件**（现在只用文字 `LEVELS[...]`）→ `[Proposed]` |
| 冲突 | 无（`RISK-VISUAL-SPEC-v2.md §F` 已定义符号，本组件是其载体） |

## 4. Risk Breakdown
| 项 | 内容 |
|---|---|
| 目的 | 5 因子风险的可追溯展开 |
| 组成 | 5 个 `<details>`：summary（因子名 + 等级）/ claim / evidence / source |
| Token | `--c-bg-subtle` `--radius-sm` `--font-size-caption` `--risk-*` |
| 交互 | 展开/收起 |
| 状态 | 默认收起 / 展开 / **资料缺失**（`[Proposed]` 加 `資料未確認` + notice） |
| 移动端 | 5 栏 → 3 栏（≤1000px）→ 2 栏（≤700px） |
| 可访问性 | `<details>/<summary>` 原生语义；`summary` 可聚焦 |
| 数据字段 | `RiskBreakdown.factors[]`（`id/level/claim/evidence/source`）、`.confidence`、`RiskFactor.notices` |
| 现状 | ⚠️ 部分（缺 `confidence`、`notices`、符号） |

## 5. Route Legend
| 项 | 内容 |
|---|---|
| 目的 | 解释地图上的颜色/线型含义 |
| 组成 | `● 低風險 ▲ 中風險 ■ 高風險 × 不可行 ⋯⋯ 通關段` + 声明句 |
| Token | `--risk-*` `--route-border-crossing` `--font-size-caption` |
| 交互 | 静态 |
| 状态 | 风险上色开 / 关（应同步说明） |
| 移动端 | 允许换行；字号 ≥12px |
| 可访问性 | 符号 + 文字 + 色块三者并存 |
| 数据字段 | 无（纯视觉） |
| 现状 | ⚠️ 纯文字、`11px`、色名与实物不符 → 见 `MAP-LAYERS-SPEC-v2.md §G` |

## 6. Map Layer Control
| 项 | 内容 |
|---|---|
| 目的 | 切换「風險上色」「口岸」图层 |
| 组成 | 标题 + 2 个 `<label><input type=checkbox>` |
| Token | `--c-bg-surface` `--font-size-body-sm` `--layout-touch-min` |
| 交互 | checkbox 切换 → 重绘图层 |
| 状态 | 勾选 / 未勾选 |
| 移动端 | `min-height 32px → 44px`（E 提案） |
| 可访问性 | `<label>` 包裹 checkbox（已有）；触控 ≥44px |
| 数据字段 | 无（纯 UI 状态 `riskLayer` / `ports`） |
| 现状 | ✅ `.journey-map-toolbar` |

## 7. Border Port Marker
| 项 | 内容 |
|---|---|
| 目的 | 标示口岸为一等公民节点 |
| 组成 | 圆点 marker（+ popup） |
| Token | `--map-port-marker` `--map-port-radius` |
| 交互 | 点击弹 popup |
| 状态 | 一般 / **选中 `[Proposed]`** / **资料不可用 `[Proposed]`** |
| 移动端 | 半径 `6 → 7` |
| 可访问性 | popup 内容为文字（含「座標未核實」） |
| 数据字段 | `BORDER_PORTS[]`：`id/name/hkNode/openFrom/openTo/modes` |
| 现状 | ✅（缺选中态与不可用态） |

## 8. Border Segment
| 项 | 内容 |
|---|---|
| 目的 | 让用户辨识跨境通关段 |
| 组成 | 折线段（紫 + 虚线）+ 路段列文字 `· 通關段` + 排队三件套 |
| Token | `--route-border-crossing` `--route-border-dash`(7 7) |
| 交互 | 点击弹 popup |
| 状态 | 一般 / 路线不可行（整条转灰虚线 `2 5`） |
| 移动端 | 线宽 ≥3 |
| 可访问性 | **不得只靠颜色**（虚线已提供非颜色线索） |
| 数据字段 | `JourneySegment.kind === 'border_crossing'`、`.border.queueMinutesRange/.confidence/.note` |
| 现状 | ✅ 颜色与虚线 ｜ **缺口**：`confidence` 写死「低信心」、`note` 未显示 |

## 9. Reliability Indicator
| 项 | 内容 |
|---|---|
| 目的 | 显示准时信心（**定性**） |
| 组成 | 文字 `信心：低/中/高`（+ `confidenceNote`） |
| Token | `--c-text-secondary` `--font-size-body-sm` |
| 交互 | 静态 |
| 状态 | high / medium / low |
| 移动端 | 同桌面 |
| 可访问性 | 文字承载；**禁止百分比** |
| 数据字段 | `RankedRoute.reliability.onTimeConfidence`、`.confidenceNote`、`.etaRange` |
| 现状 | ✅（路线卡 + 详情均显示） |

## 10. Best Departure Timeline
| 项 | 内容 |
|---|---|
| 目的 | 呈现出发时间 → 风险的关系 |
| 组成 | 推荐句 + 可展开时间表（出发 / 风险规则分 / 保守到达） |
| Token | `--font-size-caption` `--radius-md` `--c-bg-surface` |
| 交互 | `<details>` 展开；表格横向滚动 |
| 状态 | 有推荐 / 无推荐（`此情景沒有可建議的出發時點…`）/ 时段不可行（`暫緩／不可行`） |
| 移动端 | 表格 `overflow:auto`，保留表头 |
| 可访问性 | `<table>` 有 `<th>`；`<details>` 原生语义 |
| 数据字段 | `JourneyAnalysis.departureOptions[]`、`.bestDeparture` |
| 现状 | ✅ 表格版 ｜ **`[Proposed]`** 风险序列可视化 → `REPLAY-SIMULATION-SPEC.md` |

## 11. Plan B Card
| 项 | 内容 |
|---|---|
| 目的 | 回答「出问题怎么办」 |
| 组成 | 标题 + reason + trigger + 按钮 |
| Token | `--c-bg-surface` `--radius-md` `--c-text-secondary` |
| 交互 | 「查看備選路線」→ 选中该路线（联动地图） |
| 状态 | 有备选 / 无备选 / hold / 备选超期 |
| 移动端 | 与 Best Departure 并排 → 单栏 |
| 可访问性 | 按钮 ≥44px；`trigger` 需有视觉标签（E 提案） |
| 数据字段 | `JourneyAnalysis.planB: {routeId, trigger, reason} \| null` |
| 现状 | ✅ ｜ **缺口**：`觸發條件` 无独立标签 |

## 12. Data Source Indicator
| 项 | 内容 |
|---|---|
| 目的 | 诚实说明来源与时间 |
| 组成 | 标题 + notices 列表 + sources 列表（label / url / note） |
| Token | `--c-text-secondary` `--font-size-caption` `--line-height-relaxed` |
| 交互 | 有 `url` 时为新窗口链接 |
| 状态 | 有来源 / 无链接（`<strong>`）/ **部分缺失 `[Proposed]`** / **时间戳缺失 `[Proposed]`** |
| 移动端 | 单栏；长 URL 换行 |
| 可访问性 | 链接有可读文字；`target="_blank"` 已有 |
| 数据字段 | `JourneyAnalysis.notices[]`、`.sources[]`、`.quality` |
| 现状 | ✅ ｜ **缺口**：`updatedAt` 未显示 |

## 13. Confidence Indicator
| 项 | 内容 |
|---|---|
| 目的 | 让「可信度」可见（**不改颜色**） |
| 组成 | `信心：低/中/高` 文字 chip |
| Token | `--c-text-muted` `.pill` |
| 交互 | 静态 |
| 状态 | 3 档 |
| 移动端 | 同桌面 |
| 可访问性 | 文字载体 |
| 数据字段 | `RankedRoute.reliability.onTimeConfidence`、`RiskBreakdown.confidence`、`CrowdSignal.confidence`、`BorderQueue.confidence` |
| 现状 | ⚠️ 仅显示 `onTimeConfidence`；其余 3 处**未显示** `[Proposed]` |

## 14. Loading Skeleton
| 项 | 内容 |
|---|---|
| 目的 | 避免白屏 |
| 组成 | 地图骨架（`.journey-map-skeleton`）+ 状态文字 |
| Token | `--c-bg-map` `--font-size-body-sm` |
| 交互 | 无 |
| 状态 | 地图载入 / 分析中 / 重算中 |
| 移动端 | 骨架高度 `500px → 340px`（跟随地图高度） |
| 可访问性 | `role="status"`（已有） |
| 数据字段 | 无 |
| 现状 | ✅ |

## 15. Empty State
| 项 | 内容 |
|---|---|
| 目的 | 未操作时的引导 |
| 组成 | 虚线框 + 标题 + 说明 |
| Token | `--c-border-strong`（dashed）`--radius-md` `--c-text-secondary` |
| 交互 | 无（引导用户去操作） |
| 状态 | 未分析（`先選一段旅程。`） |
| 移动端 | 内距 `36/20` |
| 可访问性 | 标题为 `<h2>` |
| 数据字段 | `analysis === null` |
| 现状 | ✅ `.journey-empty` |

## 16. Error State
| 项 | 内容 |
|---|---|
| 目的 | 可读错误 + 重试路径 |
| 组成 | `role="alert"` 红框 + 文字 |
| Token | `--c-danger` `--c-danger-soft` `--c-warning-border` |
| 交互 | 修改输入后重试 |
| 状态 | 分析失败 / 离线计算失败 |
| 移动端 | 同桌面 |
| 可访问性 | `role="alert"`（已有） |
| 数据字段 | `error.message`（后端）｜**不伪造 error code** |
| 现状 | ✅ `.journey-alert` |

## 17. Degraded State
| 项 | 内容 |
|---|---|
| 目的 | 内容可用但不完整时**明确说明** |
| 组成 | 琥珀条 + 说明文字（或 `不可行` tag + 原因） |
| Token | `--c-warning` `--c-warning-soft` `--c-warning-border` `--route-unavailable` |
| 交互 | 通常无（或「查看原因」） |
| 状态 | 离线回退 / 底图失败 / 路线不可行 / 数据缺失 / 部分源失败 / 演示数据 |
| 移动端 | 同桌面 |
| 可访问性 | `role="status"` |
| 数据字段 | `notices`、`exclusions`、`quality`、`RiskFactor.notices` |
| 现状 | ⚠️ 部分（底图失败/离线/不可行 `[現]`；数据缺失与部分源失败 `[Proposed]`） |

## 18. Simulation Comparison
| 项 | 内容 |
|---|---|
| 目的 | 让用户看懂「调整时间后什么变了」 |
| 组成 | 原方案 / 新方案 双栏 + 差异高亮 + 变化摘要 |
| Token | 见 `REPLAY-SIMULATION-SPEC.md` |
| 交互 | 拖动时间轴后展示 |
| 状态 | 未调整 / 计算中 / 完成对比 / 无差异 |
| 移动端 | 上下堆叠（原 → 新），差异项加前导符号 |
| 可访问性 | 差异**不只靠颜色**（用 `↑↓±` 符号 + 文字） |
| 数据字段 | 需 `JourneyAnalysis` 两次快照对比（**现有接口未提供 diff**，见 §20 依赖） |
| 现状 | ❌ `[Proposed]` —— 见 `REPLAY-SIMULATION-SPEC.md` |

---

## 19. 组件 ↔ 数据字段总表

| 组件 | 主要字段 | 可解析？ |
|---|---|---|
| Search / Location Input | `PlaceEntry`、`JourneyAnalysisRequest` | ✅ |
| Route Card | `AnalyzedJourney.*`、`RankedRoute.*` | ✅ |
| Risk Badge | `RiskLevel`、`CrowdSignal.level` | ✅ |
| Risk Breakdown | `RiskBreakdown.factors[].*`、`.confidence` | ✅（confidence 未用） |
| Route Legend | —（纯视觉） | — |
| Map Layer Control | 无（UI 状态） | — |
| Border Port Marker | `BORDER_PORTS[]` | ✅ |
| Border Segment | `JourneySegment.kind/.border.*` | ✅（confidence 写死） |
| Reliability Indicator | `RankedRoute.reliability.*` | ✅ |
| Best Departure Timeline | `departureOptions[]`、`bestDeparture` | ✅ |
| Plan B Card | `JourneyAnalysis.planB` | ✅ |
| Data Source Indicator | `notices[]`、`sources[]`、`quality` | ✅（updatedAt 未用） |
| Confidence Indicator | 4 处 confidence | ⚠️ 3 处未用 |
| Loading / Empty / Error / Degraded | `loading`/`error`/`notices` | ✅ |
| Simulation Comparison | **需要 diff** | ❌ 见 §20 |

## 20. 冲突与依赖（不修改既有规范）

| # | 冲突 / 依赖 | 说明 | 需要谁 | 级别 |
|---|---|---|---|---|
| 1 | `Route Card` 与 `UI-WIREFRAMES.md §3` 字号提案 | 本文件与 wireframe 一致（`10–11px → 12px`），**与 `DESIGN-TOKENS-v2.md §3` 的收敛提案一致**，无冲突 | — | — |
| 2 | `Risk Badge` 为新建组件，但 `JOURNEY-VISUAL-SPEC-v2.md §G` 已定义 `symbol` 字段 | **不冲突**：Badge 只是 `JourneyVisualSpec.risk[*].symbol` 的载体 | — | — |
| 3 | `Border Segment` 的 `confidence` 现为写死「低信心」 | 与 `BorderQueue.confidence` 字段不一致 → 需按字段渲染 | **D** | P0 |
| 4 | `Simulation Comparison` 需要「前后差异」数据 | 现有 `JourneyAnalysis` **不提供 diff**；需两次分析对比或新增字段 | **A/C** | P1 |
| 5 | `Confidence Indicator` 需 4 处 confidence 全部可见 | 其中 3 处未接线 | **D** | P1 |
| 6 | `Risk Breakdown` 的 `score` 是否显示 | 现只显示 `level`（避免被读成精确值） | **E + A** | P2 |
| 7 | `Map Layer Control` 44px 提案 | 属视觉，不需后端 | **D** | P2 |

> 以上均为**记录**，E 不修改 `JOURNEY-VISUAL-SPEC-v2.md` / `RISK-VISUAL-SPEC-v2.md` / `MAP-LAYERS-SPEC-v2.md`。
