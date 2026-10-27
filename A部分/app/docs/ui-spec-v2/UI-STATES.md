# UI States v2 — 7 页面 × 4 类状态（共 28 组）

Owner **E** ｜ 消费方 **D** ｜ 版本 v2.0 · 2026-10-10
配套：`UI-PAGE-INVENTORY.md`、`UI-WIREFRAMES.md`、`MAP-LAYERS-SPEC-v2.md §F`

> **标注**：`[現]` = 现有代码已实作 ｜ `[Proposed]` = E 设计提案，代码尚未实作
> ⚠️ 现有实作只有**一组共用状态元件**（`.journey-status` / `.journey-alert` / `.journey-empty` /
> `.journey-map-skeleton` / `tilesFailed` caption），**并非每页各有四态**。本文件把它们分配到 7 个单元。

---

## 0. 通用规则

### 0.1 四类状态不得混用

| 状态 | 含义 | 视觉 |
|---|---|---|
| **Loading** | 正在取得或重算 | 中性/品牌色，**不报错** |
| **Empty** | 还没有可显示的内容（未操作或无数据） | 中性虚线框，引导下一步 |
| **Error** | 请求失败 | 红色 `role="alert"`，给重试 |
| **Degraded** | 有内容但**不完整/不可信** | 琥珀警示条 + **明确说明缺什么** |

### 0.2 三条不可违反的区分（任务书要求）

| 概念 | 必须的视觉 |
|---|---|
| **风险低**（`RiskLevel.low`） | 青绿实线 + `●` + 文字 `低風險` |
| **置信度低**（`confidence: low`） | **不改颜色**；用文字 `信心：低` |
| **数据缺失**（因子为 `null`） | 中性色 `--route-neutral` + 文字「資料未確認」 |
| **路线不可用**（`eligible:false`） | 灰 `#8b99a1` + **虚线 `2 5`** + `×` + 文字 `不可行` |

> **数据缺失绝不可显示为零风险**；缓存/演示数据绝不可伪装为实时。

### 0.3 数据可信度说明的统一措辞

| 品质 | 徽章文字 | Token |
|---|---|---|
| `live` | `實時資料` | `--c-quality-live` |
| `cached` | `快取資料` | `--c-quality-cached` |
| `fixture` | `演示估算 · fixture` | `--c-quality-fixture` |

**现状**：`JourneyAnalysis.quality` **固定为 `'fixture'`** → 目前所有结果都属 **Degraded 的「只有演示数据」** 分支。

### 0.4 共用状态 Token

| 用途 | Token |
|---|---|
| Loading 条 | `--c-info` / `--c-info-soft` |
| Empty 框 | `--c-border-strong`（虚线）+ `--c-text-secondary` |
| Error 框 | `--c-danger` / `--c-danger-soft` |
| Degraded 警示条 | `--c-warning` / `--c-warning-soft` / `--c-warning-border` |
| 骨架 | `--c-bg-map` / `--c-bg-subtle` |

---

## 1. Home / Search

