# C 部分缺失项补充与收口（回应《第二阶段进度汇报》）

**日期**：2026-10-12　**负责人**：成员 C　**基线**：`/workspace/八校黑客松/A部分/app`
**依据**：`progress-2026-10-12/index.html` 的 C 段（缺口栏）、§5 阻塞与风险表、§6 下一步第 2 条，
以及 `docs/C_PHASE2_HANDOFF.md` §5。

**一句话**：汇报里点名的 C 缺口共 8 项，**本轮收口 4 项（代码 + 测试）、2 项转为「已提供契约文本待 A 登记」、1 项复核确认已实现、1 项（模型校准）如实保留为赛后**。所有改动不触碰 A 的共享类型、B 的适配层、D 的组件；黄金三情景输出未变。

---

## 1. 逐项收口表

| # | 汇报原文（C 缺口） | 处理 | 证据 | 状态 |
|---|---|---|---|---|
| 1 | 「门槛常数与 B 的模型重复且数值不一致（B 建议 C 改消费 `estimateBorderQueue()`，单一权威来源）」 | `src/lib/border/index.ts` 改为**完全委派** B 的 `estimateBorderQueue()`；删除 C 自带的 `BORDER_QUEUE_BASE`、`BORDER_ADJUSTMENTS`、`BORDER_PEAK_WINDOWS`、`BORDER_QUALITY_CONFIDENCE_CAP`；只保留 C 的**风险等级切分**与文案 | `c-border.test.ts` 新增「排隊區間與 B 的權威估算完全相同」等 3 项 | ✅ 已收口 |
| 2 | 「不输出准时概率的前提是模型未经历史校准（P3）」 | 无法用代码「修复」（缺历史数据）；保持在 `CROWD/BORDER_UNCALIBRATED_NOTE`、`confidence` 上限 `medium`、`evidence` 文案中明示；赛後校准计划见 §4 | 两条 note 与 confidence 上限均有测试锁定 | 📄 已如实保留（P3） |
| 3 | 「`hold` 规则与 A 的严重天气暂缓需再对齐口径」 | `team-decide.ts` 的 `SEVERE_WEATHER_HOLD_SCORE` 改为直接取 A 的 `RISK_LEVEL_CUTOFFS.high`（不再硬编 70），并在注释写清语义：**weather 因子达「高风险」且主路以路面为主**才暂缓，铁路上盖候车不触发 | `c-team-decide.test.ts` 的 hold / 不触发现有 2 项；阈值来源单测由 A 的 `risk-engine.test.ts` 覆盖 | ✅ 已收口 |
| 4 | D2-05「基础排序允许到达超时候选被推荐」（A/C） | C 侧加**期限硬约束**：`pickPrimary()` 只在 A 的推荐 `meetsDeadline !== false` 时采用；否则改选「先满足期限、再比排名分」的可行候选，并加 `notices` 说明。`selectBackup` 本就把超时备选排在最后 | `c-team-decide.test.ts` 新增「A 推薦的路線趕不上期限 → 改選其他可行路線」 | ✅ 已收口（C 侧） |
| 5 | D2-04「主路与备选共享故障段」 | C4（`src/lib/plan/index.ts`）已有**独立性硬校验**：不同口岸 + 不共用 ≥20 分钟的主要长途线路，否则回传 `null`（宁缺勿滥） | `c-plan.test.ts`（6 项） | ✅ 复核确认已实现 |
| 6 | §6-2「整理 `TeamDecisionResult` 语义给 A 登记」 | 给出可直接抄进 `API_CONTRACT.md` 的语义文本，见 §2 | 本文 §2 | 📄 待 A 登记 |
| 7 | 「把 C1/C2 类型收编进 `types/**`」（C 只在自己目录定义） | 给出 C1/C2 结果类型的建议定义，见 §3；C 仍未改 `types/**` | 本文 §3 | 📄 待 A 收编 |
| 8 | D2-03「第一阶段中断情景数据矛盾」 | C 侧已提供**中断区段重叠过滤**（`decision/disruption.ts`，含站序覆盖判定）；剩余是 B/A 补结构化范围或收窄演示事件 | `decision-disruption-scope.test.ts`（11 项） | ⏳ B/A 待办（C 侧就绪） |

---

## 2. 给 A 的 `TeamDecisionResult` 契约语义（建议登记）

