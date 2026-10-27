# C（决策引擎与 GenAI）第二阶段工作评估

**评估日期**：2026-10-07　**评估人**：成员 C（自评 + 对代码/文档的独立复核）
**评估范围**：团队「第二階段：可共享版本（10 月 7 日前）」在 C 侧的交付 —— 对应
`给Pi_Agent_成员C指令.txt` 的 **10/6–10/7** 目标，以及 `团队开发工作流_组员版.txt` 的
「10/6 接口骨架 → 10/7 第一个纵切片」。
> 口径说明：`TASKS.md` 第二階段的行项多属 A/D；C 在该阶段的验收点是「锁定输入输出契约 + 实现正常情景基础决策 + 固定输入固定输出」，并被团队流程列为 10/7 纵切片的决策层依赖。为便于评估，下方同时收录 C **提前完成**的 10/8–10/9 内容（已超出第二阶段范围）。

**总评**：第二阶段目标**全部达成且大幅超前**（8 项指令目标 8 项达标，另提前交付 Plan B、暴雨/中断、`unavailable`、additive 建议层）；**工程质量高**（纯函数、确定性、黄金档案、不变量测试齐备）。**主要不足集中在「最后一公里」**：新增字段未登记进冻结契约、前端未消费、以及演示走廊的事实性核验尚未闭环。

---

## 1. 任务完成情况

### 1.1 对照 C 指令（10/6–10/7 与第二阶段验收点）

| # | 第二阶段目标（C 指令） | 状态 | 证据 |
|---|---|---|---|
| 1 | 与 A 锁定 `TripRequest` / `DecisionResponse` | ✅ | `src/lib/types/*`（A 所有）+ `INTEGRATION_VERIFICATION_BC_A.md §2`，签名逐字一致 |
| 2 | 候选路线结构、评分维度、阈值草案 | ✅ | `src/lib/corridor/index.ts`（R1/R2/R3）、`src/lib/decision/thresholds.ts` |
| 3 | normal / heavy_rain / disruption 各一个预期结果测试 | ✅ | `src/test/decision-scenarios.test.ts`（11 项，锁定三情景输出） |
| 4 | 正常情景：约束过滤 / 基础评分 / ETA / `departAt` / `confidence` | ✅ | `engine.ts`、`scoring.ts`；normal = ready / high / 08:09 |
| 5 | 固定输入 → 固定输出（确定性） | ✅ | `determinism.test.ts`（3 项，10 次相同 + 5 次并发相同）+ 黄金档案 |
| 6 | `docs/DECISION_ENGINE.md`（规则/阈值/局限/校准） | ✅ | 15.8 KB，含 §10 已知限制、§11 GenAI 待办、§12 建议层 |
| 7 | 结构化 `reasons` 供前端直接展示 | ✅ | `buildReasons()`；disruption 的 reasons 逐条引用真实输入（信号故障、人流高、扣分明细） |
| 8 | `ready` / `uncertain` / `unavailable` 三态 + 明确原因 | ✅ | `decideStatus()`；`unavailable` 返回 HTTP 200 + 排除原因 |

**结论：第二阶段 8 项目标全部达成。**

### 1.2 提前完成（原属 10/8–10/9，超出第二阶段）

| 内容 | 证据 |
|---|---|
| Plan B + `switchCondition`（不同运输方式优先） | `engine.ts` 的 `planB` 选择；`decision-scenarios.test.ts` |
| 暴雨 / 中断情景与缓冲 | `SCENARIO_PROFILES`；heavy_rain 07:58 / disruption 07:22 |
| 数据过期 → 降信心 → `uncertain` | `isStale` 分支 + `context-contract.test.ts` |
| `unavailable` 与时序边界 | `decision-edge-cases.test.ts`（13 项） |
| 建议层 `action` / `switchDeadline` / `basis` / `uncertainty` | `advisory.ts` + `decision-advisory.test.ts`（11 项） |
| 回应 B/C 口径（unknown≠零延误、恶劣天气安全） | `decision-live-safety.test.ts`（13 项） |

---

## 2. 交付物与量化

