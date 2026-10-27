# C（决策引擎）与其他部分的接口对接核对报告

**日期**：2026-10-07　**核对人**：成员 C（决策引擎与 GenAI）
**核对对象**：C 的 WorkBuddy「接口契约 v1」在主体项目中的接入情况 —— 对手方为 A（契约与骨架）、B（数据适配层）、D（前端与 QA）、E（UI/视觉）。
**结论（一句话）**：**C 与主体的「数据结构 / 调用流程」已经一致且可运行（172 项测试、构建全绿、三情景黄金输出未变）；「接口契约登记」与「前端消费」两处仍有缺口** —— 四个 additive 字段已实现并通过测试，但既未登录 `API_CONTRACT.md §2.2`，也未被前端渲染。无阻塞性断裂。

---

## 0. 结论速览

| 维度 | 判定 | 证据 |
|---|---|---|
| 调用流程（A→B→C→D） | ✅ 一致 | `decideTrip(request, snapshot, options)` 签名与 `INTEGRATION.md §2`、handler 调用完全一致 |
| 数据结构（C 契约 v1 → 主体） | ✅ 一致（走廊/命名/枚举已重映射） | `docs/contracts/C_接口契约_v1_workbuddy.md` + `DECISION_CONTRACT_CHANGE_REQUEST.md §3` |
| C 新增 4 个 additive 字段（代码层） | ✅ 已实现、已测试 | `src/lib/decision/advisory.ts`、`src/test/decision-advisory.test.ts`(23)、`decision-live-safety.test.ts`(13) |
| C 新增 4 个字段（**文档登记**） | ❌ **缺口 P1** | `grep action/switchDeadline/basis/uncertainty API_CONTRACT.md` = 无命中 |
| C 新增 4 个字段（**前端消费**） | ❌ **缺口 P1** | `grep -rn "action\|basis\|uncertainty\|switchDeadline" src/components/` 仅命中无关的 `action` prop |
| 附加字段可选语义（类型 vs 契约） | ❌ **不一致 P1**（A/D 已知） | `types/decision.ts` 附加属性为必填；契约写「前端必须容忍缺失」 |
| 数据质量诚实性（混合来源） | ⚠️ 本次已修正 C 侧文案 | 见 §3 |
| 演示基线（三情景） | ✅ 未变 | `08:09 / 07:58 / 07:22`，`depart_at`，黄金档案未更新 |

---

## 1. 核对方法与可复现证据

```bash
cd /workspace/八校黑客松/resilience-travel-assistant
npx tsc --noEmit          # 退出 0
npm run lint              # 退出 0
npx vitest run            # 15 个文件 / 172 项全过（原 169 + C 新增 3）
npm run build             # 成功（4 个路由）
npm run smoke             # 三情景各 5 次，15/15 一致
```

运行时抽样（对 A 的历史预览服务 `:5173` 的真实 HTTP 调用，用于观察当前实际输出，不改动该进程）：

| scenario | status | confidence | departAt | action | switchDeadline | dataQuality |
|---|---|---|---|---|---|---|
| normal | ready | high | 08:09 | depart_at | 2026-10-13T07:49+08 | fixture |
| heavy_rain | ready | medium | 07:58 | depart_at | 2026-10-13T07:29+08 | fixture |
| disruption | uncertain | low | 07:22 | depart_at | 2026-10-13T07:37+08 | fixture |
| live | uncertain | low | 08:02 | depart_at | 2026-10-13T07:45+08 | **live（混合）** |

`live` 的 `dataSources`：`weather-live` / `td-special-traffic-news` / `mtr-next-train` 为 `live`，**`route-estimates` 仍为 `fixture`**；主路线服务状态为 `unknown`。这正是 B 交接第 2 条描述的「混合数据」现场。

---

## 2. 调用流程核对（A → B → C → D）

