<!--
  存檔說明（由接入者加上，原文未改動）
  來源：WorkBuddy AI 分享連結（2026-10-06 匯入）
  分享碼：HeNlBz5WKiwGp8LA21x0zaCtovFVmrWwWir_jA7qP8gJIZaI8D07amJw9unXqJP-
  作者：成員 C（決策引擎與 GenAI）
  原文檔名：接口契约_v1.md
  原文狀態：草案（待 A/B/D 確認）
  接入記錄：docs/DECISION_CONTRACT_CHANGE_REQUEST.md
  注意：原文使用的走廊是 CORRIDOR_TM_KLW（屯門 → 九龍西）的結構佔位，
        與主體專案凍結的走廊（tko-hang-hau-to-central，坑口 → 中環）不同；
        走廊以主體契約為準，可沿用的部分是欄位結構與設計原則。
-->

# C 的职责 · 接口契约 v1（决策引擎 ↔ B / D）

**日期**：2026-10-06　**负责人**：C
**状态**：草案，待 A（接口总负责）与 B、D 确认
**用途**：这是 C 的全部对外边界。契约冻结后，B、C、D 三方即可用固定样例并行开发，不互相等。

---

## 0. 三条设计原则

1. **大模型不产生事实。** 所有时间、路线、状态都由规则与数据算出；GenAI 只负责把结构化结果解释成人话。它拿不到原始 API，也无法新增一条路线。
2. **缺失优于猜测。** 任何无法确认的字段填 `null` 并给出 `uncertainty` 说明，绝不编造。这直接对应答辩十问里「模型错了怎么办」。
3. **每个数字带出处。** 所有决策输出必须能追溯到 `basis`（规则条款或历史统计），否则不能写进 deck。

---

## 1. 契约 ①：B → C（数据输入）

B 交给 C 的**唯一**结构。C 不直接调用任何外部 API —— 数据获取与降级全部由 B 负责。

```json
{
  "corridor_id": "CORRIDOR_TM_KLW",
  "snapshot_at": "2025-09-23T13:00:00+08:00",
  "weather": {
    "signal_level": 8,
    "signal_name": "八號西北烈風或暴風信號",
    "issued_at": "2025-09-23T14:20:00+08:00",
    "pre_announce_at": "2025-09-22T21:45:00+08:00",
    "source_url": "https://my.weather.gov.hk/..."
  },
  "routes": [
    {
      "route_id": "ROUTE_A",
      "status": "normal | reduced | suspended | unknown",
      "status_since": "2025-09-23T13:00:00+08:00",
      "headway_min": 4,
      "eta_confidence": "high | medium | low",
      "incidents": [
        {
          "type": "flooding | fallen_tree | power_failure | congestion | other",
          "location": "屯门公路近小榄",
          "reported_at": "2025-09-23T13:10:00+08:00",
          "source_url": "https://..."
        }
      ],
      "source_url": "https://..."
    }
  ],
  "data_freshness_sec": 120,
  "degraded": false,
  "degraded_reason": null
}
```

### 字段纪律（B 必须遵守）

| 字段 | 要求 |
|---|---|
| `signal_level` | 1 / 3 / 8 / 9 / 10 的整数；无信号填 `0` |
| `issued_at` / `pre_announce_at` | ISO 8601 **带时区**（`+08:00`）。不带时区一律拒收 |
| `status` | 只允许四个枚举值。**不确定时必须填 `unknown`，不要猜 `normal`** |
| `incidents[].reported_at` | 该事件被**首次报道**的时刻 —— 这是非规则性中断的训练样本时间戳 |
| `degraded` | 是否在降级模式（用固定演示数据）。C 必须据此降低输出信心 |
| 所有 `source_url` | 必填。**没有出处的数字不要传进来** |

> **给 B 的一句话**：如果某个字段你拿不到，就填 `null` 并在 `degraded_reason` 里说明。
> C 会处理缺失，但没法处理一个看起来正常、实际是编的数字。

---

## 2. 契约 ②：C → D（决策输出）

D 只需要渲染这个结构，不需要理解任何规则。

