# Design Token v2 — 韧性出行助手第二阶段

Owner **E** ｜ 消费方 **D** ｜ 版本 v2.0 · 2026-10-10

**基础**：以第一阶段已收敛的 `UI Baseline v1.0 / DESIGN-TOKENS.md` 为底，**扩展**而非推翻。
**配套**：`JOURNEY-VISUAL-SPEC-v2.md`、`RISK-VISUAL-SPEC-v2.md`、`MAP-LAYERS-SPEC-v2.md`、`COMPONENT-SPEC.md`。

---

## 0. 来源与现状核对

### 0.1 三处真实来源

| 来源 | 内容 | 路径 |
|---|---|---|
| 第一阶段 UI Baseline | 6 档字级、4 档圆角、2 档阴影、4 档文字色、语义色对 | `UI-Handoff-v1.0/DESIGN-TOKENS.md` |
| 第二阶段 App 既有实作 | Tailwind 预设 `slate-*` + `journey-*` 硬编码色 | `src/app/globals.css`（114 行） |
| 本阶段已完成规范 | 风险色、地图图层、跨境/口岸 | 同目录 3 份 v2 规范 |

### 0.2 现状（必须先知道的事实）

- `src/app/globals.css` 只定义 **2 个**自订属性：`.journey-shell { --ink:#153d50; --teal:#16736b }`。
- 其余全部是 `journey-*` 类别里的**硬编码 hex**（共 20+ 个色值）。
- Tailwind 只用预设 `slate` 色阶，`tailwind.config.ts` **未扩充任何色板**。

### 0.3 ⚠️ 已发现的 Token 冲突（P1）

| 冲突 | 第一阶段 | 第二阶段实作 | 影响 |
|---|---|---|---|
| `--ink` | `#18222d`（近黑） | `#153d50`（深蓝绿） | **同名不同值**，且 `#153d50` 亦作 `.journey-replay` 底色。D 若跨页沿用会拿到意外颜色 |
| 最小字级 | `12px` | 出现 `10px` / `11px` 共 5 处 | 可读性回退 |
| 圆角 | `8/12/16/22` | 另有 `6px`、`20px`（`--r` 未收敛） | 视觉不一致 |
| `--teal` `#16736b` | 命名 `--green` | 命名 `--teal` | 同一色两个名字 |

**处理原则**：本规范以第一阶段命名为准并向下兼容；冲突项在 §7 列为待确认，**不擅自改动生产代码**。

---

## 1. 命名与实现载体

```
--{类别}-{语义}-{变体}
```

| 类别 | 前缀 | 例 |
|---|---|---|
| 色彩 | `--c-` | `--c-bg-canvas`、`--c-text-muted` |
| 字体 | `--font-` | `--font-size-body` |
| 间距 | `--space-` | `--space-4` |
| 圆角 | `--radius-` | `--radius-card` |
| 阴影 | `--shadow-` | `--shadow-card` |
| 地图 | `--map-` | `--map-route-risk-low` |
| 风险 | `--risk-` | `--risk-low` |

**兼容规则**：第一阶段既有名（`--ink` / `--muted` / `--faint` / `--line` / `--surface` / `--canvas` / `--blue` …）
**保留为别名**，新代码用 v2 名；避免一次性重命名造成大面积回归。

**确认状态图例**：✅ 已由代码/接口确认 ｜ 🟡 E 提案（视觉决定）｜ ⚠️ 待团队确认

---

## 2. 色彩系统

### 2.1 基础面与文字