```text
POST /api/decision
  └─ app/api/decision/route.ts            A  HTTP 解析
      └─ lib/api/decision-handler.ts       A  validateTripRequest → resolveContext → decideTrip
          ├─ lib/adapters/index.ts         B  resolveContext({scenario}) → { snapshot, notices, quality, tier }
          └─ lib/decision/engine.ts        C  decideTrip(request, snapshot, {notices, now}) → DecisionResponse
```

| 检查项 | 结果 |
|---|---|
| B 输出类型 = C 输入类型（`ContextSnapshot`，无转接层） | ✅ |
| A 把 B 的 `notices` / `quality` 透传给 C | ✅（`engine` 追加自己的通知，不覆盖） |
| C 不读时钟（`Date.now()` 由 A 注入为 `options.now`） | ✅（`grep Date.now src/lib/decision/` 空） |
| C 不调用网络 / 不 import adapters / 不用随机值 | ✅ 单向依赖 |
| C 的 `DecisionResponse` 由 A 原样返回（A 不改写字段） | ✅ |
| C 的错误路径不 throw（`unavailable` 用返回值） | ✅ 返回 HTTP 200 + `status: "unavailable"` |

**判定：调用流程完全一致，无遗漏。**

---

## 3. 本次核对中发现并已修正的 C 侧问题（数据诚实性文案）

来自 **B 交接第 2 条**与 **D `FRONTEND_CONTRACT_ISSUES` 第 5 条**（live 混合品质 + 未来行程日期口径）。核对后确认是真问题，已在 C 的模块内修正（纯文案/additive，不改任何时间、路线、信心）：

### 3.1 跨服务日样本不再把实时资料叫成「示范资料」

- 现象：`live` 响应里出现「本次使用的**示范资料**以 2026-10-07 为服务日样本」，但该次 `dataQuality = "live"`。
- 修法：`engine.ts` 按 `snapshot.quality` 选择称呼（`fixture → 示范资料`，`live/cached → 实时/快取资料`）。**fixture 文案逐字不变**，黄金档案不受影响。

### 3.2 混合来源改为逐项披露

- 现象：顶层 `live`，但 `route-estimates` 是 `fixture`、交通为 `unknown`；`notices` 未说明哪一部分不是实时。B 明确建议「混合时必须由 notices 说明」。
- 修法：当 `quality !== "fixture"` 且存在与顶层品质不同的来源时，追加一条 `notices`，逐项列出不同步的来源与其品质，并指向下方「资料来源」区块。仅影响 live/cached 路径。

> 两处修正新增 3 项测试（`decision-live-safety.test.ts`），全项目 **172 项测试全过**，黄金档案未更新。

---

## 4. 已一致性确认的既定口径（曾被质疑，核对后维持）

| 议题 | 现状 | 说明 |
|---|---|---|
| `unknown` 的 5 分钟保守预留 | ✅ 已实现 | `UNKNOWN_ROUTE_RULES.extraMinutes`；`duration = base + delay` 不变条件成立，预留不计入「观测延误」扣分 |
| 黑雨/八号以上安全规则 | ✅ 已实现 | 仅覆写 `action → wait`，不改任何时间数字；主线为铁路时不触发 |
| `switchDeadline` 可早于 `departAt` | ✅ 属设计 | 主线铁路、Plan B 路面时，必须早于巴士 `departAt` 离开起点，故 `switchDeadline < departAt`；见 §5 P2 |
| `etaRange` 用区间而非单点 | ✅ 刻意 | 比 C 契约 v1 的单点估计更诚实 |
| 不输出 `statistics` 依据 / 无模型层 | ✅ 刻意不做 | 无历史数据，任何提前量分布都是编造（`DECISION_ENGINE.md §10.6`） |

---

## 5. 仍待处理的问题清单

### P0（影响演示正确性，需 A/B/C 当面拍板）