| 状态 | 触发条件 | 用户可见表现 | 提示文案（逐字） | 可执行操作 | 保留原有内容 | 保留地图 | 替代内容 | 移动端 | 验收标准 | 现状 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Loading** | 提交后 `loading=true` | `.journey-status` 出现在结果区上方；按钮文字变 `正在比較路線…` 且 `disabled` | `正在重新比較；下方保留上一次結果。` ／ 按钮 `正在比較路線…` | 无（按钮禁用） | ✅ 保留上次结果 | ✅ | — | 同桌面；状态条不遮挡输入 | 提交后 300ms 内出现状态条；无白屏 | `[現]` |
| **Empty** | `analysis === null` | `.journey-empty` 虚线框占据结果区 | `先選一段旅程。` + `按「比較行程」，或使用左側「中環 → 福田」查看三個口岸方案。` | 提交比较 ／ 使用快速试用 | — | ✅（地图仍显示地点/口岸） | 引导文案 + 2 条快速试用 | 同桌面；框内距 36/20 | 首次进入可见引导，非空白 | `[現]` |
| **Error** | `run()` catch | `.journey-alert` 红框，`role="alert"` | `無法分析行程`（后端 message）／`離線計算無法完成，請檢查地點與時間。`／`分析失敗，請重試。` | 修改输入后重试 | ✅ 上次结果保留 | ✅ | — | 同桌面；红框在按钮下方 | 错误可读、含重试路径、**不伪造 error code** | `[現]` |
| **Degraded** | `fetch` 失败但本机 fallback 成功 | `.journey-status` 中性条 | `伺服器或網絡不可用，已在本機使用相同演示規則計算。` | 无（已自动降级） | ✅ 完整结果 | ✅ | 本机 fixture 结果 | 同桌面 | 用户知道这是本机规则结果，仍有三条候选 | `[現]` |
| **(附加) 选点降级** | 定位 4 类失败 | `locationMessage` `role="status"` | `定位權限被拒絕…` / `無法取得位置…` / `定位逾時…` / `此裝置不支援定位…` | 自行搜索起点 | ✅ | ✅ | 搜索面板 | 同桌面 | 4 条文案逐字一致 | `[現]` |
| **(附加) 选点受限** | 点地图距收录点 >2km | caption 提示 | `此處距離已收錄地點超過 2 公里，請點選標記或使用地點搜尋。` | 改用搜索 | ✅ | ✅ | — | 同桌面 | 不写入错误坐标 | `[現]` |

**Token**：`--c-info-soft` `--c-warning` `--c-danger` `--c-border-strong` `--radius-md`

---

## 2. Map

| 状态 | 触发条件 | 用户可见表现 | 提示文案 | 可执行操作 | 保留原有内容 | 保留地图 | 替代内容 | 移动端 | 验收标准 | 现状 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Loading** | `dynamic(ssr:false)` 载入中 | `.journey-map-skeleton`（500px 占位） | `正在載入地圖…` | 无 | — | 骨架占位 | 骨架 + 文字 | 同桌面 | 不出现空白区域；`role="status"` | `[現]` |
| **Empty** | `routes=[]` 且已分析 | 地图显示底图 + 已收录地点 + 口岸，**无折线** | caption 保留原提示 | 点选地点、缩放 | — | ✅ 保留 | 地点与口岸 marker | 340px 高 | 地图不清空、不报错 | `[現]` |
| **Error** | 地图元件异常 | `[Proposed]` caption 改为错误样式 | `[Proposed]` `地圖暫時無法顯示；路線與選點仍可在下方使用。` | 使用下方路线卡 | ✅ 路线卡仍在 | ⚠️ 可能为空 | 路线卡 + 路段列 | 同桌面 | 无 JS 崩溃；有替代路径 | `[Proposed]` |
| **Degraded — 底图失败** | `tile.on('tileerror')` | caption 变为琥珀 | `底圖暫時無法載入；參考路線與選點仍可使用。` | 继续使用 | ✅ **折线、起终点、口岸、位置全部保留** | ✅ | — | 同桌面 | **不把地图变成空白页** | `[現]` |
| **Degraded — 风险数据缺失** | 因子为 `null` | `[Proposed]` 折线改用 `--map-route-neutral`，卡片标注 | `[Proposed]` 沿用引擎 `notices`（如 `缺少天氣資料，已按保守假設處理。`） | — | ✅ | ✅ | 中性色折线 | 同桌面 | **不显示为零风险** | `[Proposed]` |
| **Degraded — 部分数据源不可用** | 部分 source 失败 | `[Proposed]` 琥珀条列出缺口 | `[Proposed]` 引擎产出 notice 原文 | 查看来源 | ✅ | ✅ | — | 同桌面 | 缺口可见 | `[Proposed]` |
| **Degraded — 口岸信息缺失** | 找不到 `portId` | 路线标为不可行 | `缺少可核對的口岸，不能確認可行性。` | 换路线 | ✅ | ✅ | 灰虚线 | 同桌面 | 该路线不被当作可行 | `[現]` |