| Token 名称 | 推荐值 | 使用场景 | 设计原因 | 对应组件 | 确认 | 真实字段 |
|---|---|---|---|---|---|---|
| `--c-bg-canvas`（别 `--canvas`） | `#f4f6f6` | 页面底色 | 第一阶段基准；与白卡形成极轻层次 | `.journey-shell` | ✅ | — |
| `--c-bg-surface`（别 `--surface`） | `#ffffff` | 卡片面 | 白卡为决策信息载体 | `.card` `.journey-details` | ✅ | — |
| `--c-bg-subtle` | `#f2f6f7` | 因子格、次级区块 | 区分层级而不加边框 | `.journey-factors details` | ✅ | — |
| `--c-bg-map`（别 `--map-canvas`） | `#e6eef0` | 地图容器底色 | 与底图瓦片衔接 | `.journey-map` | ✅ | — |
| `--c-bg-deep`（别 `--deep`） | `#263644` | 深色卡（切换条件/Replay 带） | 高对比焦点 | `.journey-replay`（现用 `#153d50`） | ⚠️ 见 §7 | — |
| `--c-text-primary`（别 `--ink`） | `#18222d` | 主要文字 | 14.6:1 | 全域 | ⚠️ 与 `#153d50` 冲突 | — |
| `--c-text-secondary`（别 `--muted`） | `#5a6672` | 次要文字、正文 | 5.9:1 | 全域 | ✅ | — |
| `--c-text-muted`（别 `--faint`） | `#6b7683` | 标签、说明、注记 | 4.6:1（最小字级仍达标） | `.journey-route-tag` `.journey-quality` | ✅ | — |
| `--c-text-on-deep` | `#eef3f7` | 深色底上的文字 | ≥7:1 | `.journey-replay` | 🟡 | — |
| `--c-border`（别 `--line`） | `#e3e8ea` | 边框、分隔线 | 细边框风格 | `.card` | ✅ | — |
| `--c-border-strong` | `#cddce3` | 次级区块边框 | 与卡片边区分 | `.journey-details` | ✅ | — |
| `--c-divider` | `#e0e8eb` | 表格行分隔 | — | `.journey-details td` | ✅ | — |

### 2.2 品牌与交互

| Token | 值 | 场景 | 原因 | 组件 | 确认 | 字段 |
|---|---|---|---|---|---|---|
| `--c-primary`（别 `--blue`） | `#2f6fe0` | 主 accent、链接、焦点 | 第一阶段冷蓝 | 全域 | ✅ | — |
| `--c-primary-strong`（别 `--blue-dark`） | `#245fc4` | accent 文字（≥4.5:1） | 小字可读 | 链接、标签 | ✅ | — |
| `--c-primary-soft`（别 `--blue-bg`） | `#eaf1fe` | 浅底 chip | — | chip | ✅ | — |
| `--c-accent-teal`（第二阶段既有 `--teal`） | `#16736b` | 第二阶段主色（眉标、选中态、时间轴节点） | 与一阶段蓝区分「地图工作区」 | `.journey-eyebrow` `.journey-segments li::before` | ✅ | — |
| `--c-accent-teal-soft` | `#e6f4f1` | 选中态浅底 | — | `button[aria-pressed=true]` | ✅ | — |
| `--c-focus-ring` | `#18222d` | `:focus-visible` 2px ring | 一致性 | 全域 | ✅ | — |

### 2.3 语意状态

| Token | 值 | 场景 | 原因 | 确认 |
|---|---|---|---|---|
| `--c-success` / `--c-success-soft` | `#0f6a46` / `#e9f6f0` | 成功、服务正常 | ≥5.9:1 / 深底配浅底 | ✅ |
| `--c-warning` / `--c-warning-soft` / `--c-warning-border` | `#8f5a0e` / `#fff8e7` / `#dab975` | 警示、暂缓、降级提示 | 第二阶段 `journey-status` 现用值 | ✅ |
| `--c-danger` / `--c-danger-soft` | `#a83232` / `#fdeeee` | 错误、不可行、超期 | — | ✅ |
| `--c-info` / `--c-info-soft` | `#245fc4` / `#eaf1fe` | 中性说明（离线回退、演示标示） | — | 🟡 |

### 2.4 数据品质（live / cached / fixture）

| Token | 值 | 场景 | 原因 | 确认 | 真实字段 |
|---|---|---|---|---|---|
| `--c-quality-live` | `#0f6a46` | `live` 徽章 | 与成功色一致 | ✅ | `RouteQuality` / `DataQuality` |
| `--c-quality-cached` | `#8f5a0e` | `cached` 徽章 | 与警示色一致 | ✅ | 同上 |
| `--c-quality-fixture` | `#5a6672` | `fixture` 徽章（**中性，不用风险色**） | fixture 不是错误，不应染红/黄 | ✅ | 同上 |

> **硬规则**：`fixture` **不得**使用绿/黄/红色；一律中性灰 + 文字「演示估算 · fixture」。

### 2.5 风险色（详见 `RISK-VISUAL-SPEC-v2.md`）