1. **R1 与 R3 共享坑口—鰂鱼涌区段**（B `B_COLLABORATION_REVIEW.md` P0）：`disruption` 情景把 R1 判为中断、R3 作 Plan B，但两者共享区段；若中断覆盖共同区段，R3 同样不可用。
   - 归属：**C 可执行**（按 `affectedSegments` 过滤）或把演示事件收窄为「北角站局部事件」。
   - 建议：由 A 定演示事件口径，C 在 `engine.ts` 增加「受影响区段重叠 → 一并排除」的规则并补测试。

### P1（文档/契约收尾，10/11 冻结前）

2. **四个 additive 字段未登录 `API_CONTRACT.md §2.2`**（A 的所有权）。下方给出可直接采用的补丁文本。
3. **附加字段可选语义与 TS 类型不一致**（A 的所有权，D 已报）：契约写「前端必须容忍缺失」，但 `DecisionResponse` 的附加属性为必填，`isActionable` 还要求 `primaryPlan !== null`。
4. **前端未消费 C 的四个字段**（D/E 的所有权）：`DecisionCard` 目前只用 `status / departAt / latestDepartAt / planB / dataSources`，未渲染 `action`（第一屏主动作）、`basis`（每数字带出处）、`uncertainty`（我们还不知道什么）。这会让答辩口径「数据不够怎么办 → 指 uncertainty + action」失去界面支撑。
5. **未来行程日期 vs 当前实时来源**（A/B/C）：`live` 用 10-07 的天气/抵站预报服务 10-13 的行程，顶层仍标 `live`。C 目前只加「服务日样本」通知；是否应降级为 `cached`/拒绝实时 ETA，需 A 定口径后 C 再实现。
6. **`action` 语义在 C 契约 v1 与主体之间被重新定义**（见下表），需 A 在会上正式确认，否则「接口契约 C 部分」的字面含义与实现不符。

| 值 | C 契约 v1（WorkBuddy）原文 | 主体实现 | 差异 |
|---|---|---|---|
| `wait` | 「现在走会白等，稍后再走更好（例如暴雨暂缓）」 | 「资料已过期 → 先核实官方资讯」 | **语义不同**，需 A 确认以主体为准 |
| `hold` | 「数据不可信／风险过高，建议留在安全处」 | 「无可行路线（`unavailable`）」 | **语义不同**，主体为维护 `hold ⇔ unavailable` 不变条件 |

### P2（可择期）

7. `switchDeadline` 早于 `departAt` 时，字段名「仍能改乘 Plan B 的最迟时刻」易被误读为「晚于建议出发」；建议在 `API_CONTRACT.md` 补一句语义说明，UI 用「若想改乘巴士，需在 07:49 前离开」表述。
8. C 侧文档数字漂移：`C_HANDOFF.md` 写 154 项 / 13 文件、`DECISION_CONTRACT_CHANGE_REQUEST.md §4` 标题写「五件事」而表内有 7 项。已在本报告 §7 登记并更新。

---

## 6. 给 A 的 `API_CONTRACT.md §2.2` 补丁文本（可直接采用）

在「附加字段（additive）」表 `generatedFor` 之后追加四行：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `action` | `"depart_now" \| "depart_at" \| "wait" \| "hold"` | `status` 的可執行版本。`hold` **只**與 `unavailable` 同時出現；`wait` 對應 `uncertain`（資料過期，先核實官方資訊）。前端可只用它顯示主要按鈕，但不得覆蓋 `status` 語意 |
| `switchDeadline` | `string`（ISO `+08:00`，無 Plan B 時為 `""`） | 仍能改乘 Plan B 的最遲時刻；與 `switchCondition` 文字中的「HH:mm 前」逐字一致。**注意**：主線鐵路／Plan B 路面時它會早於 `departAt`（需先離開起點才趕得上較慢的巴士） |
| `basis` | `DecisionBasis[]`（`claim` / `type` / `source` / `sourceUrl`） | 每個數字與結論的出處。`type` 目前只有 `rule` / `data`；未校準前**不會**出現 `statistics` |
| `uncertainty` | `string[]` | 明示「我們還不知道什麼」；任何狀態下皆非空 |