**Key Token**：`--map-canvas` `--map-route-neutral` `--c-warning` `--c-bg-map`

---

## 3. Journey Result

| 状态 | 触发 | 表现 | 文案 | 操作 | 保留 | 地图 | 替代 | 移动端 | 验收 | 现状 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Loading** | 重算中 | 状态条 + **保留上次路线卡** | `正在重新比較；下方保留上一次結果。` | — | ✅ | ✅ | — | 1 栏 | 不闪空 | `[現]` |
| **Empty** | `!analysis` | `.journey-empty` | `先選一段旅程。` | 提交 | — | ✅ | 引导 | 单栏 | — | `[現]` |
| **Error** | 分析失败 | `.journey-alert` | 同 §1 Error 三条 | 重试 | ✅ | ✅ | — | — | — | `[現]` |
| **Degraded — 路线不可行** | `eligible=false` | 卡片 tag `不可行` + 红字原因 + 地图灰虚线 | `羅湖口岸在預計通關時段未開放（按參考時間表）。` | 改选 | ✅ | ✅ | 灰虚线 | 单栏 | 与低风险**视觉不同** | `[現]` |
| **Degraded — 超期** | `meetsDeadline===false` | 卡片红字 | `保守 ETA 超過到達期限` | 改时间 | ✅ | ✅ | — | 单栏 | — | `[現]` |
| **Degraded — 整体 hold** | `action==='hold'` | 标题改 `暫緩非必要行程`，**无推荐卡**，品质徽章仍在 | `暫緩非必要行程` | 查看下方比较 | ✅ 三条候选保留 | ✅ | 无「當前推薦」tag | 单栏 | 不假装有推荐 | `[現]` |
| **Degraded — 整体 unavailable** | `action==='unavailable'` | 标题改 `暫無可行方案` | `暫無可行方案` | 调整条件 | ✅ | ✅ | — | 单栏 | — | `[現]` |
| **Degraded — 无准时概率** | 恒成立 | 只显示 `信心：低/中/高` | `信心：低` | — | — | — | — | — | **绝不出现百分比** | `[現]` |

**Key Token**：`--risk-*` `--c-danger` `--c-warning` `--font-size-metric`

---

## 4. Risk Analysis

| 状态 | 触发 | 表现 | 文案 | 操作 | 保留 | 地图 | 替代 | 移动端 | 验收 | 现状 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Loading** | 归属上层 | 随上层 Loading；因子格保留上次值 | 同上 | — | ✅ | ✅ | — | 2 栏 | 不闪 | `[現]` |
| **Empty** | `factors` 为空（理论不出现） | `[Proposed]` 中性提示 | `[Proposed]` `本次沒有風險因子資料。` | — | — | ✅ | — | — | 不显示为「低风险」 | `[Proposed]` |
| **Error** | 风险计算异常 | `[Proposed]` 归入上层 `.journey-alert` | 同上 | — | ✅ | ✅ | — | — | — | `[Proposed]` |
| **Degraded — 缺资料** | 因子 `null` | `[Proposed]` summary 加「資料未確認」+ `--route-neutral` 标记；展开显示 notice | `缺少天氣資料，已按保守假設處理。`／`未接入人流模型，以服務擁擠度代替。`／`缺少人流資料，已按保守中值處理。`／`缺少服務狀態資料，已按保守假設處理。` | 展开查看 | ✅ | ✅ | — | 2 栏 | **4 条 notice 逐字一致、可见** | `[Proposed]` |
| **Degraded — 低可信度** | `RiskBreakdown.confidence==='low'` | `[Proposed]` 卡片标题显示 `信心：低` | `信心：低` | — | ✅ | ✅ | — | 2 栏 | 信心**可见**且不改颜色 | `[Proposed]` |
| **Degraded — 品质下修** | `quality!=='live'` | 引擎产出 notice | `資料品質為 fixture，風險評估可信度已下調。` | — | ✅ | ✅ | — | 2 栏 | 该 notice 可见 | `[Proposed]` |