| 类别 | 规模 |
|---|---|
| 决策代码 | `decision/` 5 文件共 **1,510 行** + `corridor/index.ts` 343 行 = 1,853 行 |
| 决策测试 | 4 个 C 测试文件 **48 项** + 黄金/冒烟 3 项；全项目 **15 文件 / 172 项全过** |
| 文档 | `DECISION_ENGINE.md`(15.8K)、`DECISION_CONTRACT_CHANGE_REQUEST.md`(12.2K)、`C_HANDOFF.md`、`C_INTEGRATION_RECONCILIATION.md`、契约存档 1 份 |
| 门禁 | `lint` / `tsc --noEmit` / `vitest` / `build` / `smoke`(15/15) 全绿；黄金档案锁定三情景 |

---

## 3. 质量水平

| 维度 | 评级 | 说明 |
|---|---|---|
| 架构分层与契约合规 | **A** | 纯函数、无网络/无时钟/无随机；只加 additive、未改任何锁定字段；单向依赖 |
| 确定性与可复现 | **A** | 整数化评分（×1000 取整）避免浮点漂移；黄金档案 + 冒烟 15/15 |
| 不变量与自洽 | **A** | `duration = base + delay`、步骤时间连续、`Σstep = duration`、`hold ⇔ unavailable`、`switchCondition` 与 `switchDeadline` 逐字一致，均有测试 |
| 可解释性与诚实性 | **A** | `reasons` 逐条引用输入；`basis`/`uncertainty` 明示未校准；只输出定性信心；本轮又补了混合品质披露 |
| 测试覆盖 | **A−** | 48 项决策测试覆盖三情景/边界/确定性；但以「锁定示例」为主，缺属性测试与前端消费测试 |
| 文档 | **A−** | `DECISION_ENGINE.md` 完整；但存在数字漂移（154→172）、字段未登记契约 |
| 集成完备性 | **B−** | 后端输出完整，但 4 个字段未被前端渲染、未进契约；契约与类型可选语义不一致 |
| 事实正确性（走廊/线路） | **C+** | 时间为演示估算；存在 R1/R3 共享区段等演示事件自洽问题（详见 §4.3） |
| GenAI 解释层 | **C（刻意）** | 交付项 9/11 未实现，仅有 `DECISION_ENGINE.md §11` 的约束设计与模板兜底；属「可选」但仍是缺口 |

**综合：第二阶段目标达成度 A，工程质量 A−/B+；扣分点几乎都在「集成收口」而非「决策本身」。**

---

## 4. 存在的不足

### 4.1 集成收口不足（P1，影响冻结与答辩）

1. **四个 additive 字段未登记 `API_CONTRACT.md §2.2`**：`action` / `switchDeadline` / `basis` / `uncertainty` 已进代码与测试，却仍不在冻结契约，属实现与契约脱节。
2. **前端未消费这四个字段**：`DecisionCard` 只用 `status / departAt / latestDepartAt / planB / dataSources`；`action`（第一屏主动作）、`basis`、`uncertainty` 只存在于 JSON。答辩口径「数据不够怎么办 → 指 uncertainty」在界面上无支撑。
3. **附加字段可选语义与类型不一致**：契约写「前端必须容忍缺失」，但 `DecisionResponse` 附加属性为必填、`isActionable` 依赖 `primaryPlan`。

### 4.2 语义与口径未定（P1）

4. **`action.wait/hold` 的语义被重定义**：C 契约 v1 的 `wait`＝「稍后再走更好」、`hold`＝「数据不可信」，主体实现为 `wait`＝数据过期、`hold`＝无可行路线。需 A 正式确认，否则「接口契约 C 部分」的名实不符。
5. **未来行程 vs 实时来源未定口径**：`live` 用 10-07 的天气/抵站预报服务 10-13 行程，顶层仍标 `live`。本轮加了「服务日样本」通知，但 B 要求的日期校验策略仍待 A 决定。

### 4.3 事实与演示事件自洽（P0/P1）

6. **R1 与 R3 共享坑口—北角区段**（B 报 P0，已复核）：
   - 现况：`disruption` fixture 判 R1 中断（「坑口站至北角站之間列車服務暫停」），却把 **R3 当 Plan B**。
   - 复核：**R3 的将军澳线段正是「坑口站 → 鰂鱼涌站」，完全落在 R1 的停运区间内**。按当前数据，R3 也应不可用——这是演示事件自洽性缺陷，不只是「共享区段」的抽象风险。
