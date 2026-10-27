# UI Page Inventory v2 — 7 个页面清单

Owner **E** ｜ 消费方 **D** ｜ 版本 v2.0 · 2026-10-10
配套：`UI-WIREFRAMES.md`（布局）、`UI-STATES.md`（四类状态）、`COMPONENT-SPEC.md`、`API-UI-DEPENDENCIES.md`

---

## 0. ⚠️ 现状核对（必须先知道）

**当前代码只有两个路由**，7 个「页面」尚未拆成独立路由：

| 路由 | 文件 | 内容 |
|---|---|---|
| `/` | `src/app/page.tsx` → `TripForm` | **第一阶段的境内单页表单**（历史页面） |
| `/journey` | `src/app/journey/page.tsx` → `JourneyPlanner` | **第二阶段全部内容**：左侧规划面板 + 地图 + 路线卡 + 详情 + 何时出发 + Plan B + 数据与限制 |
| `/result` | `src/app/result/page.tsx` | 第一阶段结果页（历史页面） |

`JourneyPlanner.tsx` 只有 **142 行**，一个 `<div className="journey-shell">` 内串起所有区块。

### 0.1 因此本文件的定位

本文件把 7 个页面定义为 **信息架构单元（IA units）**，而不是「必须新增的 7 个路由」。
每个单元标注：

- **现状**：已实作（在 `/journey` 的哪个区块）／部分实作／Proposed（尚无实作）
- **建议**：独立路由 或 保持为 `/journey` 内的区块

> **不新增路由是本文件的默认立场** —— 第二阶段工作流把地图定为重度信息区，
> 拆成 7 个路由反而会增加导航成本。E 的职责是把**信息层级**理顺，不是拆页面。
> 若团队决定拆分，属产品结构变更，需 A 确认。

### 0.2 单元 ↔ 现状 ↔ 建议 一览

| # | IA 单元 | 现状 | 实作位置 | 建议 |
|---|---|---|---|---|
| 1 | **Home / Search** | ✅ 已实作（作为左栏） | `.journey-input-panel` | 保持为 `/journey` 左栏（移动端折叠到上方） |
| 2 | **Map** | ✅ 已实作 | `.journey-map-panel` | 保持为主内容区上半部 |
| 3 | **Journey Result** | ✅ 已实作 | `.journey-route-grid` + `.journey-details` | 保持 |
| 4 | **Risk Analysis** | ✅ 已实作（简版） | `.journey-factors`（5 个 `<details>`） | 保持为区块；**建议补 confidence 与 notices** |
| 5 | **Best Departure** | ✅ 已实作 | `.journey-advice-grid` 左卡「何時出發」 | 保持 |
| 6 | **Plan B** | ✅ 已实作 | `.journey-advice-grid` 右卡「Plan B · 預先準備」 | 保持 |
| 7 | **Data Status** | ✅ 已实作 | `.journey-source`「資料與限制」 | 保持；**建议补品质徽章到路线卡** |

**结论：7 个单元均已存在，缺的是「完整度」与「状态覆盖」，不是「页面数量」。**

---

# 1. Home / Search

| 项目 | 内容 |
|---|---|
| **页面目标** | 让用户用最少步骤确定「起点 / 终点 / 出发时间 / 到达期限 / 比较偏好」 |
| **用户任务** | 选点、设定时间、选择偏好、提交比较 |
| **主要操作** | 搜索选点（HK/SZ）、使用目前位置、点地图选点、切换 4 种比较偏好、切换演示情景、提交 |
| **信息层级** | ① 起终点 → ② 时间（出发／到达期限）→ ③ 比较偏好 → ④ 演示情景 → ⑤ 提交 → ⑥ 快速试用 |
| **顶部区域** | `.journey-heading`：眉标 `港深跨境 · 第二階段演示` + 主标 `走哪條，何時走，心裡有數。` + 副标 + 右上「第一階段通勤演示 ↗」 |
| **主内容区** | `.journey-input-panel`（300px 左栏） |
| **卡片布局** | 单卡（表单），非网格 |
| **地图与侧栏关系** | 左栏；移动端置于地图**上方** |
| **关键数据及位置** | 起终点显示 `findPlace(value)?.name`；送达 `mode` / `scenario` |
| **关键按钮** | `比較行程 →`（`.btn-primary`，满宽）、`◎ 使用目前位置`（文字按钮）、快速试用 2 个 |
| **用户反馈** | `journey-status`（分析中／已更改未重算／离线回退）、`journey-alert`（错误）、`locationMessage`（定位结果） |
| **所需组件** | Search / Location Input、Mode Selector、Scenario Select、Primary CTA |
| **使用 Token** | `--c-bg-surface` `--c-border` `--radius-lg` `--space-8` `--font-size-body` `--layout-touch-min`（44px） |
| **真实字段** | `JourneyAnalysisRequest.origin/destination/departAt/arriveBy/mode/scenario`；`RouteMode`（4 值）；`JourneyScenario`（3 值） |
| **数据缺失处理** | 无地点匹配 → `沒有匹配的地點，請更換關鍵字。`；未收录地址 → 快速试用预设 2 条走廊 |
| **移动端 / 桌面差异** | 移动：单栏、面板在地图上、`padding:18px`；桌面：300px 左栏、`padding:22px` |
| **现状** | ✅ 已实作（`JourneyPlanner.tsx` 第 103–118 行） |
| **缺口** | 无「开始/结束时间」以外的日期说明（现固定 `2026-10-13`，已用文字标示） |