| Token | 值 | 场景 | 确认 | 真实字段 |
|---|---|---|---|---|
| `--risk-low` | `#16736b` | 路线风险低 | ✅ | `RiskLevel.low` |
| `--risk-medium` | `#b46b0c` | 路线风险中（**线条/图形**） | ✅ | `RiskLevel.medium` |
| `--risk-medium-text` | `#8a5209` | 中风险**文字**（4.16→6.38:1） | 🟡 E 提案 | 同上 |
| `--risk-high` | `#ba4144` | 路线风险高 | ✅ | `RiskLevel.high` |
| `--risk-critical` | `#84282c` | **人流信号最高档**（非路线风险） | ⚠️ 待 A 确认 | `CrowdSignal.level='critical'` |
| `--risk-unavailable` | `#8b99a1` | 路线不可行（线条） | ✅ | `eligible === false` |
| `--risk-unavailable-text` | `#5f6b73` | 不可行**文字**（2.93→5.47:1） | 🟡 E 提案 | 同上 |

### 2.6 路线专用（详见 `MAP-LAYERS-SPEC-v2.md §C`）

| Token | 值 | 场景 | 确认 |
|---|---|---|---|
| `--route-primary` | 继承 `--risk-*` | 推荐路线（**不另设色**） | ✅ |
| `--route-alternative` | 继承 `--risk-*` | 备选路线（同色，降透明度） | ✅ |
| `--route-selected-width` | `7px` | 选中线宽 | ✅ |
| `--route-default-width` | `4px` | 未选中线宽 | ✅ |
| `--route-selected-opacity` | `1` | 选中透明度 | ✅ |
| `--route-default-opacity` | `0.5` | 未选中透明度 | ✅ |
| `--route-neutral` | `#2577a4` | 关闭风险上色 / 风险数据缺失 | ✅ |
| `--route-casing` | `#ffffff` | 折线白色描边 | 🟡 E 提案 |
| `--route-unavailable-dash` | `2 5` | 不可行虚线 | 🟡 E 提案（现为 `7 7`） |
| `--route-border-crossing` | `#8653ad` | 通关段颜色 | ✅ |
| `--route-border-dash` | `7 7` | 通关段虚线 | ✅ |

---

## 3. 字体体系

字体家族（沿用第二阶段 `tailwind.config.ts`）：
```css
font-family: -apple-system, BlinkMacSystemFont, "PingFang HK", "Noto Sans HK",
             "Hiragino Sans", "Microsoft JhengHei", sans-serif;
```
数值一律 `font-variant-numeric: tabular-nums`。

| Token | 值 | 用途 | 设计原因 | 确认 |
|---|---|---|---|---|
| `--font-size-display` | `43px` | 建议出发时间、输入页主标 | 第一阶段决定全站最大 | ✅ |
| `--font-size-hero` | `clamp(24px, 3.3vw, 40px)` | `.journey-heading h1` | 第二阶段既有实作 | ✅ |
| `--font-size-title` | `24px` | 到达区间、状态卡标题 | — | ✅ |
| `--font-size-metric` | `25px` | 路线卡主要数值（分钟） | 第二阶段既有 | ✅ |
| `--font-size-heading` | `18px` | `.journey-shell h2` 区块标题 | 第二阶段既有 | ✅ |
| `--font-size-card-title` | `15px` | 路线卡标题、卡片小标 | — | ✅ |
| `--font-size-body` | `14px` | `.journey-details p` 正文 | 第二阶段既有 | ✅ |
| `--font-size-body-sm` | `13px` | 次要正文、状态条、路段列 | — | ✅ |
| `--font-size-caption` | `12px` | 辅助说明、因子卡、来源 | **全站最小字级** | ✅ |
| `--font-size-micro` | `11px` | ⚠️ 仍在使用但**不建议**（地图图例、品质徽章、搜索副标、Replay 刻度） | **违反第一阶段 12px 下限** | ⚠️ 待收敛 |
| `--font-size-nano` | `10px` | ⚠️ `.journey-route-card small` | **违反下限** | ⚠️ 待收敛 |
| `--font-weight-regular` | `400` | 正文 | — | ✅ |
| `--font-weight-medium` | `500` | 栏位标签、次按钮 | Tailwind `font-medium` | ✅ |
| `--font-weight-semibold` | `600` | 强调标签、统计值、Chip | — | ✅ |
| `--font-weight-bold` | `700` | 标题、CTA、路线名 | — | ✅ |
| `--font-weight-heavy` | `800` | 区段小标（第一阶段） | — | 🟡 |
| `--line-height-tight` | `1.1` | 43px 主标 | — | ✅ |
| `--line-height-snug` | `1.2` | 标题 | — | 🟡 |
| `--line-height-normal` | `1.7` | 正文段落 | — | ✅ |
| `--line-height-relaxed` | `1.8` | 来源说明 | — | ✅ |

