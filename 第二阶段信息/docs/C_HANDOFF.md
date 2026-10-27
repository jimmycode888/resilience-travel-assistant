# C 数据交接与待确认事项（2026-10-06）

**角色**：C（决策引擎与 GenAI）　**项目**：韧性出行助手 · 坑口 ↔ 中环走廊
**一句话**：C 的决策层已按 **B 的交接文件** 补齐两处口径（unknown ≠ 零延误、黑雨安全规则），
全项目 **154 项测试通过**，三个演示情景的用户可见建议**未改变**。
**契约**：`API_CONTRACT.md`（锁定）＋ `docs/DECISION_CONTRACT_CHANGE_REQUEST.md`（新增 additive 字段的申请）。
**走廊**：以主体为准 —— `tko-hang-hau-to-central`（坑口 ↔ 中环），路线 `R1 / R2 / R3`。
C 早期草案的「屯门—九龙西」不是当前走廊，已作废并归档于 `docs/contracts/`。

---

## 1. 对接状态

| 对方 | 状态 | 说明 |
|---|---|---|
| **B**（数据与后端） | ✅ 已回应 | 逐条回应 B 交接文件第 2、3 条，见第 4 节；两处口径已写进代码与测试 |
| **A**（技术负责人与集成） | ⏳ 待确认 | `DECISION_CONTRACT_CHANGE_REQUEST.md` 有 5 项待决；`API_CONTRACT.md §2` 附加字段表待登录 |
| **D**（前端与测试） | ✅ 样例与渲染契约就绪 | `action` / `switchDeadline` / `basis` / `uncertainty` 四个新增字段见第 3 节；旧前端忽略它们行为不变 |
| **E**（UI/视觉） | ⏳ 待确认 | `action` 建议做成第一屏的主动作；「先核实再出发」不可省成颜色 |

> 本包不含 A/B 的产物。B 的交付包是 `B-data-handoff.zip` + `docs/B_HANDOFF.md`，正式版本以 B 自己的包为准。

---

## 2. 本次改动（回应 B 的交接）

### 2.1 unknown ≠ 零延误（回应 B 第 3 条）

B 指出：`unknown` 路线的 `delayMinutes = 0` 只是数值契约占位，不能当成「零延误」。

**核对结果：确认是真问题。** 原实现在 `engine.ts` 里对 `unknown` 直接采用 `delayMinutes`（=0），
但理由文案却写「已按保守假设计算」—— 文字与数字不一致，B 的实时路径
（只有天气 live、交通 unknown）会直接踩中。

**修法**：新增 `UNKNOWN_ROUTE_RULES.extraMinutes = 5`（政策常数，不是统计）。

```text
有效时间 = base + 资料延误(unknown 视为 0) + 5 分钟保守预留
plan.delayMinutes = 资料延误 + 保守预留        // 保持 duration = base + delay
信心扣分用的延误  = 资料延误（不含保守预留）   // 政策不算「观测到的延误」
```

四处文案（`reasons` / `riskNotes` / `uncertainty` / `basis`）口径一致。
**三个演示 fixture 没有任何 unknown 路线，所以黄金输出完全不变**——
这条规则只在实时路径生效。

### 2.2 黑雨 / 八号以上安全规则（回应 B 第 3 条）

**触发**：`weather.condition === "storm"`，或 `weather.warning` 含「黑色暴雨」「八号／九号／十号」「暴风」「烈风」；
**且**建议主路线的主要运输方式是路面（需要露天候车）→ `action` 降为 **`wait`**。

- **只覆写 `action`**，不改 `departAt` / `etaRange` / 路线 / 信心（有不变量测试）。
- **为什么不是 `hold`**：`hold` 的语义是「没有可行路线、不提供出发时间」。
  硬用它来表达「叫用户不要出门」会让真正需要通勤的人无所适从，也会破坏 `hold ⇔ unavailable` 不变量。
  「如非必要，请留在安全处」放在 `uncertainty` 措辞里。
- 主路线是港铁时不触发（室内候车为主）——`heavy_rain` fixture 本身就是黑雨 + 港铁主线，行动建议维持 `depart_at`。

---

## 3. 给 D 的渲染契约（C → D）

四个字段都是 **additive**，D 可以立即使用；不显示也不影响既有行为。

| 字段 | 值 | D 应怎么用 |
|---|---|---|
| `action` | `depart_now` / `depart_at` / `wait` / `hold` | 第一屏的主动作。**必须带文字**（标签见 `src/lib/labels.ts` 的 `DECISION_ACTION_LABELS`），不可只用颜色 |
| `switchDeadline` | ISO `+08:00`，无 Plan B 时 `""` | 与 `switchCondition` 文字逐字一致（已锁测试），可直接排程/提醒 |
| `basis` | `{ claim, type, source, sourceUrl }[]` | 「每个数字带出处」区块；`type` 只有 `rule` / `data`（`statistics` 在校准前不会出现） |
| `uncertainty` | `string[]` | 「我们还不知道什么」区块；任何状态下都非空，`unavailable` 时说明为何不给建议 |

三条硬要求：