---

# 2. Map

| 项目 | 内容 |
|---|---|
| **页面目标** | 在空间上比较 ≥2 条候选路线（含跨境），并让用户点选路段/地点/口岸 |
| **用户任务** | 看路线形状、比较路线、点选路线、点选地点改变起终点、查看口岸 |
| **主要操作** | 点折线选中路线、点 marker 选起终点、勾选「風險上色」「口岸」、拖拽缩放 |
| **信息层级** | ① 地图本体 → ② 工具栏 → ③ 图例/caption |
| **顶部区域** | `.journey-map-toolbar`：`港深路線圖` + 2 个 checkbox |
| **主内容区** | `.journey-map`（Leaflet，420px / 移动 340px） |
| **卡片布局** | 无卡片；地图为全宽区块 |
| **地图与侧栏关系** | 地图在 `.journey-main` 内，**左栏（Home/Search）不随地图滚动**（`align-items:start`） |
| **关键数据及位置** | 折线颜色 = 风险等级；虚线 = 通关；灰虚线 = 不可行；marker = 地点/口岸/目前位置 |
| **关键按钮** | 工具栏 2 个 checkbox；地图内 marker / 折线为点击目标 |
| **用户反馈** | `.journey-map-caption`（role="status"）：选点结果／距离提示／底图失败 |
| **所需组件** | Map Layer Control、Route Legend、Border Port Marker、Border Segment |
| **使用 Token** | `--map-*` 全部；`--radius-lg`；`--c-bg-map` |
| **真实字段** | `JourneySegment.geometry` / `.kind` / `.line` / `.from` / `.to` / `.durationMinutes` / `.border`；`RouteRisk.level`；`AnalyzedJourney.eligible`；`BORDER_PORTS` |
| **数据缺失处理** | 底图失败 → `底圖暫時無法載入；參考路線與選點仍可使用。`（**保留折线与标记**）；无路线 → 仍画地点与口岸 |
| **移动端 / 桌面差异** | 移动：`340px` 高、单栏；桌面：`420px`、右主栏。`scrollWheelZoom:false` 避免劫持滚动 |
| **现状** | ✅ 已实作（`JourneyMap.tsx`） |
| **缺口** | ① 通关段与不可行**共用虚线** ② 无白色描边 ③ 图例为纯文字、无符号、`11px` ④ 口岸无选中态 ⑤ 风险数据缺失无标示 |

---

# 3. Journey Result