同时建议在 §2.2 开头明确一句：**「附加字段在类型上应声明为可选（`?`）」**，并让 `isActionable` 以 `status !== "unavailable" && departAt !== ""` 为准，避免与「前端必须容忍缺失」矛盾（对应 §5 P1-3）。

---

## 7. 下一步具体行动

| # | 行动 | 负责 | 验证方式 | 期限 |
|---|---|---|---|---|
| 1 | 把 §6 的四行登记进 `API_CONTRACT.md §2.2`，并把附加属性改为可选 | A | 文档 diff；`isDecisionResponse` 仍只验锁定字段 | 10/11 冻结前 |
| 2 | 在结果页第一屏渲染 `action` 主动作，并新增 `basis` / `uncertainty` 区块 | D（E 提供视觉） | 组件测试断言四字段可见；不覆盖 `status` | 10/11 前 |
| 3 | 确认 `action.wait/hold` 语义以主体为准（§5 表） | A（C 提供实现说明） | 站会记录 + 文档一句话 | 10/08 |
| 4 | 定 `live` 未来日期口径（降级 / 拒绝实时 ETA / 保留现通知） | A（B/C 执行） | 新增契约条目 + 测试 | 10/09 |
| 5 | 演示事件收窄或按受影响区段过滤（P0-1） | C（A 定口径） | `decision-scenarios.test.ts` 新增重叠区段案例 | 10/10 |
| 6 | 修订 C 侧文档数字漂移（154→172、五件事→七件事、本报告链接） | C | 已在本轮完成 | 10/07 ✅ |
| 7 | 功能冻结前一并复核 `thresholds.ts` 权重与门槛、定稿 `DECISION_ENGINE.md`（C 的既定待办） | C | `npm run verify` + 文档 | 10/09 |

---

## 8. 需要关注的风险点

1. **「实现与契约脱节」正在累积**：`action` / `switchDeadline` / `basis` / `uncertainty` 已进代码、测试与变更申请，却迟迟未进冻结契约（A 待办），而 D 又按「只信任锁定字段」实现。冻结前若不收口，答辩时对不上「接口契约 C 部分」的书面定义。
2. **前端未渲染 = 答辩口径落空**：`action`（第一屏主动作）与 `uncertainty`（数据不够时的答案）目前只存在于 JSON。评委看界面时看不到，会被追问「那四个字段做了什么」。
3. **混合品质与未来日期容易被当成「假实时」**：本轮已补逐项披露文案，但顶层 `live` + 未来 6 天行程的组合仍需 A 给出口径，否则「这是真数据吗」的回答在 `live` 情景下站不住。
4. **P0 演示事件与真实网络不一致**：R1/R3 共享区段、R2 起站（B 报 690S 实为明德邨 07:30 首班）都指向「演示事件是构造的」。演示脚本与 `DEMO_RUNBOOK` 必须统一标注为「演示假设」，避免被质疑编造。
5. **两条 C 交付线并存**：WorkBuddy 的 Python `engine/` + `model/` 那条线与本工作区 Next.js 线不是同一份产物，走廊与命名均不同。**以本工作区为唯一主体**；WorkBuddy 稿仅作字段结构与设计原则的来源（已存档于 `docs/contracts/`），不得整包并入。
6. **时间成本**：功能冻结 10/11、五人测试 10/13、最终冻结 10/17。上面第 1–4 项都是「要 A/D 动作」的收尾项，越晚越难在冻结前回归。

---

## 附：本轮修改文件

修改：`src/lib/decision/engine.ts`（服务日样本称呼 + 混合来源披露）、
`src/test/decision-live-safety.test.ts`（+3 项测试）、
`docs/C_HANDOFF.md`、`docs/DECISION_CONTRACT_CHANGE_REQUEST.md`（数字与标题漂移）、
新增：本文件。
**未修改**任何锁定字段、A 的共享类型/契约、B 的适配器、D 的组件，也未更新黄金档案。