7. **线路事实来自演示估算**：R2 起站、R3 行车 19 分钟（与官方先到鰂鱼涌再到北角的站序存疑）、全走廊统一 05:30–23:30 服务窗口，均未与官方核对（B 已列 P1）。

### 4.4 方法与文档（P2）

8. **测试偏示例锁定**：缺属性测试（如随机输入下不变量恒成立）、缺「前端是否真的显示 action/basis/uncertainty」的消费测试。
9. **文档数字漂移**：`C_HANDOFF.md` 写 154 项 / 13 文件；`DECISION_CONTRACT_CHANGE_REQUEST.md` 标题写「五件事」而表内 7 项（本轮已修正）。
10. **工程追溯缺失**：工作区**无 `.git`**，无提交历史，改动的「谁、何时、为何」只能靠文档重建。
11. **`switchDeadline` 可早于 `departAt`**（铁路主线/路面 Plan B 时）：设计正确但字段名易被误读为「晚于建议出发」。

---

## 5. 具体改进建议

| 优先级 | 建议 | 负责 | 验收 |
|---|---|---|---|
| P0 | 把演示事件收窄为「北角站局部事件」，或让引擎按 `affectedSegments` 与线路经路做重叠排除（R3 也应被排除） | C（A 定事件口径） | 新增重叠区段测试；`disruption` 的 Plan B 改为不与 R1 共线的选项 |
| P1 | 采用 `C_INTEGRATION_RECONCILIATION.md §6` 的四行补丁登记 `API_CONTRACT.md §2.2` | A | 文档 diff + `isDecisionResponse` 仍只验锁定字段 |
| P1 | 结果页第一屏渲染 `action` 主动作 + `basis` / `uncertainty` 区块 | D（E 供视觉） | 组件测试断言四字段可见且不覆盖 `status` |
| P1 | 定 `action.wait/hold` 语义与未来日期口径 | A（C 出实现说明） | 契约条目 + 测试 |
| P2 | 为决策层补属性测试（不变量在随机合法输入下恒成立） | C | 新增 property 测试文件 |
| P2 | 与 B 核对 R2 起站、R3 行车时间、服务窗口，统一标注「演示假设」 | B/C | `DATA_SOURCES.md` + 路线定义更新 |
| P2 | 建议启用 `.git`（或每日快照包）承载可追溯 | A | `git log` 或按日归档 |

---

## 6. 后续优化方向（冻结前 / 赛后）

**冻结前（10/11）**

1. 把 4 个 additive 字段「三段式收口」：**契约登记 → 前端渲染 → 消费测试**。
2. 收窄演示事件，让 `disruption` 情景在事实上站得住（避免评委追问 R3 为何可行）。

**赛后（有真实数据后）**

3. **模型层校准**：C 契约 v1 的「规则层 / 模型层」两层设计只交付了规则层。有历史事件后，用「非规则性提前量分布」替换 `UNKNOWN_ROUTE_RULES.extraMinutes = 5` 与固定 `riskBufferMinutes`，才是真正提升精度的一步。
4. **逐字段 provenance 契约**：把「混合质量」从「顶层 quality + notices 说明」升级为逐来源/逐字段 `(quality, updatedAt, sourceUrl)`，让「每个数字带出处」可被机器校验。
5. **GenAI 解释层的受约束实现**：以 `basis` 为唯一事实白名单，做模板兜底 + 幻觉检测（解释中出现 `basis` 没有的事实即拒绝），并保留无 Key 的完整降级。
6. **敏感性分析**：对 `SCORING_WEIGHTS` / 缓冲 / 信心门槛做一次性敏感性扫描，说明结论对参数的稳健性（仍不输出准时概率）。

---

## 7. 一句话总评

C 的第二阶段**不只是完成，而是把 10/8–10/9 的任务也一并做完**，决策层的确定性、可解释性与测试强度都达到了「可冻结」水准；当前风险几乎全部来自**集成收口（契约登记、前端消费）与演示事件的事实自洽**，而不是决策算法本身 —— 这两点应在 10/11 冻结前优先解决。

> 相关：`C_INTEGRATION_RECONCILIATION.md`（对接核对）、`C_HANDOFF.md`（交付说明）、
> `DECISION_ENGINE.md`（规则与局限）、`docs/contracts/C_接口契约_v1_workbuddy.md`（契约存档）。
