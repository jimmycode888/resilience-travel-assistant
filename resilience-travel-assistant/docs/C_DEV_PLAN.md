# C（决策引擎与 GenAI）开发进度回顾与待办清单

**更新日期**：2026-10-07　**负责人**：成员 C
**对应**：`给Pi_Agent_成员C指令.txt` 的交付项 1–10 与 `TASKS.md` 第三/四阶段 C 的待办。
**本文件用途**：先回顾已完成模块，再逐条列出未完成子任务（含涉及文件、核心逻辑、接口/数据结构调整、验证方式），并记录本轮已执行的验证。

---

## 1. 当前实现进度回顾（已完成的功能模块）

| 模块 | 文件 | 状态 |
|---|---|---|
| 决策入口（纯函数 `decideTrip`） | `src/lib/decision/engine.ts` | ✅ |
| 路线评分（时间/状态/转乘/人流/费用加权） | `src/lib/decision/scoring.ts` | ✅ |
| 到达信心（0–100 规则分 + 扣分项 → high/medium/low） | `src/lib/decision/scoring.ts` | ✅ |
| 阈值与情景参数（缓冲/浮动/切换门槛） | `src/lib/decision/thresholds.ts` | ✅ |
| 建议层（`action`/`switchDeadline`/`basis`/`uncertainty`） | `src/lib/decision/advisory.ts` | ✅ |
| 三态判定（ready/uncertain/unavailable）与硬约束过滤 | `engine.ts` + `thresholds.ts` | ✅ |
| Plan B（优先不同运输方式）、切换条件文案 | `engine.ts` | ✅ |
| 数据过期降级、unknown ≠ 零延误、恶劣天气安全规则 | `engine.ts`+`advisory.ts`+`thresholds.ts` | ✅ |
| 走廊定义（R1/R2/R3、起终点、步行时间） | `src/lib/corridor/index.ts` | ✅（事实核验见 S7） |
| 结构化 `reasons`（引用真实输入） | `engine.ts` | ✅ |
| **GenAI 解释层（含模板回退 + 白名单）** | `src/lib/decision/explain.ts` | ✅ **本轮新增** |
| **中断区段重叠（P0 能力）** | `src/lib/decision/disruption.ts` | ✅ **本轮新增**（等待 A/B 结构化范围） |
| 算法说明与局限 | `docs/DECISION_ENGINE.md` | ✅ |
| 契约变更申请 / 交付说明 / 对接核对 | `docs/DECISION_CONTRACT_CHANGE_REQUEST.md`、`C_HANDOFF.md`、`C_INTEGRATION_RECONCILIATION.md` | ✅ |

决策层共 **7 个模块 / 1,853 行**（含 corridor），测试 **19 文件 / 267 项全过**（C 侧本轮新增 4 文件）。

---

## 2. 未完成子任务与实现方案

### S1　GenAI 解释层（C 指令第 9 项）— ✅ 本轮完成

- **涉及文件**：新增 `src/lib/decision/explain.ts`；`src/lib/decision/index.ts`（导出）；新增测试 `src/test/decision-explain.test.ts`（14 项）。
- **核心逻辑**：`explainDecision(response, { model?, timeoutMs? })` → `{ text, source: "model" | "template", reason? }`。
  - 无模型 → 模板；模型超时/抛错/空字串/输出未通过白名单 → 一律回退模板。
  - `validateExplanation(text, response)`：以 `basis`、`reasons`、结构化时间字段建立白名单，模型中任何无出处的**时刻 / 数字 / 路线 ID** 即整段拒绝（防幻觉）。
  - 本层**只回传字串**，永不修改 `departAt`/路线/信心。
- **接口调整**：无（`model` 由调用端注入，符合「不把密钥放进前端」）。
- **验证**：14 项测试覆盖模板自洽、白名单接受/拒绝、抛错、空输出、超时，以及「解释层不改变决策结果」。

### S2　中断区段重叠（B 的 P0）— ✅ 能力完成，等待 A/B 提供结构化范围

- **涉及文件**：新增 `src/lib/decision/disruption.ts`；`engine.ts`（接入）；新增测试 `src/test/decision-disruption-scope.test.ts`（11 项）。
- **核心逻辑**：
  - `LINE_STATION_ORDER`（将军澳线 / 港岛线，站序取自 B 的 `docs/data/official-rail-reference.json`）+ `segmentContains()`：判断候选路线的某一行车段是否被中断段**完全覆盖**。
  - `routeHitsScope()`：支持两类范围 —— `kind:"line"`（某线某段停运 → 同线被覆盖的路线都不可用）、`kind:"station"`（`impact:"interchange"` 仅转乘受阻 → 只有需在该站转乘的路线不可用）。
  - 引擎在过滤阶段调用 `findScopeOverlaps()`，命中即加入 `excludedRoutes`（原因：「与中断路线 R1 的受影响区段重叠」）。
- **所需数据结构调整（属 A/B）**：
  ```
  ContextSnapshot.routes[].affectedLineSegments?（additive，可选）
    Array<
      | { kind: "line"; line: string; from: string; to: string }
      | { kind: "station"; station: string; impact: "interchange" | "service" }
    >
  ```
  **未提供时行为完全不变**（因此本轮的黄金输出与演示基线不变）。