```json
{
  "corridor_id": "CORRIDOR_TM_KLW",
  "generated_at": "2025-09-23T13:00:00+08:00",
  "input_echo": {
    "origin": "屯门",
    "destination": "九龙西",
    "arrive_by": "2025-09-23T15:30:00+08:00"
  },
  "verdict": {
    "action": "depart_now | depart_at | wait | hold",
    "depart_at": "2025-09-23T13:20:00+08:00",
    "primary_route_id": "ROUTE_A",
    "arrival_estimate": "2025-09-23T14:05:00+08:00",
    "confidence": "high | medium | low",
    "buffer_min": 45
  },
  "alternatives": [
    {
      "route_id": "ROUTE_B",
      "role": "plan_b",
      "depart_at": "2025-09-23T12:50:00+08:00",
      "arrival_estimate": "2025-09-23T14:00:00+08:00",
      "worth_it": true,
      "reason": "比主路线晚到但更早出发，适合路轨已积水的情形"
    }
  ],
  "switch_condition": {
    "trigger": "ROUTE_A 状态变为 suspended，或屯门公路出现 flooding",
    "to_route_id": "ROUTE_B",
    "latest_switch_at": "2025-09-23T13:40:00+08:00"
  },
  "basis": [
    {
      "claim": "八号生效后港铁巴士将于 3 小时后停驶",
      "type": "rule",
      "source": "港铁台风服务安排",
      "source_url": "https://www.mtr.com.hk/ch/customer/main/typhoon_readiness.html"
    },
    {
      "claim": "建议缓冲 45 分钟",
      "type": "statistics",
      "source": "历史事件回测（N 次事件，命中率 X%）",
      "source_url": "model/out/回测摘要.md"
    }
  ],
  "uncertainty": [
    "港铁可能在未有通知的情况下即时暂停服务，故建议时刻已预留缓冲"
  ],
  "explanation": "（由 GenAI 生成，只能引用上面已有的内容）",
  "disclaimer": "本建议基于公开数据与历史统计，不构成出行保证。请同时留意官方公告。"
}
```

### 三个关键设计

**① `action` 只有四个值，且互斥。**
- `depart_now` —— 现在就走的窗口正在关闭
- `depart_at` —— 按 `depart_at` 出发（最常见）
- `wait` —— 现在走会白等，稍后再走更好（例如暴雨情景下的暂缓）
- `hold` —— 数据不可信／风险过高，建议留在安全处并持续观察

**`hold` 是专门为「无法确认」设计的。** 答辩时被问「如果数据不够怎么办」，这就是答案 —— 我们不猜，我们说不知道。

**② `basis` 是防止 AI 幻觉的机制，不是装饰。**
GenAI 只能引用 `basis` 里已有的条目来生成 `explanation`。任何不在 `basis` 里的事实，都不允许出现在解释里。这样评委问「这句话哪来的」，你能当场指出来源。

**③ `switch_condition` 必须给出 `latest_switch_at`。**
「什么时候该换线」如果只给条件不给时刻，用户无法执行。这是产品五个输出里的第五项，也是 C 独有的一块。

---

## 3. 契约 ③：C 内部（规则层 vs 模型层）

C 的实现必须分成两层，**不允许混在一起**：

| 层 | 负责什么 | 实现方式 | 输出 |
|---|---|---|---|
| **规则层** | 港铁巴士 T8+3h 停驶；露天段 T9 即时暂停；信号分级 | 确定性规则，直接计算 | 精确时刻 |
| **模型层** | 实际中断比规则**提前多少**（水浸、塌树等） | 历史数据回测出的分布 | 概率与提前量 |

合起来才是「建议几点走」。这个拆法的好处：

- 规则层**永不出错**，不会出现「模型把 3 小时算成 2 小时」这种低级错误
- 模型层的问题**足够小**，只需学一个量：非规则性提前量
- 答辩时能说清「哪部分可保证、哪部分有不确定性」

---

## 4. 待确认清单（今天站会要过的）

| # | 问题 | 谁答 |
|---|---|---|
| 1 | 三条路线的**真实线路编号与营办商**（我目前填的是结构占位） | 全组／有实际通勤经验的人 |
| 2 | `pre_announce_at` B 能否稳定拿到？（这是回测的关键字段） | B |
| 3 | 降级模式下，C 是降低信心还是直接给 `hold`？ | C 与 A |
| 4 | 缓冲时间与信心分级的具体阈值 | C（先出回测结果再定） |
| 5 | 这个 JSON 结构 A / B / D 是否同意 | A / B / D |

---

## 5. 下一步

1. **今天**：本契约发群，收集第 4 节 5 个问题的反馈
2. **今天**：与 A、B 锁定输入样例 → 冻结契约 ①
3. **10/7**：用固定样例实现规则层，输出第一张完整建议卡片（不含模型层）
4. **10/8–10/9**：回测跑出真实数字 → 定下缓冲与信心阈值 → 补上模型层
5. **10/11 前**：三情景各连续运行五次无阻塞

> 契约冻结前，**不要开始写实现**。改契约的成本是 10 分钟，改实现是 2 天。