| 项目 | 内容 |
|---|---|
| **页面目标** | 回答「走哪条、几点到、稳不稳」 |
| **用户任务** | 比较候选路线、选出要细看的一条 |
| **主要操作** | 点击路线卡选中（联动地图） |
| **信息层级** | ① 结果标题（含行动）→ ② 路线卡列表（3 条）→ ③ 选中路线详情 → ④ Google Maps 深链 |
| **顶部区域** | `.journey-results-heading`：`候選路線` / `暫緩非必要行程` / `暫無可行方案` + 品质徽章 |
| **主内容区** | `.journey-route-grid`（3 栏 → 移动 1 栏） |
| **卡片布局** | 每卡：tag（`當前推薦`/`比較方案`/`不可行`）+ 路线名 + **大数值分钟** + ETA + 风险 + 信心 + 红字警示 |
| **地图与侧栏关系** | 卡片与地图**联动**（选中卡 → 地图高亮） |
| **关键数据及位置** | `journey.totalMinutes`（25px 大数值）、`etaRange`、`risk.level`、`reliability.onTimeConfidence` |
| **关键按钮** | 路线卡本身（`aria-pressed`）、`在 Google Maps 重新規劃 ↗` |
| **用户反馈** | 选中卡 `.is-selected`；`保守 ETA 超過到達期限` 红字；`exclusions` 逐条红字 |
| **所需组件** | Route Card、Risk Badge、Reliability Indicator |
| **使用 Token** | `--font-size-metric`（25px）`--radius-md` `--c-border-strong` `--risk-*` |
| **真实字段** | `AnalyzedJourney.candidate.label` / `.journey.totalMinutes`；`assessment.reliability.etaRange` / `.onTimeConfidence`；`assessment.risk.level`；`meetsDeadline`；`exclusions`；`eligible` |
| **数据缺失处理** | `!eligible` → `不可行` tag + 原因；超期 → 红字；整体 `hold` → 标题变为暂缓且**无推荐卡** |
| **移动端 / 桌面差异** | 磁盘 3 栏；`≤1000px` 转 1 栏 |
| **现状** | ✅ 已实作 |
| **缺口** | ① 无「准时概率」数值（`onTimeConfidence` 只有定性，**不得伪造百分比**）② 未标示单条 `quality` |

---

# 4. Risk Analysis

| 项目 | 内容 |
|---|---|
| **页面目标** | 解释「风险从哪来」，让用户能追溯 |
| **用户任务** | 看 5 个因子的等级与依据 |
| **主要操作** | 展开因子 `<details>` |
| **信息层级** | ① 因子格（5 个）→ ② 展开后：claim → evidence → source |
| **顶部区域** | `.journey-detail-heading`（与 Journey Result 共用） |
| **主内容区** | `.journey-factors`（5 栏 → `≤1000px` 3 栏 → `≤700px` 2 栏） |
| **卡片布局** | 5 个 `<details>` 小格 |
| **地图与侧栏关系** | 属选中路线详情，位于路线卡下方 |
| **关键数据及位置** | `factor.level`（`.summary` 内）、`factor.claim` / `.evidence` / `.source`（展开后） |
| **关键按钮** | `<details>` summary 可点击 |
| **用户反馈** | 展开/收起 |
| **所需组件** | Risk Breakdown、Risk Badge |
| **使用 Token** | `--c-bg-subtle` `--radius-sm` `--font-size-caption` `--risk-*` |
| **真实字段** | `RiskBreakdown.factors[]`（`id/score/level/weight/contribution/claim/evidence/source`）；`RiskBreakdown.overall`；`.confidence`；`RiskFactor.notices` |
| **数据缺失处理** | 引擎产出 `缺少天氣資料，已按保守假設處理。` 等 → **应显示（现未显示）** |
| **移动端 / 桌面差异** | 5→3→2 栏 |
| **现状** | ⚠️ 部分实作（**只显示 level + claim + evidence + source**） |
| **缺口（P1）** | ① `confidence` 未显示 ② `notices` 未显示 ③ `overall` 分数未显示 ④ 无「資料未確認」标示 ⑤ 无 risk 符号 |

---

# 5. Best Departure

| 项目 | 内容 |
|---|---|
| **页面目标** | 回答「几点走风险最低」 |
| **用户任务** | 看推荐时点，必要时查看每 10 分钟比较 |
| **主要操作** | 展开「查看每 10 分鐘的比較」表格 |
| **信息层级** | ① 推荐时点一句话 → ② 展开的比较表 |
| **顶部区域** | `.journey-details h2` = `何時出發` |
| **主内容区** | `.journey-advice-grid` 左卡 + `<details>` + `.journey-table-wrap` |
| **卡片布局** | 1 张卡（与 Plan B 并排 2 栏，`≤1000px` 转 1 栏） |
| **地图与侧栏关系** | 位于结果区下方 |
| **关键数据及位置** | `bestDeparture.departAt`；表格列：出发 / 风险规则分 / 保守到达 |
| **关键按钮** | `<details>` summary |
| **用户反馈** | 无推荐时 → `此情景沒有可建議的出發時點；請調整時間或待情況核實。` |
| **所需组件** | Best Departure Timeline、Simulation Comparison（Replay） |
| **使用 Token** | `--c-bg-surface` `--radius-md` `--font-size-caption` |
| **真实字段** | `JourneyAnalysis.departureOptions[]`（`departAt/routeId/riskScore/etaRange/meetsDeadline`）；`.bestDeparture` |
| **数据缺失处理** | `riskScore: null` → 表格显示 `暫緩／不可行` |
| **移动端 / 桌面差异** | 2 栏 → 1 栏；表格横向可滚（`.journey-table-wrap { overflow:auto }`） |
| **现状** | ✅ 已实作 |
| **缺口** | 无风险时间序列的**可视化**（现为表格）；`riskScore` 直接裸显示数值（应说明为「规则分」） |