**Key Token**：`--risk-*` `--route-neutral` `--c-bg-subtle` `--font-size-caption`

---

## 5. Best Departure

| 状态 | 触发 | 表现 | 文案 | 操作 | 保留 | 地图 | 替代 | 移动端 | 验收 | 现状 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Loading** | 归属上层 | 卡片保留上次值 | — | — | ✅ | ✅ | — | 1 栏 | 不闪 | `[現]` |
| **Empty — 无推荐时点** | `bestDeparture===null` | 卡片显示说明句 | `此情景沒有可建議的出發時點；請調整時間或待情況核實。` | 调整时间 | ✅ 表格仍在 | ✅ | 说明句 | 1 栏 | 不显示空白 | `[現]` |
| **Empty — 未分析** | `!analysis` | `.journey-empty` | `先選一段旅程。` | 提交 | — | ✅ | — | — | — | `[現]` |
| **Error** | 归属上层 | `.journey-alert` | 同上 | — | ✅ | ✅ | — | — | — | `[現]` |
| **Degraded — 时段不可行** | `riskScore===null` | 表格该行显示 `暫緩／不可行` | `暫緩／不可行` | — | ✅ | ✅ | — | 表格横向滚动 | 不显示为 0 分 | `[現]` |
| **Degraded — 逾期** | `meetsDeadline===false` | 表格该行加 ` · 逾期` | `09:41 · 逾期` | — | ✅ | ✅ | — | 同上 | — | `[現]` |
| **Degraded — hold 情景** | `action==='hold'` | 全部时段 `routeId:null` | `暫緩非必要行程` | — | ✅ | ✅ | — | 1 栏 | 不给出出发建议 | `[現]` |

**Key Token**：`--font-size-caption` `--c-text-secondary` `--radius-md`

---

## 6. Plan B

| 状态 | 触发 | 表现 | 文案 | 操作 | 保留 | 地图 | 替代 | 移动端 | 验收 | 现状 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Loading** | 归属上层 | 卡片保留 | — | — | ✅ | ✅ | — | 1 栏 | 不闪 | `[現]` |
| **Empty — 无备选** | `planB===null` 且非 hold | 卡片说明句 | `暫無避開主路線口岸的可行備選。` | 查看其他候选 | ✅ | ✅ | 说明句 | 1 栏 | 不假装有 Plan B | `[現]` |
| **Empty — hold** | `action==='hold'` | 卡片说明句 | `暴雨情景先暫緩行程。` | — | ✅ | ✅ | — | 1 栏 | — | `[現]` |
| **Empty — 未分析** | `!analysis` | `.journey-empty` | `先選一段旅程。` | 提交 | — | ✅ | — | — | — | `[現]` |
| **Error** | 归属上层 | `.journey-alert` | — | — | ✅ | ✅ | — | — | — | `[現]` |
| **Degraded — 备选也超期** | `backup.meetsDeadline===false` | `reason` 内含警示 | `此備選可能趕不上期限。` | 自行判断 | ✅ | ✅ | — | 1 栏 | 诚实标示 | `[現]` |
| **Degraded — 换口岸（跨境）** | `planB` 与主路线不同口岸 | `reason` 说明避开哪个口岸 | 由 C 产出，UI 原样呈现 | 查看备选路线 | ✅ | ✅ | — | 1 栏 | 决策属 C，E 不改文案 | `[現]` |

**Key Token**：`--c-warning` `.pill` `--c-text-secondary`

---

## 7. Data Status