**收敛目标（E 提案）**：`10px`→`12px`、`11px`→`12px`，全站最小字级统一 `12px`。

### 3.1 风险标签字号

| Token | 值 | 场景 |
|---|---|---|
| `--font-size-risk-label` | `12px` | 风险等级文字（图例、路线卡、因子卡） |
| `--font-size-risk-symbol` | `14px` | 非颜色符号 `● ▲ ■ ◆ ×` |

---

## 4. 布局与间距

### 4.1 间距

| Token | 值 | 用途 |
|---|---|---|
| `--space-1` | `4px` | 紧邻元素 |
| `--space-2` | `6px` | 图标与文字 |
| `--space-3` | `8px` | 因子格 gap |
| `--space-4` | `10px` | 卡片内小间隔、路线卡 gap |
| `--space-5` | `12px` | 表单元件间距 |
| `--space-6` | `16px` | 区块内距、Replay 内距 |
| `--space-7` | `20px` | 卡片内距（`.journey-details`） |
| `--space-8` | `22px` | 输入面板内距 |
| `--space-9` | `24px` | 主栏间距、区块上距 |
| `--space-10` | `28px` | 页头下距 |

### 4.2 圆角（收敛目标 4 档 + 1 例外）

| Token | 值 | 用途 | 确认 |
|---|---|---|---|
| `--radius-sm` | `8px` | 因子格、小按钮 | ✅ |
| `--radius-md` | `12px` | 路线卡、`.journey-details`、Replay、搜索下拉 | ✅ |
| `--radius-lg` | `16px` | `.journey-input-panel`、`.journey-map-panel` | ✅ |
| `--radius-xl` | `22px` | 第一阶段主卡（沿用） | ✅ |
| `--radius-pill` | `9999px` | `.journey-quality`（现 `20px`）、`.pill` | 🟡 建议改用 pill |

### 4.3 阴影（2 档）

| Token | 值 | 用途 |
|---|---|---|
| `--shadow-card` | `0 8px 24px rgba(30,44,54,.05)` | 卡片（静态） |
| `--shadow-float` | `0 12px 30px rgba(21,61,80,.125)` | 搜索下拉、浮层 |

### 4.4 布局

| Token | 值 | 说明 |
|---|---|---|
| `--layout-max` | `1360px` | 内容最大宽（第二阶段实作偏 `1280`，E 提案统一） |
| `--layout-sidebar` | `300px` | 桌面左栏（`≤1000px` → `260px`） |
| `--layout-gap` | `24px` | 栏间距（`≤1000px` → `16px`） |
| `--layout-map-height` | `420px`（`≤700px` → `340px`） | 地图高度 |
| `--layout-touch-min` | `44px` | 触控最小高度 |

### 4.5 Sticky 元素

| 元素 | 规范 | 原因 |
|---|---|---|
| 地图工具栏 | **不 sticky** | 现况非 sticky，保持 |
| 移动端主 CTA（`比較行程 →`） | **不 sticky** | 第一阶段教训：sticky 会遮挡栏位 |
| Replay 条 | 不 sticky | 避免与地图滚动冲突 |

---

## 5. 图标体系

**现状**：第二阶段**没有图标库**；全部用**文字或 Unicode 字符**（`◎ 使用目前位置`、`比較行程 →`）。

