# B 数据交接与待确认事项（2026-10-06）

## 对接状态

尚未与 A/C agent 完成双向确认。可见 agent 未标注角色；远端电脑离线或 sharing_required；本 Host 没有 agent 发送／启动工作流，只有目录与会话读取能力。已核对本地 A 项目契约、C 历史接入记录。请提供 A/C 会话链接并在支持发送的环境转交此文件。

现行契约是 API_CONTRACT.md 和 src/lib/types/context.ts；走廊为坑口—中环，R1/R2/R3。C 历史草案的屯门—九龙西不是当前走廊。本次没有修改共享类型、前端或决策规则。

## 已交付

- HKO rhrread + warnsum 的天气适配与校验；未配置环境变量仍全部离线。
- 三组既有 fixture 继续可直接导入 getFixtureSnapshot(normal / heavy_rain / disruption)，数值保持不变。
- deadline 超时保障、live → cached → fixture 回退、快取 snapshot.quality 与 resolution.quality 一致。
- 实时天气缺交通时使用 unknown，不把正常 fixture 冒充实时交通；静态路线估算的 source 保持 fixture。
- 7 个新增数据测试；全项目 12 个测试文件、144 个测试通过，lint/typecheck/生产构建通过。三情景各连续 5 次通过，黄金结果未改变。

## A/C 需要确认

1. A：确认现行坑口—中环走廊与路线 ID；提供 A/C 正式会话目标及源码同步方式（当前文件树没有 .git，未创建提交）。
2. A/C：确认混合数据口径。当前顶层 live 代表天气来自 live，sources 中静态路线仍 fixture，交通 unknown；若要求整份纯 live，应由 A 明确可选混合 quality 或逐字段 provenance 契约。
3. C：unknown 路线的 delayMinutes=0 仅为现行数值契约占位。核对引擎不会据此解释为零延误，及黑雨下 hold/wait 安全规则；本次未改 C 算法。
4. A/B/C：运输署官方 feed 为 XML。仍需确认事件→固定走廊路线映射和更新时间口径；没有稳定 ETA 来源时不得生成实时延误分钟数。TD 环境变量保持空白，天气单独启用不受阻塞。
5. A：README 尚写“没有实时接入”，应在集成时同步为“可选 HKO 天气；交通状态尚未确认”。数据来源文件已更新。

## ContextSnapshot 例子

固定样本使用：

```ts
import { getFixtureSnapshot } from "@/lib/fixtures/context";
const snapshot = getFixtureSnapshot("normal");
// scenario: normal, quality: fixture
// serviceDate: 2026-10-13
// collectedAt: 2026-10-13T07:30:00+08:00
// expiresAt: 2026-10-13T08:00:00+08:00
// weather: clear, warning: null, rainfallMmPerHour: 0, temperatureC: 28
// routes: R1 ok +0 / R2 ok +3 / R3 ok +0
```

新增/修改文件：src/lib/adapters/hko.ts、validation.ts、live-providers.ts、index.ts；src/test/data-adapters.test.ts；.env.example；docs/DATA_SOURCES.md；本文件。快取和 fixture 内容未改。


## 后续补齐

用户已明确 C 历史对话属于 C 负责人、UI 评审属于 E。已核查产物与现行代码；新增港铁／城巴抵站模块、运输署 XML 公告解析和部分来源超时保留。最新协作审查与待改项见 B_COLLABORATION_REVIEW.md，最新来源见 DATA_SOURCES.md；上方首次交付的测试数量与“TD 未解析”状态仅为历史记录。