```ts
interface TeamDecisionResult {
  /** unavailable ⇔ 没有可行主路；hold = 安全暂缓（恶劣天气且主路露天）或主路赶不上期限；go = 其余。 */
  action: "go" | "hold" | "unavailable";
  /** 只引用 eligible && exclusions 为空 && meetsDeadline !== false 的路线；否则 null。 */
  primaryRouteId: string | null;
  /** 0 或 1 项；只引用与主路**真正独立**（不同口岸、不共用 ≥20 分鐘主要长途线路）的 eligible 路线。 */
  backupRouteIds: string[];
  /** 只有 action === "go" 才非 null。10 分鐘粒度、horizon 120 分鐘；confidence 为定性；evidence 说明取样方式。 */
  departureWindow: { start: string; end: string; confidence: Confidence; evidence: string } | null;
  /** 每条 { routeId, text, evidence }；text 只引用 evidence，模型失败一律回退模板。 */
  explanations: { routeId: string; text: string; evidence: string[] }[];
  /** 用户可见提示：安全规则、期限覆写（D2-05）、缺少独立备选等。 */
  notices: string[];
}
```

三条必须写进文档的硬约束：

1. **不得升用被排除的路线**：`primaryRouteId` / `backupRouteIds` 即使 A 的推荐指向被排除路线也不采用（`team-journey-api.test.ts` 已验证）。
2. **不得把「到达超时」当可执行推荐**（D2-05）：推荐候选 `meetsDeadline === false` 时改选其他可行候选，并在 `notices` 说明。
3. **不输出准时概率**：`departureWindow.confidence` 与 `reliability.onTimeConfidence` 都是定性等级；窗口为离散取样的建议区间，非连续最优解、非概率。

---

## 3. 给 A 的 C1 / C2 类型收编建议（`src/lib/types/`）

```ts
// crowd.ts
export type CrowdLevel = "low" | "medium" | "high" | "critical";
export interface CrowdFactor { label: string; points: number }         // 配分可追溯
export interface CrowdRiskResult {
  level: CrowdLevel; confidence: Confidence;
  score: number;                       // 0–100 规则分，不得当人数/机率
  factors: CrowdFactor[]; evidence: string;
  signal: CrowdSignal; notices: string[];
}

// border.ts
export type BorderLevel = RiskLevel | "unknown";
export interface BorderFactor { label: string; minutes: [number, number] | null }
export interface BorderRiskResult {
  portId: string | null; portName: string | null; open: boolean;
  level: BorderLevel; confidence: Confidence;
  queueMinutesRange: [number, number] | null;   // 区间，永不单点
  factors: BorderFactor[]; signal: BorderSignal | null; notices: string[];
}
```

> 收编后 `CrowdSignal` / `BorderSignal`（A 已有）保持不变；新增的是 C 的**结果类型**，
> 供 API 层与文档引用，避免 D/E 只看到 `signal` 而丢掉 `factors` / `level` 的溯源信息。

---

## 4. 保留项：模型层校准（P3，赛后）

- **现状**：`crowd/thresholds.ts`、`border/thresholds.ts` 的配分与等级切点、`QUEUE_PRIORS`（B）都是**先验假设**；
  `confidence` 上限 `medium`，不输出百分比。
- **不做的理由**：没有同走廊历史排队/到达记录，任何「提前量分布」都会是编造的。
- **校准路径**：① 累积同走廊实际到达与排队记录（含平日/雨天）；② 用实测分布替换固定配分；
  ③ 用真实准时率区间标定 `confidence` 档位后，才允许输出百分比。校准前不得声称任何统计依据。

---

## 5. 验证记录（2026-10-12，本机）

```bash
cd /workspace/八校黑客松/A部分/app
npm run lint        # 退出 0
npx tsc --noEmit    # 退出 0
npx vitest run      # 39 个文件 / 545 项全过（本轮 +4 项）
# 生产构建：原地 build 仍受跨账号 .next 快取 EACCES 阻塞（环境问题，见汇报 §4），
# 改以干净输出目录验证成功：10 条路由（含 /api/team-journey）
```

- **正式端点样张未变**：`POST /api/team-journey`（中环 → 福田，08:00 出发，11:00 前到）
  → `action=go`、主路 `xb-1-lok-ma-chau`、备选 `xb-3-shenzhen-bay`、窗口 `08:00–09:00`、解释含口岸排队区间。
- **第一阶黄金三情景未变**：`08:09 / 07:58 / 07:22`。

## 6. 本轮新增 / 修改文件

修改：`src/lib/border/index.ts`（委派 B 的估算、删双份常数）、`src/lib/border/thresholds.ts`（只留等级与文案）、
`src/lib/decision/team-decide.ts`（A 阈值单一来源 + D2-05 期限硬约束）、
`src/test/c-border.test.ts`（+3）、`src/test/c-team-decide.test.ts`（+1）。
新增：本文件。
**未修改**：A 的 `src/lib/types/**` 与 `API_CONTRACT.md`、B 的适配层、D 的组件、任何黄金档案。