- **待 A/B 决定（重要）**：`disruption` 演示事件目前自相矛盾 —— R1 声明「坑口↔北角列车服务暂停」，却把 R3（行车段正是坑口→鰂鱼涌，落在停运区间内）当 Plan B。两条修正路线：
  1. **A/B 补 `affectedLineSegments` 为 `坑口→北角`** → 引擎自动排除 R3；代价是该情景**失去 Plan B**（`switchCondition` 变为空）。
  2. **把演示事件改为「北角站转乘受阻」**（`kind:"station"`, `impact:"interchange"`）→ R1 仍不可用，**R3 仍可作 Plan B**（已由测试锁定），演示叙事保留。
- **C 的建议**：采用路线 2，并同步更新 `FIXTURE_CATALOG.md` 与 `DEMO_RUNBOOK.md` 的措辞。
- **验证**：11 项测试（含站序覆盖判定、两类范围、无范围时维持现状、重叠时排除 R3、确定性）。

### S3　属性 / 集成测试 — ✅ 本轮完成

- **涉及文件**：新增 `src/test/decision-properties.test.ts`（61 项）、`src/test/c-ab-integration.test.ts`（9 项）。
- **核心逻辑**：
  - 属性测试：固定种子生成 60 组合法请求/快照（情景、日期、限制、路线状态随机），断言不变量恒成立（`duration = base + delay`、步骤连续且加总一致、`switchDeadline ⇔ Plan B`、`hold` 只在 `unavailable`、无 `statistics`、`uncertainty` 非空、可重现）。
  - 集成测试：真实走 `B（resolveContextWithTier，注入空来源→三層回退）→ C（decideTrip）→ A（handleDecisionRequest / isDecisionResponse）`，全程不连网。
- **接口调整**：无。
- **验证**：70 项测试全过；集成测试确认「B 快照完整流入 C、C 输出通过 A 的契约校验、live 无来源时诚实回退」。

### S4　契约登记与前端渲染 — ⏳ 待 A / D（C 已提供补丁）

- **内容**：把 `action`/`switchDeadline`/`basis`/`uncertainty` 写进 `API_CONTRACT.md §2.2`，并把附加属性声明为可选（`?`）；结果页第一屏渲染 `action`，新增 `basis`/`uncertainty` 区块。
- **C 已交付**：`docs/C_INTEGRATION_RECONCILIATION.md §6` 的现成补丁文本。
- **归属**：A（契约）／D（界面视觉由 E 提供）。

### S5　`switchDeadline` 语义说明 — ⏳ 待 A（文档一句话）

- **内容**：铁路主线 / 路面 Plan B 时 `switchDeadline` 会早于 `departAt`（必须先离开起点才赶得上较慢的巴士）。建议在 `API_CONTRACT.md` 补充语义说明，UI 用「若想改乘巴士，需在 HH:mm 前离开」表述。

### S6　未来行程 vs 实时来源口径 — ⏳ 待 A 定口径，C 执行

- **内容**：`live` 用「现在」的天气/抵站预报服务未来日期行程时，顶层仍标 `live`。可选方案：降级为 `cached` / 拒绝实时 ETA / 保留现通知并加强文案。
- **C 已做**：跨服务日样本不再称实时资料为「示范资料」；混合来源逐项披露（见 `C_INTEGRATION_RECONCILIATION.md §3`）。
- **C 待做**：A 定口径后，在 `engine.ts` 增加对应降级逻辑 + 测试。

### S7　走廊事实核验（与 B）— ⏳

- **内容**：R2 起站（B 报 690S 实为「明德邨」）、R3 坑口→鰂鱼涌行车时间与服务窗口（全走廊统一 05:30–23:30）需与官方核对；未核对前统一标注「演示假设」。
- **归属**：B（数据）／C（`corridor/index.ts` 时间值）。

### S8　模型层校准 — ⛔ 赛后（无历史数据前刻意不做）

- **内容**：用历史事件回测的「非规则性提前量分布」替换 `UNKNOWN_ROUTE_RULES.extraMinutes = 5` 与固定缓冲；在此之前不得输出准时概率。

---

## 3. 本轮验证记录（可复现）

```bash
cd /workspace/八校黑客松/resilience-travel-assistant
npm run lint        # 退出 0
npx tsc --noEmit    # 退出 0
npx vitest run      # 19 个文件 / 267 项全过（本轮新增 4 文件 / 95 项）
npm run build       # 成功
npm run smoke       # 三情景各 5 次：08:09 / 07:58 / 07:22，未变
```

- **黄金档案未更新**：三个演示情景的 `departAt`/`etaRange`/主路线/信心/Plan B 全部与接入前一致；S2 的新能力只在提供 `affectedLineSegments` 时生效。
- **与 A / B 的集成**：`src/test/c-ab-integration.test.ts` 以真实 `resolveContextWithTier`（B）+ `decideTrip`（C）+ `handleDecisionRequest`／`isDecisionResponse`（A）验证 4 个情景、`unavailable` 边界与「最小回应仍合法」。

## 4. 本轮新增 / 修改文件

新增：`src/lib/decision/explain.ts`、`src/lib/decision/disruption.ts`、
`src/test/decision-explain.test.ts`、`src/test/decision-disruption-scope.test.ts`、
`src/test/decision-properties.test.ts`、`src/test/c-ab-integration.test.ts`、本文件。
修改：`src/lib/decision/engine.ts`（接入重叠过滤）、`src/lib/decision/index.ts`（导出）、
`docs/DECISION_ENGINE.md`（§11）、`docs/DECISION_CONTRACT_CHANGE_REQUEST.md`（新增字段申请）。