| 状态 | 触发 | 表现 | 文案 | 操作 | 保留 | 地图 | 替代 | 移动端 | 验收 | 现状 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Loading** | 归属上层 | 区块保留上次内容 | — | — | ✅ | ✅ | — | 同桌面 | 不闪 | `[現]` |
| **Empty** | `!analysis` | 区块不渲染 | — | — | — | ✅ | — | — | 未分析时不显示空区块 | `[現]` |
| **Error** | 归属上层 | `.journey-alert` | — | — | ✅ | ✅ | — | — | — | `[現]` |
| **Degraded — 演示数据** | `quality==='fixture'`（**当前恒成立**） | 徽章 `演示估算 · fixture`（结果标题右侧） | `演示估算 · fixture` | — | ✅ | ✅ | — | 同桌面 | **一眼可辨**；不用绿/黄/红 | `[現]` |
| **Degraded — 坐标未核实** | 恒成立 | notices 文字 | `全部服務狀態、客流及排隊為演示假設，並非即時資料；座標仍待官方核實。` | — | ✅ | ✅ | — | 同桌面 | 诚实声明保留 | `[現]` |
| **Degraded — 部分来源失败** | 部分 source 不可用 | `[Proposed]` 在 sources 列表标注 | `[Proposed]` 用 `DataEnvelope` 语义说明 | — | ✅ 成功来源保留 | ✅ | — | 同桌面 | 失败来源**如实排除**，不冒充成功 | `[Proposed]` |
| **Degraded — 更新时间缺失** | `updatedAt` 为空 | `[Proposed]` 显示 `更新時間未提供` | `[Proposed]` `更新時間未提供` | — | ✅ | ✅ | — | 同桌面 | 不留空白字段 | `[Proposed]` |

**Key Token**：`--c-quality-fixture` `--font-size-caption` `--line-height-relaxed`

---

## 8. 28 组覆盖矩阵

| # | 页面 | Loading | Empty | Error | Degraded |
|---|---|---|---|---|---|
| 1 | Home / Search | `[現]` | `[現]` | `[現]` | `[現]` (+2 附加) |
| 2 | Map | `[現]` | `[現]` | `[Proposed]` | `[現]` 底图失败 / `[Proposed]` ×3 |
| 3 | Journey Result | `[現]` | `[現]` | `[現]` | `[現]` ×5 |
| 4 | Risk Analysis | `[現]`（继承） | `[Proposed]` | `[Proposed]` | `[Proposed]` ×3 |
| 5 | Best Departure | `[現]`（继承） | `[現]` | `[現]`（继承） | `[現]` ×3 |
| 6 | Plan B | `[現]`（继承） | `[現]` | `[現]`（继承） | `[現]` ×2 |
| 7 | Data Status | `[現]`（继承） | `[現]` | `[現]`（继承） | `[現]` ×2 / `[Proposed]` ×2 |

**覆盖统计**：28 组全部有明确定义；其中 **`[現]` 已实作 21 组**，**`[Proposed]` 待实作 7 组**
（Map Error、Map 风险缺失、Map 部分源、Risk Empty、Risk Error、Data 部分源、Data 更新时间缺失）。

**集中缺口（P1）**：`RiskFactor.notices` / `RiskBreakdown.confidence` / `CandidateRoute.quality`
三者在接口中已存在但 UI 未呈现 —— 这是 7 组 `[Proposed]` 的主因。

---

## 9. 必须区分的组合（禁止混用视觉）

| 组合 | 正确做法 |
|---|---|
| 风险低 + 数据缺失 | 风险低用绿；数据缺失用**中性灰 + 「資料未確認」**，**不得**因缺数据而显示为绿 |
| 置信度低 + 高风险 | 红色由风险等级决定；置信度低**只加文字**「信心：低」，不改色 |
| 路线不可行 + 低风险 | 不可行是**可行性**维度：灰 + 虚线 + `×`；不得因 `overall` 分数低就显示为可行 |
| 演示数据 + 实时数据 | `fixture` 用中性徽章；`live` 才可用绿色；**不得**把 fixture 显示为 live |
| Empty + Error | Empty 是中性虚线框 + 引导；Error 是红色 `role="alert"` + 重试 |
