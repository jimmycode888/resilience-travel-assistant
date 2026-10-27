# UI Spec v2 — 第二阶段 Design System 与设计规格

Owner **E**（UI / UX / Design System）｜ 消费方 **D**（地图与前端交互）｜ 更新 2026-10-10

> 本目录是**设计规范唯一来源**。所有页面、组件与状态的视觉决定以本目录为准；
> **不包含任何业务代码**，也不修改 `src/**`、API contract、fixtures 或 decision engine。

---

## 文件索引（建议阅读顺序）

| # | 文件 | 内容 | 何时读 |
|---|---|---|---|
| 1 | **README.md** | 本文件（索引 + 阅读顺序 + 冲突清单） | 先读 |
| 2 | `DESIGN-TOKENS-v2.md` | 色彩/字体/间距/圆角/阴影/图标/地图 Token | 实作前 |
| 3 | `UI-PAGE-INVENTORY.md` | 7 个 IA 单元的清单、现状、缺口 | 了解范围 |
| 4 | `UI-WIREFRAMES.md` | 7 个单元的布局草图（移动优先 + 桌面） | 布局实作 |
| 5 | `UI-STATES.md` | 7 单元 × 4 类状态 = **28 组** | 状态实作 |
| 6 | `COMPONENT-SPEC.md` | 18 个组件的视觉与交互规则 | 组件实作 |
| 7 | `API-UI-DEPENDENCIES.md` | 数据依赖与五类字段清单 | 接线前 |
| 8 | `REPLAY-SIMULATION-SPEC.md` | 时间轴回放与差异对比 | 后续阶段 |
| 9 | `RISK-VISUAL-SPEC-v2.md` | 风险三色/四色、符号、可访问性 | 风险相关 |
| 10 | `MAP-LAYERS-SPEC-v2.md` | 路线状态矩阵、跨境/口岸、降级 | 地图相关 |
| 11 | `JOURNEY-VISUAL-SPEC-v2.md` | 视觉总纲、字段映射、Integration Notes | 总览 |
| 12 | `QA-CHECKLIST.md` | 视觉验收清单（含附录 A 新增 10 组 + 附录 B 走查模板） | 验收 |

> 2–8 为 2026-10-10 新增；9–12 为同日早前完成，**未修改**。

---

## 与其他文档的关系

| 文档 | 关系 |
|---|---|
| `docs/PHASE2_CONTRACTS.md` | 接口契约（A 所有）。本目录**不修改**它；缺口记录在 `API-UI-DEPENDENCIES.md` |
| `docs/PHASE2_QA_2026-10-10.md` | 功能/接口验收结果。本目录的 `QA-CHECKLIST.md` 是**视觉**验收，互为补充 |
| `docs/QA_CHECKLIST.md` | 第一阶段通用清单。本目录清单沿用其分级（P0/P1/P2） |
| `docs/MAP_MODULE_MIGRATION.md` | 地图模块迁移评估（定位/显示策略/POI 兑底） |
| `src/lib/integration/ui-contract.ts` | `JourneyVisualSpec` 与 `REFERENCE_JOURNEY_VISUALS`（**A 所有，本目录只引用**） |

---

## 三处必须先知道的事实

1. **7 个「页面」目前全部实作在 `/journey` 一个路由内**（`JourneyPlanner.tsx`，142 行）。
   本目录把它们定义为 **IA 单元**，默认立场**不拆路由**（详见 `UI-PAGE-INVENTORY.md §0`）。
2. **路线风险只有 3 档**（`RiskLevel = low | medium | high`）；`critical` 只存在于**人流信号**
   （`CrowdSignal.level`）。视觉规格有 4 个键，但**不得**让路线风险产出 `critical`（详见 `RISK-VISUAL-SPEC-v2.md §B/D`）。
3. **`JourneyAnalysis.quality` 目前固定为 `'fixture'`** → 所有结果都属「演示数据」，
   必须始终携带 `演示估算 · fixture` 徽章。

---

## 当前未决（阻塞 D 的部分标 P0）

| 级别 | 事项 | 需要谁 | 记录位置 |
|---|---|---|---|
| **P0** | `risk.critical` 的语义与命名（crowd-only？） | **A** | `RISK-VISUAL-SPEC-v2.md §D`、`API-UI-DEPENDENCIES.md §7.1` |
| **P0** | 团队「橙 = 较高」的归属 | **A + E** | 同上 |
| **P0** | `BorderQueue.confidence` 的实际口径（UI 现写死） | **C** | `MAP-LAYERS-SPEC-v2.md §E.4` |
| P1 | `--ink` 冲突（`#18222d` vs `#153d50`） | **D + E** | `DESIGN-TOKENS-v2.md §7` |
| P1 | `RiskFactor.notices` / `RiskBreakdown.confidence` / `CandidateRoute.quality` 未接线 | **D** | `UI-STATES.md §8`、`COMPONENT-SPEC.md §20` |
| P1 | Replay 差异对比需保存上一份快照 | **D**（纯前端） | `REPLAY-SIMULATION-SPEC.md §7` |
| P1 | `sources[]` 是否统一到 `DataEnvelope` | **B** | `API-UI-DEPENDENCIES.md §7.2` |
| P1 | `UI Spec v2` 未列入 `PHASE2_CONTRACTS.md §1` 冻结契约 | **A** | `API-UI-DEPENDENCIES.md §7.1 A-6` |

---

## 硬性边界（本目录遵守）

1. 只写入 `docs/ui-spec-v2/`。
2. 不修改业务代码、API contract、fixtures、decision engine、共享类型。
3. 不修改第一阶段归档与历史 Baseline。
4. 不擅自决定 `critical` 的业务语义。
5. 不编造实时数据、精确人数、精确排队时间或精确概率。
6. 用户可见文案使用**香港繁体中文**。
7. 每个页面与组件都引用明确的 Token 名称。
8. 无接口支持的需求标 `Pending Confirmation`，不自行创造字段。