---

# 6. Plan B

| 项目 | 内容 |
|---|---|
| **页面目标** | 回答「出问题怎么办」，含跨境换口岸 |
| **用户任务** | 了解备选路线、触发条件，并跳到该路线 |
| **主要操作** | 点「查看備選路線」（联动地图与详情） |
| **信息层级** | ① reason（为什么是它）→ ② trigger（何时切换）→ ③ 按钮 |
| **顶部区域** | `.journey-details h2` = `Plan B · 預先準備` |
| **主内容区** | `.journey-advice-grid` 右卡 |
| **卡片布局** | 1 张卡（与 Best Departure 并排） |
| **地图与侧栏关系** | 点击后地图高亮对应路线 |
| **关键数据及位置** | `planB.reason`（正文）、`planB.trigger`（次要色小字） |
| **关键按钮** | `查看備選路線`（`.btn-secondary`） |
| **用户反馈** | 无备选 → `暫無避開主路線口岸的可行備選。`；`hold` → `暴雨情景先暫緩行程。` |
| **所需组件** | Plan B Card |
| **使用 Token** | `--c-bg-surface` `--radius-md` `--c-text-secondary` |
| **真实字段** | `JourneyAnalysis.planB: { routeId, trigger, reason } \| null` |
| **数据缺失处理** | `planB === null` → 明确的「暂无」文案（已实作） |
| **移动端 / 桌面差异** | 2 栏 → 1 栏 |
| **现状** | ✅ 已实作 |
| **缺口** | 无 Plan C（契约未提供，**不得虚构**）；无换口岸对比 |

---

# 7. Data Status

| 项目 | 内容 |
|---|---|
| **页面目标** | 诚实说明「数据从哪来、多久前、可信吗」 |
| **用户任务** | 判断这份建议值不值得信 |
| **主要操作** | 点来源链接（外部） |
| **信息层级** | ① 标题 → ② notices（限制说明）→ ③ sources（来源 + 时间 + note） |
| **顶部区域** | `.journey-source h2` = `資料與限制` |
| **主内容区** | `.journey-source`（页脚上方整块） |
| **卡片布局** | 无卡片；纯文字段落列表 |
| **地图与侧栏关系** | 页面最底部 |
| **关键数据及位置** | `notices[]` 逐条；`sources[].label/url/updatedAt/note` |
| **关键按钮** | 来源链接（`target="_blank"`） |
| **用户反馈** | `quality` 徽章在结果标题右侧（`演示估算 · fixture`） |
| **所需组件** | Data Source Indicator、Confidence Indicator |
| **使用 Token** | `--c-text-secondary` `--font-size-caption` `--line-height-relaxed` |
| **真实字段** | `JourneyAnalysis.notices[]`；`.sources[]`；`.quality`（**固定 `'fixture'`**） |
| **数据缺失处理** | 无来源链接时用 `<strong>` 呈现而非空链接（已实作） |
| **移动端 / 桌面差异** | 无差异 |
| **现状** | ✅ 已实作 |
| **缺口（P1）** | ① 单条路线的 `quality` 未在路线卡标示 ② `RiskBreakdown.confidence` 未呈现 ③ 无 `updatedAt` 的「距今多久」表述 |

---

## 附：与第一阶段页面的关系

| 第一阶段页面 | 第二阶段状态 | 处理 |
|---|---|---|
| `/`（境内输入表单） | 保留，`journey-heading` 有「第一階段通勤演示 ↗」链接 | **不改动**（历史 Baseline） |
| `/result`（境内结果页） | 保留 | **不改动** |

> 本规范**只覆盖第二阶段 `/journey`**；第一阶段页面属已冻结的 UI Baseline v1.0，不在本轮范围。