1. **信心必须带理由** —— 展示 `basis` 里对应 `confidence` 的那一条，不要只给「高/中/低」。
2. **`hold` 时不给时间** —— `hold` 只与 `unavailable` 同时出现，此时 `departAt` 为空。
3. **降级要可见** —— `dataQuality` 非 `live` 时，`uncertainty[0]` 已写明，不要折叠隐藏。

---

## 4. 逐条回应 B 的「A/C 需要确认」

| B 的条目 | C 的回应 |
|---|---|
| 1. 确认走廊与路线 ID | ✅ 以主体为准：`tko-hang-hau-to-central`，`R1/R2/R3`。C 草案的屯门走廊作废 |
| 2. 混合数据口径（顶层 live + 静态路线 fixture + 交通 unknown） | ✅ **可以接受**，理由是引擎只用顶层 `quality` 做两件事：判断过期、扣 5 分信心；交通事实完全由**逐条路线的 `status`** 承载。配合本次的 unknown 规则，「交通 unknown」不再被伪装成「零延误」。**建议 A 明确要求**：混合时必须由 `notices` 说明哪一部分是 live、哪一部分是 fixture |
| 3. unknown 不得解释为零延误 + 黑雨安全规则 | ✅ 已修并加 10 项测试，见第 2 节 |
| 4. 运输署 XML feed 的事件→路线映射 | ⏳ 属 B/A。C 的立场：**没有稳定 ETA 来源时不得生成实时延误分钟数**；引擎现在的行为正好符合——状态填 `unknown` 时按保守预留处理，而不是编一个延误数字 |
| 5. README 应改为「可选 HKO 天气；交通状态尚未确认」 | ⏳ 属 A（C 未改 README 的该段） |

---

## 5. 已验证内容

```bash
npm run lint       # 绿
npx tsc --noEmit   # 绿
npm test           # 13 个文件 / 154 项测试全过（原 144 + C 新增 10）
npm run smoke      # 三个情景各 5 次，15/15 成功且结果一致
npm run build      # 绿
```

- 新增测试：`src/test/decision-live-safety.test.ts`（10 项），覆盖 unknown 保守预留、
  不变量（`duration = base + delay`、步骤加总）、文案口径、黑雨触发与不触发、`hold` 不变量、确定性。
- **黄金档案未更新**（`npm run fixtures:update` 不需要执行）：三个情景的
  `departAt` = `08:09 / 07:58 / 07:22`、`etaRange`、主路线、信心全部与接入前一致。
- `git status`：工作区没有 `.git`，未创建提交（与 B 相同）。

---

## 6. 怎么跑

```bash
npm ci
npm run verify                 # lint → typecheck → test → build
npm run smoke                  # 三情景各 5 次（冻结验收）
UPDATE_FIXTURES=1 npx vitest run src/test/golden.test.ts   # 只在刻意改变建议时执行
```

---

## 7. 答辩分工提醒

- 「模型错了怎么办」→ 指 `basis`：解释只能引用 `basis`，`basis` 没有的事实不准写进解释。
- 「数据不够怎么办」→ 指 `uncertainty` + `action: wait/hold`：我们不猜，我们说不知道，并给出下一步。
- 「这是真数据吗」→ 指 `dataQuality` + `/api/health` 的 `liveDataConfigured`。
- 「精确度多少」→ **只能答定性信心**，并说明 `thresholds.ts` 全部是演示设定、未校准
  （`basis` 里有一条明文写着这件事）。

---

## 8. 修改文件

新增：`docs/C_HANDOFF.md`、`src/test/decision-live-safety.test.ts`
修改：`src/lib/decision/engine.ts`、`thresholds.ts`、`advisory.ts`、`index.ts`、
`docs/DECISION_ENGINE.md`（§12.6、§10）、`docs/DECISION_CONTRACT_CHANGE_REQUEST.md`、`TASKS.md`

---

## 9. 2026-10-07 追加：与其他部分的对接核对

本节补记交接后的核对结果，**不改变上文 10-06 的既有结论**。

- **测试基线更新**：全项目现为 **15 个文件 / 172 项测试全过**（上文「154 / 13 文件」为 10-06 时点）。
  `npm run lint`、`npx tsc --noEmit`、`npm run build`、`npm run smoke`（三情景 15/15）全绿，
  三个演示情景的 `departAt` = `08:09 / 07:58 / 07:22` **未变**，黄金档案未更新。
- **本轮新增的 C 侧修正（数据诚实性文案）**：
  1. 跨服务日样本不再把 `live` 资料称为「示范资料」（fixture 文案逐字不变）；
  2. 顶层 `live`/`cached` 但含不同品质来源时，`notices` 逐项披露混合来源
     （回应 B 交接第 2 条、D `FRONTEND_CONTRACT_ISSUES` 第 5 条）。新增 3 项测试锁定。
- **仍开放的两处缺口**：四个 additive 字段（`action` / `switchDeadline` / `basis` / `uncertainty`）
  尚未登记进 `API_CONTRACT.md §2.2`，且前端尚未渲染（详见核对报告）。
- **完整核对矩阵、P0/P1/P2 清单与下一步行动**：
  [`C_INTEGRATION_RECONCILIATION.md`](./C_INTEGRATION_RECONCILIATION.md)。