| 类别 | Token | 呈现 | 确认 |
|---|---|---|---|
| 交通方式 | `--icon-mode-*` | **无独立图标**；用文字线路名（`東鐵線`）或模式名 | ⚠️ 现况 |
| 风险等级 | `--icon-risk-*` | Unicode：`● ▲ ■ ◆` | 🟡 E 提案 |
| 不可行 | `--icon-unavailable` | Unicode：`×` | 🟡 E 提案 |
| 通关段 | `--icon-border` | 虚线本身（`⋯` 备用） | 🟡 |
| 口岸 | `--icon-port` | 圆点 marker（无图标字形） | ✅ |
| POI / 地点 | `--icon-place` | 圆点 marker（起终点不同半径） | ✅ |
| 定位 | `--icon-locate` | 文字前缀 `◎` | ✅ |
| 数据来源 | `--icon-source` | 无图标；用文字 `資料與限制` | ✅ |
| Loading | `--icon-loading` | 文字 `正在載入地圖…` | ✅ |
| Error | `--icon-error` | `role="alert"` 红框，无图标 | ✅ |
| Unavailable | `--icon-unavailable` | `×` | 🟡 |

**规则**：
1. **不新增图标库**（避免依赖膨胀与风格漂移）。
2. 新符号一律用 Unicode 几何字符，并在 `--font-size-risk-symbol` 下渲染。
3. 图标一律 `aria-hidden`，语意由相邻文字承担。

---

## 6. 地图专用 Token

完整规范见 `MAP-LAYERS-SPEC-v2.md`。以下是**可直接落地的 Token 清单**：

| Token | 值 | 场景 | 确认 |
|---|---|---|---|
| `--map-canvas` | `#e6eef0` | 地图容器底色 | ✅ |
| `--map-route-width-default` | `4` | 未选中路线 | ✅ |
| `--map-route-width-selected` | `7` | 选中/推荐路线 | ✅ |
| `--map-route-opacity-default` | `0.5` | 未选中 | ✅ |
| `--map-route-opacity-selected` | `1` | 选中 | ✅ |
| `--map-route-risk-low/medium/high` | `#16736b`/`#b46b0c`/`#ba4144` | 风险图层上色 | ✅ |
| `--map-route-neutral` | `#2577a4` | 风险上色关闭 | ✅ |
| `--map-route-casing` | `#ffffff` | 白色描边 | 🟡 |
| `--map-route-unavailable` | `#8b99a1` | 不可行 | ✅ |
| `--map-route-dash-unavailable` | `2 5` | 不可行虚线 | 🟡 |
| `--map-route-border` | `#8653ad` | 通关段 | ✅ |
| `--map-route-dash-border` | `7 7` | 通关段虚线 | ✅ |
| `--map-port-marker` | `#8653ad` | 口岸节点 | ✅ |
| `--map-port-radius` | `6`（移动 `7`） | 口岸半径 | ✅ |
| `--map-place-terminal` | `#123e54` | 起点/终点 | ✅ |
| `--map-place-other` | `#6a8290` | 其他收录点 | ✅ |
| `--map-position` | `#2688d2` | 目前位置 | ✅ |
| `--map-position-accuracy-opacity` | `0.12` | 精度圈 | ✅ |

---

## 7. 冲突与待确认

| # | 项目 | 冲突 | 建议 | 需要谁 | 级别 |
|---|---|---|---|---|---|
| 1 | `--ink` | 一阶段 `#18222d` vs 二阶段 `.journey-shell` `#153d50` | 统一为 `--c-text-primary: #18222d`，深蓝绿另立 `--c-accent-deep: #153d50` | **D + E** | P1 |
| 2 | `--teal` vs `--green` | 同色两名 | 保留 `--teal` 作别名，主名 `--c-accent-teal` | E | P2 |
| 3 | 最小字级 | `10px`/`11px` 共 5 处 | 收敛到 `12px` | **D** | P1 |
| 4 | 圆角 `20px`/`6px` | 超出 4 档 | `20px`→pill；`6px`→`8px` | **D** | P2 |
| 5 | `--route-casing` 描边 | 未实作 | 采纳可提升底图可读性 | **D + E** | P1 |
| 6 | `--map-route-dash-unavailable` | 现与通关段同为 `7 7` | 改 `2 5` | **D** | P1 |
| 7 | `--risk-critical` | 语义未定 | 见 `RISK-VISUAL-SPEC-v2.md §D` | **A** | P0 |
| 8 | Tailwind 未扩充色板 | 只能用预设 slate | 建议在 `tailwind.config.ts` 挂上 v2 色板（**需 A 同意改 config**） | **A + D** | P1 |

> 所有 ⚠️ / 🟡 项均**不阻塞**其他 Token；D 可先实作 ✅ 项。
